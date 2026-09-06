/**
 * ============================================================================
 * БЛЮДА МЕНЮ — библиотека контента (Москва, casual dining / upper casual)
 * ============================================================================
 * 60 блюд, средний чек 3500+ ₽. recommendedPrice — ориентир цены продажи.
 *
 * КАЛИБРОВКА FOODCOST (ТЗ §13.1 «Экономического движка»):
 *   RecipeCost     = Σ(baseCost × qty) × (1 + prepWastePercent)
 *   RecipeFoodCost = RecipeCost / recommendedPrice
 * Целевые диапазоны FC по категориям (доля от цены продажи):
 *   завтраки / ланчи / салаты / закуски / горячее / гарниры ... 26–33%
 *   супы ....................................................... 14–22%
 *   десерты ................................................... 22–30%
 *   безалкогольные напитки ................................... 18–26%
 *   кофе ...................................................... 10–16%
 *   алкоголь .................................................. 28–36%
 * Над каждым блюдом — расчёт себестоимости и итоговый FC% (проверено скриптом).
 *
 * Станции: breakfast/lunch/soup/hot/garnish → hot_kitchen;
 * salad/appetizer → cold_kitchen; dessert → dessert;
 * non_alc_drink/alcohol → bar_service; coffee → coffee.
 */
import type { Dish } from '../types';
import { INGREDIENTS_MAP } from './ingredients';

