/** Зонд: почасовые загрузки станций недели 3 (утро/вечер) для точной
 * подстройки дефолтного графика. Запуск: bun run scripts/probe-loads.ts */
import { createGame, simulateDay } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';

let state: GameState = createGame({
  seed: 20250,
  restaurantName: 'Зонд',
  locationId: 'tverskaya',
  premisesSize: 'medium',
  renovation: 'standard',
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
  veranda: false,
  alcoholLicense: false,
});

for (let i = 0; i < 21; i++) {
  const res = simulateDay(state, { plannedActions: [] }, state.seed);
  state = res.state;
}

// Неделя 3: dayLogs хранит последние 7 дней.
console.log('=== Почасовая загрузка станций (неделя 3) ===');
const stations = ['hot_kitchen', 'cold_kitchen', 'dessert', 'coffee', 'bar_service'];
const all: Record<string, { day: number; hour: number; load: number }[]> = {};
for (const st of stations) all[st] = [];
for (const log of state.history.dayLogs) {
  for (const h of log.hourLogs) {
    for (const st of stations) {
      const v = h.stationLoads[st] ?? 0;
      if (v > 0.01) all[st].push({ day: log.date.day, hour: h.hour, load: v });
    }
  }
}
for (const st of stations) {
  const top = all[st].sort((a, b) => b.load - a.load).slice(0, 8);
  console.log(`\n${st}: топ-8 часов`);
  for (const t of top) {
    console.log(`  д${t.day} ч${t.hour}: ${t.load.toFixed(2)}`);
  }
}
// Гистограмма загрузки холодного цеха по часам дня (все 7 дней).
console.log('\n=== cold_kitchen по часам (медиана по дням) ===');
const byHour: Record<number, number[]> = {};
for (const x of all['cold_kitchen']) (byHour[x.hour] ??= []).push(x.load);
for (const h of Object.keys(byHour).map(Number).sort((a, b) => a - b)) {
  const vals = byHour[h].slice().sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  const flag = med > 1.15 ? ' ПЕРЕГРУЗ' : med < 0.5 ? ' недогруз' : '';
  console.log(`  час ${h}: медиана ${med.toFixed(2)} (${vals.length} дн)${flag}`);
}
