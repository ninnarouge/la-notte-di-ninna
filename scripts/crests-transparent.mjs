/**
 * Quita el fondo blanco de los blasones y deja un PNG con transparencia.
 * El blanco de adentro del escudo no se toca: solo el que está conectado al borde.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/crests");
mkdirSync(outDir, { recursive: true });

const srcDir = "C:/Users/Admin/Desktop/La Notte di Ninna/Escudos";
const files = [
  [`${srcDir}/Escudo_heráldico_familia_Lupo_4d035a26.jpg`, "lupo"],
  [`${srcDir}/Vipera_family_coat_of_arms_31fad120_2K.png`, "vipera"],
  [`${srcDir}/Escudo_heráldico_familia_Rosa_Nera_57fbc4e4_2K.png`, "rosa-nera"],
  [`${srcDir}/Falco_family_heraldic_shield_cce0971b_2K.png`, "falco"],
  [`${srcDir}/Escudo_heráldico_familia_Scorpione_20596516_2K.png`, "scorpione"],
];

const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

for (const [src, id] of files) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  const px = Buffer.from(data);
  const bg = new Uint8Array(n);
  const q = new Int32Array(n);
  let qe = 0;
  let qs = 0;
  const push = (i) => {
    if (bg[i]) return;
    const o = i * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    if (r >= 246 && g >= 246 && b >= 246 && chroma(r, g, b) <= 14) {
      bg[i] = 1;
      q[qe++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (qs < qe) {
    const i = q[qs++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x + 1 < w) push(i + 1);
    if (y > 0) push(i - w);
    if (y + 1 < h) push(i + w);
  }
  for (let i = 0; i < n; i++) if (bg[i]) px[i * 4 + 3] = 0;

  for (let pass = 0; pass < 3; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const o = i * 4;
        if (px[o + 3] === 0) continue;
        const touches =
          px[(i - 1) * 4 + 3] === 0 || px[(i + 1) * 4 + 3] === 0 || px[(i - w) * 4 + 3] === 0 || px[(i + w) * 4 + 3] === 0;
        if (!touches) continue;
        const r = px[o];
        const g = px[o + 1];
        const b = px[o + 2];
        const min = Math.min(r, g, b);
        if (chroma(r, g, b) > 30 || min < 190) continue;
        px[o + 3] = Math.round((1 - (min - 190) / 65) * 255);
      }
    }
  }

  const out = resolve(outDir, `${id}.png`);
  await sharp(px, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width: 900, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 85, effort: 10 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`${id} ${meta.width}x${meta.height}`);
}
