import { createGame, simulateDay, simulateDayUntilPause } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';
const opts = {
  seed: 777, restaurantName: 'Т', locationId: 'tverskaya',
  premisesSize: 'medium' as const, renovation: 'standard' as const, loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false, alcoholLicense: false,
};
let state: GameState = createGame(opts);
const counts: Record<string, number> = {};
let pauses = 0;
for (let i = 0; i < 56; i++) {
  const res = simulateDayUntilPause(state, state.seed);
  if (res.midday) {
    pauses++;
    for (const p of res.midday.problems) counts[p.id] = (counts[p.id] ?? 0) + 1;
    if (pauses <= 6) {
      const s = res.midday;
      console.log(`д${i}: [${s.problems.map(p=>p.id).join(',')}] guests=${s.guests} lost=${s.lostGuests} hits=${s.stopListHits} sat=${s.satisfactionSoFar} peak=${s.stationPeak.map(p=>p.load.toFixed(2)).join('/')} cash=${Math.round(s.cash/1000)}k`);
    }
    state = simulateDay(state, { plannedActions: [] }, state.seed).state;
  } else {
    state = res.draft;
  }
}
console.log(`недель 8: пауз ${pauses}/56 дней;`, JSON.stringify(counts));
