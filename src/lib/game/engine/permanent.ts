/**
 * v2 §15 (этап 5): ЧТЕНИЕ ПЕРМАНЕНТНЫХ ЭФФЕКТОВ ДИЛЕММ.
 *
 * Отдельный модуль БЕЗ импортов движка (только типы + конфиг) — читается
 * staff/hour/demand/bsc/day/weekclose без циклических зависимостей.
 * Запись эффектов — engine/dilemmas.ts (applyDilemmaResolution).
 */
import type { Restaurant } from '../types';
import { BALANCE_V2_5 } from '../config/balance2.config';

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

/** §15 «Кризис» (отказ): множитель qFatigue (×1,3) в окне 26 нед. */
export function qFatigueMult(restaurant: Restaurant, week: number): number {
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
 *  в заказе ×0,97 каждый (FC −1 п.п., средний чек −3%). */
export function chefMenuCutFactors(restaurant: Restaurant): { portion: number; qty: number } {
  if (!restaurant.permanentEffects?.chefMenuCut) return { portion: 1, qty: 1 };
  const d = BALANCE_V2_5.dilemmas;
  return { portion: 1 - d.chefFCPP / 0.33, qty: 1 - d.chefCheckPct };
}

/** §11.2/§15: множитель штрафов событий (жёсткие проверки ×1,6 навсегда). */
export function eventFineMult(restaurant: Restaurant): number {
  return restaurant.permanentEffects?.hardInspections ? BALANCE_V2_5.dilemmas.refuseFineMult : 1;
}

/** §16.1: «ограничить вечером» — алкоголь недоступен с 18:00. */
export function alcoholCurbActive(restaurant: Restaurant): boolean {
  return restaurant.permanentEffects?.alcoholEveningRestrict === true;
}

/** Роялти франшизы: доля владельцу с выручки недели (§15 ветка A). ₽. */
export function franchiseRoyalty(revenue: number, restaurant: Restaurant): number {
  const share = restaurant.permanentEffects?.franchiseOwnerShare;
  if (!share || share <= 0) return 0;
  return Math.round(revenue * share);
}
