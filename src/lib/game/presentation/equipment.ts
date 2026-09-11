/**
 * ============================================================================
 * ОБОРУДОВАНИЕ: ВИЗУАЛЬНОЕ СОСТОЯНИЕ (VISUAL_STATE_MAP §6)
 * ============================================================================
 * Николай (техник) + CoffeeDisplay кофемашины + зоны износа.
 * Pure-функции от GameState.
 */

import type { GameState } from '@/lib/game/types';
import type { Mood, CoffeeDisplay } from './types';
import { THRESHOLDS, moodFromFlags } from './thresholds';

/** Активное событие с поломкой оборудования (§6 brokenNow). */
export function equipmentBrokenNow(state: GameState): boolean {
  return state.activeEvents.some((e) => !e.resolved && e.effect.equipmentBreak === true);
}

/** Состояние кофемашины (§6). */
export function getCoffeeDisplay(state: GameState): CoffeeDisplay {
  const wear = state.restaurant?.equipment.coffee.wear ?? 0;
  if (wear >= THRESHOLDS.wear.critical || equipmentBrokenNow(state)) return 'broken';
  if (wear >= THRESHOLDS.wear.warning) return 'warning';
  return 'ok';
}

/** Николай — техник (§6). */
export function getTechnicianMood(state: GameState): Mood {
  const eq = state.restaurant?.equipment;
  const maxWear = eq
    ? Math.max(eq.kitchen.wear, eq.coffee.wear, eq.hall.wear)
    : 0;
  const techRisk = state.restaurant?.risks.technical ?? 0;

  return moodFromFlags({
    critical:
      equipmentBrokenNow(state) ||
      maxWear >= THRESHOLDS.wear.critical ||
      techRisk >= THRESHOLDS.technicalRisk.critical,
    warning:
      maxWear >= THRESHOLDS.wear.warning ||
      techRisk >= THRESHOLDS.technicalRisk.warning,
    great: maxWear < THRESHOLDS.wearGreat && techRisk < THRESHOLDS.technicalRisk.great,
  });
}

/** Полное визуальное состояние оборудования (экран «Оборудование»). */
export function getEquipmentVisualState(state: GameState) {
  const eq = state.restaurant?.equipment;
  const zones = eq
    ? [
        { zone: 'kitchen' as const, wear: eq.kitchen.wear, critical: eq.kitchen.wear >= THRESHOLDS.wear.critical },
        { zone: 'coffee' as const, wear: eq.coffee.wear, critical: eq.coffee.wear >= THRESHOLDS.wear.critical },
        { zone: 'hall' as const, wear: eq.hall.wear, critical: eq.hall.wear >= THRESHOLDS.wear.critical },
      ]
    : [];
  return {
    mood: getTechnicianMood(state),
    coffee: getCoffeeDisplay(state),
    zones,
    brokenNow: equipmentBrokenNow(state),
  };
}
