/**
 * ============================================================================
 * НАСТРОЕНИЯ ПЕРСОНАЖЕЙ (VISUAL_STATE_MAP §1–§3, §7, §9)
 * ============================================================================
 * Анна (HR) + роли смены, Максим (шеф), Ольга (маркетолог), Игорь (владелец).
 * Pure-функции от GameState. Бухгалтер/банкир — в finance.ts, техник — в
 * equipment.ts, кладовщик — в warehouse.ts.
 */

import type { GameState, RoleId } from '@/lib/game/types';
import { difficultyWin } from '@/lib/game/config/difficulty.config';
import type { Mood, CharacterId } from './types';
import { THRESHOLDS, moodFromFlags, worstMood } from './thresholds';

/* ── Укомплектованность (§1–§2) ── */

/** Максимальная потребность роли по неделе: max(morning, evening) любого дня. */
function maxShiftNeed(state: GameState, roleId: RoleId): number {
  const shifts = state.restaurant?.staff.schedule[roleId] ?? [];
  let need = 0;
  for (const sh of shifts) need = Math.max(need, sh.morning, sh.evening);
  return need;
}

/** Роль не закрыта сменами: пул < max потребности недели (§2). */
export function isUnderstaffed(state: GameState, roleId: RoleId): boolean {
  const pool = state.restaurant?.staff.pools[roleId];
  if (!pool) return false;
  return pool.count < maxShiftNeed(state, roleId);
}

/** Серьёзный дефицит: пул < max × 0.75 (§2 severe). */
export function isSeverelyUnderstaffed(state: GameState, roleId: RoleId): boolean {
  const pool = state.restaurant?.staff.pools[roleId];
  if (!pool) return false;
  const need = maxShiftNeed(state, roleId);
  return need > 0 && pool.count < need * THRESHOLDS.severeShare;
}

/** Худший дефицит по всем ролям (для Анны, §1). */
function anySevere(state: GameState): boolean {
  if (!state.restaurant) return false;
  const roles = Object.keys(state.restaurant.staff.pools) as RoleId[];
  return roles.some((r) => isSeverelyUnderstaffed(state, r));
}

/* ── Анна — HR (§1) ── */

export function getHrMood(state: GameState): Mood {
  const pools = state.restaurant?.staff.pools;
  if (!pools) return 'normal';
  let cnt = 0;
  let fatigueSum = 0;
  let moraleSum = 0;
  let newHires = 0;
  for (const pool of Object.values(pools)) {
    fatigueSum += pool.fatigue * pool.count;
    moraleSum += pool.morale * pool.count;
    newHires += pool.newHires;
    cnt += pool.count;
  }
  const avgFatigue = cnt > 0 ? fatigueSum / cnt : 0;
  const avgMorale = cnt > 0 ? moraleSum / cnt : 50;
  const newHireShare = cnt > 0 ? newHires / cnt : 0;

  return moodFromFlags({
    critical:
      avgFatigue > THRESHOLDS.fatigue.critical ||
      avgMorale < THRESHOLDS.morale.critical ||
      anySevere(state),
    warning:
      avgFatigue > THRESHOLDS.fatigue.warning ||
      avgMorale < THRESHOLDS.morale.warning ||
      newHireShare > THRESHOLDS.newHireShare.warning,
    great:
      avgFatigue < THRESHOLDS.fatigue.great &&
      avgMorale > THRESHOLDS.morale.great &&
      newHireShare < THRESHOLDS.newHireShare.great,
  });
}

/* ── Роли смены (§2): спрайт роли показывает Mood своего пула ── */

export function getStaffRoleMood(state: GameState, roleId: RoleId): Mood {
  const pool = state.restaurant?.staff.pools[roleId];
  if (!pool) return 'normal';
  return moodFromFlags({
    critical:
      pool.fatigue > THRESHOLDS.fatigue.critical ||
      pool.morale < THRESHOLDS.morale.critical ||
      isSeverelyUnderstaffed(state, roleId),
    warning:
      pool.fatigue > THRESHOLDS.fatigue.warning ||
      pool.morale < THRESHOLDS.morale.warning ||
      isUnderstaffed(state, roleId),
    great: pool.fatigue < THRESHOLDS.fatigue.great && pool.morale > THRESHOLDS.morale.great,
  });
}

/* ── Максим — шеф (§3) ── */

/** Пиковая загрузка кухонных станций последнего дня (hot/cold/prep). */
export function peakKitchenLoad(state: GameState): number {
  const hourLogs = state.lastDayResult?.hourLogs ?? [];
  let peak = 0;
  for (const h of hourLogs) {
    const loads = h.stationLoads;
    const m = Math.max(
      loads.hot_kitchen ?? 0,
      loads.cold_kitchen ?? 0,
      loads.prep ?? 0,
    );
    peak = Math.max(peak, m);
  }
  return peak;
}

/** Food Cost недели (pnl), иначе статистика, иначе kpi дня. */
export function currentFoodCost(state: GameState): number {
  const pnl = state.weekResult?.pnl;
  if (pnl && pnl.revenue > 0) return (pnl.cogs + pnl.wasteCost) / pnl.revenue;
  const ws = state.history.weekStats.at(-1);
  if (ws && ws.foodCost > 0) return ws.foodCost;
  return state.lastDayResult?.kpi.foodCost ?? 0;
}

