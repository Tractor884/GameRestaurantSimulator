/* Диагностика системных событий v8 (запуск: bun run scripts/diag-v8.ts). */
import { createGame, simulateDay, resolveEvent } from '../src/lib/game/engine';
import { computeFinalGrade } from '../src/lib/game/engine/finalGrade';

let state = createGame({
  seed: 777,
  restaurantName: 'T',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
});

const seen = new Set();
let landlordTalks = 0;
for (let i = 0; i < 52 * 7 && state.phase !== 'gameover'; i++) {
  const res = simulateDay(state, { plannedActions: [] }, state.seed);
  state = res.state;
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    if (!seen.has(e.templateId)) {
      seen.add(e.templateId);
      console.log('EVENT:', e.templateId, '| нед', e.date.week, '| резолюций:', (e.resolutions ?? []).length);
      if (e.templateId.startsWith('landlord')) landlordTalks++;
    }
    const options = e.resolutions;
    if (!options) continue;
    let idx = 0;
    for (let k = 0; k < options.length; k++) if (state.restaurant!.finance.cash >= options[k].cost) idx = k;
    if (!resolveEvent(state, e.id, idx).ok) resolveEvent(state, e.id, 0);
  }
  state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
}
console.log('---');
console.log('ownerTrust:', Math.round(state.restaurant!.finance.ownerTrust ?? -1));
console.log(
  'дивиденды:',
  JSON.stringify(
    state.restaurant!.finance.dividends?.history?.map((h) => ({ q: h.quarter, paid: Math.round(h.paid / 1000) + 'т', d: h.trustDelta })),
  ),
);
console.log(
  'аренда: база',
  state.restaurant!.landlord?.rentBase,
  '→ текущая',
  state.restaurant!.rentMonthly,
  'отношения',
  state.restaurant!.landlord?.relation,
  'отказов',
  state.restaurant!.landlord?.refusals,
  'разговоров',
  landlordTalks,
);
console.log('переезды:', state.history.relocations);
const grade = computeFinalGrade(state);
console.log('ФИНАЛЬНЫЙ РАНГ:', grade.rank, '| скор', (grade.score * 100).toFixed(0), '| оси:', JSON.stringify(grade.axes));
console.log('спец:', JSON.stringify(grade.special));
