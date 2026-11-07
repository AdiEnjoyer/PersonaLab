import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'public', 'icons');
const svg = await readFile(path.join(root, 'scripts', 'assets', 'icon.svg'));
await mkdir(outDir, { recursive: true });

async function png(size: number, name: string, scale = 1): Promise<void> {
  const inner = Math.round(size * scale);
  const pad = Math.floor((size - inner) / 2);
  await sharp(svg)
    .resize(inner, inner)
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: '#0b0b0f' })
    .png()
    .toFile(path.join(outDir, name));
}

await png(180, 'icon-180.png');
await png(512, 'icon-512.png');
// Maskable icons keep the artwork inside the central safe zone.
await png(512, 'maskable-512.png', 0.7);
console.log('icons written to public/icons');