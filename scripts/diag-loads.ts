/* Диагностика: загрузка станций по часам и накопление усталости по ролям. */
import { createGame, simulateDay } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';

const opts = {
  seed: 12345,
  restaurantName: 'Тест',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
};

let state: GameState = createGame(opts);

const pools = state.restaurant!.staff.pools;
console.log('Стартовые пулы (роль: чел):');
for (const [role, p] of Object.entries(pools)) console.log(' ', role, p.count);

// Печать загрузок дня 4 (пятница) первой недели
let printed = false;
for (let i = 0; i < 21; i++) {
  const { result, state: next } = simulateDay(state, { plannedActions: [] }, state.seed);
  state = next;
  if (!printed && i === 4) {
    printed = true;
    console.log('\nЧасовые загрузки (день 5, нед 1):');
    for (const h of result.hourLogs) {
      if (h.seated >= 5) {
        console.log(
          `  ${h.hour}:00 seated=${h.seated} waiters=${h.waiterLoad} hot=${h.stationLoads.hot_kitchen ?? 0} cold=${h.stationLoads.cold_kitchen ?? 0} dessert=${h.stationLoads.dessert ?? 0} bar=${h.stationLoads.bar_service ?? 0} orders=${h.orders}`,
        );
      }
    }
  }
}

console.log('\nУсталость по ролям после 3 недель:');
for (const [role, p] of Object.entries(state.restaurant!.staff.pools)) {
  console.log(' ', role, p.fatigue.toFixed(0), 'мораль', p.morale.toFixed(0), 'чел', p.count);
}
const last = state.history.weekStats[state.history.weekStats.length - 1];
console.log('неделя:', last.week, 'выручка', Math.round(last.revenue / 1000), 'тыс, рейтинг', last.rating.toFixed(2), 'удовл', last.satisfaction);
