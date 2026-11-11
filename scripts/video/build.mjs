// Monta o vídeo de divulgação a partir das telas do README e da pixel art do onsen.
// Uso (precisa do ffmpeg no PATH):  npm run build:demo && npm run screenshots && node scripts/video/build.mjs
// Saída: docs/video/qyrex-divulgacao.mp4 (1920×1080) e qyrex-divulgacao-vertical.mp4 (1080×1920).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qyrex-video-"));
const outDir = path.join(root, "docs", "video");
fs.mkdirSync(outDir, { recursive: true });

const FPS = 30;
const SHOT_SECONDS = 3.8;
const INTRO_SECONDS = 4;
const OUTRO_SECONDS = 5;
const FADE = 0.5;
const ONSEN = path.join(root, "site", "assets", "qyrex-onsen.mp4");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (res.status !== 0) throw new Error(`${path.basename(cmd)} saiu com ${res.status}`);
}
const ffmpeg = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const X264 = ["-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(FPS)];

// 1. Cenas em PNG (Electron).
const electron = (await import("electron")).default;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
console.log("cenas:");
run(electron, [path.join(here, "render.cjs"), tmp], { env });
const shots = fs.readdirSync(tmp).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));

// 2. Um clipe por cena.
/** O onsen (pixel art, 320×180 ampliado sem borrar) com o texto por cima, que entra em fade. */
function onsenClip(overlay, seconds, out) {
  ffmpeg([
    "-stream_loop", "-1", "-i", ONSEN,
    "-loop", "1", "-framerate", String(FPS), "-i", path.join(tmp, overlay),
    "-filter_complex",
    `[0:v]scale=320:180:flags=neighbor,scale=1920:1080:flags=neighbor,fps=${FPS},drawbox=color=0x070914@0.35:t=fill[bg];` +
      `[1:v]scale=1920:1080,format=rgba,fade=in:st=0.3:d=0.6:alpha=1[ov];[bg][ov]overlay=0:0,format=yuv420p`,
    "-t", String(seconds), ...X264, out,
  ]);
}
/** Tela do app com aproximação lenta (a imagem tem o dobro do tamanho, então não treme). */
function shotClip(png, out) {
  const frames = Math.round(SHOT_SECONDS * FPS);
  ffmpeg([
    "-i", path.join(tmp, png),
    "-vf", `zoompan=z='1+0.04*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${FPS},format=yuv420p`,
    "-frames:v", String(frames), ...X264, out,
  ]);
}
const clips = [];
const add = (name, seconds) => clips.push({ file: path.join(tmp, name), seconds });
onsenClip("intro.png", INTRO_SECONDS, path.join(tmp, "c-intro.mp4"));
add("c-intro.mp4", INTRO_SECONDS);
shots.forEach((png, i) => {
  shotClip(png, path.join(tmp, `c-${i}.mp4`));
  add(`c-${i}.mp4`, SHOT_SECONDS);
});
onsenClip("outro.png", OUTRO_SECONDS, path.join(tmp, "c-outro.mp4"));
add("c-outro.mp4", OUTRO_SECONDS);

// 3. Junta tudo com transição cruzada e uma trilha muda (algumas redes recusam vídeo sem áudio).
let filter = "";
let last = "0:v";
let at = 0;
clips.forEach((clip, i) => {
  if (i === 0) {
    at = clip.seconds;
    return;
  }
  const offset = at - FADE;
  filter += `[${last}][${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[v${i}];`;
  last = `v${i}`;
  at = offset + clip.seconds;
});
const total = at;
filter += `[${last}]fade=out:st=${(total - 0.6).toFixed(3)}:d=0.6,format=yuv420p[v]`;
const wide = path.join(outDir, "qyrex-divulgacao.mp4");
ffmpeg([
  ...clips.flatMap((c) => ["-i", c.file]),
  "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
  "-filter_complex", filter, "-map", "[v]", "-map", `${clips.length}:a`,
  "-t", total.toFixed(3), "-c:v", "libx264", "-crf", "19", "-preset", "slow", "-pix_fmt", "yuv420p", "-profile:v", "high",
  "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", wide,
]);

// 4. Versão vertical (Reels, Shorts, TikTok): o vídeo no meio, com o nome fixo em cima e o
//    endereço embaixo (recortados dos textos da abertura e do encerramento).
const tall = path.join(outDir, "qyrex-divulgacao-vertical.mp4");
ffmpeg([
  "-i", wide,
  "-loop", "1", "-framerate", String(FPS), "-i", path.join(tmp, "intro.png"),
  "-loop", "1", "-framerate", String(FPS), "-i", path.join(tmp, "outro.png"),
  "-f", "lavfi", "-i", `color=c=0x0d1020:s=1080x1920:r=${FPS}`,
  "-filter_complex",
  "[1:v]crop=1840:720:1000:270,scale=960:-2[top];[2:v]crop=1840:380:1000:570,scale=960:-2[bottom];" +
    "[0:v]scale=1080:-2[mid];[3:v][mid]overlay=0:656:shortest=1[a];[a][top]overlay=60:210[b];[b][bottom]overlay=60:1380,setsar=1,format=yuv420p",
  "-map", "0:a", "-t", total.toFixed(3),
  "-c:v", "libx264", "-crf", "19", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "copy", tall,
]);

// 5. Cópias leves: o vídeo e a capa que o site publica (a Vercel só serve a pasta site/)
//    e a prévia animada do README (o GitHub não toca .mp4 do repositório dentro do README).
const siteAssets = path.join(root, "site", "assets");
ffmpeg([
  "-i", wide, "-vf", "scale=1280:-2", "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", path.join(siteAssets, "qyrex-divulgacao.mp4"),
]);
ffmpeg(["-ss", "2", "-i", wide, "-frames:v", "1", "-vf", "scale=1280:-2", "-c:v", "libwebp", "-quality", "82", path.join(siteAssets, "qyrex-divulgacao-poster.webp")]);
ffmpeg([
  "-i", wide,
  // 480 px, 5 fps e 48 cores: fica perto de 3 MB (em 640 px e 8 fps passava de 8 MB).
  "-vf", "fps=5,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
  "-loop", "0", path.join(outDir, "qyrex-divulgacao.gif"),
]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`ok: ${path.relative(root, wide)} e ${path.relative(root, tall)} (${total.toFixed(1)} s)`);
