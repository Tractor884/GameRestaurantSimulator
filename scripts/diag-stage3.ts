/** ДИАГНОСТИКА ЭТАПА 3 §14: чистый эффект усталости меню и полная выгода
 *  ротации на нескольких seed (шум траекторий ±2% — одного прогона мало).
 *  Запуск: bun scripts/diag-stage3.ts
 */
import { createGame, simulateDay, resolveEvent, replyToReviews, toggleMenuDish, DISHES, menuFatigueFactor } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';

const CATS = ['breakfast', 'lunch', 'salad', 'soup', 'appetizer', 'hot', 'garnish', 'dessert', 'non_alc_drink', 'coffee'];

interface Opts { noFatigue?: boolean; refresh?: boolean }

function run(weeks: number, seed: number, o: Opts = {}): GameState {
  let state: GameState = createGame({
    seed, restaurantName: 'Диаг', locationId: 'tverskaya', premisesSize: 'medium' as const,
    renovation: 'standard' as const, loanAmount: 6_000_000,
    equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
    veranda: false, alcoholLicense: false,
  });
  for (let i = 0; i < weeks * 7 && state.phase !== 'gameover'; i++) {
    const res = simulateDay(state, { plannedActions: [] }, state.seed);
    state = res.state;
    for (const e of state.activeEvents.filter((x) => !x.resolved)) {
      const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
      if (!options) continue;
      resolveEvent(state, e.id, 0);
    }
    state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
    if (o.noFatigue && state.day === 0 && i > 0) {
      state.restaurant!.menu.categoryFreshness = {};
    }
    if (o.refresh && state.day === 0 && i > 0 && (state.week - 1) % 8 === 0) {
      const r = state.restaurant!;
      for (const cat of CATS) {
        const inMenu = r.menu.dishes.filter((id) => (DISHES.find((d) => d.id === id)?.category ?? '') === cat);
        const notIn = DISHES.filter((d) => d.category === cat && !r.menu.dishes.includes(d.id));
        if (inMenu.length > 1 && notIn.length > 0) {
          toggleMenuDish(state, inMenu[0]);
          toggleMenuDish(state, notIn[state.week % notIn.length].id);
        }
      }
    }
  }
  return state;
}

const SEEDS = [777, 20250, 42];
const q3 = (st: GameState) => st.history.weekStats.slice(26, 39);
const sum = (ws: { revenue: number }[]) => ws.reduce((s, w) => s + w.revenue, 0);
const guests = (ws: { guests: number }[]) => ws.reduce((s, w) => s + w.guests, 0);
// возвратные гости Q3 из dayLogs нет — берём weekStats.returningShare × guests, если есть
const returning = (ws: { guests: number; returningShare?: number }[]) =>
  ws.reduce((s, w) => s + w.guests * (w.returningShare ?? 0), 0);

for (const seed of SEEDS) {
  const stat = run(39, seed);
  const nofat = run(39, seed, { noFatigue: true });
  const live = run(39, seed, { refresh: true });
  const qs = q3(stat), qn = q3(nofat), ql = q3(live);
  const revD = ((sum(qn) - sum(qs)) / sum(qs)) * 100;
  const liveD = ((sum(ql) - sum(qs)) / sum(qs)) * 100;
  console.log(`seed ${seed}: усталость-эффект выручки Q3: ${revD >= 0 ? '+' : ''}${revD.toFixed(2)}% · живое меню: +${liveD.toFixed(2)}% · фактор ${ (menuFatigueFactor(stat.restaurant!) * 100).toFixed(1) }%`);
  console.log(`   возвратные гости Q3: статично ${Math.round(returning(qs))} · без усталости ${Math.round(returning(qn))} · Δ ${(((returning(qn) - returning(qs)) / Math.max(1, returning(qs))) * 100).toFixed(1)}% · доля возвратных ${((returning(qs) / Math.max(1, guests(qs))) * 100).toFixed(1)}%`);
}
