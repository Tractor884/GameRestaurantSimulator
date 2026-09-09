/**
 * Конфиг сегментов гостей (ТЗ §13).
 *
 * МАТЕМАТИКА КАЛИБРОВКИ СРЕДНЕГО ЧЕКА:
 *   ExpectedCheck(сегмент) = Σ P(категория) × Quantity × Цена_категории
 * Пример (вечерние гости, цены Upper Casual):
 *   0.45×890(закуски) + 0.35×990(салаты) + 0.90×1490(горячее)
 *   + 0.35×590(гарнир) + 0.80×590(напитки) + 0.30×490(кофе)
 *   + 0.35×690(десерты) + 0.30×1200(алкоголь) ≈ 3513 ₽
 * Это и формирует фактический средний чек — он НЕ задаётся жёстко (ТЗ §13.7).
 */
import type { DishCategory, SegmentId } from '../types';

export interface SegmentConfig {
  id: SegmentId;
  name: string;
  /** Ожидаемый бюджет сегмента на одного гостя, ₽. */
  budget: number;
  /** Чувствительность к цене (для PricePerceptionFactor, ТЗ §13.5). */
  priceSensitivity: number;
  /** Максимальное ожидание в очереди, мин (ТЗ §14.3). */
  maxQueueMinutes: number;
  /** Вероятности заказа категорий (ТЗ §10.2). */
  orderProbabilities: Partial<Record<DishCategory, number>>;
  /** Множитель количества позиций в категории (обычно 1). */
  categoryQuantities: Partial<Record<DishCategory, number>>;
  /** Предпочтения часов (вес): доля сегмента в часе = вес / сумма весов всех сегментов. */
  hourWeights: Record<number, number>; // час 8..23
  /** Предпочтение дней недели: множитель поверх профиля дня локации. */
  dayWeights: number[]; // 7 значений
  /** Базовая вероятность оставить отзыв. */
  reviewProbability: number;
  /** Базовая лояльность (вероятность возврата при удовлетворённости 100). */
  baseLoyalty: number;
  /** Эластичность лояльности: (S/100)^k. */
  loyaltyElasticity: number;
  /** Диапазон задержки возврата, дней [min, max]. */
  returnDelayDays: [number, number];
  /** Склонность к чаевым, доля от чека. */
  tipRate: number;
  alcoholProbability: number;
}

const H = (weights: Record<number, number>): Record<number, number> => weights;

