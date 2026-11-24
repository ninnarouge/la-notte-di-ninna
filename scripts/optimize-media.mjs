import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const uploads = path.join(root, "uploads");
const media = path.join(root, "public", "media");
mkdirSync(media, { recursive: true });

const hero = path.join(
  uploads,
  "74b73b437597ce79d0027f2215ccd3b7a781bae68c3b61621cfdcbfeb8a53d81_15fa.png",
);
const portrait = path.join(uploads, "jefa-mafia-luz-dorada_0960.png");
const reunion = path.join(uploads, "reunion-clandestina-humo_ae55.png");
const video = path.join(uploads, "video-escena-ninna_3378.mp4");

async function webp(input, width, out, quality) {
  await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toFile(path.join(media, out));
}

async function jpeg(input, width, out, quality) {
  await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(path.join(media, out));
}

await webp(hero, 1400, "cena-1400.webp", 80);
await webp(hero, 900, "cena-900.webp", 78);
await jpeg(hero, 1400, "cena-1400.jpg", 82);
await webp(portrait, 900, "jefa-900.webp", 80);
await webp(reunion, 1400, "reunion-1400.webp", 80);

const posterPng = "/tmp/escena-poster-src.png";
execFileSync("ffmpeg", [
  "-y",
  "-ss",
  "0.75",
  "-i",
  video,
  "-frames:v",
  "1",
  posterPng,
]);
await sharp(posterPng).resize({ width: 900 }).webp({ quality: 76 }).toFile(path.join(media, "escena-poster.webp"));

execFileSync("ffmpeg", [
  "-y",
  "-i",
  video,
  "-t",
  "3.8",
  "-an",
  "-c:v",
  "libx264",
  "-profile:v",
  "high",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-preset",
  "medium",
  "-crf",
  "27",
  path.join(media, "escena.mp4"),
]);

console.log("media lista");
