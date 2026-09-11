/**
 * ФИКС БАТЧА P0a: перегенерация 7 ассетов с замечаниями VLM-QA
 * (утечки текста/подписей, неверный фон). Промпты усилены анти-текстом.
 * Запуск: bun scripts/gen-art-p0a-fix.ts
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('download/art-raw/p0a');
const PROMPTS_FILE = path.resolve('public/game-art/_prompts.md');

const STYLE =
  'Flat cartoon illustration, 2D vector-style art, clean dark outlines, soft flat shading, warm cozy restaurant management game, rounded friendly shapes, muted warm palette, no text, no letters, no numbers, no captions, no signatures, no watermarks anywhere, all badges and documents completely blank.';

const FRAME =
  'Bust portrait, three-quarter view, looking at viewer, plain solid deep dark green background color #07392F, centered composition, absolutely no border captions.';

const JOBS: { id: string; prompt: string }[] = [
  {
    id: 'anna_great',
    prompt: `${STYLE} Character: Woman Anna, 38 years old, HR manager, dark blonde hair in a neat low bun, soft friendly round face, small thin scar through right eyebrow, grey-brown eyes, wearing sage green knitted sweater over white shirt collar, blank staff badge on a lanyard without any lettering, small stud earrings. Beaming joyful smile, sparkling eyes, raised happy eyebrows, one hand showing enthusiastic thumbs-up, two small sage-green sparkle marks floating near her head. ${FRAME}`,
  },
  {
    id: 'anna_critical',
    prompt: `${STYLE} Character: Woman Anna, 38 years old, HR manager, dark blonde hair in a neat low bun, soft friendly round face, small thin scar through right eyebrow, grey-brown eyes, wearing sage green knitted sweater over white shirt collar, blank staff badge on a lanyard without any lettering, small stud earrings. Serious alarmed face, tired wide eyes with faint grey shadows under them, eyebrows in worried arch, pressed tense lips, two short dark red stress lines above her head, palm pressed against her forehead. ${FRAME}`,
  },
  {
    id: 'irina_great',
    prompt: `${STYLE} Character: Woman Irina, 50 years old, restaurant office accountant, grey-streaked dark shoulder-length bob haircut, thin-framed round glasses perched low on the tip of her nose, calm attentive eyes, wearing olive-grey blazer over cream blouse, thin gold necklace. Content serene smile, confident posture, holding a blank cream sheet of paper with only a simple green rising line drawn on it, one small sage-green sparkle near her head. ${FRAME}`,
  },
  {
    id: 'irina_normal',
    prompt: `${STYLE} Character: Woman Irina, 50 years old, restaurant office accountant, grey-streaked dark shoulder-length bob haircut, thin-framed round glasses perched low on the tip of her nose, calm attentive eyes, wearing olive-grey blazer over cream blouse, thin gold necklace. Neutral calm focused expression, small grey calculator in one hand. ${FRAME}`,
  },
  {
    id: 'irina_warning',
    prompt: `${STYLE} Character: Woman Irina, 50 years old, restaurant office accountant, grey-streaked dark shoulder-length bob haircut, thin-framed round glasses perched low on the tip of her nose, calm attentive eyes, wearing olive-grey blazer over cream blouse, thin gold necklace. Anxious expression, peering over her glasses at a completely blank paper document, eyebrows raised, amber-orange sweat drop at her temple, one finger pointing at the document. ${FRAME}`,
  },
  {
    id: 'nikolay_great',
    prompt: `${STYLE} Character: Man Nikolai, 40 years old, equipment technician, russet-brown hair under a dark baseball cap, short stubble beard, dark eyes, dark knitted scarf around his neck, wearing dark graphite-grey work overalls with an amber-orange high-visibility vest. Satisfied confident smile, thumbs up, a clean grey rag over his shoulder, holding a metal toolbox, one small sage-green sparkle near his head. ${FRAME}`,
  },
  {
    id: 'sergey_warning',
    prompt: `${STYLE} Character: Man Sergey, 52 years old, warehouse manager, heavyset large build, bald top of head with short grey hair on the sides, big bushy grey mustache, kind tired eyes, wearing brown walnut-colored work vest over a light beige shirt, completely blank clipboard in the chest pocket. Worried face, looking down into an empty wooden crate he holds, mustache drooping sadly, amber-orange sweat drop at his temple. ${FRAME}`,
  },
];

async function main() {
  console.log(`P0a-fix started: ${new Date().toISOString()}, jobs: ${JOBS.length}`);
  const zai = await ZAI.create();
  let ok = 0;
  for (const job of JOBS) {
    const outPath = path.join(OUT, `${job.id}.png`);
    fs.rmSync(outPath, { force: true });
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        const t0 = Date.now();
        const response = await zai.images.generations.create({ prompt: job.prompt, size: '1024x1024' as never });
        const b64 = response?.data?.[0]?.base64;
        if (!b64) throw new Error('empty base64');
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 20000) throw new Error(`small (${buf.length}b)`);
        fs.writeFileSync(outPath, buf);
        console.log(`+ ${job.id} (${(buf.length / 1024).toFixed(0)} Kb, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        fs.appendFileSync(PROMPTS_FILE, `\n## p0a-fix/${job.id}\n\`\`\`\n${job.prompt}\n\`\`\`\n`);
        ok++;
        done = true;
      } catch (e) {
        console.error(`- ${job.id} attempt ${attempt}: ${(e as Error).message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  console.log(`DONE: ${ok}/${JOBS.length}`);
  if (ok < JOBS.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