export const SEGMENTS: Record<SegmentId, SegmentConfig> = {
  breakfast: {
    id: 'breakfast',
    name: 'Завтракающие',
    budget: 1500,
    priceSensitivity: 0.9,
    maxQueueMinutes: 10,
    orderProbabilities: { breakfast: 0.9, coffee: 0.65, non_alc_drink: 0.4, dessert: 0.05 },
    categoryQuantities: {},
    hourWeights: H({ 8: 1.5, 9: 1.3, 10: 0.6, 11: 0.2 }),
    dayWeights: [1.1, 1.1, 1.1, 1.1, 1.0, 0.6, 0.9],
    reviewProbability: 0.05,
    baseLoyalty: 0.4,
    loyaltyElasticity: 1.4,
    returnDelayDays: [1, 3],
    tipRate: 0.05,
    alcoholProbability: 0.02,
  },
  business_lunch: {
    id: 'business_lunch',
    name: 'Бизнес-ланч',
    budget: 1500,
    priceSensitivity: 1.0,
    maxQueueMinutes: 12,
    orderProbabilities: { lunch: 0.82, soup: 0.25, salad: 0.2, coffee: 0.3, non_alc_drink: 0.35, dessert: 0.05 },
    categoryQuantities: {},
    hourWeights: H({ 11: 0.5, 12: 1.5, 13: 1.6, 14: 0.8, 15: 0.2 }),
    dayWeights: [1.15, 1.15, 1.15, 1.15, 0.9, 0.15, 0.3],
    reviewProbability: 0.04,
    baseLoyalty: 0.5,
    loyaltyElasticity: 1.5,
    returnDelayDays: [1, 7],
    tipRate: 0.07,
    alcoholProbability: 0.05,
  },
  office_evening: {
    id: 'office_evening',
    name: 'Офисные вечером',
    budget: 3200,
    priceSensitivity: 0.6,
    maxQueueMinutes: 15,
    orderProbabilities: {
      appetizer: 0.3, salad: 0.4, hot: 0.85, garnish: 0.35,
      non_alc_drink: 0.75, coffee: 0.35, dessert: 0.25, alcohol: 0.2,
    },
    categoryQuantities: {},
    hourWeights: H({ 17: 0.4, 18: 1.3, 19: 1.4, 20: 1.0, 21: 0.6 }),
    dayWeights: [1.0, 1.0, 1.1, 1.2, 1.3, 0.4, 0.5],
    reviewProbability: 0.08,
    baseLoyalty: 0.3,
    loyaltyElasticity: 1.2,
    returnDelayDays: [3, 14],
    tipRate: 0.1,
    alcoholProbability: 0.3,
  },
  family: {
    id: 'family',
    name: 'Семьи',
    budget: 3200,
    priceSensitivity: 0.7,
    maxQueueMinutes: 20,
    orderProbabilities: {
      appetizer: 0.35, soup: 0.3, hot: 0.9, garnish: 0.4,
      non_alc_drink: 0.9, dessert: 0.5, coffee: 0.25,
    },
    categoryQuantities: { dessert: 1.4, non_alc_drink: 1.2 },
    hourWeights: H({ 11: 0.3, 12: 1.0, 13: 1.2, 14: 1.0, 15: 0.4, 16: 0.2, 17: 0.2, 18: 0.8, 19: 1.0, 20: 0.6 }),
    dayWeights: [0.6, 0.5, 0.6, 0.9, 1.3, 1.6, 1.2],
    reviewProbability: 0.09,
    baseLoyalty: 0.45,
    loyaltyElasticity: 1.3,
    returnDelayDays: [7, 21],
    tipRate: 0.08,
    alcoholProbability: 0.15,
  },
  youth: {
    id: 'youth',
    name: 'Молодёжь',
    budget: 2400,
    priceSensitivity: 0.9,
    maxQueueMinutes: 15,
    orderProbabilities: {
      appetizer: 0.4, salad: 0.3, hot: 0.8, garnish: 0.3,
      non_alc_drink: 0.85, dessert: 0.4, coffee: 0.3, alcohol: 0.1,
    },
    categoryQuantities: { non_alc_drink: 1.2 },
    hourWeights: H({ 12: 0.3, 15: 0.3, 16: 0.4, 17: 0.6, 18: 1.0, 19: 1.4, 20: 1.5, 21: 1.2, 22: 0.6 }),
    dayWeights: [0.8, 0.8, 0.9, 1.1, 1.4, 1.5, 1.1],
    reviewProbability: 0.12,
    baseLoyalty: 0.3,
    loyaltyElasticity: 1.2,
    returnDelayDays: [3, 14],
    tipRate: 0.05,
    alcoholProbability: 0.12,
  },
  tourist: {
    id: 'tourist',
    name: 'Туристы',
    budget: 4500,
    priceSensitivity: 0.5,
    maxQueueMinutes: 18,
    orderProbabilities: {
      appetizer: 0.5, salad: 0.4, soup: 0.35, hot: 0.95, garnish: 0.4,
      non_alc_drink: 0.9, dessert: 0.45, coffee: 0.4, alcohol: 0.3,
    },
    categoryQuantities: {},
    hourWeights: H({ 10: 0.3, 11: 0.5, 12: 1.2, 13: 1.3, 14: 1.1, 15: 0.6, 16: 0.4, 17: 0.4, 18: 0.9, 19: 1.1, 20: 1.0, 21: 0.5 }),
    dayWeights: [0.7, 0.7, 0.8, 0.9, 1.2, 1.4, 1.3],
    reviewProbability: 0.15,
    baseLoyalty: 0.05,
    loyaltyElasticity: 1.0,
    returnDelayDays: [30, 90],
    tipRate: 0.1,
    alcoholProbability: 0.4,
  },
  premium: {
    id: 'premium',
    name: 'Премиум-гости',
    budget: 6000,
    priceSensitivity: 0.25,
    maxQueueMinutes: 25,
    orderProbabilities: {
      appetizer: 0.6, salad: 0.5, soup: 0.3, hot: 1.0, garnish: 0.5,
      non_alc_drink: 0.8, dessert: 0.5, coffee: 0.5, alcohol: 0.45,
    },
    categoryQuantities: { appetizer: 1.2 },
    hourWeights: H({ 12: 0.3, 13: 0.4, 15: 0.2, 16: 0.2, 17: 0.3, 18: 1.0, 19: 1.4, 20: 1.4, 21: 1.0, 22: 0.4 }),
    dayWeights: [0.9, 0.9, 1.0, 1.1, 1.3, 1.4, 0.9],
    reviewProbability: 0.1,
    baseLoyalty: 0.4,
    loyaltyElasticity: 1.6,
    returnDelayDays: [14, 45],
    tipRate: 0.15,
    alcoholProbability: 0.55,
  },
  evening: {
    id: 'evening',
    name: 'Вечерние гости',
    budget: 3500,
    priceSensitivity: 0.5,
    maxQueueMinutes: 15,
    orderProbabilities: {
      appetizer: 0.45, salad: 0.35, hot: 0.9, garnish: 0.35,
      non_alc_drink: 0.8, coffee: 0.3, dessert: 0.35, alcohol: 0.3,
    },
    categoryQuantities: {},
    hourWeights: H({ 16: 0.2, 17: 0.5, 18: 1.2, 19: 1.4, 20: 1.3, 21: 1.0, 22: 0.8 }),
    dayWeights: [0.7, 0.7, 0.9, 1.1, 1.4, 1.5, 1.0],
    reviewProbability: 0.08,
    baseLoyalty: 0.35,
    loyaltyElasticity: 1.3,
    returnDelayDays: [3, 21],
    tipRate: 0.12,
    alcoholProbability: 0.35,
  },
};

export const SEGMENT_IDS = Object.keys(SEGMENTS) as SegmentId[];
