/** Точечная перегенерация одного ассета: bun scripts/gen-art-one.ts <id> <prompt-file> */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const [id, promptFile] = process.argv.slice(2);
if (!id || !promptFile) { console.error('usage: bun scripts/gen-art-one.ts <id> <prompt-file>'); process.exit(1); }
const prompt = fs.readFileSync(promptFile, 'utf8').trim();
const outPath = path.resolve(`download/art-raw/p0a/${id}.png`);
fs.rmSync(outPath, { force: true });
const zai = await ZAI.create();
for (let a = 1; a <= 3; a++) {
  try {
    const r = await zai.images.generations.create({ prompt, size: '1024x1024' as never });
    const buf = Buffer.from(r?.data?.[0]?.base64 ?? '', 'base64');
    if (buf.length < 20000) throw new Error('small');
    fs.writeFileSync(outPath, buf);
    fs.appendFileSync(path.resolve('public/game-art/_prompts.md'), `\n## p0a-fix2/${id}\n\`\`\`\n${prompt}\n\`\`\`\n`);
    console.log(`+ ${id} ${(buf.length / 1024).toFixed(0)}Kb`);
    process.exit(0);
  } catch (e) { console.error(`- ${id} attempt ${a}: ${(e as Error).message}`); }
}
process.exit(1);
