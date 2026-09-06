/**
 * ВЕРИФИКАЦИЯ СЛОЖНОСТЕЙ (ТЗ §36): novice / standard / professional.
 *
 * Один и тот же сценарий (Тверская, 70 мест, кредит 6 млн, seed 20250),
 * 16 недель идентичных решений — сравниваем, как расходятся экономики:
 *  - кассовый минимум (подушка Novice против тонкого Prof);
 *  - события (eventFrequency ×0.7 / ×1.4);
 *  - рейтинг (reputationSpeed: инерция против живости);
 *  - накопленная прибыль и LR-усталость.
 *
 * Запуск: bun scripts/difficulty-test.ts
 */
import { createGame, simulateDay, resolveEvent, type ActionResult } from '../src/lib/game/engine';
import type { GameState, RoleId, GameDate } from '../src/lib/game/types';
import { DIFFICULTIES, difficultyWin } from '../src/lib/game/config/difficulty.config';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';
import { addReviews } from '../src/lib/game/engine/endday';
import { updateFatigue } from '../src/lib/game/engine/staff';
import type { Review } from '../src/lib/game/types';

const WEEKS = 16;
const SEED = 20250;

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

/** Авторезолюция крит-событий: «платим и чиним», если есть деньги. */
function autoResolve(state: GameState): void {
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    const tpl = EVENT_TEMPLATES_MAP[e.templateId];
    if (!tpl?.resolutions) continue;
    let idx = 0;
    const r = state.restaurant!;
    for (let i = 0; i < tpl.resolutions.length; i++) {
      if (r.finance.cash >= tpl.resolutions[i].cost) idx = i;
    }
    const res: ActionResult = resolveEvent(state, e.id, idx);
    if (!res.ok) resolveEvent(state, e.id, 0);
  }
  state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
}

interface DiffStats {
  minCash: number;
  events: number;
  ratingMin: number;
  ratingFinal: number;
  avgFatigueFinal: number;
  totalRevenue: number;
  totalNet: number;
  avgFc: number;
  avgLc: number;
  win: boolean;
}

function runDifficulty(difficultyId: string): DiffStats {
  const state = createGame({
    seed: SEED,
    restaurantName: 'Тест',
    difficultyId,
    locationId: 'tverskaya',
    premisesSize: 'medium',
    renovation: 'standard',
    loanAmount: 6_000_000,
    equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
    veranda: false,
    alcoholLicense: false,
  });

  let minCash = Infinity;
  let events = 0;
  let ratingMin = 5;
  let s = state;
  for (let d = 0; d < WEEKS * 7; d++) {
    const res = simulateDay(s, { plannedActions: [] }, s.seed);
    s = res.state;
    const r = s.restaurant!;
    minCash = Math.min(minCash, r.finance.cash);
    ratingMin = Math.min(ratingMin, r.reputation.rating);
    events += s.lastDayResult?.events.length ?? 0;
    autoResolve(s);
    if (s.phase === 'gameover') break;
  }

  const weeks = s.history.weekStats;
  const avgFc = weeks.reduce((a, w) => a + w.foodCost, 0) / Math.max(1, weeks.length);
  const avgLc = weeks.reduce((a, w) => a + w.laborCost, 0) / Math.max(1, weeks.length);
  const pools = Object.values(s.restaurant!.staff.pools);
  const people = pools.reduce((a, p) => a + p.count, 0);
  const avgFatigue = pools.reduce((a, p) => a + p.fatigue * p.count, 0) / Math.max(1, people);
  const last4 = weeks.slice(-4);
  const win = difficultyWin(difficultyId);
  // Прогноз победы по текущему темпу: прибыль × (52/16) против планки.
  const cumNet = s.history.cumulativeNetProfit;
  const projected = (cumNet / Math.max(1, s.week - 1)) * 51;
  const bscAvg = last4.reduce((a, w) => a + w.bsc, 0) / Math.max(1, last4.length);

  return {
    minCash,
    events,
    ratingMin,
    ratingFinal: s.restaurant!.reputation.rating,
    avgFatigueFinal: avgFatigue,
    totalRevenue: weeks.reduce((a, w) => a + w.revenue, 0),
    totalNet: weeks.reduce((a, w) => a + w.netProfit, 0),
    avgFc,
    avgLc,
    // Индикатор «на пути к победе этой сложности» по 16 неделям.
    win: s.restaurant!.finance.cash >= win.minCash * 0.5 && bscAvg >= win.minBscAvgQuarter && projected >= win.minCumulativeProfit && s.restaurant!.reputation.rating >= win.minRating - 0.15,
  };
}

console.log(`=== СЛОЖНОСТИ: ${WEEKS} недель, Тверская/70 мест, кредит 6 млн, seed ${SEED} ===\n`);
console.log('сложность     | мин.касса  | событий | рейтинг мин→кон | усталость | выручка    | чист.прибыль | FC    | LC    | на пути к победе');
console.log('='.repeat(135));

const results: Record<string, DiffStats> = {};
for (const id of ['novice', 'standard', 'professional']) {
  const st = runDifficulty(id);
  results[id] = st;
  console.log(
    `${DIFFICULTIES[id].name.padEnd(13)} | ${fmt(st.minCash).padStart(9)} | ${String(st.events).padStart(7)} | ${st.ratingMin.toFixed(2)} → ${st.ratingFinal.toFixed(2).padEnd(4)} | ${st.avgFatigueFinal.toFixed(0).padStart(8)} | ${fmt(st.totalRevenue).padStart(9)} | ${fmt(st.totalNet).padStart(12)} | ${pct(st.avgFc).padStart(5)} | ${pct(st.avgLc).padStart(5)} | ${st.win ? 'ДА' : 'нет'}`,
  );
}

