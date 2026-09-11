/**
 * НОРМАЛИЗАЦИЯ ФОНА ПОРТРЕТА: заливка однотонного фона точным цветом
 * (flood-fill от краёв с допуском + feather 2px). Утилита пайплайна.
 * Запуск: bun scripts/art-bg-fix.ts <file.png> <hex, напр. 07392F>
 */
import sharp from 'sharp';
import fs from 'fs';

const [file, hexRaw] = process.argv.slice(2);
if (!file || !hexRaw) {
  console.error('usage: bun scripts/art-bg-fix.ts <file.png> <hex без #>');
  process.exit(1);
}
const target = parseInt(hexRaw.replace('#', ''), 16);
const [tr, tg, tb] = [(target >> 16) & 255, (target >> 8) & 255, target & 255];

const { width, height } = await sharp(file).metadata();
const w = width!;
const h = height!;
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const ch = info.channels; // 4 (RGBA)
const px = (i: number) => [data[i * ch], data[i * ch + 1], data[i * ch + 2]];

// Реперный цвет фона — среднее по 4 углам
const corner = (x: number, y: number) => {
  const i = (y * w + x) * ch;
  return [data[i], data[i + 1], data[i + 2]];
};
let br = 0, bg = 0, bb = 0;
for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
  const [r, g, b] = corner(x, y);
  br += r / 4; bg += g / 4; bb += b / 4;
}
const dist = (r: number, g: number, b: number) => Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);
const TOL = 90; // допуск суммарный по RGB

// BFS-заливка от всех граничных пикселей, близких к реперному
const mask = new Uint8Array(w * h);
const queue: number[] = [];
const push = (idx: number) => {
  if (!mask[idx]) { mask[idx] = 1; queue.push(idx); }
};
for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
while (queue.length) {
  const idx = queue.pop()!;
  const x = idx % w;
  const y = (idx / w) | 0;
  const [r, g, b] = px(idx);
  if (dist(r, g, b) > TOL) continue; // не фон — дальше не распространяем
  if (x > 0) push(idx - 1);
  if (x < w - 1) push(idx + 1);
  if (y > 0) push(idx - w);
  if (y < h - 1) push(idx + w);
}

// Перекраска: mask=1 И близко к фону → точный цвет; feather — усреднение с соседями
let changed = 0;
const isBg = new Uint8Array(w * h);
for (let idx = 0; idx < w * h; idx++) {
  if (!mask[idx]) continue;
  const [r, g, b] = px(idx);
  if (dist(r, g, b) <= TOL) { isBg[idx] = 1; changed++; }
}
for (let idx = 0; idx < w * h; idx++) {
  if (!isBg[idx]) continue;
  data[idx * ch] = tr;
  data[idx * ch + 1] = tg;
  data[idx * ch + 2] = tb;
  data[idx * ch + 3] = 255;
}
// Feather: пограничные пиксели isBg — смешиваем с соседями (простое размытие границы)
const border: number[] = [];
for (let idx = 0; idx < w * h; idx++) {
  if (!isBg[idx]) continue;
  const x = idx % w, y = (idx / w) | 0;
  const nbs = [x > 0 ? idx - 1 : -1, x < w - 1 ? idx + 1 : -1, y > 0 ? idx - w : -1, y < h - 1 ? idx + w : -1];
  if (nbs.some((n) => n >= 0 && !isBg[n])) border.push(idx);
}
for (const idx of border) {
  const x = idx % w, y = (idx / w) | 0;
  let r = tr * 2, g = tg * 2, b = tb * 2, n = 2;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const nidx = ny * w + nx;
    if (isBg[nidx]) continue;
    const [nr, ng, nb] = px(nidx);
    r += nr; g += ng; b += nb; n++;
  }
  data[idx * ch] = Math.round(r / n);
  data[idx * ch + 1] = Math.round(g / n);
  data[idx * ch + 2] = Math.round(b / n);
}

await sharp(data, { raw: { width: w, height: h, channels: ch } }).png().toFile(file);
console.log(`bg-fixed: ${file} → #${hexRaw.toUpperCase()} (rep=${Math.round(br)},${Math.round(bg)},${Math.round(bb)}, перекрашено ${(changed / (w * h) * 100).toFixed(1)}%, feather ${border.length}px)`);
if (!fs.existsSync(file)) process.exit(1);
