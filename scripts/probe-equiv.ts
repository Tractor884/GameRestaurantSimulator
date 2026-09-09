import { createGame, simulateDay, simulateDayUntilPause } from '../src/lib/game/engine';
const opts = {
  seed: 777, restaurantName: 'Т', locationId: 'tverskaya',
  premisesSize: 'medium' as const, renovation: 'standard' as const, loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false, alcoholLicense: false,
};
let a = createGame(opts);
let b = createGame(opts);
let compared = 0;
let paused = 0;
for (let i = 0; i < 10; i++) {
  const r = simulateDayUntilPause(a, a.seed);
  if (r.midday) {
    paused++;
    // день с паузой: обе ветки проживают его обычным simulateDay (синхрон траекторий)
    a = simulateDay(a, { plannedActions: [] }, a.seed).state;
    b = simulateDay(b, { plannedActions: [] }, b.seed).state;
    continue;
  }
  const s = simulateDay(b, { plannedActions: [] }, b.seed).state;
  const same = JSON.stringify(r.draft) === JSON.stringify(s);
  compared++;
  if (!same) {
    console.log(`✗ день ${i}: расхождение! a(${a.week},${a.day}) b(${s.week},${s.day})`);
    process.exit(1);
  }
  a = r.draft;
  b = s;
}
console.log(`✓ no-pause дни идентичны simulateDay (сравнено ${compared}, с паузой ${paused})`);
