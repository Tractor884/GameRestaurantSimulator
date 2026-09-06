/**
 * Инварианты симуляции (ТЗ §26).
 * Главный: ни одна симуляция не должна создавать деньги из воздуха.
 */
import type { GameState, InvariantReport } from '../types';
import { LOSE_CONDITIONS } from '../config/difficulty.config';

export function checkInvariants(state: GameState): InvariantReport {
  const violations: string[] = [];
  const r = state.restaurant;
  if (!r) return { ok: true, violations };

  // Деньги.
  if (r.finance.cash < LOSE_CONDITIONS.bankruptCash - 1) {
    violations.push(`Касса ниже овердрафта: ${r.finance.cash} ₽`);
  }
  if (Number.isNaN(r.finance.cash)) violations.push('Касса NaN — нарушение денежного инварианта');

  // Кредиты: остаток долга неотрицателен.
  for (const loan of r.finance.loans) {
    if (loan.remaining < -1) violations.push(`Долг по кредиту отрицательный: ${loan.remaining}`);
  }

  // Склад: количество ≥ 0.
  for (const batch of r.inventory.batches) {
    if (batch.quantity < -0.001) violations.push(`Партия ${batch.ingredientId} ушла в минус`);
  }

  // Диапазоны.
  if (r.reputation.rating < 1 || r.reputation.rating > 5) violations.push('Рейтинг вне [1,5]');
  if (r.reputation.windowReviews.length > 150) violations.push('Окно отзывов переполнено');
  for (const [k, v] of Object.entries(r.risks)) {
    if (v < 0 || v > 100) violations.push(`Риск ${k} вне [0,100]`);
  }
  if (r.cleanliness < 0 || r.cleanliness > 100) violations.push('Чистота вне [0,100]');

  return { ok: violations.length === 0, violations };
}
