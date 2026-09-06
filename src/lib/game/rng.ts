/**
 * Детерминированный ГСЧ (ТЗ §5 Экономического движка).
 * mulberry32 — быстрый, воспроизводимый, без Math.random().
 * Движок симуляции использует ТОЛЬКО этот модуль для случайности.
 */

export interface Rng {
  /** Число с плавающей точкой в [0, 1). */
  next(): number;
  /** Целое в [min, max) — половинный интервал, max не включается. */
  int(min: number, max: number): number;
  /** Вещественное в [min, max). */
  float(min: number, max: number): number;
  /** true с вероятностью p. */
  chance(p: number): boolean;
  /** Случайный элемент массива. */
  pick<T>(arr: readonly T[]): T;
  /** Взвешенный выбор индекса по массиву весов. */
  weighted(weights: readonly number[]): number;
}

/** mulberry32: seed → функция [0,1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Хеш строки в 32-битное число (для производных seed по имени модуля). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Комбинация чисел в новый seed (daySeed = hash(gameSeed, week, day)). */
export function hashSeed(...nums: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= Math.imul(n >>> 0, 2654435761) >>> 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min));
    },
    float(min: number, max: number): number {
      return min + next() * (max - min);
    },
    chance(p: number): boolean {
      return next() < p;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    weighted(weights: readonly number[]): number {
      const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
      if (total <= 0) return 0;
      let roll = next() * total;
      for (let i = 0; i < weights.length; i++) {
        roll -= Math.max(0, weights[i]);
        if (roll <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

/** Производный поток для модуля: deriveRng(daySeed, "demand"). */
export function deriveRng(seed: number, module: string): Rng {
  return createRng(hashSeed(seed, hashString(module)));
}

/**
 * Случайный фактор спроса: RandomFactor ∈ [0.90, 1.10] (ТЗ §5.4).
 * Возвращаемое значение — множитель.
 */
export function demandRandomFactor(rng: Rng, min = 0.9, max = 1.1): number {
  return rng.float(min, max);
}
