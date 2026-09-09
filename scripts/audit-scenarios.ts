/**
 * ДИАГНОСТИКА ПО АУДИТУ ПРОЕКТА (пользовательский документ «Аудит проекта.docx»).
 *
 * 6 сценариев раздела 10 аудита + дамп множителей спроса (§12.1):
 *  A — нормальная игра 16 недель (дефолты, крит-события решаем «платим и чиним»)
 *  B — агрессивный маркетинг: все 5 каналов на максимуме, недели 2–9
 *  C — экономия на персонале: −25% штата на 3-й неделе
 *  D — плохой склад: еженедельные закупки впрок 2.5× (включая скоропорт)
 *  E — один провальный день (грязь + стоп-лист на всё меню + цены +60%)
 *  F — пиковая перегрузка: рейтинг 4.6 + все каналы (пт/сб вечера)
 *
 * Запуск: bun run scripts/audit-scenarios.ts [all|a|b|c|d|e|f|factors]
 */
import { createGame, simulateDay, resolveEvent, estimateIngredientNeeds, type ActionResult } from '../src/lib/game/engine';
import type { GameState, StationType } from '../src/lib/game/types';
import { DISHES_MAP } from '../src/lib/game/content/dishes';
import { addTransaction } from '../src/lib/game/engine/core';
import { placePurchase } from '../src/lib/game/engine/inventory';
import { marketingFactor, estimatedCheck, qualityPerceptionFactor, eventDemandFactor } from '../src/lib/game/engine/demand';
import { workingHours } from '../src/lib/game/engine/core';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';
import { LOCATIONS_MAP } from '../src/lib/game/config/locations.config';
import { DAY_PROFILES, HOUR_PROFILES, HOLIDAYS, dayOfYear, monthOfDay } from '../src/lib/game/config/demandProfiles.config';
import { reputationFactor } from '../src/lib/game/config/reputation.config';
import { SEGMENTS, SEGMENT_IDS } from '../src/lib/game/config/segments.config';

/* ============================ ХЕЛПЕРЫ ПРОГОНА ============================ */

const BASE_OPTS = {
  seed: 20250,
  restaurantName: 'Аудит',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
};

const STATIONS: StationType[] = ['hot_kitchen', 'cold_kitchen', 'prep', 'coffee', 'dessert', 'bar_service'];

interface RunStats {
  minCash: number;
  lostGuestsTotal: number;
  days: number;
  eventsTotal: number;
  eventsByWeek: Map<number, number>;
  peakLoads: Record<string, number>; // max по всем часам прогона
  top3PerStation: Record<string, number[]>; // все часы по станциям (для топ-3)
  categoryRevenue: Record<string, number>;
  categoryCogs: Record<string, number>;
  queuePeak: number;
}

function newStats(): RunStats {
  return {
    minCash: Infinity,
    lostGuestsTotal: 0,
    days: 0,
    eventsTotal: 0,
    eventsByWeek: new Map(),
    peakLoads: {},
    top3PerStation: {},
    categoryRevenue: {},
    categoryCogs: {},
    queuePeak: 0,
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

/** Авторезолюция критических событий: «платим и чиним», если есть деньги.
 *  v2 §6.2: динамические резолюции (арендодатель) резолвятся наравне с шаблонными. */
function autoResolve(state: GameState): void {
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
    if (!options) continue;
    let idx = 0;
    const r = state.restaurant!;
    for (let i = 0; i < options.length; i++) {
      if (r.finance.cash >= options[i].cost) idx = i;
    }
    const res: ActionResult = resolveEvent(state, e.id, idx);
    if (!res.ok) resolveEvent(state, e.id, 0);
  }
  state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
}

function trackDay(state: GameState, stats: RunStats): void {
  const r = state.restaurant!;
  stats.minCash = Math.min(stats.minCash, r.finance.cash);
  stats.days += 1;
  const log = state.lastDayResult;
  if (!log) return;
  stats.lostGuestsTotal += log.kpi.lostGuests;
  const evts = log.events.length;
  if (evts > 0) {
    stats.eventsTotal += evts;
    stats.eventsByWeek.set(log.date.week, (stats.eventsByWeek.get(log.date.week) ?? 0) + evts);
  }
  for (const h of log.hourLogs) {
    for (const [st, v] of Object.entries(h.stationLoads)) {
      const val = v ?? 0;
      stats.peakLoads[st] = Math.max(stats.peakLoads[st] ?? 0, val);
      (stats.top3PerStation[st] ??= []).push(val);
    }
    stats.queuePeak = Math.max(stats.queuePeak, h.queueAvg);
  }
  for (const [cat, v] of Object.entries(log.kpi.categoryRevenue)) {
    stats.categoryRevenue[cat] = (stats.categoryRevenue[cat] ?? 0) + (v ?? 0);
  }
  for (const [cat, v] of Object.entries(log.kpi.categoryCogs)) {
    stats.categoryCogs[cat] = (stats.categoryCogs[cat] ?? 0) + (v ?? 0);
  }
}

/** Прогнать N дней с телеметрией; onBeforeDay вызывается до simulateDay. */
function runDays(
  state: GameState,
  days: number,
  stats: RunStats,
  onBeforeDay?: (state: GameState) => void,
): GameState {
  let s = state;
  for (let i = 0; i < days; i++) {
    onBeforeDay?.(s);
    const res = simulateDay(s, { plannedActions: [] }, s.seed);
    s = res.state;
    trackDay(s, stats);
    autoResolve(s);
  }
  return s;
}

/** Средняя загрузка топ-3 часов (устойчивый пик, цель аудита 85–115%). */
function top3Avg(values: number[] | undefined): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, sorted.length);
}

