/**
 * БАТЧ P0b (после Ворот B): пилотные ассеты для 5 экранов.
 * - портреты: Максим(шеф)/Ольга(маркетолог)/Андрей(банкир)/Игорь(владелец) ×4 + fallback
 * - full-body спрайты стаффа ×4 (хрома-фон #FF00FF)
 * - гости business/family/couple_evening ×3 (хрома-фон)
 * - слои зала ×10 (хрома-фон)
 * - сцена склада (1344x768) + слои склада ×4 (хрома-фон)
 * Запуск: bun scripts/gen-art-p0b.ts (в фоне, ~60 мин)
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('download/art-raw/p0b');
const PROMPTS_FILE = path.resolve('public/game-art/_prompts.md');
fs.mkdirSync(OUT, { recursive: true });

const STYLE =
  'Flat cartoon illustration, 2D vector-style art, clean dark outlines, soft flat shading, warm cozy restaurant management game, rounded friendly shapes, muted warm palette, no text, no letters, no numbers, no captions, no signatures, no watermarks anywhere, all badges, screens and documents completely blank.';

const FRAME_PORTRAIT =
  'Bust portrait, three-quarter view, looking at viewer, plain solid deep dark green background color #07392F, centered composition, absolutely no border captions.';

const FRAME_ALPHA =
  'Full body standing pose, feet visible in frame, whole figure fully visible centered with 5% margin from edges, soft ellipse shadow underneath, isolated on solid magenta background #FF00FF, absolutely no border, no text.';

const FRAME_OBJECT =
  'Single object fully visible and centered like a sticker with 5% margin from edges, soft ellipse shadow underneath, isolated on solid magenta background #FF00FF, absolutely no border, no text.';

type Job = { id: string; prompt: string; size?: string };

// ── 1. Портреты персонажей ────────────────────────────────────────────────
const CHEF = 'Man Maxim, 45 years old, head chef, short dark beard with grey streaks, thick dark eyebrows, wide nose, warm tired eyes, wearing a white chef double-breasted jacket with a terracotta apron and a kitchen towel over his shoulder';
const MARKETER = 'Woman Olga, 29 years old, marketing manager, dark curly shoulder-length hair, cheerful round face, light stylish makeup, wearing a terracotta blazer over a cream turtleneck, holding a tablet with a completely blank screen';
const BANKER = 'Man Andrey, 47 years old, bank manager, dark hair combed back with grey temples, thin bone-rimmed glasses, even warm tan, wearing a dark warm graphite-grey suit with a burgundy tie, black briefcase at his side';
const OWNER = 'Man Igor, 55 years old, restaurant owner, short grey buzz-cut hair, warm laughter wrinkles around his eyes, wearing a cream knitted sweater over a collared shirt, dark trousers, wristwatch, holding a small coffee cup';

const PORTRAITS: Job[] = [
  { id: 'chef_great', prompt: `${STYLE} Character: ${CHEF}. Proud confident smile, chin raised, holding a big soup ladle up like a scepter, one small sage-green sparkle mark floating near his head. ${FRAME_PORTRAIT}` },
  { id: 'chef_normal', prompt: `${STYLE} Character: ${CHEF}. Calm focused working expression, glancing at a completely blank recipe card held in one hand. ${FRAME_PORTRAIT}` },
  { id: 'chef_warning', prompt: `${STYLE} Character: ${CHEF}. Annoyed frown, arms crossed over chest, thick eyebrows knitted together, one amber-orange sweat drop at his temple. ${FRAME_PORTRAIT}` },
  { id: 'chef_critical', prompt: `${STYLE} Character: ${CHEF}. Irritated furious face, open shouting mouth, angry arched eyebrows, two short dark red stress lines above his head, waving the kitchen towel in frustration, faint grey shadow under his eyes. ${FRAME_PORTRAIT}` },
  { id: 'marketer_great', prompt: `${STYLE} Character: ${MARKETER}. Energetic beaming smile, sparkling eyes, holding the tablet up triumphantly like showing great results, two small sage-green sparkle marks near her head. ${FRAME_PORTRAIT}` },
  { id: 'marketer_normal', prompt: `${STYLE} Character: ${MARKETER}. Friendly working smile, glancing down at the blank tablet in her hands. ${FRAME_PORTRAIT}` },
  { id: 'marketer_warning', prompt: `${STYLE} Character: ${MARKETER}. Concerned anxious expression, biting her lip, one amber-orange sweat drop at her temple, holding the tablet close to her chest. ${FRAME_PORTRAIT}` },
  { id: 'marketer_critical', prompt: `${STYLE} Character: ${MARKETER}. Alarmed distressed face, wide worried eyes, eyebrows in a worried arch, two short dark red stress lines above her head, one hand pressed to her cheek. ${FRAME_PORTRAIT}` },
  { id: 'banker_great', prompt: `${STYLE} Character: ${BANKER}. Polite satisfied closed-lip smile, relaxed confident posture, holding his briefcase. ${FRAME_PORTRAIT}` },
  { id: 'banker_normal', prompt: `${STYLE} Character: ${BANKER}. Neutral businesslike calm face, straight posture, hands folded in front. ${FRAME_PORTRAIT}` },
  { id: 'banker_warning', prompt: `${STYLE} Character: ${BANKER}. Stern watchful expression, eyebrows slightly lowered, adjusting his tie with one hand, faint amber tint on his face. ${FRAME_PORTRAIT}` },
  { id: 'banker_critical', prompt: `${STYLE} Character: ${BANKER}. Grave concerned face, holding a smartphone up to his ear as if making an urgent call, worried arched eyebrows, two short dark red stress lines above his head. ${FRAME_PORTRAIT}` },
  { id: 'owner_great', prompt: `${STYLE} Character: ${OWNER}. Beaming warm smile, raising the coffee cup in a small celebratory toast, one small sage-green sparkle mark near his head. ${FRAME_PORTRAIT}` },
  { id: 'owner_normal', prompt: `${STYLE} Character: ${OWNER}. Calm content smile, holding the coffee cup at chest level. ${FRAME_PORTRAIT}` },
  { id: 'owner_warning', prompt: `${STYLE} Character: ${OWNER}. Concerned face, eyebrows knitted, coffee cup lowered at his side, one amber-orange sweat drop at his temple. ${FRAME_PORTRAIT}` },
  { id: 'owner_critical', prompt: `${STYLE} Character: ${OWNER}. Deeply disappointed heavy face, sad eyes, eyebrows in a deep worried arch, palm pressed to his forehead, two short dark red stress lines above his head. ${FRAME_PORTRAIT}` },
  { id: 'fallback_character', prompt: `${STYLE} Neutral generic employee emblem: featureless smooth cream rounded silhouette of a person without any face, simple rounded body in warm grey uniform, standing calmly inside a large cream circle ring. ${FRAME_PORTRAIT}` },
];

// ── 2. Персонал смены (full-body, хрома) ─────────────────────────────────
const WAITER = 'Young waiter, 26 years old, slim build, dark hair tied in a small ponytail, black apron over a cream shirt, dark trousers';
const COOK = 'Male line cook, 33 years old, sturdy build, dark bandana tied on his head, white chef jacket with a walnut-brown apron';
const BARISTA = 'Young barista woman, 24 years old, freckles, light brown hair in a loose bun, sage-green apron over a cream t-shirt';
const HOSTESS = 'Young hostess woman, 27 years old, long chestnut braid, terracotta dress, small blank card holder in one hand';

const STAFF: Job[] = [
  { id: 'waiter_great', prompt: `${STYLE} ${WAITER}. Cheerful bright smile, holding a serving tray high and steady, one small sage-green sparkle mark near his head. ${FRAME_ALPHA}` },
  { id: 'waiter_normal', prompt: `${STYLE} ${WAITER}. Calm friendly working smile, holding the tray at hip level with a few dishes. ${FRAME_ALPHA}` },
  { id: 'waiter_warning', prompt: `${STYLE} ${WAITER}. Tired strained face, wiping his forehead with a cloth, one amber-orange sweat drop at his temple. ${FRAME_ALPHA}` },
  { id: 'waiter_critical', prompt: `${STYLE} ${WAITER}. Exhausted desperate face, two short dark red stress lines above his head, tray with empty plates trembling in his hands. ${FRAME_ALPHA}` },
  { id: 'cook_great', prompt: `${STYLE} ${COOK}. Proud confident smile, holding a spatula raised up, one small sage-green sparkle mark near his head. ${FRAME_ALPHA}` },
  { id: 'cook_normal', prompt: `${STYLE} ${COOK}. Focused cooking expression, stirring with the spatula. ${FRAME_ALPHA}` },
  { id: 'cook_warning', prompt: `${STYLE} ${COOK}. Annoyed frown, arms crossed, one amber-orange sweat drop at his temple. ${FRAME_ALPHA}` },
  { id: 'cook_critical', prompt: `${STYLE} ${COOK}. Furious stressed face, puffs of steam rising from both sides of his head, two short dark red stress lines above his head. ${FRAME_ALPHA}` },
  { id: 'barista_great', prompt: `${STYLE} ${BARISTA}. Beaming smile, holding up a finished latte cup with milk foam art, one small sage-green sparkle mark near her head. ${FRAME_ALPHA}` },
  { id: 'barista_normal', prompt: `${STYLE} ${BARISTA}. Friendly focused smile, pouring coffee from a small steel pitcher. ${FRAME_ALPHA}` },
  { id: 'barista_warning', prompt: `${STYLE} ${BARISTA}. Worried face, glancing sideways at an unseen machine, one amber-orange sweat drop at her temple. ${FRAME_ALPHA}` },
  { id: 'barista_critical', prompt: `${STYLE} ${BARISTA}. Distressed face, holding a wrench tool awkwardly as if repairing, two short dark red stress lines above her head. ${FRAME_ALPHA}` },
  { id: 'hostess_great', prompt: `${STYLE} ${HOSTESS}. Radiant welcoming smile, one arm open in a warm greeting gesture, one small sage-green sparkle mark near her head. ${FRAME_ALPHA}` },
  { id: 'hostess_normal', prompt: `${STYLE} ${HOSTESS}. Friendly professional smile, card holder held at her waist. ${FRAME_ALPHA}` },
  { id: 'hostess_warning', prompt: `${STYLE} ${HOSTESS}. Flustered rushed face, checking the blank card holder closely, one amber-orange sweat drop at her temple. ${FRAME_ALPHA}` },
  { id: 'hostess_critical', prompt: `${STYLE} ${HOSTESS}. Overwhelmed tired face, both hands pressed to her temples, two short dark red stress lines above her head. ${FRAME_ALPHA}` },
];

// ── 3. Гости (мини-группы, хрома) ────────────────────────────────────────
const GUESTS: Job[] = [
  { id: 'guest_business_happy', prompt: `${STYLE} Businessman guest, 38 years old, graphite-grey suit, small black briefcase, standing content and satisfied after a good meal, relaxed happy smile. ${FRAME_ALPHA}` },
  { id: 'guest_business_neutral', prompt: `${STYLE} Businessman guest, 38 years old, graphite-grey suit, small black briefcase, standing with a neutral calm businesslike face. ${FRAME_ALPHA}` },
  { id: 'guest_business_unhappy', prompt: `${STYLE} Businessman guest, 38 years old, graphite-grey suit, small black briefcase, standing dissatisfied: deep frown, unhappy eyebrows, one short dark red annoyance line above his head. ${FRAME_ALPHA}` },
  { id: 'guest_family_happy', prompt: `${STYLE} Family of three: mother in a sage-green cardigan, father in a brown jacket, and a small laughing child holding a plush teddy bear, standing together all smiling happily. ${FRAME_ALPHA}` },
  { id: 'guest_family_neutral', prompt: `${STYLE} Family of three: mother in a sage-green cardigan, father in a brown jacket, and a small calm child holding a plush teddy bear, standing together with neutral pleasant faces. ${FRAME_ALPHA}` },
  { id: 'guest_family_unhappy', prompt: `${STYLE} Family of three: mother in a sage-green cardigan, father in a brown jacket, both frowning and disappointed, and a cranky crying child hugging the plush teddy bear, one short dark red annoyance line above the child. ${FRAME_ALPHA}` },
  { id: 'guest_couple_happy', prompt: `${STYLE} Romantic dinner couple in their thirties: man in a walnut-brown jacket, woman in a terracotta dress, standing close together smiling warmly at each other, one small sage-green sparkle mark between them. ${FRAME_ALPHA}` },
  { id: 'guest_couple_neutral', prompt: `${STYLE} Romantic dinner couple in their thirties: man in a walnut-brown jacket, woman in a terracotta dress, standing side by side with calm pleasant faces. ${FRAME_ALPHA}` },
  { id: 'guest_couple_unhappy', prompt: `${STYLE} Romantic dinner couple in their thirties: man in a walnut-brown jacket, woman in a terracotta dress, both disappointed, looking away from each other with crossed arms, one short dark red annoyance line above them. ${FRAME_ALPHA}` },
];

// ── 4. Слои зала (объекты, хрома) ────────────────────────────────────────
const LAYERS: Job[] = [
  { id: 'queue_small', prompt: `${STYLE} Two standing guests waiting in a short queue: a woman in a cream coat and a man in a brown jacket, calm patient neutral faces, standing close one behind another. ${FRAME_ALPHA}` },
  { id: 'queue_medium', prompt: `${STYLE} Five standing guests waiting in a queue: mixed adults in warm-colored autumn coats, some checking their watches, mildly tired faces, arranged in a compact vertical group. ${FRAME_ALPHA}` },
  { id: 'queue_large', prompt: `${STYLE} Eight standing guests waiting in a long crowded queue: tired and displeased faces, crossed arms, one man checking his watch, two short dark red annoyance lines above two heads, compact vertical group. ${FRAME_ALPHA}` },
  { id: 'floor_dirty', prompt: `${STYLE} Light floor dirt on warm walnut wooden floor boards: pale grey smudge stains, scattered small crumbs, one crumpled paper napkin in the corner, wide horizontal composition. ${FRAME_OBJECT}` },
  { id: 'dirty_dishes', prompt: `${STYLE} A tall stack of used dirty plates with grey smudges and scattered cutlery on a small wooden counter top. ${FRAME_OBJECT}` },
  { id: 'coffee_warning', prompt: `${STYLE} A professional warm-grey espresso coffee machine with a small amber liquid puddle spreading underneath it and a few hanging drops leaking from the group head. ${FRAME_OBJECT}` },
  { id: 'coffee_broken', prompt: `${STYLE} A professional warm-grey espresso coffee machine with grey smoke puffs rising from the top and a small dark X-shaped cross mark on its blank display. ${FRAME_OBJECT}` },
  { id: 'kitchen_steam', prompt: `${STYLE} Two soft translucent cream-grey steam clouds floating horizontally, gentle rounded puffs. ${FRAME_OBJECT}` },
  { id: 'kitchen_smoke', prompt: `${STYLE} Several thick dense grey smoke clouds with small amber sparks and glowing embers rising. ${FRAME_OBJECT}` },
  { id: 'penalty_notice', prompt: `${STYLE} A single blank white paper notice sheet, slightly tilted, with a small beige round wax seal at the bottom, no markings on the paper. ${FRAME_OBJECT}` },
];

// ── 5. Сцена склада (1344×768) + слои склада (хрома) ─────────────────────
const SCENE_WAREHOUSE = `${STYLE} Cozy restaurant warehouse interior, no people, empty clean room. Emerald bistro palette: deep dark green upper walls #07392F, lower walls tiled in dark emerald green #0D4A3C with thin lighter seams #175747, walnut wood floor, warm graphite metal shelving racks with wooden crates and cardboard boxes along the back and side walls, a large chest freezer with muted blue-grey tint #BFD0CE on the left side, a wooden receiving table with a mechanical scale in the foreground right, warm graphite pendant lamps, a sage-green potted plant near the door. Slight top-down 30 degree stage perspective, warm light from ceiling lamps.`;

const WAREHOUSE_LAYERS: Job[] = [
  { id: 'shelves_full', prompt: `${STYLE} A metal shelf segment completely filled with wooden crates and cardboard boxes, neat and abundant, fully stocked. ${FRAME_OBJECT}` },
  { id: 'shelves_low', prompt: `${STYLE} A metal shelf segment only half filled: a few boxes and one crate standing far apart, half empty shelves. ${FRAME_OBJECT}` },
  { id: 'shelves_empty', prompt: `${STYLE} A completely empty metal shelf segment with bare shelves and a thin grey cobweb in the upper corner. ${FRAME_OBJECT}` },
  { id: 'spoiled_food', prompt: `${STYLE} An open wooden crate with greenish spoiled vegetables and dark rot spots, three small flies hovering above, thin wavy stink lines rising. ${FRAME_OBJECT}` },
];

const JOBS: Job[] = [
  ...PORTRAITS,
  ...STAFF,
  ...GUESTS,
  ...LAYERS,
  { id: 'warehouse_base', prompt: SCENE_WAREHOUSE, size: '1344x768' },
  ...WAREHOUSE_LAYERS,
];

async function main() {
  console.log(`P0b started: ${new Date().toISOString()}, jobs: ${JOBS.length}`);
  const zai = await ZAI.create();
  let ok = 0;
  const newPrompts: string[] = [];
  for (const job of JOBS) {
    const outPath = path.join(OUT, `${job.id}.png`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 20000) {
      console.log(`= ${job.id} (already exists, skip)`);
      ok++;
      continue;
    }
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        const t0 = Date.now();
        const response = await zai.images.generations.create({ prompt: job.prompt, size: (job.size ?? '1024x1024') as never });
        const b64 = response?.data?.[0]?.base64;
        if (!b64) throw new Error('empty base64');
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 20000) throw new Error(`small (${buf.length}b)`);
        fs.writeFileSync(outPath, buf);
        console.log(`+ ${job.id} (${(buf.length / 1024).toFixed(0)} Kb, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        newPrompts.push(`\n## p0b/${job.id}\n\`\`\`\n${job.prompt}\n\`\`\`\n`);
        ok++;
        done = true;
      } catch (e) {
        console.error(`- ${job.id} attempt ${attempt}: ${(e as Error).message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  if (newPrompts.length) fs.appendFileSync(PROMPTS_FILE, newPrompts.join(''));
  console.log(`DONE: ${ok}/${JOBS.length}`);
  if (ok < JOBS.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
