/**
 * ПОСТОБРАБОТКА БАТЧА P0a: PNG (download/art-raw/p0a) → WebP в public/game-art/
 * + сборка контакт-листа ревью (public/game-art/_review/p0a-style-review.png).
 * Запуск: bun scripts/art-postprocess-p0a.ts
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const RAW = path.resolve('download/art-raw/p0a');
const ART = path.resolve('public/game-art');
const REVIEW = path.join(ART, '_review');

const MAP: Record<string, string> = {
  anna: 'characters/hr/hr',
  irina: 'characters/accountant/accountant',
  sergey: 'characters/warehouse_manager/warehouse_manager',
  nikolay: 'characters/technician/technician',
};
const MOODS = ['great', 'normal', 'warning', 'critical'] as const;
const LABELS: Record<string, string> = {
  anna: 'Anna — HR',
  irina: 'Irina — Accountant',
  sergey: 'Sergey — Warehouse',
  nikolay: 'Nikolay — Technician',
};

async function toWebp(src: string, dst: string, quality: number): Promise<void> {
  const img = sharp(src);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error(`bad png: ${src}`);
  await img.webp({ quality, effort: 4 }).toFile(dst);
  const kb = (fs.statSync(dst).size / 1024).toFixed(0);
  console.log(`webp ${path.relative(ART, dst)} ${meta.width}x${meta.height} ${kb}Kb`);
}

async function labelSvg(text: string, w: number, h: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#002B25"/>
    <text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#F7F1E5">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function buildContactSheet(): Promise<void> {
  const CELL = 250;
  const LABEL_H = 30;
  const GAP = 10;
  const PAD = 16;
  const HEADER_H = 64;
  const gridW = PAD * 2 + CELL * 4 + GAP * 3;
  const headerSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${gridW}" height="${HEADER_H}">
      <rect width="${gridW}" height="${HEADER_H}" fill="#07392F"/>
      <text x="${gridW / 2}" y="28" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#F7F1E5">P0a STYLE REVIEW — Emerald Bistro</text>
      <text x="${gridW / 2}" y="50" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#8A8D8C">4 characters x 4 moods + base scene | flat cartoon | warm palette on dark green</text>
    </svg>`,
  );

  const composites: sharp.OverlayOptions[] = [];
  let y = HEADER_H + PAD;

  for (const [key, label] of Object.entries(LABELS)) {
    let x = PAD;
    for (const mood of MOODS) {
      const png = path.join(RAW, `${key}_${mood}.png`);
      if (!fs.existsSync(png)) throw new Error(`missing raw: ${png}`);
      const cell = await sharp(png).resize(CELL, CELL, { fit: 'cover' }).png().toBuffer();
      composites.push({ input: cell, left: x, top: y });
      const lab = await labelSvg(`${label} · ${mood}`, CELL, LABEL_H);
      composites.push({ input: lab, left: x, top: y + CELL });
      x += CELL + GAP;
    }
    y += CELL + LABEL_H + GAP;
  }

  // Сцена
  y += 8;
  const sceneW = gridW - PAD * 2;
  const sceneH = Math.round((sceneW * 768) / 1344);
  const scene = await sharp(path.join(RAW, 'restaurant_base.png')).resize(sceneW, sceneH).png().toBuffer();
  composites.push({ input: scene, left: PAD, top: y });
  const lab = await labelSvg('restaurant_base — main scene (1344x768)', sceneW, LABEL_H);
  composites.push({ input: lab, left: PAD, top: y + sceneH });
  y += sceneH + LABEL_H + PAD;

  await sharp({
    create: { width: gridW, height: y, channels: 4, background: '#175747' },
  })
    .composite(composites)
    .png({ compressionLevel: 8 })
    .toFile(path.join(REVIEW, 'p0a-style-review.png'));
  console.log(`contact sheet: public/game-art/_review/p0a-style-review.png ${gridW}x${y}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(REVIEW, { recursive: true });
  for (const [key, prefix] of Object.entries(MAP)) {
    const dir = path.join(ART, path.dirname(prefix));
    fs.mkdirSync(dir, { recursive: true });
    for (const mood of MOODS) {
      const src = path.join(RAW, `${key}_${mood}.png`);
      if (!fs.existsSync(src)) throw new Error(`missing raw: ${src}`);
      await toWebp(src, path.join(ART, `${prefix}_${mood}.webp`), 82);
    }
  }
  const sceneDir = path.join(ART, 'scenes/restaurant');
  fs.mkdirSync(sceneDir, { recursive: true });
  const sceneSrc = path.join(RAW, 'restaurant_base.png');
  if (!fs.existsSync(sceneSrc)) throw new Error('missing raw: restaurant_base.png');
  await toWebp(sceneSrc, path.join(sceneDir, 'restaurant_base.webp'), 85);

  await buildContactSheet();
  console.log('OK: postprocess done');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