function printWeeks(state: GameState, label: string, lastN = 16): void {
  const ws = state.history.weekStats.slice(-lastN);
  console.log(`\n--- ${label}: понедельно (последние ${ws.length}) ---`);
  console.log('нед | выручка    | гости | ср.чек | FC    | LC    | чист.маржа | рейтинг | возвр. | касса');
  for (const w of ws) {
    console.log(
      `${String(w.week).padStart(3)} | ${fmt(w.revenue).padStart(10)} | ${String(w.guests).padStart(5)} | ${fmt(w.avgCheck).padStart(6)} | ${pct(w.foodCost).padStart(5)} | ${pct(w.laborCost).padStart(5)} | ${pct(w.netProfit / Math.max(1, w.revenue)).padStart(10)} | ${w.rating.toFixed(2).padStart(7)} | ${pct(w.returningShare).padStart(6)} | ${fmt(w.cashEnd)}`,
    );
  }
  const totalRev = ws.reduce((s, w) => s + w.revenue, 0);
  const totalNet = ws.reduce((s, w) => s + w.netProfit, 0);
  const avgFc = ws.reduce((s, w) => s + w.foodCost, 0) / Math.max(1, ws.length);
  const avgLc = ws.reduce((s, w) => s + w.laborCost, 0) / Math.max(1, ws.length);
  const avgRet = ws.reduce((s, w) => s + w.returningShare, 0) / Math.max(1, ws.length);
  console.log(
    `ИТОГО: выручка ${fmt(totalRev)}, чистая ${fmt(totalNet)} (${pct(totalNet / Math.max(1, totalRev))}), FC ср ${pct(avgFc)}, LC ср ${pct(avgLc)}, возвратные ср ${pct(avgRet)}`,
  );
}

function printStructure(stats: RunStats, label: string): void {
  const total = Object.values(stats.categoryRevenue).reduce((s, v) => s + v, 0);
  if (total <= 0) return;
  console.log(`\n--- ${label}: структура выручки и FC по категориям ---`);
  console.log('категория      | доля выручки | FC категории');
  const rows = Object.entries(stats.categoryRevenue).sort((a, b) => b[1] - a[1]);
  for (const [cat, rev] of rows) {
    const cogs = stats.categoryCogs[cat] ?? 0;
    console.log(
      `${cat.padEnd(14)} | ${pct(rev / total).padStart(12)} | ${pct(cogs / Math.max(1, rev)).padStart(12)}`,
    );
  }
  const group = (cats: string[]) => cats.reduce((s, c) => s + (stats.categoryRevenue[c] ?? 0), 0);
  const food = group(['breakfast', 'lunch', 'salad', 'soup', 'appetizer', 'hot', 'garnish']);
  const drinks = group(['non_alc_drink', 'coffee']);
  const alcohol = group(['alcohol']);
  const desserts = group(['dessert']);
  console.log(
    `ГРУППЫ: еда ${pct(food / total)} · кофе+напитки ${pct(drinks / total)} · алкоголь ${pct(alcohol / total)} · десерты ${pct(desserts / total)}`,
  );
}

