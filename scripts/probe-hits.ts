import { createGame, simulateDay, startDayRun, runHoursUntil } from '../src/lib/game/engine';

const opts = {
  seed: 12345, restaurantName: 'Тест', locationId: 'tverskaya',
  premisesSize: 'medium' as const, renovation: 'standard' as const, loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false, alcoholLicense: false,
};
let state = createGame(opts);
for (let i = 0; i < 18; i++) state = simulateDay(state, { plannedActions: [] }, state.seed).state;
console.log('день:', state.week, state.day);
// Ручной прогон до 16:00
const { draft, run } = startDayRun(state, state.seed);
runHoursUntil(draft, run, 16);
console.log('hits к 15:', run.totals.stopListHits, 'orders:', run.totals.orders, 'guests:', Math.round(run.totals.guests));
// Полный день через simulateDay (эталон)
const full = simulateDay(state, { plannedActions: [] }, state.seed);
// Соберём hits из полного прогона по hourLogs до 15
let hits = 0, orders = 0, guests = 0;
for (const h of full.result.hourLogs) { if (h.hour < 16) { hits += 0; guests += h.seated; } }
console.log('полный день: guests(до15)=' + guests, 'kpi.stopListHits=' + full.result.kpi.stopListHits, 'kpi.orders=' + full.result.kpi.ordersCount);
