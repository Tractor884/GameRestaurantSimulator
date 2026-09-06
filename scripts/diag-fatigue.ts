/* Сценарий: нехватка персонала → усталость должна расти; найм → восстанавливаться. */
import { createGame, simulateDay, hireStaff } from '../src/lib/game/engine';
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

// Увольним 3 поваров горячего и 3 официантов — дефицит на пиках
state.restaurant!.staff.pools.hot_cook.count -= 3;
state.restaurant!.staff.pools.waiter.count -= 3;

console.log('=== ДЕФИЦИТ ПЕРСОНАЛА (−3 повара, −3 официанта), 3 недели ===');
for (let i = 0; i < 21; i++) {
  state = simulateDay(state, { plannedActions: [] }, state.seed).state;
}
const p = state.restaurant!.staff.pools;
console.log('повар гор. усталость:', p.hot_cook.fatigue.toFixed(0), '(ожидание: растёт, 50+)');
console.log('официант усталость:', p.waiter.fatigue.toFixed(0), '(ожидание: растёт)');
console.log('посудомойщик:', p.dishwasher.fatigue.toFixed(0));
console.log('мораль повар:', p.hot_cook.morale.toFixed(0));
const w = state.history.weekStats;
console.log('нед 3: выручка', Math.round(w[w.length-1].revenue/1000), 'тыс, рейтинг', w[w.length-1].rating.toFixed(2));

console.log('\n=== НАЁМ (+4 повара, +4 официанта), ещё 3 недели ===');
hireStaff(state, 'hot_cook', 4);
hireStaff(state, 'waiter', 4);
for (let i = 0; i < 21; i++) {
  state = simulateDay(state, { plannedActions: [] }, state.seed).state;
}
const p2 = state.restaurant!.staff.pools;
console.log('повар гор. усталость:', p2.hot_cook.fatigue.toFixed(0), '(ожидание: снижается)');
console.log('официант усталость:', p2.waiter.fatigue.toFixed(0), '(ожидание: снижается)');
const w2 = state.history.weekStats;
console.log('нед 6: выручка', Math.round(w2[w2.length-1].revenue/1000), 'тыс, рейтинг', w2[w2.length-1].rating.toFixed(2));