export const DISHES: Dish[] = [
  /* ==================== ЗАВТРАКИ (hot_kitchen, FC 26–33%) ==================== */

  // 120+1.6+24+1.8+0.07+6.2+25.6+18 = 197.3 ₽ × 1.04 = 205 ₽ → FC 29.7% (690 ₽)
  {
    id: 'syrniki',
    name: 'Сырники со сгущёнкой',
    category: 'breakfast',
    station: 'hot_kitchen',
    recommendedPrice: 690,
    baseQuality: 72,
    basePopularity: 78,
    prepMinutes: 12,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'curd', quantity: 0.25 },
      { ingredientId: 'flour', quantity: 0.035 },
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'sugar', quantity: 0.025 },
      { ingredientId: 'salt', quantity: 0.003 },
      { ingredientId: 'sunflower_oil', quantity: 0.04 },
      { ingredientId: 'condensed_milk', quantity: 0.08 },
      { ingredientId: 'sour_cream', quantity: 0.05 },
    ],
  },

  // 48+7.6+19+65+19+1.9+0.04 = 160.5 ₽ × 1.03 = 165 ₽ → FC 28.0% (590 ₽)
  {
    id: 'omelet_tomato',
    name: 'Омлет с томатами и чеддером',
    category: 'breakfast',
    station: 'hot_kitchen',
    recommendedPrice: 590,
    baseQuality: 68,
    basePopularity: 62,
    prepMinutes: 10,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'egg', quantity: 4 },
      { ingredientId: 'milk', quantity: 0.08 },
      { ingredientId: 'tomato', quantity: 0.1 },
      { ingredientId: 'cheese_cheddar', quantity: 0.05 },
      { ingredientId: 'butter_82', quantity: 0.02 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'salt', quantity: 0.002 },
    ],
  },

  // 5.1+23.75+81+14.4+9.5+0.02 = 133.8 ₽ × 1.03 = 138 ₽ → FC 28.1% (490 ₽)
  {
    id: 'oatmeal_berries',
    name: 'Овсянка с ягодами и мёдом',
    category: 'breakfast',
    station: 'hot_kitchen',
    recommendedPrice: 490,
    baseQuality: 65,
    basePopularity: 55,
    prepMinutes: 8,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'oats', quantity: 0.06 },
      { ingredientId: 'milk', quantity: 0.25 },
      { ingredientId: 'berries_mix', quantity: 0.09 },
      { ingredientId: 'honey', quantity: 0.02 },
      { ingredientId: 'butter_82', quantity: 0.01 },
      { ingredientId: 'salt', quantity: 0.001 },
    ],
  },

  // 36+25.2+148+66.5+1.9+1.9+0.02 = 279.5 ₽ × 1.05 = 294 ₽ → FC 29.6% (990 ₽)
  {
    id: 'eggs_benedict',
    name: 'Яйца Бенедикт с лососем',
    category: 'breakfast',
    station: 'hot_kitchen',
    recommendedPrice: 990,
    baseQuality: 86,
    basePopularity: 70,
    prepMinutes: 18,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'egg', quantity: 3 },
      { ingredientId: 'bread_brioche', quantity: 0.06 },
      { ingredientId: 'salmon_fresh', quantity: 0.08 },
      { ingredientId: 'butter_82', quantity: 0.07 },
      { ingredientId: 'lemon', quantity: 0.01 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'salt', quantity: 0.001 },
    ],
  },

  // 37.8+65+45.5+14.25+5.7+10.5 = 178.8 ₽ × 1.05 = 188 ₽ → FC 31.8% (590 ₽)
  {
    id: 'croissant_ham',
    name: 'Круассан с ветчиной и сыром',
    category: 'breakfast',
    station: 'hot_kitchen',
    recommendedPrice: 590,
    baseQuality: 66,
    basePopularity: 58,
    prepMinutes: 7,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'bread_brioche', quantity: 0.09 },
      { ingredientId: 'prosciutto', quantity: 0.025 },
      { ingredientId: 'cheese_cheddar', quantity: 0.035 },
      { ingredientId: 'butter_82', quantity: 0.015 },
      { ingredientId: 'tomato', quantity: 0.03 },
      { ingredientId: 'lettuce_mix', quantity: 0.015 },
    ],
  },

  // 24+62.5+18.4+2.1+2.08+52.25+18+1.9+0.85 = 182.1 ₽ × 1.05 = 191 ₽ → FC 27.7% (690 ₽)
  {
    id: 'shakshuka',
    name: 'Шакшука',
    category: 'breakfast',
    station: 'hot_kitchen',
    recommendedPrice: 690,
    baseQuality: 78,
    basePopularity: 66,
    prepMinutes: 15,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'passata', quantity: 0.25 },
      { ingredientId: 'pepper_bell', quantity: 0.08 },
      { ingredientId: 'onion', quantity: 0.05 },
      { ingredientId: 'garlic', quantity: 0.008 },
      { ingredientId: 'cheese_suluguni', quantity: 0.055 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'pepper_black', quantity: 0.001 },
    ],
  },

  /* ============ БИЗНЕС-ЛАНЧИ (hot_kitchen, FC 26–33%) ============
   * Техкарта = суп + горячее + напиток, увеличенные выходы. */

  // борщ(говядина 62.4+овощи 17.9+сметана 14.4+т.п.) + курица с пюре(83.6+15.6+33.3)
  // + хлеб 18 + морс 48 + мелочь 4.7 = 261.9 ₽ × 1.05 = 275 ₽ → FC 27.8% (990 ₽)
  {
    id: 'lunch_classic',
    name: 'Бизнес-ланч «Классический»',
    category: 'lunch',
    station: 'hot_kitchen',
    recommendedPrice: 990,
    baseQuality: 70,
    basePopularity: 82,
    prepMinutes: 20,
    prepWastePercent: 0.05,
    recipe: [
      // борщ с говядиной
      { ingredientId: 'beef_stew', quantity: 0.08 },
      { ingredientId: 'beet', quantity: 0.08 },
      { ingredientId: 'cabbage', quantity: 0.07 },
      { ingredientId: 'potato', quantity: 0.1 },
      { ingredientId: 'carrot', quantity: 0.05 },
      { ingredientId: 'onion', quantity: 0.04 },
      { ingredientId: 'tomato_paste', quantity: 0.015 },
      { ingredientId: 'sour_cream', quantity: 0.04 },
      // куриная грудка с картофельным пюре
      { ingredientId: 'chicken_fillet', quantity: 0.14 },
      { ingredientId: 'potato', quantity: 0.15 },
      { ingredientId: 'butter_82', quantity: 0.03 },
      { ingredientId: 'milk', quantity: 0.05 },
      // хлеб + напиток
      { ingredientId: 'bread_sourdough', quantity: 0.05 },
      { ingredientId: 'mors_cranberry', quantity: 0.3 },
      { ingredientId: 'herbs_dill', quantity: 0.006 },
      { ingredientId: 'salt', quantity: 0.004 },
      { ingredientId: 'sunflower_oil', quantity: 0.01 },
    ],
  },

  // крем-суп(34.2+28+39.2+3.84+1.26+1.04) + салат(35+23+6.5+13.5+1.52)
  // + хлеб 18 + сок 32.5 + соль = 237.6 ₽ × 1.05 = 250 ₽ → FC 28.0% (890 ₽)
  {
    id: 'lunch_light',
    name: 'Бизнес-ланч «Лёгкий»',
    category: 'lunch',
    station: 'hot_kitchen',
    recommendedPrice: 890,
    baseQuality: 68,
    basePopularity: 70,
    prepMinutes: 18,
    prepWastePercent: 0.05,
    recipe: [
      // крем-суп из шампиньонов с курицей
      { ingredientId: 'chicken_fillet', quantity: 0.09 },
      { ingredientId: 'mushroom_champignon', quantity: 0.1 },
      { ingredientId: 'cream_33', quantity: 0.07 },
      { ingredientId: 'potato', quantity: 0.08 },
      { ingredientId: 'onion', quantity: 0.03 },
      { ingredientId: 'garlic', quantity: 0.004 },
      // овощной салат
      { ingredientId: 'lettuce_mix', quantity: 0.05 },
      { ingredientId: 'tomato_cherry', quantity: 0.05 },
      { ingredientId: 'cucumber', quantity: 0.05 },
      { ingredientId: 'olive_oil', quantity: 0.015 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      // хлеб + напиток
      { ingredientId: 'bread_sourdough', quantity: 0.05 },
      { ingredientId: 'juice_apple', quantity: 0.25 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // борщ с говядиной 104.7 + свиная шея 100.8 + пюре(12+19+3.8+масло)
  // + сметана 18 + хлеб 21.6 + морс 56 + мелочь 7.6 = 332 ₽ × 1.05 = 349 ₽ → FC 29.3% (1190 ₽)
  {
    id: 'lunch_hearty',
    name: 'Бизнес-ланч «Сытный»',
    category: 'lunch',
    station: 'hot_kitchen',
    recommendedPrice: 1190,
    baseQuality: 72,
    basePopularity: 75,
    prepMinutes: 22,
    prepWastePercent: 0.05,
    recipe: [
      // борщ с говядиной
      { ingredientId: 'beef_stew', quantity: 0.1 },
      { ingredientId: 'beet', quantity: 0.08 },
      { ingredientId: 'cabbage', quantity: 0.09 },
      { ingredientId: 'carrot', quantity: 0.05 },
      { ingredientId: 'onion', quantity: 0.04 },
      { ingredientId: 'tomato_paste', quantity: 0.015 },
      { ingredientId: 'sour_cream', quantity: 0.05 },
      // свиная шея с картофельным пюре
      { ingredientId: 'pork_neck', quantity: 0.18 },
      { ingredientId: 'potato', quantity: 0.25 },
      { ingredientId: 'butter_82', quantity: 0.02 },
      { ingredientId: 'milk', quantity: 0.04 },
      // хлеб + напиток + мелочь
      { ingredientId: 'bread_sourdough', quantity: 0.06 },
      { ingredientId: 'mors_cranberry', quantity: 0.35 },
      { ingredientId: 'herbs_dill', quantity: 0.006 },
      { ingredientId: 'garlic', quantity: 0.004 },
      { ingredientId: 'sunflower_oil', quantity: 0.015 },
      { ingredientId: 'salt', quantity: 0.005 },
    ],
  },

  // том-кх(кокос 50.4+креветка 47.5+гриб+лайм+...) 92 + рис с курицей(16.2+49.4+соевый+овощи 28)
  // + фреш 65 + мелочь 15.9 = 282.4 ₽ × 1.05 = 297 ₽ → FC 27.2% (1090 ₽)
  {
    id: 'lunch_asian',
    name: 'Бизнес-ланч «Азиатский»',
    category: 'lunch',
    station: 'hot_kitchen',
    recommendedPrice: 1090,
    baseQuality: 75,
    basePopularity: 68,
    prepMinutes: 20,
    prepWastePercent: 0.05,
    recipe: [
      // суп на кокосовом молоке с креветкой
      { ingredientId: 'coconut_milk', quantity: 0.12 },
      { ingredientId: 'shrimp_reg', quantity: 0.05 },
      { ingredientId: 'mushroom_champignon', quantity: 0.04 },
      { ingredientId: 'ginger', quantity: 0.01 },
      { ingredientId: 'lime', quantity: 0.02 },
      { ingredientId: 'cilantro', quantity: 0.005 },
      // рис жасмин с курицей в соево-овощной глазури
      { ingredientId: 'rice_jasmine', quantity: 0.09 },
      { ingredientId: 'chicken_fillet', quantity: 0.13 },
      { ingredientId: 'soy_sauce', quantity: 0.02 },
      { ingredientId: 'pepper_bell', quantity: 0.05 },
      { ingredientId: 'carrot', quantity: 0.04 },
      { ingredientId: 'onion', quantity: 0.03 },
      { ingredientId: 'sunflower_oil', quantity: 0.02 },
      { ingredientId: 'sriracha', quantity: 0.005 },
      // напиток
      { ingredientId: 'juice_orange', quantity: 0.25 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  /* ==================== САЛАТЫ (cold_kitchen, FC 26–33%) ==================== */

  // 60.8+41.4+70+14.4+12+11.4+7.5+3.8+4.5+0.78+18+23 = 268.6 ₽ × 1.06 = 285 ₽ → FC 28.8% (990 ₽)
  {
    id: 'caesar_chicken',
    name: 'Цезарь с курицей',
    category: 'salad',
    station: 'cold_kitchen',
    recommendedPrice: 990,
    baseQuality: 75,
    basePopularity: 95,
    prepMinutes: 12,
    prepWastePercent: 0.06,
    recipe: [
      { ingredientId: 'chicken_fillet', quantity: 0.16 },
      { ingredientId: 'lettuce_romaine', quantity: 0.09 },
      { ingredientId: 'cheese_parmesan', quantity: 0.025 },
      { ingredientId: 'bread_sourdough', quantity: 0.04 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'sauces_mayo', quantity: 0.03 },
      { ingredientId: 'anchovy', quantity: 0.003 },
      { ingredientId: 'lemon', quantity: 0.02 },
      { ingredientId: 'sauces_worcester', quantity: 0.005 },
      { ingredientId: 'garlic', quantity: 0.003 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'tomato_cherry', quantity: 0.05 },
    ],
  },

  // 208+41.4+70+14.4+12+11.4+7.5+3.8+4.5+0.78+18+23 = 419.2 ₽ × 1.05 = 440 ₽ → FC 31.7% (1390 ₽)
  {
    id: 'caesar_shrimp',
    name: 'Цезарь с креветками',
    category: 'salad',
    station: 'cold_kitchen',
    recommendedPrice: 1390,
    baseQuality: 80,
    basePopularity: 85,
    prepMinutes: 12,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'shrimp_tiger', quantity: 0.13 },
      { ingredientId: 'lettuce_romaine', quantity: 0.09 },
      { ingredientId: 'cheese_parmesan', quantity: 0.025 },
      { ingredientId: 'bread_sourdough', quantity: 0.04 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'sauces_mayo', quantity: 0.03 },
      { ingredientId: 'anchovy', quantity: 0.003 },
      { ingredientId: 'lemon', quantity: 0.02 },
      { ingredientId: 'sauces_worcester', quantity: 0.005 },
      { ingredientId: 'garlic', quantity: 0.003 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'tomato_cherry', quantity: 0.05 },
    ],
  },

  // 28.5+15.6+114+2.25+13.8+32+22.5+1.52+3.8+0.07 = 234 ₽ × 1.05 = 246 ₽ → FC 27.6% (890 ₽)
  {
    id: 'greek_salad',
    name: 'Греческий с фетой',
    category: 'salad',
    station: 'cold_kitchen',
    recommendedPrice: 890,
    baseQuality: 70,
    basePopularity: 72,
    prepMinutes: 10,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'tomato', quantity: 0.15 },
      { ingredientId: 'cucumber', quantity: 0.12 },
      { ingredientId: 'cheese_feta', quantity: 0.095 },
      { ingredientId: 'onion_red', quantity: 0.03 },
      { ingredientId: 'pepper_bell', quantity: 0.06 },
      { ingredientId: 'olives', quantity: 0.04 },
      { ingredientId: 'olive_oil', quantity: 0.025 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'lemon', quantity: 0.02 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 203.5+67.2+35+9.1+27.6+18+7.8+4.2+0.04 = 372.4 ₽ × 1.06 = 395 ₽ → FC 30.6% (1290 ₽)
  {
    id: 'salmon_avocado',
    name: 'Салат с лососем и авокадо',
    category: 'salad',
    station: 'cold_kitchen',
    recommendedPrice: 1290,
    baseQuality: 82,
    basePopularity: 78,
    prepMinutes: 12,
    prepWastePercent: 0.06,
    recipe: [
      { ingredientId: 'salmon_fresh', quantity: 0.11 },
      { ingredientId: 'avocado', quantity: 0.12 },
      { ingredientId: 'lettuce_mix', quantity: 0.05 },
      { ingredientId: 'cucumber', quantity: 0.07 },
      { ingredientId: 'tomato_cherry', quantity: 0.06 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'lime', quantity: 0.03 },
      { ingredientId: 'soy_sauce', quantity: 0.01 },
      { ingredientId: 'salt', quantity: 0.002 },
    ],
  },

  // 275+28.5+8+18+15+0.04 = 344.5 ₽ × 1.04 = 358 ₽ → FC 30.1% (1190 ₽)
  {
    id: 'caprese_burrata',
    name: 'Капрезе с бурратой',
    category: 'salad',
    station: 'cold_kitchen',
    recommendedPrice: 1190,
    baseQuality: 84,
    basePopularity: 65,
    prepMinutes: 10,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'cheese_burrata', quantity: 0.11 },
      { ingredientId: 'tomato', quantity: 0.15 },
      { ingredientId: 'basil', quantity: 0.01 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'vinegar_balsamic', quantity: 0.01 },
      { ingredientId: 'salt', quantity: 0.002 },
    ],
  },

  // 195+42+45+6.25+24+7.2+13.5+12+0.04 = 345 ₽ × 1.06 = 366 ₽ → FC 28.4% (1290 ₽)
  {
    id: 'warm_duck_salad',
    name: 'Тёплый салат с утиной грудкой',
    category: 'salad',
    station: 'cold_kitchen',
    recommendedPrice: 1290,
    baseQuality: 85,
    basePopularity: 60,
    prepMinutes: 16,
    prepWastePercent: 0.06,
    recipe: [
      { ingredientId: 'duck_breast', quantity: 0.13 },
      { ingredientId: 'lettuce_mix', quantity: 0.06 },
      { ingredientId: 'berries_mix', quantity: 0.05 },
      { ingredientId: 'orange', quantity: 0.05 },
      { ingredientId: 'nuts_walnut', quantity: 0.02 },
      { ingredientId: 'honey', quantity: 0.01 },
      { ingredientId: 'olive_oil', quantity: 0.015 },
      { ingredientId: 'vinegar_balsamic', quantity: 0.008 },
      { ingredientId: 'salt', quantity: 0.002 },
    ],
  },

  /* ==================== СУПЫ (hot_kitchen, FC 14–22%) ==================== */

  // 54.6+5.5+3.2+4.8+2.75+1.68+4.65+18+1.9+1.3+0.09+1.55 = 100 ₽ × 1.05 = 105 ₽ → FC 15.2% (690 ₽)
  {
    id: 'borsch',
    name: 'Борщ с говядиной',
    category: 'soup',
    station: 'hot_kitchen',
    recommendedPrice: 690,
    baseQuality: 72,
    basePopularity: 80,
    prepMinutes: 20,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'beef_stew', quantity: 0.07 },
      { ingredientId: 'beet', quantity: 0.1 },
      { ingredientId: 'cabbage', quantity: 0.08 },
      { ingredientId: 'potato', quantity: 0.1 },
      { ingredientId: 'carrot', quantity: 0.05 },
      { ingredientId: 'onion', quantity: 0.04 },
      { ingredientId: 'tomato_paste', quantity: 0.015 },
      { ingredientId: 'sour_cream', quantity: 0.05 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'salt', quantity: 0.004 },
      { ingredientId: 'sunflower_oil', quantity: 0.01 },
    ],
  },

  // 42+44.8+2.88+1.68+14.25+1.52+10.8+1.04+0.07 = 119 ₽ × 1.04 = 124 ₽ → FC 21.0% (590 ₽)
  {
    id: 'mushroom_cream',
    name: 'Крем-суп из шампиньонов',
    category: 'soup',
    station: 'hot_kitchen',
    recommendedPrice: 590,
    baseQuality: 70,
    basePopularity: 68,
    prepMinutes: 15,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'mushroom_champignon', quantity: 0.15 },
      { ingredientId: 'cream_33', quantity: 0.08 },
      { ingredientId: 'potato', quantity: 0.06 },
      { ingredientId: 'onion', quantity: 0.04 },
      { ingredientId: 'butter_82', quantity: 0.015 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'bread_sourdough', quantity: 0.03 },
      { ingredientId: 'garlic', quantity: 0.004 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 88+42+14+4.2+10.4+23+2+1.3+5.6+0.07 = 190.6 ₽ × 1.05 = 200 ₽ → FC 20.2% (990 ₽)
  {
    id: 'tom_yam',
    name: 'Том Ям с креветками',
    category: 'soup',
    station: 'hot_kitchen',
    recommendedPrice: 990,
    baseQuality: 84,
    basePopularity: 76,
    prepMinutes: 18,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'shrimp_tiger', quantity: 0.055 },
      { ingredientId: 'coconut_milk', quantity: 0.1 },
      { ingredientId: 'mushroom_champignon', quantity: 0.05 },
      { ingredientId: 'ginger', quantity: 0.01 },
      { ingredientId: 'lime', quantity: 0.04 },
      { ingredientId: 'tomato_cherry', quantity: 0.05 },
      { ingredientId: 'cilantro', quantity: 0.005 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'sriracha', quantity: 0.008 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 41.8+11.2+3.84+3.3+2.1+11.4+12+2.28+0.09 = 88 ₽ × 1.05 = 92.4 ₽ → FC 15.7% (590 ₽)
  {
    id: 'chicken_noodle',
    name: 'Куриный суп с лапшой',
    category: 'soup',
    station: 'hot_kitchen',
    recommendedPrice: 590,
    baseQuality: 66,
    basePopularity: 60,
    prepMinutes: 14,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'chicken_fillet', quantity: 0.11 },
      { ingredientId: 'pasta', quantity: 0.07 },
      { ingredientId: 'potato', quantity: 0.08 },
      { ingredientId: 'carrot', quantity: 0.06 },
      { ingredientId: 'onion', quantity: 0.05 },
      { ingredientId: 'butter_82', quantity: 0.012 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'herbs_dill', quantity: 0.006 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 26.6+45.5+25+3.84+2.75+1.68+16.8+1.52+10.8+1.04+0.07 = 135.6 ₽ × 1.04 = 141 ₽ → FC 20.4% (690 ₽)
  {
    id: 'cheese_soup',
    name: 'Сырный суп с курицей',
    category: 'soup',
    station: 'hot_kitchen',
    recommendedPrice: 690,
    baseQuality: 72,
    basePopularity: 74,
    prepMinutes: 15,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'chicken_fillet', quantity: 0.07 },
      { ingredientId: 'cheese_cheddar', quantity: 0.035 },
      { ingredientId: 'cheese_cream', quantity: 0.025 },
      { ingredientId: 'potato', quantity: 0.08 },
      { ingredientId: 'carrot', quantity: 0.05 },
      { ingredientId: 'onion', quantity: 0.04 },
      { ingredientId: 'cream_33', quantity: 0.03 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'bread_sourdough', quantity: 0.03 },
      { ingredientId: 'garlic', quantity: 0.004 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  /* ==================== ЗАКУСКИ (cold_kitchen, FC 26–33%) ==================== */

  // 54+34.2+54+6.4+1.3+27+7.5+0.07 = 184.5 ₽ × 1.05 = 194 ₽ → FC 28.1% (690 ₽)
  {
    id: 'bruschetta_tomato',
    name: 'Брускетты с томатами',
    category: 'appetizer',
    station: 'cold_kitchen',
    recommendedPrice: 690,
    baseQuality: 66,
    basePopularity: 64,
    prepMinutes: 8,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'bread_sourdough', quantity: 0.15 },
      { ingredientId: 'tomato', quantity: 0.18 },
      { ingredientId: 'cheese_mozzarella', quantity: 0.06 },
      { ingredientId: 'basil', quantity: 0.008 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'olive_oil', quantity: 0.03 },
      { ingredientId: 'vinegar_balsamic', quantity: 0.005 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 25.2+45+63+36+7.6+1.56+22+0.07 = 200.4 ₽ × 1.05 = 210 ₽ → FC 26.6% (790 ₽)
  {
    id: 'hummus_edamame',
    name: 'Хумус с эдамаме',
    category: 'appetizer',
    station: 'cold_kitchen',
    recommendedPrice: 790,
    baseQuality: 70,
    basePopularity: 55,
    prepMinutes: 12,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'chickpeas', quantity: 0.12 },
      { ingredientId: 'tahini', quantity: 0.05 },
      { ingredientId: 'edamame', quantity: 0.15 },
      { ingredientId: 'olive_oil', quantity: 0.04 },
      { ingredientId: 'lemon', quantity: 0.04 },
      { ingredientId: 'garlic', quantity: 0.006 },
      { ingredientId: 'pita', quantity: 0.1 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 101.5+21+14.4+8.4+2.08+4.5+7.75+1.52+0.09+28+52 = 241.2 ₽ × 1.07 = 258 ₽ → FC 29.0% (890 ₽)
  {
    id: 'wings_bbq',
    name: 'Крылья BBQ',
    category: 'appetizer',
    station: 'cold_kitchen',
    recommendedPrice: 890,
    baseQuality: 76,
    basePopularity: 82,
    prepMinutes: 16,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'chicken_thigh', quantity: 0.35 },
      { ingredientId: 'sriracha', quantity: 0.03 },
      { ingredientId: 'honey', quantity: 0.02 },
      { ingredientId: 'soy_sauce', quantity: 0.02 },
      { ingredientId: 'garlic', quantity: 0.008 },
      { ingredientId: 'breadcrumbs', quantity: 0.03 },
      { ingredientId: 'sunflower_oil', quantity: 0.05 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'salt', quantity: 0.004 },
      // сырный соус-дип
      { ingredientId: 'cream_33', quantity: 0.05 },
      { ingredientId: 'cheese_cheddar', quantity: 0.04 },
    ],
  },

  // 133+54+6+12+0.9+7.75+1.14+0.04 = 214.8 ₽ × 1.07 = 230 ₽ → FC 29.1% (790 ₽)
  {
    id: 'cheese_balls_bacon',
    name: 'Сырные шарики с беконом',
    category: 'appetizer',
    station: 'cold_kitchen',
    recommendedPrice: 790,
    baseQuality: 72,
    basePopularity: 70,
    prepMinutes: 10,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'cheese_suluguni', quantity: 0.14 },
      { ingredientId: 'bacon', quantity: 0.06 },
      { ingredientId: 'breadcrumbs', quantity: 0.04 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'flour', quantity: 0.02 },
      { ingredientId: 'sunflower_oil', quantity: 0.05 },
      { ingredientId: 'herbs_dill', quantity: 0.003 },
      { ingredientId: 'salt', quantity: 0.002 },
    ],
  },

  // 256+1.8+12+12.4+8.4+7.8+0.78+7 = 306.2 ₽ × 1.07 = 328 ₽ → FC 30.1% (1090 ₽)
  {
    id: 'shrimp_tempura',
    name: 'Креветки темпура',
    category: 'appetizer',
    station: 'cold_kitchen',
    recommendedPrice: 1090,
    baseQuality: 78,
    basePopularity: 68,
    prepMinutes: 12,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'shrimp_tiger', quantity: 0.16 },
      { ingredientId: 'flour', quantity: 0.04 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'sunflower_oil', quantity: 0.08 },
      { ingredientId: 'soy_sauce', quantity: 0.02 },
      { ingredientId: 'lime', quantity: 0.03 },
      { ingredientId: 'garlic', quantity: 0.003 },
      { ingredientId: 'sriracha', quantity: 0.01 },
    ],
  },

  // 42+127.5+90+54+40+3.75+1.52 = 358.8 ₽ × 1.05 = 377 ₽ → FC 29.2% (1290 ₽)
  {
    id: 'beer_snack_set',
    name: 'Сет закусок к пиву',
    category: 'appetizer',
    station: 'cold_kitchen',
    recommendedPrice: 1290,
    baseQuality: 70,
    basePopularity: 66,
    prepMinutes: 8,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'pickles_mix', quantity: 0.15 },
      { ingredientId: 'sausage_hunting', quantity: 0.15 },
      { ingredientId: 'bacon', quantity: 0.1 },
      { ingredientId: 'bread_sourdough', quantity: 0.15 },
      { ingredientId: 'olives', quantity: 0.05 },
      { ingredientId: 'onion_red', quantity: 0.05 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
    ],
  },

  /* ==================== ГОРЯЧЕЕ (hot_kitchen, FC 26–33%) ==================== */

  // 792+28.5+1.9+1.3+1.7+0.09 = 825.5 ₽ × 1.05 = 867 ₽ → FC 31.1% (2790 ₽)
  {
    id: 'ribeye_steak',
    name: 'Стейк рибай 300 г',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 2790,
    baseQuality: 88,
    basePopularity: 72,
    prepMinutes: 18,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'beef_ribeye', quantity: 0.33 },
      { ingredientId: 'butter_82', quantity: 0.03 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'pepper_black', quantity: 0.002 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 407+33.6+28.5+7.6+1.9+9+0.07 = 487.7 ₽ × 1.06 = 517 ₽ → FC 27.3% (1890 ₽)
  {
    id: 'salmon_steak',
    name: 'Стейк из лосося',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1890,
    baseQuality: 85,
    basePopularity: 76,
    prepMinutes: 15,
    prepWastePercent: 0.06,
    recipe: [
      { ingredientId: 'salmon_fresh', quantity: 0.22 },
      { ingredientId: 'cream_33', quantity: 0.06 },
      { ingredientId: 'butter_82', quantity: 0.03 },
      { ingredientId: 'lemon', quantity: 0.04 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'olive_oil', quantity: 0.01 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 83.6+84+38+84+1.3+2.28+9.6+7.6+28+0.09 = 338.5 ₽ × 1.05 = 355 ₽ → FC 27.6% (1290 ₽)
  {
    id: 'chicken_cream',
    name: 'Куриная грудка в сливочном соусе',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1290,
    baseQuality: 70,
    basePopularity: 74,
    prepMinutes: 15,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'chicken_fillet', quantity: 0.22 },
      { ingredientId: 'cream_33', quantity: 0.15 },
      { ingredientId: 'butter_82', quantity: 0.04 },
      { ingredientId: 'cheese_parmesan', quantity: 0.03 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'herbs_dill', quantity: 0.006 },
      { ingredientId: 'potato', quantity: 0.2 },
      { ingredientId: 'milk', quantity: 0.08 },
      { ingredientId: 'mushroom_champignon', quantity: 0.1 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 20.8+99+36+140+0.78+13.5+1.7+0.09 = 311.9 ₽ × 1.04 = 324 ₽ → FC 27.2% (1190 ₽)
  {
    id: 'pasta_carbonara',
    name: 'Паста карбонара',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1190,
    baseQuality: 78,
    basePopularity: 85,
    prepMinutes: 12,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'pasta', quantity: 0.13 },
      { ingredientId: 'bacon', quantity: 0.11 },
      { ingredientId: 'egg', quantity: 3 },
      { ingredientId: 'cheese_parmesan', quantity: 0.05 },
      { ingredientId: 'garlic', quantity: 0.003 },
      { ingredientId: 'olive_oil', quantity: 0.015 },
      { ingredientId: 'pepper_black', quantity: 0.002 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 20.8+192+52+56+67.2+1.56+18+27.6+1.9+0.09 = 437.1 ₽ × 1.06 = 463 ₽ → FC 29.1% (1590 ₽)
  {
    id: 'pasta_seafood',
    name: 'Паста с морепродуктами',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1590,
    baseQuality: 82,
    basePopularity: 72,
    prepMinutes: 15,
    prepWastePercent: 0.06,
    recipe: [
      { ingredientId: 'pasta', quantity: 0.13 },
      { ingredientId: 'shrimp_tiger', quantity: 0.12 },
      { ingredientId: 'mussels', quantity: 0.1 },
      { ingredientId: 'squid', quantity: 0.08 },
      { ingredientId: 'cream_33', quantity: 0.12 },
      { ingredientId: 'garlic', quantity: 0.006 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'tomato_cherry', quantity: 0.06 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 21.6+120+22.4+44.8+42.75+84+2.1+1.3+13.5+1.52+0.09 = 354.1 ₽ × 1.07 = 379 ₽ → FC 27.3% (1390 ₽)
  {
    id: 'risotto_porcini',
    name: 'Ризотто с белыми грибами',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1390,
    baseQuality: 84,
    basePopularity: 66,
    prepMinutes: 20,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'rice_jasmine', quantity: 0.12 },
      { ingredientId: 'mushroom_porcini', quantity: 0.08 },
      { ingredientId: 'mushroom_champignon', quantity: 0.08 },
      { ingredientId: 'cream_33', quantity: 0.08 },
      { ingredientId: 'butter_82', quantity: 0.045 },
      { ingredientId: 'cheese_parmesan', quantity: 0.03 },
      { ingredientId: 'onion', quantity: 0.05 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'olive_oil', quantity: 0.015 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 144+32+52+27+14+9.5+7.6+5.6+7.2+6.2+1.5+0.07 = 306.7 ₽ × 1.07 = 328 ₽ → FC 30.1% (1090 ₽)
  {
    id: 'moscow_burger',
    name: 'Бургер «Московский»',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1090,
    baseQuality: 76,
    basePopularity: 88,
    prepMinutes: 12,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'beef_brisket', quantity: 0.2 },
      { ingredientId: 'bun_burger', quantity: 1 },
      { ingredientId: 'cheese_cheddar', quantity: 0.04 },
      { ingredientId: 'bacon', quantity: 0.03 },
      { ingredientId: 'lettuce_mix', quantity: 0.02 },
      { ingredientId: 'tomato', quantity: 0.05 },
      { ingredientId: 'sauces_mayo', quantity: 0.02 },
      { ingredientId: 'pickles_mix', quantity: 0.02 },
      { ingredientId: 'potato', quantity: 0.15 },
      { ingredientId: 'sunflower_oil', quantity: 0.04 },
      { ingredientId: 'onion_red', quantity: 0.02 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 223.2+12+57+7.6+44.8+2.1+2.75+1.56+1.9+6.2+0.09 = 359.2 ₽ × 1.05 = 377 ₽ → FC 27.1% (1390 ₽)
  {
    id: 'beef_braised',
    name: 'Томлёная грудинка с пюре',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1390,
    baseQuality: 82,
    basePopularity: 70,
    prepMinutes: 22,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'beef_brisket', quantity: 0.31 },
      { ingredientId: 'potato', quantity: 0.25 },
      { ingredientId: 'butter_82', quantity: 0.06 },
      { ingredientId: 'milk', quantity: 0.08 },
      { ingredientId: 'cream_33', quantity: 0.08 },
      { ingredientId: 'onion', quantity: 0.05 },
      { ingredientId: 'carrot', quantity: 0.05 },
      { ingredientId: 'garlic', quantity: 0.006 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'tomato_paste', quantity: 0.02 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 429+27+11.4+2.28+1.3+9.6+13.8+0.09 = 494.5 ₽ × 1.08 = 534 ₽ → FC 31.6% (1690 ₽)
  {
    id: 'dorado_grill',
    name: 'Дорадо на гриле',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1690,
    baseQuality: 80,
    basePopularity: 62,
    prepMinutes: 15,
    prepWastePercent: 0.08,
    recipe: [
      { ingredientId: 'dorado', quantity: 0.33 },
      { ingredientId: 'olive_oil', quantity: 0.03 },
      { ingredientId: 'lemon', quantity: 0.06 },
      { ingredientId: 'herbs_dill', quantity: 0.006 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'zucchini', quantity: 0.06 },
      { ingredientId: 'pepper_bell', quantity: 0.06 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 145.2+37.8+12+4.5+8+11.5+1.68+18+1.9+6.5+1.04+56+0.07 = 304.2 ₽ × 1.07 = 325 ₽ → FC 27.3% (1190 ₽)
  {
    id: 'turkey_quinoa',
    name: 'Котлеты из индейки с киноа',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1190,
    baseQuality: 74,
    basePopularity: 58,
    prepMinutes: 15,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'turkey_fillet', quantity: 0.22 },
      { ingredientId: 'quinoa', quantity: 0.09 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'breadcrumbs', quantity: 0.03 },
      { ingredientId: 'zucchini', quantity: 0.05 },
      { ingredientId: 'pepper_bell', quantity: 0.05 },
      { ingredientId: 'onion', quantity: 0.04 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'yogurt', quantity: 0.05 },
      { ingredientId: 'garlic', quantity: 0.004 },
      { ingredientId: 'avocado', quantity: 0.1 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 22.4+140.4+9.3+25+2.1+2.75+1.56+18+84+1.52+0.09 = 307.1 ₽ × 1.05 = 322 ₽ → FC 27.1% (1190 ₽)
  {
    id: 'pasta_bolognese',
    name: 'Паста болоньезе',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1190,
    baseQuality: 76,
    basePopularity: 84,
    prepMinutes: 14,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'pasta', quantity: 0.14 },
      { ingredientId: 'beef_stew', quantity: 0.18 },
      { ingredientId: 'tomato_paste', quantity: 0.03 },
      { ingredientId: 'passata', quantity: 0.1 },
      { ingredientId: 'onion', quantity: 0.05 },
      { ingredientId: 'carrot', quantity: 0.05 },
      { ingredientId: 'garlic', quantity: 0.006 },
      { ingredientId: 'olive_oil', quantity: 0.02 },
      { ingredientId: 'cheese_parmesan', quantity: 0.03 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'salt', quantity: 0.004 },
    ],
  },

  // 360+90+28.5+21+1.9+0.78+15+0.07 = 517.2 ₽ × 1.07 = 553 ₽ → FC 29.3% (1890 ₽)
  {
    id: 'duck_cherry',
    name: 'Утиная грудка с ягодным соусом',
    category: 'hot',
    station: 'hot_kitchen',
    recommendedPrice: 1890,
    baseQuality: 87,
    basePopularity: 64,
    prepMinutes: 20,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'duck_breast', quantity: 0.24 },
      { ingredientId: 'berries_mix', quantity: 0.1 },
      { ingredientId: 'butter_82', quantity: 0.03 },
      { ingredientId: 'potato_young', quantity: 0.15 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'garlic', quantity: 0.003 },
      { ingredientId: 'vinegar_balsamic', quantity: 0.01 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  /* ==================== ГАРНИРЫ (hot_kitchen, FC 26–33%) ==================== */

  // 16.8+57+9.5+22.4+0.07 = 105.8 ₽ × 1.04 = 110 ₽ → FC 28.2% (390 ₽)
  {
    id: 'potato_puree',
    name: 'Картофельное пюре',
    category: 'garnish',
    station: 'hot_kitchen',
    recommendedPrice: 390,
    baseQuality: 65,
    basePopularity: 60,
    prepMinutes: 10,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'potato', quantity: 0.35 },
      { ingredientId: 'butter_82', quantity: 0.06 },
      { ingredientId: 'milk', quantity: 0.1 },
      { ingredientId: 'cream_33', quantity: 0.04 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 19.2+27.6+15+15.2+36+1.3+1.9+12+0.07 = 128.3 ₽ × 1.07 = 137 ₽ → FC 28.0% (490 ₽)
  {
    id: 'grilled_veggies',
    name: 'Овощи гриль',
    category: 'garnish',
    station: 'hot_kitchen',
    recommendedPrice: 490,
    baseQuality: 70,
    basePopularity: 55,
    prepMinutes: 10,
    prepWastePercent: 0.07,
    recipe: [
      { ingredientId: 'zucchini', quantity: 0.12 },
      { ingredientId: 'pepper_bell', quantity: 0.12 },
      { ingredientId: 'eggplant', quantity: 0.1 },
      { ingredientId: 'tomato', quantity: 0.08 },
      { ingredientId: 'olive_oil', quantity: 0.04 },
      { ingredientId: 'garlic', quantity: 0.005 },
      { ingredientId: 'herbs_dill', quantity: 0.005 },
      { ingredientId: 'vinegar_balsamic', quantity: 0.008 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  // 21.6+20.7+12.8+12+2.1+27+28.5+6.3+1.04+1.52+0.07 = 133.6 ₽ × 1.05 = 140 ₽ → FC 31.2% (450 ₽)
  {
    id: 'rice_veggies',
    name: 'Рис жасмин с овощами',
    category: 'garnish',
    station: 'hot_kitchen',
    recommendedPrice: 450,
    baseQuality: 66,
    basePopularity: 52,
    prepMinutes: 8,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'rice_jasmine', quantity: 0.12 },
      { ingredientId: 'pepper_bell', quantity: 0.09 },
      { ingredientId: 'zucchini', quantity: 0.08 },
      { ingredientId: 'eggplant', quantity: 0.08 },
      { ingredientId: 'onion', quantity: 0.05 },
      { ingredientId: 'olive_oil', quantity: 0.03 },
      { ingredientId: 'butter_82', quantity: 0.03 },
      { ingredientId: 'soy_sauce', quantity: 0.015 },
      { ingredientId: 'garlic', quantity: 0.004 },
      { ingredientId: 'herbs_dill', quantity: 0.004 },
      { ingredientId: 'salt', quantity: 0.003 },
    ],
  },

  /* ==================== ДЕСЕРТЫ (dessert, FC 22–30%) ==================== */

  // 100+28.5+6+12+2.88+36+1.95 = 187.3 ₽ × 1.03 = 193 ₽ → FC 28.0% (690 ₽)
  {
    id: 'cheesecake',
    name: 'Чизкейк Нью-Йорк',
    category: 'dessert',
    station: 'dessert',
    recommendedPrice: 690,
    baseQuality: 82,
    basePopularity: 85,
    prepMinutes: 8,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'cheese_cream', quantity: 0.1 },
      { ingredientId: 'butter_82', quantity: 0.03 },
      { ingredientId: 'breadcrumbs', quantity: 0.04 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'sugar', quantity: 0.04 },
      { ingredientId: 'berries_mix', quantity: 0.04 },
      { ingredientId: 'vanilla_sugar', quantity: 0.003 },
    ],
  },

  // 100+24+2.16+6.4+14.4+3.28+12.5 = 162.7 ₽ × 1.03 = 168 ₽ → FC 24.3% (690 ₽)
  {
    id: 'tiramisu',
    name: 'Тирамису',
    category: 'dessert',
    station: 'dessert',
    recommendedPrice: 690,
    baseQuality: 84,
    basePopularity: 88,
    prepMinutes: 10,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'cheese_cream', quantity: 0.1 },
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'sugar', quantity: 0.03 },
      { ingredientId: 'coffee_beans', quantity: 0.004 },
      { ingredientId: 'bread_sourdough', quantity: 0.04 }, // савоярди
      { ingredientId: 'cocoa', quantity: 0.004 },
      { ingredientId: 'chocolate_dark', quantity: 0.01 },
    ],
  },

  // 3.6+36+3.6+12+38+28.8+12.8+1.95 = 136.8 ₽ × 1.03 = 141 ₽ → FC 23.9% (590 ₽)
  {
    id: 'medovik',
    name: 'Медовик',
    category: 'dessert',
    station: 'dessert',
    recommendedPrice: 590,
    baseQuality: 75,
    basePopularity: 72,
    prepMinutes: 8,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'flour', quantity: 0.08 },
      { ingredientId: 'honey', quantity: 0.05 },
      { ingredientId: 'sugar', quantity: 0.05 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'butter_82', quantity: 0.04 },
      { ingredientId: 'sour_cream', quantity: 0.08 },
      { ingredientId: 'condensed_milk', quantity: 0.04 },
      { ingredientId: 'vanilla_sugar', quantity: 0.003 },
    ],
  },

  // 100+47.5+24+2.16+0.9+4.1+21+18+1.3 = 219 ₽ × 1.04 = 228 ₽ → FC 28.8% (790 ₽)
  {
    id: 'chocolate_fondant',
    name: 'Шоколадный фондан',
    category: 'dessert',
    station: 'dessert',
    recommendedPrice: 790,
    baseQuality: 86,
    basePopularity: 78,
    prepMinutes: 14,
    prepWastePercent: 0.04,
    recipe: [
      { ingredientId: 'chocolate_dark', quantity: 0.08 },
      { ingredientId: 'butter_82', quantity: 0.05 },
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'sugar', quantity: 0.03 },
      { ingredientId: 'flour', quantity: 0.02 },
      { ingredientId: 'cocoa', quantity: 0.005 },
      { ingredientId: 'ice_cream_base', quantity: 0.05 },
      { ingredientId: 'berries_mix', quantity: 0.02 },
      { ingredientId: 'vanilla_sugar', quantity: 0.002 },
    ],
  },

  // 50.4+81+7.5+12+1.4 = 152.3 ₽ × 1.03 = 157 ₽ → FC 26.6% (590 ₽)
  {
    id: 'ice_cream_berries',
    name: 'Мороженое с ягодами',
    category: 'dessert',
    station: 'dessert',
    recommendedPrice: 590,
    baseQuality: 68,
    basePopularity: 70,
    prepMinutes: 5,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'ice_cream_base', quantity: 0.12 },
      { ingredientId: 'berries_mix', quantity: 0.09 },
      { ingredientId: 'syrup_monin', quantity: 0.01 },
      { ingredientId: 'nuts_walnut', quantity: 0.01 },
      { ingredientId: 'mint', quantity: 0.002 },
    ],
  },

  // 4.5+38+4.05+37.5+30+1.6+12+4.75+1.95 = 134.4 ₽ × 1.05 = 141 ₽ → FC 28.8% (490 ₽)
  {
    id: 'cinnamon_roll',
    name: 'Синнабон',
    category: 'dessert',
    station: 'dessert',
    recommendedPrice: 490,
    baseQuality: 70,
    basePopularity: 66,
    prepMinutes: 6,
    prepWastePercent: 0.05,
    recipe: [
      { ingredientId: 'flour', quantity: 0.1 },
      { ingredientId: 'butter_82', quantity: 0.04 },
      { ingredientId: 'sugar_brown', quantity: 0.03 },
      { ingredientId: 'pecan', quantity: 0.015 },
      { ingredientId: 'cheese_cream', quantity: 0.03 },
      { ingredientId: 'yeast', quantity: 0.005 },
      { ingredientId: 'egg', quantity: 1 },
      { ingredientId: 'milk', quantity: 0.05 },
      { ingredientId: 'vanilla_sugar', quantity: 0.003 },
    ],
  },

  /* ============== БЕЗАЛКОГОЛЬНЫЕ НАПИТКИ (bar_service, FC 18–26%) ============== */

  // 54+15+14.4+21.25+5.7+1.4+1.44 = 113.2 ₽ × 1.02 = 115 ₽ → FC 23.6% (490 ₽)
  {
    id: 'lemonade_sea_buckthorn',
    name: 'Лимонад облепиховый',
    category: 'non_alc_drink',
    station: 'bar_service',
    recommendedPrice: 490,
    baseQuality: 72,
    basePopularity: 75,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'berries_mix', quantity: 0.06 }, // облепиха (ягоды микс)
      { ingredientId: 'syrup_monin', quantity: 0.02 },
      { ingredientId: 'honey', quantity: 0.02 },
      { ingredientId: 'sparkling_water', quantity: 0.25 },
      { ingredientId: 'lemon', quantity: 0.03 },
      { ingredientId: 'mint', quantity: 0.002 },
      { ingredientId: 'sugar', quantity: 0.02 },
    ],
  },

  // 56+12.75+7.5+5.2+1.4 = 82.9 ₽ × 1.02 = 84.5 ₽ → FC 21.7% (390 ₽)
  {
    id: 'cranberry_mors',
    name: 'Морс клюквенный',
    category: 'non_alc_drink',
    station: 'bar_service',
    recommendedPrice: 390,
    baseQuality: 65,
    basePopularity: 70,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'mors_cranberry', quantity: 0.35 },
      { ingredientId: 'sparkling_water', quantity: 0.15 },
      { ingredientId: 'syrup_monin', quantity: 0.01 },
      { ingredientId: 'lime', quantity: 0.02 },
      { ingredientId: 'mint', quantity: 0.002 },
    ],
  },

  // 90+4.75+13+7.6+10.8 = 126.2 ₽ × 1.03 = 130 ₽ → FC 23.6% (550 ₽)
  {
    id: 'berry_smoothie',
    name: 'Смузи ягодный',
    category: 'non_alc_drink',
    station: 'bar_service',
    recommendedPrice: 550,
    baseQuality: 70,
    basePopularity: 65,
    prepMinutes: 5,
    prepWastePercent: 0.03,
    recipe: [
      { ingredientId: 'berries_mix', quantity: 0.1 },
      { ingredientId: 'banana', quantity: 0.05 },
      { ingredientId: 'yogurt', quantity: 0.1 },
      { ingredientId: 'milk', quantity: 0.08 },
      { ingredientId: 'honey', quantity: 0.015 },
    ],
  },

  // 78+35 = 113 ₽ × 1.02 = 115.3 ₽ → FC 19.6% (590 ₽)
  {
    id: 'orange_fresh',
    name: 'Апельсиновый фреш',
    category: 'non_alc_drink',
    station: 'bar_service',
    recommendedPrice: 590,
    baseQuality: 72,
    basePopularity: 78,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'juice_orange', quantity: 0.3 },
      { ingredientId: 'orange', quantity: 0.28 },
    ],
  },

  /* ==================== КОФЕ (coffee, FC 10–16%) ==================== */

  // 28.8+14.25 = 43.05 ₽ × 1.02 = 43.9 ₽ → FC 10.5% (420 ₽)
  {
    id: 'cappuccino',
    name: 'Капучино',
    category: 'coffee',
    station: 'coffee',
    recommendedPrice: 420,
    baseQuality: 78,
    basePopularity: 90,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'coffee_beans', quantity: 0.018 },
      { ingredientId: 'milk', quantity: 0.15 },
    ],
  },

  // 28.8+23.75 = 52.55 ₽ × 1.02 = 53.6 ₽ → FC 11.9% (450 ₽)
  {
    id: 'latte',
    name: 'Латте',
    category: 'coffee',
    station: 'coffee',
    recommendedPrice: 450,
    baseQuality: 76,
    basePopularity: 85,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'coffee_beans', quantity: 0.018 },
      { ingredientId: 'milk', quantity: 0.25 },
    ],
  },

  // 32 ₽ × 1.02 = 32.6 ₽ → FC 10.2% (320 ₽) — двойная порция зерна
  {
    id: 'americano',
    name: 'Американо',
    category: 'coffee',
    station: 'coffee',
    recommendedPrice: 320,
    baseQuality: 70,
    basePopularity: 75,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'coffee_beans', quantity: 0.02 },
    ],
  },

  // 35.2+14.25 = 49.45 ₽ × 1.02 = 50.4 ₽ → FC 10.5% (480 ₽)
  {
    id: 'flat_white',
    name: 'Флэт уайт',
    category: 'coffee',
    station: 'coffee',
    recommendedPrice: 480,
    baseQuality: 80,
    basePopularity: 72,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    recipe: [
      { ingredientId: 'coffee_beans', quantity: 0.022 },
      { ingredientId: 'milk', quantity: 0.15 },
    ],
  },

  /* ============== АЛКОГОЛЬ (bar_service, FC 28–36%, лицензия) ============== */

  // 0.16 л × 1250 = 200 ₽ × 1.02 = 204 ₽ → FC 29.6% (690 ₽)
  {
    id: 'house_red_glass',
    name: 'Бокал красного house',
    category: 'alcohol',
    station: 'bar_service',
    recommendedPrice: 690,
    baseQuality: 68,
    basePopularity: 72,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    requiresAlcoholLicense: true,
    recipe: [{ ingredientId: 'wine_red_house', quantity: 0.16 }],
  },

  // 0.16 л × 1250 = 200 ₽ × 1.02 = 204 ₽ → FC 29.6% (690 ₽)
  {
    id: 'house_white_glass',
    name: 'Бокал белого house',
    category: 'alcohol',
    station: 'bar_service',
    recommendedPrice: 690,
    baseQuality: 68,
    basePopularity: 70,
    prepMinutes: 5,
    prepWastePercent: 0.02,
    requiresAlcoholLicense: true,
    recipe: [{ ingredientId: 'wine_white_house', quantity: 0.16 }],
  },

  // 0.5 л × 320 = 160 ₽ × 1.08 (пена/потери при наливе) = 172.8 ₽ → FC 29.3% (590 ₽)
  {
    id: 'draft_lager',
    name: 'Крафтовый лагер 0.5',
    category: 'alcohol',
    station: 'bar_service',
    recommendedPrice: 590,
    baseQuality: 70,
    basePopularity: 85,
    prepMinutes: 5,
    prepWastePercent: 0.08,
    requiresAlcoholLicense: true,
    recipe: [{ ingredientId: 'beer_draft_dark', quantity: 0.5 }],
  },

  // 153+63+15.6+1.4 = 233 ₽ × 1.03 = 240 ₽ → FC 30.4% (790 ₽)
  {
    id: 'gin_tonic',
    name: 'Джин-тоник',
    category: 'alcohol',
    station: 'bar_service',
    recommendedPrice: 790,
    baseQuality: 78,
    basePopularity: 70,
    prepMinutes: 5,
    prepWastePercent: 0.03,
    requiresAlcoholLicense: true,
    recipe: [
      { ingredientId: 'gin', quantity: 0.09 },
      { ingredientId: 'tonic', quantity: 0.3 },
      { ingredientId: 'lime', quantity: 0.06 },
      { ingredientId: 'mint', quantity: 0.002 },
    ],
  },
];