function printPeaks(stats: RunStats, label: string): void {
  console.log(`\n--- ${label}: пиковые загрузки станций (цель аудита: топ-3 часы 0.85–1.15) ---`);
  for (const st of STATIONS) {
    console.log(
      `${st.padEnd(13)}: макс ${(stats.peakLoads[st] ?? 0).toFixed(2)} · топ-3 ср ${top3Avg(stats.top3PerStation[st]).toFixed(2)}`,
    );
  }
  console.log(`очередь (макс. среднее за час): ${stats.queuePeak.toFixed(1)} чел.`);
}

function printEvents(stats: RunStats, weeks: number): void {
  const avg = stats.eventsTotal / Math.max(1, weeks);
  console.log(
    `\nСОБЫТИЯ: ${stats.eventsTotal} за ${weeks} нед (в среднем ${avg.toFixed(2)}/нед; аудит: минимум 1/5–7 нед); недель без событий: ${weeks - stats.eventsByWeek.size}`,
  );
  if (stats.eventsByWeek.size > 0) {
    console.log('  по неделям:', [...stats.eventsByWeek.entries()].map(([w, n]) => `н${w}:${n}`).join(' '));
  }
}

/* ============================ СЦЕНАРИЙ A ============================ */

function scenarioA(): void {
  console.log('\n==============================================');
  console.log('=== СЦЕНАРИЙ A: нормальная игра, 16 недель ===');
  console.log('==============================================');
  let state: GameState = createGame(BASE_OPTS);
  const stats = newStats();
  state = runDays(state, 16 * 7, stats);
  printWeeks(state, 'A', 16);
  printStructure(stats, 'A (все 16 нед)');
  printPeaks(stats, 'A');
  printEvents(stats, 16);
  console.log(`\nушедшие из очереди: ${stats.lostGuestsTotal} за 16 нед (${(stats.lostGuestsTotal / 112).toFixed(1)}/день)`);
  console.log(`минимальная касса: ${fmt(stats.minCash)} ₽`);
  const monthlyRent = state.restaurant!.rentMonthly;
  const last4Rev = state.history.weekStats.slice(-4).reduce((s, w) => s + w.revenue, 0);
  console.log(`доля аренды: ${pct(monthlyRent / Math.max(1, last4Rev))} (аренда ${fmt(monthlyRent)}/мес к выручке 4 нед)`);
  console.log(`накопленная чистая прибыль: ${fmt(state.history.cumulativeNetProfit)} ₽ (порог победы Стандарта 12 млн — см. difficulty.config.ts; после калибровки 2.0 отражает годовую, а не 7-недельную работу)`);
}

/* ============================ СЦЕНАРИЙ B ============================ */

function scenarioB(): void {
  console.log('\n=====================================================');
  console.log('=== СЦЕНАРИЙ B: агрессивный маркетинг, 12 недель ===');
  console.log('=====================================================');
  let state: GameState = createGame(BASE_OPTS);
  const warmup = newStats();
  state = runDays(state, 14, warmup);
  const r = state.restaurant!;
  const budgets: [string, number][] = [
    ['social_ads', 350_000],
    ['food_blogs', 400_000],
    ['search_maps', 200_000],
    ['loyalty', 150_000],
    ['outdoor', 500_000],
  ];
  for (const [ch, budget] of budgets) {
    r.marketing.campaigns.push({ channelId: ch, weeklyBudget: budget, startWeek: 2, durationWeeks: 8 });
  }
  const stats = newStats();
  Object.assign(stats, { minCash: warmup.minCash, lostGuestsTotal: warmup.lostGuestsTotal });
  state = runDays(state, 10 * 7, stats);
  printWeeks(state, 'B', 12);
  const baseWeeks = state.history.weekStats.slice(0, 2);
  const marketWeeks = state.history.weekStats.slice(2, 10);
  const avgBase = baseWeeks.reduce((s, w) => s + w.guests, 0) / Math.max(1, baseWeeks.length);
  const avgMarket = marketWeeks.reduce((s, w) => s + w.guests, 0) / Math.max(1, marketWeeks.length);
  const revBase = baseWeeks.reduce((s, w) => s + w.revenue, 0) / Math.max(1, baseWeeks.length);
  const revMarket = marketWeeks.reduce((s, w) => s + w.revenue, 0) / Math.max(1, marketWeeks.length);
  console.log(`\nрост: гости ${avgBase.toFixed(0)} → ${avgMarket.toFixed(0)}/нед (×${(avgMarket / Math.max(1, avgBase)).toFixed(2)}), выручка ${fmt(revBase)} → ${fmt(revMarket)} (×${(revMarket / Math.max(1, revBase)).toFixed(2)})`);
  const mfY = marketingFactor(r, 'youth', state.week);
  const mfE = marketingFactor(r, 'evening', state.week);
  console.log(`маркетинг-фактор (young/evening) при макс. бюджетах: ${mfY.toFixed(2)} / ${mfE.toFixed(2)} (кап 1.8)`);
  printPeaks(stats, 'B');
  printEvents(stats, 12);
}

