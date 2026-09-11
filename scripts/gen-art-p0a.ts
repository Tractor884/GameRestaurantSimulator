/**
 * ГЕНЕРАЦИЯ БАТЧА P0a (стиль-тест, Ворота B) — ART_STYLE.md §8, ASSET_LIST.md §1/§4.
 * 16 портретов (Анна/Ирина/Сергей/Николай × 4 состояния) + restaurant_base.
 * Запуск: bun scripts/gen-art-p0a.ts  (фоново, лог в download/art-raw/p0a/gen.log)
 * Выход: download/art-raw/p0a/*.png + public/game-art/_prompts.md (append)
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('download/art-raw/p0a');
const PROMPTS_FILE = path.resolve('public/game-art/_prompts.md');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(PROMPTS_FILE), { recursive: true });

const STYLE = 'Flat cartoon illustration, 2D vector-style art, clean dark outlines, soft flat shading, warm cozy restaurant management game, rounded friendly shapes, muted warm palette, no text, no letters, no numbers, no watermark.';

const PORTRAIT_FRAME = 'Bust portrait, three-quarter view, looking at viewer, plain solid deep dark green background color #07392F, centered composition.';

interface Job {
  id: string;
  size: string;
  prompt: string;
}

const CHARACTERS: Record<string, { desc: string; moods: Record<string, string> }> = {
  anna: {
    desc: 'Woman Anna, 38 years old, HR manager, dark blonde hair in a neat low bun, soft friendly round face, small thin scar through right eyebrow, grey-brown eyes, wearing sage green knitted sweater over white shirt with visible collar, staff ID badge on a lanyard, small stud earrings.',
    moods: {
      great: 'Beaming joyful smile, sparkling eyes, raised happy eyebrows, one hand showing enthusiastic thumbs-up, two small sage-green sparkle marks floating near her head.',
      normal: 'Calm content light smile, relaxed neutral eyebrows, holding a small cream-colored notebook against chest.',
      warning: 'Concerned worried face, slightly widened eyes, eyebrows drawn together, pursed lips, single amber-orange sweat drop at her temple, one hand touching her cheek.',
      critical: 'Serious alarmed face, tired wide eyes with faint grey shadows under them, eyebrows in worried arch, pressed tense lips, two short dark red stress lines above her head, palm pressed against her forehead.',
    },
  },
  irina: {
    desc: 'Woman Irina, 50 years old, chief accountant, grey-streaked dark shoulder-length bob haircut, thin-framed round glasses perched low on the tip of her nose, calm attentive eyes, wearing olive-grey blazer over cream blouse, thin gold necklace.',
    moods: {
      great: 'Content serene smile, confident posture, holding one printed sheet with a simple green rising line, one small sage-green sparkle near her head.',
      normal: 'Neutral calm focused expression, small grey calculator in one hand.',
      warning: 'Anxious expression, peering over her glasses at a paper invoice, eyebrows raised, amber-orange sweat drop at her temple, one finger pointing at the document.',
      critical: 'Alarm and despair, both hands pressed to the sides of her head, several papers falling down around her, mouth open in dismay, two dark red stress lines above her head.',
    },
  },
  sergey: {
    desc: 'Man Sergey, 52 years old, warehouse manager, heavyset large build, bald top of head with short grey hair on the sides, big bushy grey mustache, kind tired eyes, wearing brown walnut-colored work vest over a light beige shirt with a clipboard in the chest pocket.',
    moods: {
      great: 'Proud happy smile under his big mustache, cheerful eyes, one arm gesturing presenting abundance, one small sage-green sparkle near his head.',
      normal: 'Calm working expression, pencil tucked behind his ear, holding the clipboard from his chest pocket.',
      warning: 'Worried face, looking down into an empty wooden crate he holds, mustache drooping sadly, amber-orange sweat drop at his temple.',
      critical: 'Distraught face, both arms spread wide in disbelief toward empty shelves, mouth open, two dark red stress lines above his head, faint grey shadows under his eyes.',
    },
  },
  nikolay: {
    desc: 'Man Nikolai, 40 years old, equipment technician, russet-brown hair under a dark baseball cap, short stubble beard, dark eyes, dark knitted scarf around his neck, wearing dark graphite-grey work overalls with an amber-orange high-visibility vest, holding a metal toolbox.',
    moods: {
      great: 'Satisfied confident smile, thumbs up, a clean grey rag over his shoulder, one small sage-green sparkle near his head.',
      normal: 'Calm focused working expression, silver wrench in one hand.',
      warning: 'Concentrated worried face, eyebrows knitted, looking at a small puff of grey smoke rising from the toolbox, amber-orange sweat drop at his temple.',
      critical: 'Alarmed face squinting at bright sparks, mouth open in shock, baseball cap askew, two dark red stress lines above his head.',
    },
  },
};

const SCENE_PROMPT = `${STYLE} Cozy casual-dining restaurant interior, no people, empty clean room. Emerald bistro palette: upper walls deep dark green #07392F, lower walls and kitchen pass wall tiled in dark emerald green #0D4A3C with thin lighter seams #175747, warm light wooden dining tables #C9A87C with cream tablecloths #F7F1E5, terracotta chair cushions #C46A43, sage green potted plants #8A9A5B, warm graphite metal pendant lamps. Layout: kitchen pass window with stove and hanging pans occupying upper-left background (about half of the width), coffee station with a big espresso machine on upper-right, six dining tables in the middle, wooden entrance double door at lower-right, tall windows with warm daylight along the left wall, dark wooden floor at the bottom. Slight top-down 30 degree stage perspective, warm daylight glow from left windows.`;

function buildJobs(): Job[] {
  const jobs: Job[] = [];
  for (const [char, c] of Object.entries(CHARACTERS)) {
    for (const mood of ['great', 'normal', 'warning', 'critical'] as const) {
      jobs.push({
        id: `${char}_${mood}`,
        size: '1024x1024',
        prompt: `${STYLE} Character: ${c.desc} ${c.moods[mood]} ${PORTRAIT_FRAME}`,
      });
    }
  }
  jobs.push({ id: 'restaurant_base', size: '1344x768', prompt: SCENE_PROMPT });
  return jobs;
}

async function generateOne(zai: Awaited<ReturnType<typeof ZAI.create>>, job: Job, retries = 3): Promise<boolean> {
  const outPath = path.join(OUT, `${job.id}.png`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 20000) {
    console.log(`= exists, skip: ${job.id}`);
    return true;
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const t0 = Date.now();
      const response = await zai.images.generations.create({ prompt: job.prompt, size: job.size as never });
      const b64 = response?.data?.[0]?.base64;
      if (!b64) throw new Error('empty base64');
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 20000) throw new Error(`suspiciously small (${buf.length}b)`);
      fs.writeFileSync(outPath, buf);
      console.log(`+ ${job.id} (${(buf.length / 1024).toFixed(0)} Kb, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      fs.appendFileSync(PROMPTS_FILE, `\n## p0a/${job.id}\n\`\`\`\n${job.prompt}\n\`\`\`\n`);
      return true;
    } catch (e) {
      console.error(`- ${job.id} attempt ${attempt}: ${(e as Error).message}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return false;
}

async function main() {
  console.log(`P0a generation started: ${new Date().toISOString()}`);
  const jobs = buildJobs();
  console.log(`jobs: ${jobs.length}`);
  const zai = await ZAI.create();
  let ok = 0;
  for (const job of jobs) {
    const done = await generateOne(zai, job);
    if (done) ok++;
  }
  console.log(`DONE: ${ok}/${jobs.length}`);
  if (ok < jobs.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
