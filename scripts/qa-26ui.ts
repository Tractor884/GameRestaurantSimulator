/**
 * VLM-QA скриншотов задачи 26-ui (Склад/Отзывы/Графики).
 * Запуск: bun scripts/qa-26ui.ts → download/26ui-qa.md
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const FILES: [string, string][] = [
  ['26ui-warehouse.png', 'Экран «Склад», секция «Ожидают доставки». Вопросы: (1) виден ли скроллбар справа внутри секции; (2) есть ли sticky-подзаголовки групп «Сегодня»/«Завтра» с количеством; (3) есть ли бейдж в шапке секции вида «N поз. · оплачено X»; (4) есть ли внизу строка «Итого к доставке: N позиций на X»; (5) не вылезает ли список за границы карточки.'],
  ['26ui-reviews.png', 'Экран «Отзывы». Вопросы: (1) видна ли под гистограммой строка-пояснение про «Негативными считаются оценки ≤3,5 (столбцы 1–3)»; (2) есть ли ненулевые столбцы 1–3 со звёздами (красный/жёлтый); (3) есть ли на карточках отзывов красный бейдж «ждёт ответа»; (4) отображаются ли дробные оценки вида «3,4/5».'],
  ['26ui-schedule-hint.png', 'Экран «Графики», раскрытая методичка «Как рассчитать нужные смены и людей». Вопросы: (1) видны ли 5 разделов (пропускная способность, формула, правило пула, норма занятости, пример расчёта); (2) есть ли кнопки «Смотреть почасовой график» и «Академия: планирование смен».'],
  ['26ui-schedule-stations.png', 'Экран «Графики», секция «Загрузка станций». Вопросы: (1) есть ли в каждой карточке строка «люди:» с ролями и количеством; (2) есть ли советы про одиночные роли (например «бариста один на смену — снимать смену нельзя»); (3) есть ли внизу легенда «Советы учитывают, кто реально стоит в сменах».'],
];

const OUT = path.resolve('download/26ui-qa.md');

async function main() {
  const zai = await ZAI.create();
  const lines: string[] = [`# 26-ui VLM-QA — ${new Date().toISOString()}`, ''];
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
                text: `Скриншот UI браузерной игры. ${question} Ответь СТРОГО компактным JSON без markdown: {"q1":..., "q2":..., "q3":..., "q4":..., "notes":"<проблемы, если есть, иначе пусто>"} — значения true/false или краткий текст.`,
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
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`→ ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