/* ============================ СЦЕНАРИЙ C ============================ */

function scenarioC(): void {
  console.log('\n================================================================');
  console.log('=== СЦЕНАРИЙ C: экономия на персонале (−25%), 12 недель ===');
  console.log('================================================================');
  let state: GameState = createGame(BASE_OPTS);
  const stats = newStats();
  state = runDays(state, 21, stats); // 3 недели нормальной игры
  const r = state.restaurant!;
  console.log('\nУВОЛЕНИЕ 25% ШТАТА (перед 4-й неделей):');
  for (const [role, pool] of Object.entries(r.staff.pools)) {
    const before = pool.count;
    pool.count = Math.max(1, Math.floor(pool.count * 0.75));
    console.log(`  ${role.padEnd(12)}: ${before} → ${pool.count}`);
  }
  state = runDays(state, 9 * 7, stats);
  printWeeks(state, 'C', 12);
  const before = state.history.weekStats.slice(1, 3);
  const after = state.history.weekStats.slice(-4);
  const sat = (arr: typeof before) => arr.reduce((s, w) => s + w.satisfaction, 0) / Math.max(1, arr.length);
  const rev = (arr: typeof before) => arr.reduce((s, w) => s + w.revenue, 0) / Math.max(1, arr.length);
  console.log(`\nудовлетворённость: до ${sat(before).toFixed(0)} → после ${sat(after).toFixed(0)}`);
  console.log(`выручка: до ${fmt(rev(before))}/нед → после ${fmt(rev(after))}/нед`);
  console.log(`рейтинг: ${state.history.weekStats[2]?.rating.toFixed(2) ?? '?'} → ${state.restaurant!.reputation.rating.toFixed(2)}`);
  const cooks = state.restaurant!.staff.pools.hot_cook;
  const waiters = state.restaurant!.staff.pools.waiter;
  console.log(`усталость: повар ${cooks.fatigue.toFixed(0)}, официант ${waiters.fatigue.toFixed(0)}; мораль: ${cooks.morale.toFixed(0)}/${waiters.morale.toFixed(0)}`);
  printEvents(stats, 12);
}

/* ============================ СЦЕНАРИЙ D ============================ */

function scenarioD(): void {
  console.log('\n=====================================================================');
  console.log('=== СЦЕНАРИЙ D: плохой склад (закупки впрок 2.5×), 12 недель ===');
  console.log('====================================================================');
  let state: GameState = createGame(BASE_OPTS);
  const stats = newStats();
  state = runDays(
    state,
    12 * 7,
    stats,
    (s) => {
      if (s.day !== 0) return;
      const r = s.restaurant!;
      const needs = estimateIngredientNeeds(r, 7, 160);
      let total = 0;
      const placedCount = { n: 0 };
      for (const [ingId, qty] of Object.entries(needs)) {
        const q = Math.round(qty * 2.5); // «впрок»
        if (q <= 0) continue;
        placePurchase(r, ingId, q, false, { week: s.week, day: s.day, hour: 8 });
        total += Math.round(q * (0 + 1)) * 0; // paid считается ниже через последнюю позицию
        placedCount.n++;
        void ingId;
      }
      // Считаем сумму только что добавленных заказов.
      const newOrders = r.inventory.pendingOrders.slice(-placedCount.n);
      total = newOrders.reduce((sum, o) => sum + o.paid, 0);
      if (total > 0 && r.finance.cash - total >= 0) {
        addTransaction(r, { week: s.week, day: s.day, hour: 8 }, 'purchase', total, 'out', 'Закупка впрок 2.5×');
      } else if (total > 0) {
        r.inventory.pendingOrders = r.inventory.pendingOrders.filter((o) => !newOrders.includes(o));
      }
    },
  );
  printWeeks(state, 'D', 12);
  const ws = state.history.weekStats;
  const wasteShare = ws.slice(-4).reduce((s, w) => s + w.wasteCost, 0) / Math.max(1, ws.slice(-4).reduce((s, w) => s + w.revenue, 0));
  console.log(`\nдоля порчи в выручке (последние 4 нед): ${pct(wasteShare)}`);
  console.log(`санитарный риск: ${state.restaurant!.risks.sanitary.toFixed(1)}`);
  console.log(`партий на складе: ${state.restaurant!.inventory.batches.length}`);
  printEvents(stats, 12);
}

