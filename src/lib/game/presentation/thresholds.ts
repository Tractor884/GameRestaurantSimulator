/**
 * ============================================================================
 * ПОРОГИ ВИЗУАЛЬНЫХ СОСТОЯНИЙ (VISUAL_STATE_MAP.md §12)
 * ============================================================================
 * Единственный источник констант презентационного слоя. Значения согласованы
 * с эталонами движка (калибровка 2.0): усталость 30/60/80, износ 40/60/80,
 * загрузка станций 1.0/1.2, FC 34/36/40, очередь 3/6/10, coverDays 0.5/1.5/5.
 * Правка порогов НЕ требует правки движка (слой — только чтение).
 */

import type { Mood } from './types';

export const THRESHOLDS = {
  /* Персонал (§1–§2) */
  fatigue: { great: 30, warning: 60, critical: 80 },
  morale: { great: 75, warning: 50, critical: 30 },
  newHireShare: { warning: 0.25, great: 0.1 },
  severeShare: 0.75, // пул < max смен × 0.75 → severe

  /* Кухня / шеф (§3) */
  kitchenLoad: { great: 0.85, warning: 1.0, critical: 1.2 },
  wear: { great: 40, warning: 60, critical: 80 },
  foodCost: { great: 0.32, warning: 0.36, critical: 0.4 },
  stopListHits: 12,

  /* Финансы (§4, §8) */
  runway: { critical: 1, warning: 4, great: 8, bankerGreat: 6, bankerWarning: 6 },

  /* Склад (§5) */
  coverDays: { empty: 0.5, low: 1.5, overstock: 5 },
  nearExpiry: 0.08,
  wasteShare: 0.05,

  /* Техник (§6) */
  technicalRisk: { great: 30, warning: 50, critical: 70 },
  wearGreat: 35,

  /* Маркетинг (§7) */
  guestTrend: { great: 0.08, warning: -0.05, critical: -0.25 },
  budgetShare: 0.08,

  /* Владелец (§9) */
  bsc: { great: 70, warning: 55, critical: 40 },

  /* Гости (§10) */
  satisfaction: { happy: 85, unhappy: 68 },
  lostShare: { happy: 0.05, unhappy: 0.12 },

  /* Сцена зала (§11) */
  queue: { small: 3, medium: 6, large: 10 },
  cleanliness: { off: 75, on: 50, heavy: 35 },
  dishesWear: 70,

  /* Дни до истечения партий (склад) */
  nearExpiryDays: 2,
} as const;

/** Сведение «хуже — важнее»: из нескольких Mood берём приоритетный. */
const MOOD_ORDER: Record<Mood, number> = { great: 0, normal: 1, warning: 2, critical: 3 };
const MOOD_BY_ORDER: Mood[] = ['great', 'normal', 'warning', 'critical'];

/** Самый «плохой» из настроений (great < normal < warning < critical). */
export function worstMood(...moods: Mood[]): Mood {
  let worst: Mood = 'great';
  for (const m of moods) if (MOOD_ORDER[m] > MOOD_ORDER[worst]) worst = m;
  return worst;
}

/** Самый «хороший» признак не спасает: настроение = худший сигнал. */
export function moodFromFlags(flags: { great: boolean; warning: boolean; critical: boolean }): Mood {
  if (flags.critical) return 'critical';
  if (flags.warning) return 'warning';
  if (flags.great) return 'great';
  return 'normal';
}

/** Инверсия MOOD_ORDER (для отладки/сообщений). */
export function moodRank(mood: Mood): number {
  return MOOD_ORDER[mood];
}

export { MOOD_BY_ORDER };
