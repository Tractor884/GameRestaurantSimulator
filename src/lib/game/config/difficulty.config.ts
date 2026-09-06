/**
 * Конфиг сложности (ТЗ §36). MVP: только Standard.
 * Значения влияют на стартовый капитал, ставку кредита, эластичность.
 */
import type { GameStatus } from '../types';

export interface DifficultyConfig {
  id: string;
  name: string;
  ownerEquity: number; // собственный взнос, ₽
  maxLoan: number; // максимальный кредит, ₽
  loanLimitMultiplier: number; // кредитный лимит = min(maxLoan, k × own equity)
  loanRate: number; // годовая ставка
  loanTermMonths: number;
  demandElasticity: number; // множитель эластичности цены
  eventFrequency: number; // множитель частоты событий
  fineSeverity: number;
  staffFatigueRate: number;
  reputationSpeed: number;
  cashBuffer: number; // рекомендуемый денежный запас, ₽
}

export const DIFFICULTIES: Record<string, DifficultyConfig> = {
  standard: {
    id: 'standard',
    name: 'Стандарт',
    ownerEquity: 12_000_000,
    maxLoan: 20_000_000,
    loanLimitMultiplier: 1.5,
    loanRate: 0.22,
    loanTermMonths: 36,
    demandElasticity: 1.0,
    eventFrequency: 1.0,
    fineSeverity: 1.0,
    staffFatigueRate: 1.0,
    reputationSpeed: 1.0,
    cashBuffer: 3_000_000,
  },
};

/** Целевые ориентиры здорового ресторана (ТЗ §30) — для подсказок UI. */
export const HEALTHY_TARGETS = {
  foodCost: [0.3, 0.34] as const,
  laborCost: [0.25, 0.32] as const, // с соц. взносами
  rentShare: [0.08, 0.15] as const,
  marketingShare: [0.02, 0.05] as const,
  ebitdaMargin: [0.1, 0.2] as const,
  netMargin: [0.05, 0.15] as const,
  rating: 4.0,
  avgCheckNoAlcohol: [3500, 4000] as const,
};

/** Условия победы на 52-й неделе (ТЗ §37.3). */
export const WIN_CONDITIONS = {
  minCash: 3_000_000,
  minBscAvgQuarter: 70,
  minRating: 4.2,
  minCumulativeProfit: 5_000_000,
  minPositiveOpWeeks: 8,
};

/** Порог поражения: рейтинг ниже 2.0 в течение 4 недель. */
export const LOSE_CONDITIONS = {
  lowRatingThreshold: 2.0,
  lowRatingWeeks: 4,
  bankruptCash: -1_000_000, // допуск овердрафта до 1 млн ₽
};

export const STATUS_LABELS: Record<GameStatus, string> = {
  open: 'Работает',
  bankrupt: 'Банкротство',
  survived_12: 'Выжил (12 недель)',
  stable: 'Стабильный ресторан',
  sustainable: 'Устойчивый ресторан',
  excellent: 'Отличный ресторан',
};