/* ============================ СЦЕНАРИЙ E ============================ */

function scenarioE(): void {
  console.log('\n==================================================================');
  console.log('=== СЦЕНАРИЙ E: один провальный день (неделя 6, день 2) ===');
  console.log('==================================================================');
  let state: GameState = createGame(BASE_OPTS);
  const stats = newStats();
  state = runDays(state, 5 * 7, stats); // 5 недель нормальной игры
  const ratingBefore = state.restaurant!.reputation.rating;
  console.log(`рейтинг до провала: ${ratingBefore.toFixed(2)}`);

  // === САМ ПРОВАЛ: грязь, стоп-лист на всё меню, цены +60% ===
  const r = state.restaurant!;
  const savedClean = r.cleanliness;
  const savedStop = [...r.menu.stopList];
  const savedPrices: Record<string, number> = {};
  r.cleanliness = 5;
  r.menu.stopList = [...r.menu.dishes];
  for (const id of r.menu.dishes) {
    savedPrices[id] = r.menu.prices[id] ?? DISHES_MAP[id]?.recommendedPrice ?? 0;
    r.menu.prices[id] = savedPrices[id] * 1.6;
  }
  state = runDays(state, 1, stats);
  const bad = state.lastDayResult!;
  console.log(`провальный день: гостей ${bad.kpi.guests}, удовл. ${bad.kpi.satisfaction}, отзывов ${bad.reviews.length}`);
  console.log(`рейтинг сразу после: ${state.restaurant!.reputation.rating.toFixed(2)} (Δ ${(state.restaurant!.reputation.rating - ratingBefore).toFixed(2)})`);

  // === ВОССТАНОВЛЕНИЕ (нормальный сервис, цены и склад возвращены) ===
  const r2 = state.restaurant!;
  r2.menu.stopList = savedStop;
  r2.cleanliness = savedClean;
  for (const [id, p] of Object.entries(savedPrices)) r2.menu.prices[id] = p;
  const trajectory: string[] = [];
  state = runDays(
    state,
    14,
    newStats(),
    (s) => {
      trajectory.push(`${s.day}:${s.restaurant!.reputation.rating.toFixed(2)}`);
    },
  );
  console.log('восстановление рейтинга по дням (день:рейтинг):');
  console.log('  ' + trajectory.join(' → '));
  console.log(`итог: ${ratingBefore.toFixed(2)} → ${state.restaurant!.reputation.rating.toFixed(2)} через 2 недели`);
}

/* ============================ СЦЕНАРИЙ F ============================ */

