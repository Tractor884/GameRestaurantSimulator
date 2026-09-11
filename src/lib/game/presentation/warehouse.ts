/**
 * ============================================================================
 * СКЛАД: ВИЗУАЛЬНОЕ СОСТОЯНИЕ (VISUAL_STATE_MAP §5)
 * ============================================================================
 * Сергей (кладовщик) + StockDisplay полок: coverDays, порча, истечение.
 * Pure-функции от GameState.
 */

import type { GameState } from '@/lib/game/types';
import type { Mood, StockDisplay } from './types';
import { THRESHOLDS, moodFromFlags } from './thresholds';

/** Дней от текущей даты до GameDate (может быть отрицательным). */
function daysUntil(state: GameState, week: number, day: number): number {
  return (week - state.week) * 7 + (day - state.day);
}

/** Оценка дневной потребности (§5): средн. позиций/день × 3.9 позиции на гостя. */
function dailyDemandEstimate(state: GameState): number {
  const logs = state.history.dayLogs.slice(-7);
  if (logs.length === 0) return 1;
  const avgOrders = logs.reduce((s, l) => s + l.kpi.ordersCount, 0) / logs.length;
  return Math.max(1, avgOrders * 3.9);
}

export function getWarehouseVisualState(state: GameState) {
  const batches = state.restaurant?.inventory.batches ?? [];
  const totalQty = batches.reduce((s, b) => s + b.quantity, 0);
  const coverDays = totalQty / dailyDemandEstimate(state);

  // Стоимость партий (для доли истекающих).
  let totalValue = 0;
  let nearExpiryValue = 0;
  let hasExpired = false;
  for (const b of batches) {
    const value = b.quantity * b.unitCost;
    totalValue += value;
    const left = daysUntil(state, b.expiresAt.week, b.expiresAt.day);
    if (left < 0) hasExpired = true;
    if (left >= 0 && left <= THRESHOLDS.nearExpiryDays) nearExpiryValue += value;
  }
  const nearExpiryShare = totalValue > 0 ? nearExpiryValue / totalValue : 0;

  const pnl = state.weekResult?.pnl;
  const wasteShare = pnl && pnl.revenue > 0 ? pnl.wasteCost / pnl.revenue : 0;

  // Порядок приоритетов §5: empty → spoiled → low → near → over → balanced.
  let stock: StockDisplay;
  if (coverDays < THRESHOLDS.coverDays.empty) stock = 'empty';
  else if (wasteShare > THRESHOLDS.wasteShare || hasExpired) stock = 'spoiled';
  else if (coverDays < THRESHOLDS.coverDays.low) stock = 'low_stock';
  else if (nearExpiryShare > THRESHOLDS.nearExpiry) stock = 'near_expiry';
  else if (coverDays > THRESHOLDS.coverDays.overstock) stock = 'overstock';
  else stock = 'balanced';

  // Кладовщик §5: great=balanced; normal=overstock; warning=low|near; critical=empty|spoiled.
  const keeper: Mood = moodFromFlags({
    critical: stock === 'empty' || stock === 'spoiled',
    warning: stock === 'low_stock' || stock === 'near_expiry',
    great: stock === 'balanced',
  });

  return { stock, coverDays, nearExpiryShare, wasteShare, keeper };
}

/** Сергей — кладовщик (настроение). */
export function getWarehouseMood(state: GameState): Mood {
  return getWarehouseVisualState(state).keeper;
}
