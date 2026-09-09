/** ЭТАП 5 · диагностика S1/S2 против S4: почему алкоголь/веранда не дают
 *  расчётного прироста. Покомпонентный разбор выручки и узких мест.
 *  Мульти-seed S2: шум траектории ±3% — честный замер только по среднему. */
import { createGame, simulateDay, resolveEvent, replyToReviews, setProcurementPolicy, toggleMenuDish, hireSeasonalStaff } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';

const BASE_OPTS = {
  seed: 777,
  restaurantName: 'Diag5',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
};

function run(weeks: number, opts: { alcohol?: boolean; barFocus?: boolean; veranda?: boolean; hireWaiters?: number; seed?: number } = {}): GameState {
  let state: GameState = createGame({ ...BASE_OPTS, ...(opts.seed != null ? { seed: opts.seed } : {}), ...(opts.alcohol != null ? { alcoholLicense: opts.alcohol } : {}), ...(opts.veranda != null ? { veranda: opts.veranda } : {}) });
  setProcurementPolicy(state, 'premium');
  if (opts.barFocus) {
    for (const id of ['house_white_glass', 'gin_tonic']) {
      if (!state.restaurant!.menu.dishes.includes(id)) toggleMenuDish(state, id);
    }
  }
  for (let i = 0; i < weeks * 7 && state.phase !== 'gameover'; i++) {
    const res = simulateDay(state, { plannedActions: [] }, state.seed);
    state = res.state;
    for (const e of state.activeEvents.filter((x) => !x.resolved)) {
      const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
      if (!options) continue;
      let idx = 0;
      if (e.templateId !== 'owner_dividend') {
        for (let k = 0; k < options.length; k++) {
          if (state.restaurant!.finance.cash >= options[k].cost) idx = k;
        }
      }
      if (!resolveEvent(state, e.id, idx).ok) resolveEvent(state, e.id, options.length - 1);
    }
    state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
    if (state.day === 0) replyToReviews(state);
    if (opts.hireWaiters && state.week === 18 && state.day === 0) {
      // Сезонная бригада (движок): 2 официанта + 2 повара горячего цеха.
      hireSeasonalStaff(state, opts.hireWaiters);
    }
  }
  return state;
}

const s4 = run(26);
console.log('=== S4 (26 нед, без веранды/алкоголя) ===');
const s1 = run(26, { alcohol: true, barFocus: true });
console.log('=== S1 (лицензия + бар) ===');
const s2 = run(26, { veranda: true, hireWaiters: 2 });
console.log('=== S2 (веранда + 2 официанта с графиком) ===');

function dump(name: string, st: GameState) {
  const ws = st.history.weekStats.slice(-8);
  const rev = ws.reduce((s, w) => s + w.revenue, 0);
  const guests = ws.reduce((s, w) => s + w.guests, 0);
  const check = guests > 0 ? rev / guests : 0;
  const net = ws.reduce((s, w) => s + w.netProfit, 0);
  const last = st.history.dayLogs.slice(-7);
  const lost = last.reduce((s, l) => s + l.kpi.lostGuests, 0);
  const catRev: Record<string, number> = {};
  for (const l of last) {
    for (const [k, v] of Object.entries(l.kpi.categoryRevenue)) catRev[k] = (catRev[k] ?? 0) + (v ?? 0);
  }
  const alc = catRev.alcohol ?? 0;
  const r = st.restaurant!;
  const fc = ws.reduce((s, w) => s + w.foodCost, 0) / ws.length;
  const lc = ws.reduce((s, w) => s + w.laborCost, 0) / ws.length;
  console.log(`${name}: выручка/нед ${(rev / ws.length / 1000).toFixed(0)} тыс · гостей/нед ${(guests / ws.length).toFixed(0)} · чек ${check.toFixed(0)} · потеряно/нед ${lost} · рейтинг ${r.reputation.rating.toFixed(2)} · маржа нед ${((net / rev) * 100).toFixed(1)}%`);
  const peakLoad = (st: string) =>
    last.flatMap((l) => l.hourLogs.map((h) => h.stationLoads[st] ?? 0)).sort((a, b) => b - a).slice(0, 3).map((x) => x.toFixed(2)).join('/');
  console.log(`  FC ${(fc * 100).toFixed(1)}% · LC ${(lc * 100).toFixed(1)}% · алкоголь: ${(alc / 1000).toFixed(0)} тыс (${((alc / Math.max(1, last.reduce((s, l) => s + l.kpi.revenue, 0))) * 100).toFixed(1)}%) · усталость офиц. ${r.staff.pools.waiter.fatigue.toFixed(0)} · инвентарь ${st.restaurant!.inventory.batches.reduce((s, b) => s + b.quantity * b.unitCost, 0).toFixed(0)} ₽`);
  console.log(`  пики станций: hot ${peakLoad('hot_kitchen')} · cold ${peakLoad('cold_kitchen')} · bar ${peakLoad('bar_service')} · очередь ${last.flatMap((l) => l.hourLogs.map((h) => h.queueAvg)).sort((a, b) => b - a).slice(0, 3).join('/')}`);
}
dump('S4', s4);
dump('S1', s1);
dump('S2', s2);

/* ---------- Мульти-seed S2 vs S4 (сезон 18–39, шум траектории ±3%) ---------- */
console.log('\n=== Мульти-seed: S2 (веранда+найм) vs S4, сезон нед 18–39 ===');
const seeds = [777, 20250, 42, 1001];
const season = (st: GameState) => st.history.weekStats.filter((w) => w.week >= 18 && w.week <= 39);
const mOf = (ws: { revenue: number; netProfit: number; guests: number }[]) => {
  const rev = ws.reduce((s, w) => s + w.revenue, 0);
  const net = ws.reduce((s, w) => s + w.netProfit, 0);
  const g = ws.reduce((s, w) => s + w.guests, 0);
  return { rev, net, g, margin: rev > 0 ? (net / rev) * 100 : NaN };
};
const marginsDelta: number[] = [];
const revDeltas: number[] = [];
for (const seed of seeds) {
  const a = run(39, { seed });
  const b = run(39, { seed, veranda: true, hireWaiters: 2 });
  const ma = mOf(season(a));
  const mb = mOf(season(b));
  const revD = ma.rev > 0 ? ((mb.rev - ma.rev) / ma.rev) * 100 : NaN;
  revDeltas.push(revD);
  marginsDelta.push(mb.margin - ma.margin);
  console.log(`  seed ${seed}: выручка сезона ${revD.toFixed(1)}% · маржа ${ma.margin.toFixed(1)} → ${mb.margin.toFixed(1)} (Δ ${(mb.margin - ma.margin).toFixed(1)} п.п.) · гостей +${mb.g && ma.g ? (((mb.g - ma.g) / ma.g) * 100).toFixed(1) : '—'}%`);
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log(`  СРЕДНЕЕ: выручка сезона ${avg(revDeltas).toFixed(2)}% · маржа ${avg(marginsDelta).toFixed(2)} п.п.`);
