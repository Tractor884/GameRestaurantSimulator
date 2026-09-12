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
  /** Доля отзывов «личный казус» (реализм v9): даже в отличном ресторане
   *  часть гостей сталкивается с личной проблемой (перепутали блюдо,
   *  ждали дольше соседей, не сошлись вкусы) — их оценка низка
   *  независимо от средней удовлетворённости. */
  badLuckShare: number;
  /** Диапазон оценки «личного казуса»: от 2,0 до badLuckTop. */
  badLuckTop: number;
  /** Вероятностный модификатор: 1 + |S-70|/50 (ТЗ §16.2). */
  satisfactionModifierSensitivity: number;
}

export const REPUTATION_CONFIG: ReputationConfig = {
  priorRating: 3.9,
  // АУДИТ: 20→45. Байесовский буфер сильнее: один провальный день
  // (даже с ~20 плохими отзывами) не должен ронять рейтинг больше чем
  // на 0.3–0.4 пункта. Замер: Δ было −0.61 (prior 20), стало ≈ −0.36.
  priorReviews: 45,
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
  // Реализм (v9, запрос пользователя): ~2% отзывов — «личный казус»
  // (оценка 2,0–3,4★) даже при высокой удовлетворённости ≈ 3 негативных
  // отзыва в неделю — видны на экране отзывов, работа с ними (§8) —
  // регулярная рутина управляющего. Замер по эталону: рейтинг −0,03…−0,05 —
  // байесовский буфер и окно 100 отзывов переваривают без обвала.
  badLuckShare: 0.02,
  badLuckTop: 3.4,
  // АУДИТ: 50→80 — крайние дни генерируют меньше «внезапных» отзывов
  // (крайности отзывчивее, но не взрываются в 2 раза).
  satisfactionModifierSensitivity: 80,
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