export const DISHES_MAP: Record<string, Dish> = Object.fromEntries(DISHES.map((d) => [d.id, d]));

/* ============================ ХЕЛПЕРЫ ============================ */

/**
 * Себестоимость техкарты по базовым ценам ингредиентов, ₽.
 *
 * Формула ТЗ §13.1 «Экономического движка»:
 *   RecipeCost = Σ(baseCost × quantity) × (1 + prepWastePercent)
 * где baseCost — оптовая цена единицы ингредиента (кг/л/шт),
 * quantity — расход на порцию в тех же единицах,
 * prepWastePercent — технологические потери блюда (доля).
 */
export function recipeCost(dish: Dish): number {
  const raw = dish.recipe.reduce((sum, item) => {
    const ing = INGREDIENTS_MAP[item.ingredientId];
    return sum + (ing ? ing.baseCost * item.quantity : 0);
  }, 0);
  return raw * (1 + dish.prepWastePercent);
}

/**
 * FoodCost техкарты как ДОЛЯ от цены продажи (не проценты!).
 *
 * Формула ТЗ §13.1: RecipeFoodCost = RecipeCost / SellingPrice.
 * Если price не передан, берётся recommendedPrice блюда.
 * Пример: 0.28 = 28% → в целевом коридоре 26–33% для горячих блюд.
 * Фактический FoodCost дня считается движком по FIFO-партиям склада
 * (COGS/Waste против food-выручки) — эта функция лишь калибровочный ориентир.
 */
