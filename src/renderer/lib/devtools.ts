import { tm } from "@shared/i18n";

/**
 * Funções da caixa de ferramentas (página Ferramentas). Tudo roda localmente,
 * sem rede: nada do que o usuário cola sai do PC.
 */

// --- JSON ----------------------------------------------------------------------------

export type JsonResult = { ok: true; text: string } | { ok: false; error: string; line: number | null; column: number | null };

/**
 * Índice do primeiro caractere inválido de um JSON. As mensagens novas do V8
 * não trazem mais a posição, então o erro é localizado aqui (só é chamado
 * depois que o JSON.parse já falhou).
 */
export function jsonErrorIndex(text: string): number {
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const fail = (): never => {
    throw i;
  };
  const literal = (word: string) => {
    if (text.startsWith(word, i)) i += word.length;
    else fail();
  };
  const string = () => {
    i++; // aspas de abertura
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") {
        i++;
        if (text[i] === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail();
          i += 4;
        } else if (!'"\\/bfnrt'.includes(text[i] ?? "")) fail();
      } else if (text.charCodeAt(i) < 0x20) fail();
      i++;
    }
    if (i >= text.length) fail();
    i++;
  };
  const number = () => {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail();
    else i += m[0].length;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      ws();
      if (text[i] === "}") return void i++;
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        string();
        ws();
        if (text[i] !== ":") fail();
        i++;
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "}") return void i++;
        else fail();
      }
    } else if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") return void i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") return void i++;
        else fail();
      }
    } else if (c === '"') string();
    else if (c === "t") literal("true");
    else if (c === "f") literal("false");
    else if (c === "n") literal("null");
    else number();
  };
  try {
    value();
    ws();
    return i < text.length ? i : -1;
  } catch (pos) {
    return typeof pos === "number" ? Math.min(pos, text.length) : -1;
  }
}

function positionOf(input: string): { line: number | null; column: number | null } {
  const index = jsonErrorIndex(input);
  if (index < 0) return { line: null, column: null };
  const before = input.slice(0, index).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

export function formatJson(input: string, indent: number | "min" = 2): JsonResult {
  try {
    const value: unknown = JSON.parse(input);
    return { ok: true, text: indent === "min" ? JSON.stringify(value) : JSON.stringify(value, null, indent) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, ...positionOf(input) };
  }
}

/** Ordena as chaves de objetos recursivamente (útil para comparar JSONs). */
export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortJsonKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

// --- Base64 / URL ---------------------------------------------------------------------

export function base64Encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return urlSafe ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b64;
}

/** Aceita base64 normal ou URL-safe, com ou sem padding. Lança erro se não for base64/UTF-8 válido. */
export function base64Decode(input: string): string {
  const clean = input.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error(tm("Base64 inválido."));
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function urlEncode(text: string): string {
  return encodeURIComponent(text);
}

export function urlDecode(text: string): string {
  return decodeURIComponent(text.replace(/\+/g, " "));
}

// --- JWT -----------------------------------------------------------------------------

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** Datas das claims de tempo (exp, iat, nbf), em ms. */
  times: { claim: "exp" | "iat" | "nbf"; ms: number }[];
  expired: boolean | null;
}

/** Só decodifica: a assinatura NÃO é verificada (a UI deixa isso claro). */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().replace(/^Bearer\s+/i, "").split(".");
  if (parts.length < 2) throw new Error(tm("Não parece um JWT (esperado header.payload.assinatura)."));
  const parse = (part: string, error: string): Record<string, unknown> => {
    try {
      const value: unknown = JSON.parse(base64Decode(part));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw new Error(error);
    }
  };
  const header = parse(parts[0], tm("Header do JWT inválido."));
  const payload = parse(parts[1], tm("Payload do JWT inválido."));
  const times = (["exp", "iat", "nbf"] as const)
    .filter((claim) => typeof payload[claim] === "number")
    .map((claim) => ({ claim, ms: (payload[claim] as number) * 1000 }));
  const exp = times.find((t) => t.claim === "exp");
  return { header, payload, times, expired: exp ? exp.ms < Date.now() : null };
}

// --- Tempo ---------------------------------------------------------------------------

/** Número de 10 dígitos = segundos; 13 = milissegundos. Devolve ms ou null. */
export function parseTimestamp(input: string): number | null {
  const t = input.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Math.abs(n) < 1e11 ? Math.round(n * 1000) : Math.round(n);
  }
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

// --- Texto ---------------------------------------------------------------------------

/** Quebra em palavras: camelCase, PascalCase, snake_case, kebab-case, espaços. */
export function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export const CASES = {
  camel: (w: string[]) => w.map((x, i) => (i === 0 ? x : x[0].toUpperCase() + x.slice(1))).join(""),
  pascal: (w: string[]) => w.map((x) => x[0].toUpperCase() + x.slice(1)).join(""),
  snake: (w: string[]) => w.join("_"),
  constant: (w: string[]) => w.join("_").toUpperCase(),
  kebab: (w: string[]) => w.join("-"),
  title: (w: string[]) => w.map((x) => x[0].toUpperCase() + x.slice(1)).join(" "),
} as const;
export type CaseId = keyof typeof CASES;

/** Slug para URL/nome de branch: sem acento, minúsculo, hífens. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Diff ----------------------------------------------------------------------------

export type DiffLine = { kind: "same" | "add" | "del"; text: string; a: number | null; b: number | null };

/** Diff por linhas (LCS). Limite de tamanho para não travar a UI com textos enormes. */
export function diffLines(a: string, b: string, maxLines = 2000): DiffLine[] {
  const A = a.split(/\r?\n/);
  const B = b.split(/\r?\n/);
  if (A.length > maxLines || B.length > maxLines) throw new Error(tm("Texto grande demais para comparar."));
  const n = A.length;
  const m = B.length;
  // Tabela LCS (memória ~ n×m inteiros).
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = A[i] === B[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: "same", text: A[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: "del", text: A[i], a: i + 1, b: null });
      i++;
    } else {
      out.push({ kind: "add", text: B[j], a: null, b: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: A[i], a: ++i, b: null });
  while (j < m) out.push({ kind: "add", text: B[j], a: null, b: ++j });
  return out;
}

// --- Cores ---------------------------------------------------------------------------

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Aceita #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() e hsl()/hsla(). */
export function parseColor(input: string): Rgb | null {
  const t = input.trim().toLowerCase();
  let m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(t);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    const n = (k: number) => parseInt(hex.slice(k, k + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1 };
  }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const alpha = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    const c = [m[1], m[2], m[3]].map(Number);
    if (c.some((v) => v > 255) || alpha > 1) return null;
    return { r: c[0], g: c[1], b: c[2], a: alpha };
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const [h, s, l] = [Number(m[1]) % 360, Number(m[2]) / 100, Number(m[3]) / 100];
    if (s > 1 || l > 1) return null;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
    const alpha = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    return { r: f(0), g: f(8), b: f(4), a: alpha };
  }
  return null;
}

export function toHex({ r, g, b, a }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(Math.round(a * 255)) : ""}`;
}

export function toHsl({ r, g, b, a }: Rgb): string {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  const body = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return a < 1 ? `hsl(${body} / ${a})` : `hsl(${body})`;
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contrastRatio(x: Rgb, y: Rgb): number {
  const lum = ({ r, g, b }: Rgb) => {
    const c = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

// --- Hash ----------------------------------------------------------------------------

export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export async function hashText(text: string, algorithm: HashAlgorithm): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