export function getChefMood(state: GameState): Mood {
  const peak = peakKitchenLoad(state);
  const wear = state.restaurant?.equipment.kitchen.wear ?? 0;
  const fc = currentFoodCost(state);
  const stopListHits = state.lastDayResult?.kpi.stopListHits ?? 0;

  return moodFromFlags({
    critical:
      peak >= THRESHOLDS.kitchenLoad.critical ||
      wear >= THRESHOLDS.wear.critical ||
      fc > THRESHOLDS.foodCost.critical,
    warning:
      peak >= THRESHOLDS.kitchenLoad.warning ||
      wear >= THRESHOLDS.wear.warning ||
      fc > THRESHOLDS.foodCost.warning ||
      stopListHits >= THRESHOLDS.stopListHits,
    great:
      peak < THRESHOLDS.kitchenLoad.great &&
      wear < THRESHOLDS.wear.great &&
      fc < THRESHOLDS.foodCost.great,
  });
}

/* ── Ольга — маркетолог (§7) ── */

/** Тренд гостей: средн. 2 посл. недели / средн. 2 прежних − 1 (§7). */
export function guestTrend(state: GameState): number {
  const stats = state.history.weekStats;
  if (stats.length < 4) return 0;
  const last2 = stats.slice(-2);
  const prev2 = stats.slice(-4, -2);
  const avgLast = last2.reduce((s, w) => s + w.guests, 0) / 2;
  const avgPrev = prev2.reduce((s, w) => s + w.guests, 0) / 2;
  if (avgPrev <= 0) return 0;
  return avgLast / avgPrev - 1;
}

function hasActiveCampaigns(state: GameState): boolean {
  return (state.restaurant?.marketing.campaigns ?? []).some((c) => c.endedWeek == null);
}

/** Активное репутационное рисковое событие (скандал, §7). */
function scandalActive(state: GameState): boolean {
  return state.activeEvents.some(
    (e) => !e.resolved && (e.effect.riskDelta?.reputation ?? 0) > 0,
  );
}

export function getMarketerMood(state: GameState): Mood {
  const trend = guestTrend(state);
  const campaigns = hasActiveCampaigns(state);
  const pnl = state.weekResult?.pnl;
  const budgetShare = pnl && pnl.revenue > 0 ? pnl.marketing / pnl.revenue : 0;

  return moodFromFlags({
    critical: scandalActive(state) || trend < THRESHOLDS.guestTrend.critical,
    warning:
      (!campaigns && trend < THRESHOLDS.guestTrend.warning) ||
      budgetShare > THRESHOLDS.budgetShare,
    great: trend > THRESHOLDS.guestTrend.great && campaigns,
  });
}

/* ── Игорь — владелец (§9) ── */

/** Отставание целей сложности ( GoalsPanel-подобный расчёт, §9). */
function goalsLagging(state: GameState): number {
  const r = state.restaurant;
  if (!r) return 0;
  const win = difficultyWin(state.difficultyId);
  const lastQuarter = state.history.weekStats.slice(-12);
  const bscAvg = lastQuarter.length
    ? lastQuarter.reduce((s, w) => s + w.bsc, 0) / lastQuarter.length
    : 0;
  // Порог «в графике»: цель × (пройденная доля года, минимум 15%).
  const expected = Math.max(0.15, state.week / 52);
  const progresses = [
    r.reputation.rating / win.minRating,
    state.history.cumulativeNetProfit / win.minCumulativeProfit,
    r.finance.cash / win.minCash,
    bscAvg / win.minBscAvgQuarter,
    state.history.positiveOpWeeks / win.minPositiveOpWeeks,
  ];
  return progresses.filter((p) => p < expected).length;
}

export function getOwnerMood(state: GameState): Mood {
  const bsc = state.weekResult?.bsc.total ?? 0;
  const lowRating = state.history.lowRatingWeeks;
  const cash = state.restaurant?.finance.cash ?? 0;
  const weeklyOut = Math.max(1, state.history.weekStats.at(-1) ? Math.abs(state.history.weekStats.at(-1)!.revenue - state.history.weekStats.at(-1)!.netProfit) : 1);
  const lagging = goalsLagging(state);

  return moodFromFlags({
    critical:
      lowRating >= 2 ||
      cash < weeklyOut ||
      lagging >= 3,
    warning: lagging >= 1 || bsc < THRESHOLDS.bsc.warning,
    great: bsc >= THRESHOLDS.bsc.great && lagging === 0,
  });
}

/* ── Диспетчер по id персонажа ── */

import { getAccountantMood, getBankerMood } from './finance';
import { getWarehouseMood } from './warehouse';
import { getTechnicianMood } from './equipment';

/** Настроение именного персонажа по id (§13 «экраны → персонажи»). */
export function getCharacterMood(state: GameState, id: CharacterId): Mood {
  switch (id) {
    case 'hr':
      return getHrMood(state);
    case 'chef':
      return getChefMood(state);
    case 'accountant':
      return getAccountantMood(state);
    case 'warehouse_manager':
      return getWarehouseMood(state);
    case 'technician':
      return getTechnicianMood(state);
    case 'marketer':
      return getMarketerMood(state);
    case 'banker':
      return getBankerMood(state);
    case 'owner':
      return getOwnerMood(state);
  }
}

/** Худшее настроение набора персонажей (для сводных панелей). */
export function worstOfCharacters(state: GameState, ids: CharacterId[]): Mood {
  return worstMood(...ids.map((id) => getCharacterMood(state, id)));
}
