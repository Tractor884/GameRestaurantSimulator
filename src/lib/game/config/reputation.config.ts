/**
 * Конфиг репутации (ТЗ §16).
 * Эффективный рейтинг — байесовский:
 *   EffectiveRating = (priorReviews × priorRating + Σ WeightedScores) / (priorReviews + Σ Weights)
 * Малое число отзывов не обрушивает рейтинг (инвариант §27.8).
 */
export interface ReputationConfig {
  priorRating: number;
  priorReviews: number;
  /** Кусочная таблица ReputationFactor (ТЗ §8.6). */
  ratingFactorTable: [number, number][];
  /** Вес скандального отзыва. */
  scandalWeight: number;
  /** Окно отзывов. */
  windowSize: number;
  /** Шум оценки отзыва ±. */
  reviewNoise: number;
  /** Вероятностный модификатор: 1 + |S-70|/50 (ТЗ §16.2). */
  satisfactionModifierSensitivity: number;
}

export const REPUTATION_CONFIG: ReputationConfig = {
  priorRating: 3.9,
  priorReviews: 20,
  ratingFactorTable: [
    [1.0, 0.3],
    [2.0, 0.55],
    [3.0, 0.85],
    [3.5, 0.95],
    [4.0, 1.05],
    [4.3, 1.15],
    [4.6, 1.25],
    [5.0, 1.35],
  ],
  scandalWeight: 5,
  windowSize: 100,
  reviewNoise: 0.5,
  satisfactionModifierSensitivity: 50,
};

/** Линейная интерполяция по кусочной таблице. */
export function interpolateTable(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x1, y1] = table[i];
    const [x2, y2] = table[i + 1];
    if (x >= x1 && x <= x2) {
      return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
    }
  }
  return table[table.length - 1][1];
}

/** ReputationFactor по рейтингу. */
export function reputationFactor(rating: number): number {
  return interpolateTable(REPUTATION_CONFIG.ratingFactorTable, rating);
}
