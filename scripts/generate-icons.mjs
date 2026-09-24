// Gera o ícone do app sem dependências externas:
//   build/icon.png  (512×512, usado pela janela, bandeja e Linux/macOS)
//   build/icon.ico  (16–256 px, usado pelo instalador e pelo .exe no Windows)
//
// O desenho ("PQ" branco sobre um quadrado arredondado com degradê no azul do
// app) é vetorial: cada tamanho é rasterizado direto das formas, com
// supersampling para suavizar as bordas — nada de reduzir um PNG grande.
//
// Uso: npm run icons

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.resolve("build");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZE = 512;

// --- Formas (coordenadas em [0,1]) ------------------------------------------------

const GRADIENT_FROM = [76, 110, 245]; // accent (tema claro)
const GRADIENT_TO = [128, 160, 255]; // accent-hover (tema escuro)
const STROKE = 0.0375; // metade da espessura das letras

function roundedRectSdf(x, y, inset, radius) {
  const half = 0.5 - inset;
  const qx = Math.abs(x - 0.5) - (half - radius);
  const qy = Math.abs(y - 0.5) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Meio anel do lado direito (a "barriga" do P). */
function rightHalfRingDistance(x, y, cx, cy, r) {
  if (x >= cx) return Math.abs(Math.hypot(x - cx, y - cy) - r);
  return Math.min(Math.hypot(x - cx, y - (cy - r)), Math.hypot(x - cx, y - (cy + r)));
}

function letterDistance(x, y) {
  // P
  const stemX = 0.22;
  const bowlX = 0.3;
  const bowlY = 0.42;
  const bowlR = 0.1;
  const p = Math.min(
    segmentDistance(x, y, stemX, 0.32, stemX, 0.68),
    segmentDistance(x, y, stemX, bowlY - bowlR, bowlX, bowlY - bowlR),
    segmentDistance(x, y, stemX, bowlY + bowlR, bowlX, bowlY + bowlR),
    rightHalfRingDistance(x, y, bowlX, bowlY, bowlR)
  );
  // Q
  const qx = 0.655;
  const qy = 0.5;
  const qr = 0.135;
  const q = Math.min(Math.abs(Math.hypot(x - qx, y - qy) - qr), segmentDistance(x, y, 0.75, 0.595, 0.795, 0.675));
  return Math.min(p, q) - STROKE;
}

/** Cor (RGBA, 0–255) de um ponto do ícone, antes da suavização. */
function sample(x, y) {
  if (roundedRectSdf(x, y, 0.06, 0.2) > 0) return [0, 0, 0, 0];
  if (letterDistance(x, y) <= 0) return [255, 255, 255, 255];
  const t = Math.max(0, Math.min(1, (x + y) / 2));
  return [
    GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t,
    GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t,
    GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t,
    255,
  ];
}

function render(size) {
  // Tamanhos pequenos precisam de mais amostras para não "serrilhar".
  const ss = size <= 32 ? 8 : 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          // Acumula pré-multiplicado por alfa para as bordas não escurecerem.
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const i = (py * size + px) * 4;
      pixels[i] = a ? Math.round(r / a) : 0;
      pixels[i + 1] = a ? Math.round(g / a) : 0;
      pixels[i + 2] = a ? Math.round(b / a) : 0;
      pixels[i + 3] = Math.round(a / (ss * ss));
    }
  }
  return pixels;
}

// --- PNG ------------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  // Cada linha começa com o byte de filtro 0 (nenhum).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO (entradas em PNG, suportado desde o Windows Vista) ----------------------------

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo: ícone
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // 0 significa 256
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "icon.png"), encodePng(PNG_SIZE, render(PNG_SIZE)));
const icoImages = ICO_SIZES.map((size) => ({ size, png: encodePng(size, render(size)) }));
fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), encodeIco(icoImages));
console.log(`Ícones gerados em ${path.relative(process.cwd(), OUT_DIR)}/: icon.png (${PNG_SIZE}px) e icon.ico (${ICO_SIZES.join(", ")}px)`);
