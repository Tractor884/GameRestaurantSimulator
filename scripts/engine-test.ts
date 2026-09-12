/* Headless-тест движка: 6 недель по дням (кнопка «День»), проверки багов. */
import { createGame, simulateDay, simulateWeek, resolveEvent } from '../src/lib/game/engine';
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

// Запускаем кампанию на 3 недели
state.restaurant!.marketing.campaigns.push({
  channelId: 'social_ads',
  weeklyBudget: 100_000,
  startWeek: 0,
  durationWeeks: 3,
});

let weeksClosed = 0;
let fatigueSeen = 0;
for (let i = 0; i < 42; i++) {
  const before = state.week;
  const { state: next } = simulateDay(state, { plannedActions: [] }, state.seed);
  state = next;
  // v9: дилеммы/системные события приходят и в здоровой игре — бенчмарк
  // должен их проживать (пассивный игрок берёт первый вариант).
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    resolveEvent(state, e.id, 0);
  }
  if (state.week > before) weeksClosed++;
  const avgF = Object.values(state.restaurant!.staff.pools)
    .filter((p) => p.count > 0)
    .reduce((s, p) => s + p.fatigue * p.count, 0) /
    Math.max(1, Object.values(state.restaurant!.staff.pools).reduce((s, p) => s + p.count, 0));
  fatigueSeen = Math.max(fatigueSeen, avgF);
}

const w = state.history.weekStats;
console.log('=== ТЕСТ ПО ДНЯМ (42 нажатия «День») ===');
console.log('недель закрыто:', weeksClosed, '(ожидание 6)');
console.log('weekStats записей:', w.length);
console.log('касса:', Math.round(state.restaurant!.finance.cash / 1000), 'тыс ₽');
console.log('payrollGross остаток:', state.restaurant!.finance.accrued.payrollGross, '(ожидание 0)');
console.log('максимальная средняя усталость:', fatigueSeen.toFixed(1));
console.log('weekResult есть:', !!state.weekResult, 'неделя:', state.weekResult?.week);
if (w.length >= 4) {
  const last = w[w.length - 1];
  console.log('последняя неделя: выручка', Math.round(last.revenue / 1000), 'тыс, FC', (last.foodCost * 100).toFixed(1) + '%, LC', (last.laborCost * 100).toFixed(1) + '%, рейтинг', last.rating.toFixed(2));
}

// === Кампании: экспирация и затухание ===
console.log('\n=== КАМПАНИИ ===');
console.log('кампании после 6 нед:', JSON.stringify(state.restaurant!.marketing.campaigns.map(c => ({ ch: c.channelId, ended: c.endedWeek }))));
console.log('риск репутации:', state.restaurant!.risks.reputation.toFixed(1));
console.log('риски:', JSON.stringify(Object.fromEntries(Object.entries(state.restaurant!.risks).map(([k, v]) => [k, Math.round(v)]))));

// === Ещё 4 недели кнопкой «Неделя» — риски должны тянуться вниз при хорошем сервисе ===
for (let i = 0; i < 4; i++) {
  const r = simulateWeek(state, state.seed);
  state = r.state;
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    resolveEvent(state, e.id, 0);
  }
}
console.log('\n=== ПОСЛЕ 4 НЕДЕЛЬ ЧЕРЕЗ КНОПКУ «НЕДЕЛЯ» ===');
console.log('риск репутации:', state.restaurant!.risks.reputation.toFixed(1), '(должен снижаться при хорошем сервисе)');
console.log('недель всего:', state.history.weekStats.length);
const last = state.history.weekStats[state.history.weekStats.length - 1];
console.log('последняя неделя: выручка', Math.round(last.revenue / 1000), 'тыс, рейтинг', last.rating.toFixed(2), 'BSC', last.bsc);
console.log('усталость повар гор.:', state.restaurant!.staff.pools.hot_cook.fatigue.toFixed(1));
console.log('усталость официант:', state.restaurant!.staff.pools.waiter.fatigue.toFixed(1));
console.log('мораль средняя:', (Object.values(state.restaurant!.staff.pools).reduce((s, p) => s + p.morale, 0) / 10).toFixed(0));
console.log('кампании:', JSON.stringify(state.restaurant!.marketing.campaigns.map(c => ({ ch: c.channelId, ended: c.endedWeek }))));
