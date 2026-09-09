import { createGame, simulateDay, resolveEvent } from '../src/lib/game/engine';
import type { GameState, RoleId } from '../src/lib/game/types';
import { ROLE_IDS } from '../src/lib/game/config/staffRoles.config';

const BASE_OPTS = {
  seed: 777, restaurantName: 'Диаг', locationId: 'tverskaya', premisesSize: 'medium' as const,
  renovation: 'standard' as const, loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false, alcoholLicense: false,
};

function run(weeks: number, cutStaff = 0): GameState {
  let state: GameState = createGame(BASE_OPTS);
  if (cutStaff > 0) for (const r of ROLE_IDS) {
    const p = state.restaurant!.staff.pools[r as RoleId];
    p.count = Math.max(1, Math.round(p.count * (1 - cutStaff)));
  }
  const fatigueByQuarter: number[] = [];
  const neg235: number[] = [0, 0, 0, 0]; const neg30: number[] = [0, 0, 0, 0]; const neg25: number[] = [0, 0, 0, 0];
  for (let i = 0; i < weeks * 7 && state.phase !== 'gameover'; i++) {
    const res = simulateDay(state, { plannedActions: [] }, state.seed);
    state = res.state;
    for (const e of state.activeEvents.filter((x) => !x.resolved)) {
      resolveEvent(state, e.id, 0);
    }
    state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
    const w = state.week;
    if (w % 13 === 0 && w / 13 > fatigueByQuarter.length) {
      const pools = Object.values(state.restaurant!.staff.pools);
      const n = pools.reduce((s, p) => s + p.count, 0);
      const f = n > 0 ? pools.reduce((s, p) => s + p.fatigue * p.count, 0) / n : 0;
      fatigueByQuarter.push(f);
    }
    const q = Math.min(3, Math.floor((w - 1) / 13));
    for (const rev of res.result.reviews) {
      if (rev.score <= 2.5) neg235[q]++;
      if (rev.score <= 3.0) neg30[q]++;
      if (rev.score <= 2.0) neg25[q]++;
    }
  }
  console.log(`  усталость по Q: ${fatigueByQuarter.map((f) => f.toFixed(0)).join(' / ')}`);
  console.log(`  отзывы ≤2.0 по Q: ${neg25.join(' / ')} · ≤2.5: ${neg235.join(' / ')} · ≤3.0: ${neg30.join(' / ')}`);
  console.log(`  satisfaction последн. дней: ${state.history.dayLogs.slice(-3).map((l) => l.kpi.satisfaction).join(', ')}`);
  return state;
}
console.log('S0 пассив:'); run(52);
console.log('C (−25%):'); run(52, 0.25);
