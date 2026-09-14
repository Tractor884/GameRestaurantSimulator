/** Task 28 (e2e-помощник): прогон пассивной партии 52 недели с ником и
 * дамп финального GameState в JSON-файл для импорта в браузере через
 * «Настройки → Импорт JSON» — так финальный экран (GameOverDialog) можно
 * проверить в e2e без 52 недель живой игры. Мутирует только движок, не браузер.
 * Запуск: bun run scripts/make-final-save.ts [nick] [outFile] */
import { createGame, simulateDay, resolveEvent } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';
import { writeFileSync } from 'node:fs';

const NICK = process.argv[2] ?? 'ТестРейтинг';
const OUT = process.argv[3] ?? 'download/28-final-save.json';

let state: GameState = createGame({
  seed: 4242,
  restaurantName: 'Ложка-Поварёшка',
  nick: NICK,
  difficultyId: 'standard',
  locationId: 'tverskaya',
  premisesSize: 'medium',
  renovation: 'standard',
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
  alcoholLicense: false,
});

for (let i = 0; i < 52 * 7 && state.phase !== 'gameover'; i++) {
  const res = simulateDay(state, { plannedActions: [] }, state.seed);
  state = res.state;
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
    if (!options) continue;
    let idx = 0;
    for (let k = 0; k < options.length; k++) {
      if (state.restaurant!.finance.cash >= options[k].cost) idx = k;
    }
    if (!resolveEvent(state, e.id, idx).ok) resolveEvent(state, e.id, 0);
  }
  state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
}

if (state.phase !== 'gameover') {
  console.error('Игра не дошла до gameover, phase =', state.phase);
  process.exit(1);
}

const payload = JSON.stringify({ state, date: new Date().toISOString() }, null, 2);
writeFileSync(OUT, payload, 'utf-8');
console.log('OK: nick =', state.playerNick, '· недель =', state.history.weekStats.length);
console.log('статус =', state.status, '· файл =', OUT, `(${payload.length} байт)`);
