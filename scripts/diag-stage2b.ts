import { createGame, simulateDay, resolveEvent } from '../src/lib/game/engine';
import type { GameState, RoleId } from '../src/lib/game/types';
import { ROLE_IDS, STAFF_ROLES } from '../src/lib/game/config/staffRoles.config';
import { quitProbability } from '../src/lib/game/config/balance2.config';

const BASE_OPTS = {
  seed: 777, restaurantName: 'Диаг', locationId: 'tverskaya', premisesSize: 'medium' as const,
  renovation: 'standard' as const, loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false, alcoholLicense: false,
};

let state: GameState = createGame(BASE_OPTS);
const resignByWeek = new Map<number, string[]>();
for (let i = 0; i < 52 * 7 && state.phase !== 'gameover'; i++) {
  const res = simulateDay(state, { plannedActions: [] }, state.seed);
  state = res.state;
  for (const e of state.activeEvents.filter((x) => !x.resolved)) resolveEvent(state, e.id, 0);
  state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
}
const log = state.history.resignationLog ?? [];
console.log('увольнений всего:', log.length);
const byRole = new Map<string, number>();
for (const e of log) byRole.set(e.roleId, (byRole.get(e.roleId) ?? 0) + 1);
console.log('по ролям:', [...byRole.entries()].map(([r, n]) => `${STAFF_ROLES[r as RoleId].shortName}:${n}`).join(' '));
console.log('по неделям:', log.map((e) => e.week).join(','));
// мораль/усталость по ролям на конец года
for (const r of ROLE_IDS) {
  const p = state.restaurant!.staff.pools[r as RoleId];
  console.log(`${STAFF_ROLES[r as RoleId].shortName}: count=${p.count} F=${p.fatigue.toFixed(0)} M=${p.morale.toFixed(0)} p=${(quitProbability(p.fatigue, p.morale) * 100).toFixed(2)}%/нед`);
}
