/**
 * VLM-QA скриншотов задачи 28 (ник в визарде + рейтинг игроков).
 * Запуск: bun scripts/qa-28.ts → download/28-qa.md
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const FILES: [string, string][] = [
  [
    '28-wizard-nick.png',
    'Первый шаг визарда открытия ресторана. Вопросы: (1) есть ли блок «Ваш ник (для рейтинга среди друзей)» с полем ввода; (2) видна ли красная подсказка «Ник нужен для рейтинга — минимум 2 символа»; (3) кнопка «Далее» внизу выглядит неактивной (серой/disabled); (4) ниже ли блок выбора сложности с тремя карточками (Новичок/Стандарт/Профессионал).',
  ],
  [
    '28-leaderboard.png',
    'Диалог «Рейтинг игроков» (открыт из Настроек). Вопросы: (1) есть ли таблица с колонками # / ИГРОК / УРОВЕНЬ / ОЧКИ; (2) первая строка — АннаШеф с медалью/местом 1 и очками 846; (3) есть ли строка ТестРейтинг (место 2, уровень B+, 720); (4) у уровней цветные бейджи (A — зелёный, B — жёлтый/янтарный, C/D — серый); (5) внизу строка «Записей в рейтинге: 5» и кнопка «Обновить».',
  ],
  [
    '28-final-leaderboard.png',
    'Финальный экран игры (диалог) со списком рейтинга. Вопросы: (1) есть ли зелёная строка «✓ Результат отправлен в рейтинг»; (2) в таблице строка ТестРейтинг подсвечена бежевым/янтарным фоном с бейджем «это вы»; (3) в шапке финального экрана видно 557 / 1000 и «УРОВЕНЬ C+».',
  ],
];

const OUT = path.resolve('download/28-qa.md');

async function main() {
  const zai = await ZAI.create();
  const lines: string[] = [`# 28 VLM-QA — ${new Date().toISOString()}`, ''];
  for (const [file, question] of FILES) {
    const p = path.resolve('download', file);
    if (!fs.existsSync(p)) {
      lines.push(`## ${file}\n- ФАЙЛ НЕ НАЙДЕН\n`);
      continue;
    }
    const b64 = fs.readFileSync(p).toString('base64');
    try {
      const response = await zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Скриншот UI браузерной игры. ${question} Ответь СТРОГО компактным JSON без markdown: {"q1":..., "q2":..., "q3":..., "q4":..., "q5":..., "notes":"<проблемы, если есть, иначе пусто>"} — значения true/false или краткий текст (лишние ключи можно опустить).`,
              },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      });
      const raw = response.choices[0]?.message?.content ?? '';
      lines.push(`## ${file}\n\`\`\`\n${raw}\n\`\`\`\n`);
      console.log(`${file}: OK`);
    } catch (e) {
      lines.push(`## ${file}\n- ОШИБКА VLM: ${String(e).slice(0, 300)}\n`);
      console.log(`${file}: FAIL ${String(e).slice(0, 120)}`);
    }
  }
  fs.writeFileSync(OUT, lines.join('\n'), 'utf-8');
  console.log('→', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