console.log('\n=== ПРОВЕРКИ МЕХАНИК (прямые, детерминированные) ===');

/** Одинаковая пачка плохих отзывов → сравнить |Δрейтинг| при разной инерции приора. */
function ratingDropAtSpeed(speed: number): number {
  const state = createGame({
    seed: SEED, restaurantName: 'R', locationId: 'tverskaya', premisesSize: 'medium',
    renovation: 'standard', loanAmount: 0,
    equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
    veranda: false, alcoholLicense: false,
  });
  const r = state.restaurant!;
  const before = r.reputation.rating;
  const now: GameDate = { week: 2, day: 0, hour: 23 };
  // 20 «двоек» с обычным весом 1 — симуляция плохой недели.
  const reviews: Review[] = Array.from({ length: 20 }, (_, i) => ({
    id: `t${i}`,
    score: 2,
    weight: 1,
    date: now,
    segmentId: 'evening',
    sourceId: 'maps',
    text: 'Плохо',
    dateIso: '',
  })) as unknown as Review[];
  addReviews(r, reviews, now, speed);
  return before - r.reputation.rating;
}

/** Усталость при перегрузке (roleLoad 1.5) 10 дней: накопление × rate. */
function fatigueAtRate(rate: number): number {
  const state = createGame({
    seed: SEED, restaurantName: 'R', locationId: 'tverskaya', premisesSize: 'medium',
    renovation: 'standard', loanAmount: 0,
    equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
    veranda: false, alcoholLicense: false,
  });
  const r = state.restaurant!;
  const roleId: RoleId = 'hot_cook';
  r.staff.pools[roleId].fatigue = 0;
  const date: GameDate = { week: 2, day: 1, hour: 23 };
  const loads: Partial<Record<RoleId, number>> = { [roleId]: 1.5 };
  for (let d = 0; d < 10; d++) updateFatigue(r, { ...date, day: 1 }, loads, rate);
  return r.staff.pools[roleId].fatigue;
}

/** Восстановление за 7 выходных: НЕ зависит от rate (физиология). */
function restAtRate(rate: number): number {
  const state = createGame({
    seed: SEED, restaurantName: 'R', locationId: 'tverskaya', premisesSize: 'medium',
    renovation: 'standard', loanAmount: 0,
    equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
    veranda: false, alcoholLicense: false,
  });
  const r = state.restaurant!;
  const roleId: RoleId = 'hot_cook';
  r.staff.pools[roleId].fatigue = 80;
  // scheduled=0 → ветка восстановления (перегрузка не задана).
  const date: GameDate = { week: 2, day: 6, hour: 23 };
  for (let d = 0; d < 7; d++) updateFatigue(r, date, {}, rate);
  return r.staff.pools[roleId].fatigue;
}

const dropNov = ratingDropAtSpeed(DIFFICULTIES.novice.reputationSpeed);
const dropStd = ratingDropAtSpeed(DIFFICULTIES.standard.reputationSpeed);
const dropPro = ratingDropAtSpeed(DIFFICULTIES.professional.reputationSpeed);
const fatNov = fatigueAtRate(DIFFICULTIES.novice.staffFatigueRate);
const fatStd = fatigueAtRate(DIFFICULTIES.standard.staffFatigueRate);
const fatPro = fatigueAtRate(DIFFICULTIES.professional.staffFatigueRate);
const rest1 = restAtRate(1);
const rest13 = restAtRate(1.3);

console.log(
  `рейтинг: −${dropNov.toFixed(2)} (novice) / −${dropStd.toFixed(2)} (std) / −${dropPro.toFixed(2)} (prof) за одинаковую плохую неделю`,
);
console.log(`усталость: ${fatNov.toFixed(1)} / ${fatStd.toFixed(1)} / ${fatPro.toFixed(1)} за 10 перегрузочных дней`);
console.log(`отдых 7 дней: ${rest1.toFixed(1)} (rate 1) vs ${rest13.toFixed(1)} (rate 1.3) — должен совпадать`);

const n = results.novice;
const s = results.standard;
const p = results.professional;
const checks: [string, boolean][] = [
  ['касса e2e: novice > standard > professional (подушка vs тонкий запас)', n.minCash > s.minCash && s.minCash > p.minCash],
  ['события e2e: professional ≥ standard ≥ novice (×1.4/×1.0/×0.7)', p.events >= s.events && s.events >= n.events],
  ['рейтинг: плохие отзывы бьют сильнее на prof (Δ prof > std > nov)', dropPro > dropStd && dropStd > dropNov],
  ['усталость: перегруз копится prof > std > nov', fatPro > fatStd && fatStd > fatNov],
  ['отдых одинаков на любой сложности (rate не ускоряет восстановление)', Math.abs(rest1 - rest13) < 0.01],
  ['экономики e2e расходятся (|Δприбыли| nov vs prof > 5%)', Math.abs(n.totalNet - p.totalNet) / Math.max(1, s.totalNet) > 0.05],
  ['планки победы: novice 9M < standard 12M < professional 15M', difficultyWin('novice').minCumulativeProfit < difficultyWin('standard').minCumulativeProfit && difficultyWin('standard').minCumulativeProfit < difficultyWin('professional').minCumulativeProfit],
];
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗ FAIL'} ${label}`);
}
console.log(failed === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nПРОВАЛЕНО: ${failed}`);
