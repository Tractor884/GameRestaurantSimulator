/**
 * ЧТЕНИЕ ПЕРМАНЕНТНЫХ ЭФФЕКТОВ ДИЛЕММ (БАЛ-v2 §15, порт из v1.0.0).
 *
 * Отдельный модуль БЕЗ импортов движка (только типы + конфиг) — читается
 * hour/demand/bsc/staff/day/weekclose без циклических зависимостей.
 * Запись эффектов — engine/dilemmas.ts (applyDilemmaResolution).
 */
import type { Restaurant } from '../types';
import { DILEMMAS } from '../config/dilemmas.config';

/** §15 «Франшиза»: множитель спроса навсегда (+4%). */
export function permanentDemandMult(restaurant: Restaurant): number {
  return restaurant.permanentEffects?.franchiseDemand ?? 1;
}

/** §15 «Кризис»: множитель ФОТ (оклады ×1,12 навсегда). */
export function payrollWageMult(restaurant: Restaurant): number {
  return restaurant.permanentEffects?.wageRaise ?? 1;
}

/** §15 «Шеф» (отказ): множитель вероятности увольнений в окне 8 нед. */
export function quitProbMult(restaurant: Restaurant, week: number): number {
  const w = restaurant.permanentEffects?.chefQuitRisk;
  if (!w || week > w.untilWeek) return 1;
  return w.mult;
}

/** §15 «Кризис» (отказ): множитель прироста усталости (×1,3) в окне 26 нед. */
export function fatigueGrowthMult(restaurant: Restaurant, week: number): number {
  const c = restaurant.permanentEffects?.staffCrisis;
  if (!c || week > c.untilWeek) return 1;
  return c.qFatigueMult;
}

/** §15 «Кризис» (отказ): множитель стоимости найма (×1,5) в окне 26 нед. */
export function hireCostMult(restaurant: Restaurant, week: number): number {
  const c = restaurant.permanentEffects?.staffCrisis;
  if (!c || week > c.untilWeek) return 1;
  return c.hireMult;
}

/** §15 «Франшиза» (отказ): престиж +2 к перспективе «Клиенты» BSC. */
export function clientPrestigeBonus(restaurant: Restaurant): number {
  return restaurant.permanentEffects?.prestigeBonus ?? 0;
}

/** §15 «Шеф» (согласие): факторы операционки — расход входов и позиции
 *  в заказе ×(1−N) каждый (FC −1 п.п., средний чек −3%). */
export function chefMenuCutFactors(restaurant: Restaurant): { portion: number; qty: number } {
  if (!restaurant.permanentEffects?.chefMenuCut) return { portion: 1, qty: 1 };
  return { portion: 1 - DILEMMAS.chefFCPP / 0.33, qty: 1 - DILEMMAS.chefCheckPct };
}

/** §11.2/§15: множитель штрафов событий (жёсткие проверки ×1,6 навсегда). */
export function eventFineMult(restaurant: Restaurant): number {
  return restaurant.permanentEffects?.hardInspections ? DILEMMAS.refuseFineMult : 1;
}

/** Роялти франшизы: доля сети с выручки недели (§15 ветка «подписать»), ₽. */
export function franchiseRoyalty(revenue: number, restaurant: Restaurant): number {
  const share = restaurant.permanentEffects?.franchiseOwnerShare;
  if (!share || share <= 0) return 0;
  return Math.round(revenue * share);
}

/** «Доставка» (v9): комиссия агрегатора — доля всей выручки недели, ₽. */
export function deliveryRoyalty(revenue: number, restaurant: Restaurant): number {
  const share = restaurant.permanentEffects?.deliveryShare;
  if (!share || share <= 0) return 0;
  return Math.round(revenue * share);
}

/**
 * Кредитное плечо для триггера «Реструктуризация»: NetDebt/активы.
 * Активы = касса + остаточная стоимость оборудования + склад.
 * (v1.0.0 считала NetDebt/Equity; здесь — та же логика на доступных полях.)
 */
export function leverageOf(restaurant: Restaurant): number {
  const loans = restaurant.finance.loans.reduce((s, l) => s + l.remaining, 0);
  const netDebt = loans - restaurant.finance.cash;
  if (netDebt <= 0) return 0;
  const equipResidual =
    restaurant.equipment.kitchen.value * (1 - restaurant.equipment.kitchen.wear / 100) +
    restaurant.equipment.coffee.value * (1 - restaurant.equipment.coffee.wear / 100) +
    restaurant.equipment.hall.value * (1 - restaurant.equipment.hall.wear / 100);
  const inventory = restaurant.inventory.batches.reduce((s, b) => s + b.quantity * b.unitCost, 0);
  const assets = restaurant.finance.cash + equipResidual + inventory;
  return netDebt / Math.max(1, assets);
}
