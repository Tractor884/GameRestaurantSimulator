/**
 * ============================================================================
 * ФИНАНСОВЫЕ ВИЗУАЛЬНЫЕ СОСТОЯНИЯ (VISUAL_STATE_MAP §4, §8)
 * ============================================================================
 * Ирина (бухгалтер), Андрей (банкир): взлётная полоса кассы, просрочки.
 * Pure-функции от GameState, без RNG и Date.now().
 */

import type { GameState } from '@/lib/game/types';
import type { Mood } from './types';
import { THRESHOLDS, moodFromFlags } from './thresholds';

/** Средний недельный отток (₽) по последним 4–6 неделям:
 *  revenue − netProfit ≈ полные расходы (§4). */
export function avgWeeklyOut(state: GameState): number {
  const stats = state.history.weekStats;
  const n = Math.min(6, stats.length);
  if (n === 0) return 1;
  const sum = stats.slice(-n).reduce((s, w) => s + (w.revenue - w.netProfit), 0);
  // Отток не может быть ≤ 0 (иначе полоса = бесконечность на старте).
  return Math.max(1, sum / n);
}

/** Кассовая «взлётная полоса» в неделях (§4). */
export function runwayWeeks(state: GameState): number {
  const cash = state.restaurant?.finance.cash ?? 0;
  return cash / avgWeeklyOut(state);
}

/** Есть ли просроченные платежи по кредитам. */
export function anyOverdue(state: GameState): boolean {
  return (state.restaurant?.finance.loans ?? []).some((l) => l.overduePayments > 0);
}

/** Серия убыточных недель подряд (для «касса падает 2 недели», §4). */
function losingStreak(state: GameState): number {
  const stats = state.history.weekStats;
  let n = 0;
  for (let i = stats.length - 1; i >= 0; i--) {
    if (stats[i].netProfit <= 0) n++;
    else break;
  }
  return n;
}

/** Ирина — бухгалтер (§4). */
export function getAccountantMood(state: GameState): Mood {
  const runway = runwayWeeks(state);
  const overdue = anyOverdue(state);
  const lastNet = state.history.weekStats.at(-1)?.netProfit ?? 0;
  const cashFalling = losingStreak(state) >= 2;
  const minSafe = state.weekResult?.forecast[0]?.minSafeCashEnd;
  const cash = state.restaurant?.finance.cash ?? 0;
  const belowMinSafe = typeof minSafe === 'number' && cash < minSafe;

  return moodFromFlags({
    critical: overdue || runway < THRESHOLDS.runway.critical,
    warning:
      runway < THRESHOLDS.runway.warning ||
      (lastNet < 0 && cashFalling) ||
      belowMinSafe,
    great: runway >= THRESHOLDS.runway.great && lastNet > 0,
  });
}

/** Андрей — банкир (§8). */
export function getBankerMood(state: GameState): Mood {
  const loans = state.restaurant?.finance.loans ?? [];
  const runway = runwayWeeks(state);
  return moodFromFlags({
    critical: anyOverdue(state),
    warning: loans.length > 0 && runway < THRESHOLDS.runway.bankerWarning,
    great: loans.length === 0 && runway >= THRESHOLDS.runway.bankerGreat,
  });
}

/** Полное визуальное состояние финансов (экран «Финансы», §4). */
export function getFinanceVisualState(state: GameState) {
  const lastNet = state.history.weekStats.at(-1)?.netProfit ?? 0;
  return {
    mood: getAccountantMood(state),
    runwayWeeks: runwayWeeks(state),
    avgWeeklyOut: avgWeeklyOut(state),
    overdue: anyOverdue(state),
    lastNetProfit: lastNet,
  };
}
