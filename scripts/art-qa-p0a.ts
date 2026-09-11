/**
 * VLM-QA БАТЧА P0a: проверка каждой картинки на соответствие ART_STYLE.
 * Вопросы: стиль (0–10), наличие текста/букв, мимика, фон.
 * Запуск: bun scripts/art-qa-p0a.ts → download/art-qa/p0a-qa.md
 */
import ZAI from 'z-ai-web-dev-sdk';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const RAW = path.resolve('download/art-raw/p0a');
const REPORT = path.resolve('download/art-qa');
fs.mkdirSync(REPORT, { recursive: true });

const FILES = fs.readdirSync(RAW).filter((f) => f.endsWith('.png')).sort();

const QUESTION = `You are QA-checking a game art asset against the art bible.
The required style: flat cartoon illustration, 2D vector-style, clean dark outlines, soft flat shading, warm cozy restaurant game, rounded friendly shapes, muted warm palette, character on plain solid deep dark green background #07392F (for portraits) OR cozy emerald-green restaurant interior (for the scene).
Answer STRICTLY as compact JSON, no markdown:
{"style": <0-10 how well it matches the required style>,
 "text": <true if ANY letters, numbers or watermarks are visible in the image>,
 "bg": "<background color description, one short phrase>",
 "expression": "<facial expression / scene mood, one short phrase>",
 "notes": "<problems if any, else empty>"}`;

async function main() {
  const zai = await ZAI.create();
  const lines: string[] = [`# P0a VLM-QA — ${new Date().toISOString()}`, '', '| Ассет | style | текст | фон | выражение | замечания |', '|---|---|---|---|---|---|'];
  let fails = 0;
  for (const f of FILES) {
    const full = path.join(RAW, f);
    try {
      const png = await sharp(full).resize(768, null).png().toBuffer();
      const b64 = png.toString('base64');
      const response = await zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: QUESTION },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      });
      const raw = response.choices[0]?.message?.content ?? '';
      const json = raw.replace(/```json|```/g, '').trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(json);
      } catch {
        parsed = { style: '?', text: '?', notes: `unparsable: ${json.slice(0, 120)}` };
      }
      const style = Number(parsed.style);
      const bad = (typeof style === 'number' && style < 7) || parsed.text === true || String(parsed.notes ?? '').length > 0;
      if (bad) fails++;
      lines.push(
        `| ${f} | ${parsed.style} | ${parsed.text ? '⚠ ДА' : 'нет'} | ${String(parsed.bg ?? '')} | ${String(parsed.expression ?? '')} | ${String(parsed.notes ?? '')} |`,
      );
      console.log(`${bad ? '!' : '.'} ${f}: style=${parsed.style} text=${parsed.text}`);
    } catch (e) {
      fails++;
      lines.push(`| ${f} | ERR | | | | ${(e as Error).message} |`);
      console.error(`x ${f}: ${(e as Error).message}`);
    }
  }
  lines.push('', `**Итог: ${FILES.length - fails}/${FILES.length} без замечаний.**`);
  fs.writeFileSync(path.join(REPORT, 'p0a-qa.md'), lines.join('\n'));
  console.log(`QA done: ${FILES.length - fails}/${FILES.length} ok; report: download/art-qa/p0a-qa.md`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