export function recipeFoodCost(dish: Dish, price?: number): number {
  const p = price ?? dish.recommendedPrice;
  if (p <= 0) return 0;
  return recipeCost(dish) / p;
}

/**
 * Стартовый сбалансированный набор для визарда открытия ресторана.
 *
 * ~28 позиций: покрывает все категории кроме премиальных позиций
 * (стейк рибай, дорадо, утиная грудка, буррата, креветки…), чтобы
 * стартовое меню окупалось при среднем чеке 3500+ ₽ без лицензии
 * на алкоголь. Две алкогольные позиции включены сознательно:
 * решение (брать ли лицензию за ₽/год) остаётся за игроком.
 */
export const STARTER_MENU_IDS: string[] = [
  // завтраки
  'syrniki',
  'omelet_tomato',
  'oatmeal_berries',
  'shakshuka',
  // бизнес-ланч (сегмент business_lunch — ключевой для локации)
  'lunch_classic',
  // салаты
  'caesar_chicken',
  'greek_salad',
  // супы
  'borsch',
  'mushroom_cream',
  'cheese_soup',
  // закуски
  'bruschetta_tomato',
  'wings_bbq',
  'cheese_balls_bacon',
  // горячее (средний ценовой сегмент)
  'chicken_cream',
  'pasta_carbonara',
  'pasta_bolognese',
  'moscow_burger',
  // гарниры
  'potato_puree',
  'grilled_veggies',
  // десерты
  'cheesecake',
  'medovik',
  'ice_cream_berries',
  // безалкогольные напитки
  'lemonade_sea_buckthorn',
  'cranberry_mors',
  'orange_fresh',
  // кофе
  'cappuccino',
  'latte',
  // алкоголь — игрок решает, оформлять ли лицензию
  'house_red_glass',
  'draft_lager',
];
