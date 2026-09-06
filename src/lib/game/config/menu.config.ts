/**
 * Конфиг меню и эластичности цен (ТЗ §17, §10.5).
 * PriceFactor = (RecommendedPrice / CurrentPrice)^Elasticity
 */
import type { DishCategory } from '../types';

export interface MenuCategoryConfig {
  id: DishCategory;
  label: string;
  /** Эластичность спроса по цене внутри категории. */
  elasticity: number;
  /** Целевой FoodCost категории (для подсказок). */
  targetFoodCost: number;
  stationNote: string;
}

export const MENU_CATEGORIES: Record<DishCategory, MenuCategoryConfig> = {
  breakfast: { id: 'breakfast', label: 'Завтраки', elasticity: 1.6, targetFoodCost: 0.28, stationNote: 'Горячий цех' },
  lunch: { id: 'lunch', label: 'Бизнес-ланчи', elasticity: 1.9, targetFoodCost: 0.3, stationNote: 'Горячий цех' },
  salad: { id: 'salad', label: 'Салаты', elasticity: 1.3, targetFoodCost: 0.3, stationNote: 'Холодный цех' },
  soup: { id: 'soup', label: 'Супы', elasticity: 1.1, targetFoodCost: 0.2, stationNote: 'Горячий цех' },
  appetizer: { id: 'appetizer', label: 'Закуски', elasticity: 1.2, targetFoodCost: 0.3, stationNote: 'Холодный цех' },
  hot: { id: 'hot', label: 'Горячее', elasticity: 1.0, targetFoodCost: 0.32, stationNote: 'Горячий цех' },
  garnish: { id: 'garnish', label: 'Гарниры', elasticity: 1.2, targetFoodCost: 0.26, stationNote: 'Горячий цех' },
  dessert: { id: 'dessert', label: 'Десерты', elasticity: 1.0, targetFoodCost: 0.25, stationNote: 'Кондитерская' },
  non_alc_drink: { id: 'non_alc_drink', label: 'Напитки', elasticity: 1.4, targetFoodCost: 0.22, stationNote: 'Бар' },
  coffee: { id: 'coffee', label: 'Кофе', elasticity: 0.9, targetFoodCost: 0.14, stationNote: 'Кофе-станция' },
  alcohol: { id: 'alcohol', label: 'Алкоголь', elasticity: 0.8, targetFoodCost: 0.35, stationNote: 'Бар (лицензия)' },
};

/** Минимальный и рекомендуемый размер меню (ТЗ §17). */
export const MENU_SIZE = {
  minDishes: 12,
  recommendedMin: 25,
  recommendedMax: 45,
  penaltyBelow: 0.15, // -15% к разнообразию в удовлетворённости при меню < мин
};

/** НДС в ценах не моделируем отдельно (игровая упрощённая модель, ТЗ §2.5). */
