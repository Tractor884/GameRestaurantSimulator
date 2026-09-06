/* Тест: репутационный риск = 100 → 2 недели хорошего сервиса → должен упасть. */
import { createGame, simulateWeek } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';

const opts = {
  seed: 777,
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

// Прогрев 2 недели (штат адаптируется, рейтинг установится)
for (let i = 0; i < 2; i++) state = simulateWeek(state, state.seed).state;

// Симулируем «последствия скандала»: все риски на 100
state.restaurant!.risks.reputation = 100;
state.restaurant!.risks.sanitary = 100;
state.restaurant!.risks.staff = 100;

console.log('=== ПОСЛЕ СКАНДАЛА: все риски 100 ===');
console.log('репутация:', state.restaurant!.risks.reputation);

for (let i = 0; i < 3; i++) {
  state = simulateWeek(state, state.seed).state;
  const r = state.restaurant!.risks;
  console.log(`нед ${i + 1}: репутация ${r.reputation.toFixed(0)}, санитария ${r.sanitary.toFixed(0)}, кадры ${r.staff.toFixed(0)}`);
}

const last = state.history.weekStats[state.history.weekStats.length - 1];
console.log('рейтинг:', last.rating.toFixed(2), '| выручка:', Math.round(last.revenue / 1000), 'тыс');
console.log('усталость повар гор.:', state.restaurant!.staff.pools.hot_cook.fatigue.toFixed(0));
