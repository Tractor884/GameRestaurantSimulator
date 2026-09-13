/**
 * ЦЕПОЧКА АРЕНДОДАТЕЛЯ (БАЛ-v2 §6, порт из v1.0.0 moderate-пресет).
 *
 * Механика:
 *  1. Квартальная индексация договора: RentQ = Rent0 × (1 + i)^Q × (1 + Σшагов).
 *     Хорошие отношения (≥ relationReliefAt) дают −0,5 п.п. к индексу.
 *  2. Разговор ~раз в год (первый — случайная неделя 8–23, детерминировано
 *     от seed): предложение шага +s с компенсацией (фасад).
 *  3. Отказ → relation −20, следующий разговор через 16 нед с шагом s×1,5
 *     без компенсации; второй отказ → через 8 нед УЛЬТИМАТУМ.
 *  4. Переезд («с сохранением» улучшений): 2 млн ₽ + 3 нед спрос ×0,75 +
 *     аренда = база ×1,10; оборудование, лицензии и ремонт НЕ теряются.
 */
export const LANDLORD = {
  /** Квартальный индекс договора, доли (i в RentQ = Rent0 × (1+i)^Q). */
  quarterlyIndex: 0.021,
  /** Шаг события «арендодатель» (первое предложение). */
  eventStep: 0.07,
  /** Множитель шага при повторном предложении (после отказа). */
  repeatStepMultiplier: 1.5,
  /** Шаг ультиматума (2 отказа подряд), доли. */
  ultimatumStep: 0.1,
  /** Отношения: старт / штраф за отказ / бонус за согласие. */
  relationStart: 60,
  refusalRelation: 20,
  acceptRelation: 10,
  /** Первый разговор: неделя = firstTalkMin + rng(firstTalkSpread). */
  firstTalkMin: 8,
  firstTalkSpread: 16,
  /** После отказа следующий разговор через N недель. */
  refuseNextIn: 16,
  /** После второго отказа — ультиматум через N недель. */
  ultimatumIn: 8,
  /** Переезд: цена, просадка спроса, срок, новая аренда = база × фактор. */
  relocationCost: 2_000_000,
  relocationDemandFactor: 0.75,
  relocationDemandWeeks: 3,
  relocationRentFactor: 1.1,
  /** Хорошие отношения (≥ порога) снижают квартальный индекс. */
  relationReliefAt: 80,
  relationRelief: 0.005,
} as const;

/** Эффективный квартальный индекс с учётом отношений. */
export function rentQuarterlyIndex(relation: number): number {
  return relation >= LANDLORD.relationReliefAt
    ? LANDLORD.quarterlyIndex - LANDLORD.relationRelief
    : LANDLORD.quarterlyIndex;
}