function scenarioF(): void {
  console.log('\n=========================================================================');
  console.log('=== СЦЕНАРИЙ F: пиковая перегрузка (рейтинг 4.6 + все каналы) ===');
  console.log('=========================================================================');
  let state: GameState = createGame(BASE_OPTS);
  const warmup = newStats();
  state = runDays(state, 14, warmup);
  const r = state.restaurant!;
  r.reputation.rating = 4.6;
  const budgets: [string, number][] = [
    ['social_ads', 350_000],
    ['food_blogs', 400_000],
    ['search_maps', 200_000],
    ['loyalty', 150_000],
    ['outdoor', 500_000],
  ];
  for (const [ch, budget] of budgets) {
    r.marketing.campaigns.push({ channelId: ch, weeklyBudget: budget, startWeek: state.week, durationWeeks: 4 });
  }
  const stats = newStats();
  state = runDays(state, 7, stats);
  // state.history.dayLogs хранит последние 7 дней — как раз наша неделя.
  console.log('\nнеделя при рейтинге 4.6 + макс. маркетинг:');
  console.log('день | гостей | ушли | очередь макс | гор.цех макс | официанты макс');
  for (const log of state.history.dayLogs) {
    const guests = log.kpi.guests;
    const lost = log.kpi.lostGuests;
    const queue = Math.max(0, ...log.hourLogs.map((h) => h.queueAvg));
    const hotLoad = Math.max(0, ...log.hourLogs.map((h) => h.stationLoads['hot_kitchen'] ?? 0));
    const waiterL = Math.max(0, ...log.hourLogs.map((h) => h.waiterLoad));
    console.log(`${String(log.date.day).padStart(4)} | ${String(guests).padStart(6)} | ${String(lost).padStart(4)} | ${queue.toFixed(0).padStart(13)} | ${hotLoad.toFixed(2).padStart(13)} | ${waiterL.toFixed(2).padStart(15)}`);
  }
  printPeaks(stats, 'F');
}

/* ============================ ДАМП МНОЖИТЕЛЕЙ СПРОСА ============================ */

function demandFactorsDump(): void {
  console.log('\n=========================================================');
  console.log('=== ДАМП МНОЖИТЕЛЕЙ СПРОСА (Тверская и Митино) ===');
  console.log('=========================================================');
  for (const locId of ['tverskaya', 'mitino']) {
    const state = createGame({ ...BASE_OPTS, locationId: locId });
    const r = state.restaurant!;
    const date = { week: 8, day: 2, hour: 13 };
    const loc = LOCATIONS_MAP[locId];
    const rawProfile = HOUR_PROFILES.weekday[loc.type];
    const hours = workingHours(r, 2);
    const visibleSum = hours.reduce((s, h) => s + rawProfile[h - 8], 0) || 1;
    const doy = dayOfYear(8, 2);
    const month = monthOfDay(doy);
    const season = loc.seasonProfile[month - 1] ?? 1;
    const holiday = HOLIDAYS.find((h) => Math.abs(h.dayOfYear - doy) <= 1)?.factor ?? 1;
    const rep = reputationFactor(r.reputation.rating);
    const quality = qualityPerceptionFactor(state);
    const eventF = eventDemandFactor(state, 8);
    console.log(`\n[${loc.name}] неделя 8, среда`);
    console.log(`baseTraffic=${loc.baseTraffic}, dayProfile=${DAY_PROFILES[loc.type][2].toFixed(2)}, hourProfile(13)=${(rawProfile[5] / visibleSum).toFixed(3)}, hourProfile(19)=${(rawProfile[11] / visibleSum).toFixed(3)}`);
    console.log(`season=${season.toFixed(2)}, holiday=${holiday}, reputation(${r.reputation.rating.toFixed(2)})=${rep.toFixed(2)}, quality=${quality.toFixed(2)}, event=${eventF.toFixed(2)}, competition=${loc.competitionFactor}`);
    const mfY = marketingFactor(r, 'youth', 8);
    console.log(`marketing(youth, без кампаний)=${mfY.toFixed(2)}`);
    console.log('сегмент         | ожид.чек | бюджет | gap   | pricePerception');
    for (const segId of SEGMENT_IDS) {
      const seg = SEGMENTS[segId];
      const est = estimatedCheck(r, segId);
      const gap = est / seg.budget - 1;
      const pp = Math.max(0.3, Math.min(1.5, 1 - seg.priceSensitivity * 1.0 * gap));
      console.log(`${segId.padEnd(15)} | ${fmt(est).padStart(7)} | ${fmt(seg.budget).padStart(6)} | ${gap.toFixed(2).padStart(5)} | ${pp.toFixed(2).padStart(16)}`);
    }
    void date;
  }
}

/* ============================ ЗАПУСК ============================ */

const which = process.argv[2] ?? 'all';
if (which === 'all' || which === 'factors') demandFactorsDump();
if (which === 'all' || which === 'a') scenarioA();
if (which === 'all' || which === 'b') scenarioB();
if (which === 'all' || which === 'c') scenarioC();
if (which === 'all' || which === 'd') scenarioD();
if (which === 'all' || which === 'e') scenarioE();
if (which === 'all' || which === 'f') scenarioF();
