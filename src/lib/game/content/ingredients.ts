/**
 * ============================================================================
 * ИНГРЕДИЕНТЫ — библиотека контента (Москва, оптовые цены 2025, ₽)
 * ============================================================================
 * ЕДИНИЦЫ: kg / l / pc (шт). baseCost — цена за единицу.
 * shelfLifeDays — срок годности. storage — категория хранения.
 * wastePercent — потери при подготовке (для RecipeCost, ТЗ §13.1).
 *
 * КАЛИБРОВКА FOODCOST: цены подобраны так, чтобы себестоимость типового
 * блюда casual dining давала FoodCost 28–34% при ценах продажи из dishes.ts.
 * Пример: Цезарь с курицей ~27–30%, стейк рибай ~30%, супы ~16–20%,
 * кофе ~10–14% — так и в реальном ресторане.
 */
import type { Ingredient } from '../types';

const I = (
  id: string,
  name: string,
  unit: Ingredient['unit'],
  baseCost: number,
  shelfLifeDays: number,
  storage: Ingredient['storage'],
  wastePercent: number,
): Ingredient => ({ id, name, unit, baseCost, shelfLifeDays, storage, wastePercent });

export const INGREDIENTS: Ingredient[] = [
  /* -------- МЯСО И ПТИЦА -------- */
  I('chicken_fillet', 'Куриное филе', 'kg', 380, 4, 'refrigerated', 0.04),
  I('chicken_thigh', 'Бедро куриное б/к', 'kg', 290, 4, 'refrigerated', 0.05),
  I('beef_ribeye', 'Говядина рибай', 'kg', 2400, 5, 'refrigerated', 0.03),
  I('beef_striploin', 'Говядина стриплойн', 'kg', 2200, 5, 'refrigerated', 0.03),
  I('beef_brisket', 'Говяжья грудинка', 'kg', 720, 5, 'refrigerated', 0.05),
  I('beef_stew', 'Говядина для тушения', 'kg', 780, 5, 'refrigerated', 0.04),
  I('pork_neck', 'Свиная шея', 'kg', 560, 5, 'refrigerated', 0.04),
  I('pork_belly', 'Свиная грудинка', 'kg', 480, 5, 'refrigerated', 0.05),
  I('lamb_leg', 'Баранина, нога', 'kg', 1250, 5, 'refrigerated', 0.05),
  I('turkey_fillet', 'Филе индейки', 'kg', 660, 4, 'refrigerated', 0.04),
  I('duck_breast', 'Утиная грудка', 'kg', 1500, 4, 'refrigerated', 0.06),
  I('veal_liver', 'Печень телячья', 'kg', 620, 3, 'refrigerated', 0.06),
  I('bacon', 'Бекон', 'kg', 900, 10, 'refrigerated', 0.03),
  I('sausage_hunting', 'Охотничьи колбаски', 'kg', 850, 10, 'refrigerated', 0.03),
  I('prosciutto', 'Прошутто', 'kg', 2600, 20, 'refrigerated', 0.04),

  /* -------- РЫБА И МОРЕПРОДУКТЫ -------- */
  I('salmon_fresh', 'Лосось охлаждённый', 'kg', 1850, 3, 'refrigerated', 0.06),
  I('salmon_frozen', 'Лосось мороженый', 'kg', 1150, 60, 'frozen', 0.06),
  I('dorado', 'Дорадо', 'kg', 1300, 3, 'refrigerated', 0.08),
  I('sea_bass', 'Сибас', 'kg', 1400, 3, 'refrigerated', 0.08),
  I('cod_fillet', 'Треска филе', 'kg', 780, 3, 'refrigerated', 0.05),
  I('shrimp_tiger', 'Креветка тигровая', 'kg', 1600, 90, 'frozen', 0.02),
  I('shrimp_reg', 'Креветка 16/20', 'kg', 950, 90, 'frozen', 0.02),
  I('mussels', 'Мидии', 'kg', 520, 2, 'refrigerated', 0.08),
  I('octopus', 'Осьминог', 'kg', 2200, 90, 'frozen', 0.03),
  I('squid', 'Кальмар', 'kg', 700, 90, 'frozen', 0.05),

  /* -------- МОЛОЧНЫЕ ПРОДУКТЫ -------- */
  I('butter_82', 'Масло сливочное 82.5%', 'kg', 950, 20, 'refrigerated', 0.01),
  I('cream_33', 'Сливки 33%', 'l', 560, 10, 'refrigerated', 0.01),
  I('milk', 'Молоко 3.2%', 'l', 95, 7, 'refrigerated', 0.01),
  I('milk_oat', 'Молоко овсяное', 'l', 190, 30, 'dry', 0.01),
  I('sour_cream', 'Сметана 25%', 'kg', 360, 10, 'refrigerated', 0.01),
  I('cheese_parmesan', 'Пармезан', 'kg', 2800, 60, 'refrigerated', 0.06),
  I('cheese_mozzarella', 'Моцарелла', 'kg', 900, 15, 'refrigerated', 0.03),
  I('cheese_burrata', 'Буррата', 'kg', 2500, 5, 'refrigerated', 0.02),
  I('cheese_feta', 'Фета', 'kg', 1200, 30, 'refrigerated', 0.03),
  I('cheese_cheddar', 'Чеддер', 'kg', 1300, 40, 'refrigerated', 0.03),
  I('cheese_cream', 'Крем-чиз', 'kg', 1000, 30, 'refrigerated', 0.01),
  I('cheese_suluguni', 'Сулугуни', 'kg', 950, 20, 'refrigerated', 0.03),
  I('egg', 'Яйцо куриное С1', 'pc', 12, 25, 'refrigerated', 0.03),
  I('yogurt', 'Йогурт натуральный', 'kg', 130, 10, 'refrigerated', 0.01),
  I('curd', 'Творог 9%', 'kg', 480, 7, 'refrigerated', 0.02),
  I('ice_cream_base', 'База мороженого', 'kg', 420, 60, 'frozen', 0.01),

  /* -------- ОВОЩИ И ЗЕЛЕНЬ -------- */
  I('tomato', 'Томаты', 'kg', 190, 7, 'refrigerated', 0.07),
  I('tomato_cherry', 'Томаты черри', 'kg', 460, 6, 'refrigerated', 0.05),
  I('cucumber', 'Огурцы', 'kg', 130, 8, 'refrigerated', 0.06),
  I('lettuce_romaine', 'Салат романо', 'kg', 460, 5, 'refrigerated', 0.12),
  I('lettuce_mix', 'Микс салатов', 'kg', 700, 4, 'refrigerated', 0.1),
  I('spinach', 'Шпинат', 'kg', 550, 4, 'refrigerated', 0.12),
  I('arugula', 'Рукола', 'kg', 650, 4, 'refrigerated', 0.1),
  I('avocado', 'Авокадо', 'kg', 560, 5, 'refrigerated', 0.15),
  I('potato', 'Картофель', 'kg', 48, 30, 'dry', 0.08),
  I('potato_young', 'Картофель молодой', 'kg', 140, 14, 'refrigerated', 0.06),
  I('sweet_potato', 'Батат', 'kg', 130, 25, 'dry', 0.07),
  I('onion', 'Лук репчатый', 'kg', 42, 40, 'dry', 0.07),
  I('onion_red', 'Лук красный', 'kg', 75, 30, 'dry', 0.06),
  I('garlic', 'Чеснок', 'kg', 260, 60, 'dry', 0.08),
  I('beet', 'Свёкла', 'kg', 55, 40, 'dry', 0.08),
  I('carrot', 'Морковь', 'kg', 55, 40, 'dry', 0.07),
  I('cabbage', 'Капуста белокочанная', 'kg', 40, 40, 'dry', 0.1),
  I('cabbage_sauerkraut', 'Капуста квашеная', 'kg', 160, 20, 'refrigerated', 0.03),
  I('pepper_bell', 'Перец болгарский', 'kg', 230, 10, 'refrigerated', 0.1),
  I('zucchini', 'Цукини', 'kg', 160, 8, 'refrigerated', 0.08),
  I('eggplant', 'Баклажан', 'kg', 150, 8, 'refrigerated', 0.08),
  I('mushroom_champignon', 'Шампиньоны', 'kg', 280, 5, 'refrigerated', 0.08),
  I('mushroom_porcini', 'Белые грибы', 'kg', 1500, 4, 'refrigerated', 0.12),
  I('corn', 'Кукуруза консервированная', 'kg', 240, 180, 'dry', 0.01),
  I('peas_green', 'Горошек зелёный', 'kg', 300, 180, 'dry', 0.01),
  I('lemon', 'Лимон', 'kg', 190, 20, 'refrigerated', 0.08),
  I('lime', 'Лайм', 'kg', 260, 15, 'refrigerated', 0.1),
  I('orange', 'Апельсин', 'kg', 125, 20, 'refrigerated', 0.08),
  I('apple', 'Яблоки', 'kg', 115, 30, 'refrigerated', 0.07),
  I('banana', 'Банан', 'kg', 95, 7, 'refrigerated', 0.06),
  I('pear', 'Груша', 'kg', 160, 20, 'refrigerated', 0.07),
  I('berries_mix', 'Ягоды микс', 'kg', 900, 3, 'refrigerated', 0.1),
  I('strawberry', 'Клубника', 'kg', 1200, 3, 'refrigerated', 0.12),
  I('pineapple', 'Ананас', 'kg', 320, 10, 'refrigerated', 0.2),
  I('ginger', 'Имбирь', 'kg', 420, 20, 'refrigerated', 0.1),
  I('herbs_dill', 'Укроп/петрушка', 'kg', 380, 4, 'refrigerated', 0.15),
  I('basil', 'Базилик', 'kg', 800, 4, 'refrigerated', 0.12),
  I('mint', 'Мята', 'kg', 700, 4, 'refrigerated', 0.12),
  I('cilantro', 'Кинза', 'kg', 400, 4, 'refrigerated', 0.15),
  I('edamame', 'Эдамаме', 'kg', 420, 90, 'frozen', 0.01),

  /* -------- БАКАЛЕЯ И СУХИЕ ======== */
  I('flour', 'Мука пшеничная', 'kg', 45, 180, 'dry', 0.01),
  I('breadcrumbs', 'Сухари панировочные', 'kg', 150, 180, 'dry', 0.01),
  I('rice_jasmine', 'Рис жасмин', 'kg', 180, 180, 'dry', 0.01),
  I('quinoa', 'Киноа', 'kg', 420, 180, 'dry', 0.01),
  I('buckwheat', 'Гречка', 'kg', 95, 180, 'dry', 0.01),
  I('pasta', 'Паста сухая', 'kg', 160, 180, 'dry', 0.02),
  I('pasta_fresh', 'Паста свежая', 'kg', 450, 5, 'refrigerated', 0.03),
  I('gnocchi', 'Ньокки', 'kg', 360, 90, 'frozen', 0.01),
  I('oats', 'Овсяные хлопья', 'kg', 85, 180, 'dry', 0.01),
  I('semolina', 'Манка', 'kg', 60, 180, 'dry', 0.01),
  I('sugar', 'Сахар', 'kg', 72, 365, 'dry', 0.01),
  I('sugar_brown', 'Сахар тростниковый', 'kg', 135, 365, 'dry', 0.01),
  I('salt', 'Соль', 'kg', 22, 365, 'dry', 0.01),
  I('pepper_black', 'Перец чёрный молотый', 'kg', 850, 365, 'dry', 0.01),
  I('olive_oil', 'Масло оливковое', 'l', 900, 365, 'dry', 0.01),
  I('sunflower_oil', 'Масло подсолнечное', 'l', 155, 365, 'dry', 0.01),
  I('vinegar_balsamic', 'Уксус бальзамический', 'l', 1500, 365, 'dry', 0.01),
  I('soy_sauce', 'Соевый соус', 'l', 420, 365, 'dry', 0.01),
  I('sriracha', 'Соус шрирача', 'l', 700, 180, 'dry', 0.01),
  I('tomato_paste', 'Томатная паста', 'kg', 310, 90, 'dry', 0.02),
  I('passata', 'Пассата томатная', 'kg', 250, 90, 'dry', 0.01),
  I('coconut_milk', 'Кокосовое молоко', 'l', 420, 180, 'dry', 0.01),
  I('honey', 'Мёд', 'kg', 720, 365, 'dry', 0.01),
  I('chocolate_dark', 'Шоколад тёмный 70%', 'kg', 1250, 180, 'dry', 0.02),
  I('chocolate_milk', 'Шоколад молочный', 'kg', 900, 180, 'dry', 0.02),
  I('cocoa', 'Какао-порошок', 'kg', 820, 180, 'dry', 0.01),
  I('coffee_beans', 'Кофейные зёрна arabica', 'kg', 1600, 90, 'dry', 0.01),
  I('tea_leaf', 'Чай листовой', 'kg', 1800, 365, 'dry', 0.01),
  I('yeast', 'Дрожжи свежие', 'kg', 320, 20, 'refrigerated', 0.03),
  I('vanilla_sugar', 'Ванильный сахар', 'kg', 650, 365, 'dry', 0.01),
  I('nuts_walnut', 'Грецкий орех', 'kg', 1200, 120, 'dry', 0.03),
  I('almonds', 'Миндаль', 'kg', 1500, 120, 'dry', 0.02),
  I('pecan', 'Пекан', 'kg', 2500, 120, 'dry', 0.02),
  I('nuts_pine', 'Кедровый орех', 'kg', 4000, 90, 'dry', 0.02),
  I('condensed_milk', 'Сгущённое молоко', 'kg', 320, 180, 'dry', 0.01),
  I('chickpeas', 'Нут', 'kg', 210, 180, 'dry', 0.01),
  I('lentils', 'Чечевица', 'kg', 260, 180, 'dry', 0.01),
  I('tahini', 'Тахини', 'kg', 900, 120, 'dry', 0.01),
  I('sauces_mayo', 'Майонез', 'kg', 380, 90, 'refrigerated', 0.01),
  I('sauces_worcester', 'Вустерширский соус', 'l', 900, 365, 'dry', 0.01),
  I('capers', 'Каперсы', 'kg', 1200, 180, 'dry', 0.01),
  I('olives', 'Оливки', 'kg', 800, 180, 'dry', 0.02),
  I('anchovy', 'Анчоусы', 'kg', 2500, 180, 'dry', 0.02),
  I('pickles_mix', 'Соленья микс', 'kg', 280, 90, 'refrigerated', 0.03),
  I('tofu', 'Тофу', 'kg', 520, 20, 'refrigerated', 0.03),
  I('seaweed_nori', 'Нори', 'kg', 1400, 365, 'dry', 0.02),

  /* -------- ХЛЕБ И ВЫПЕЧКА -------- */
  I('bread_sourdough', 'Хлеб на закваске', 'kg', 360, 2, 'dry', 0.08),
  I('bread_brioche', 'Бриошь', 'kg', 420, 3, 'dry', 0.05),
  I('bun_burger', 'Булочка для бургера', 'pc', 32, 3, 'dry', 0.03),
  I('pita', 'Пита/лаваш', 'kg', 220, 3, 'dry', 0.05),
  I('phylo', 'Тесто фило', 'kg', 520, 5, 'refrigerated', 0.05),

  /* -------- НАПИТКИ БЕЗАЛКОГОЛЬНЫЕ -------- */
  I('sparkling_water', 'Вода газированная', 'l', 85, 365, 'dry', 0.01),
  I('still_water', 'Вода без газа', 'l', 65, 365, 'dry', 0.01),
  I('juice_orange', 'Сок апельсиновый', 'l', 260, 30, 'refrigerated', 0.02),
  I('juice_apple', 'Сок яблочный', 'l', 130, 90, 'dry', 0.01),
  I('mors_cranberry', 'Морс клюквенный', 'l', 160, 14, 'refrigerated', 0.01),
  I('syrup_monin', 'Сиропы (монин)', 'l', 750, 180, 'dry', 0.01),
  I('tonic', 'Тоник', 'l', 210, 180, 'dry', 0.01),
  I('mint_dry', 'Чай мятный (сухой)', 'kg', 1600, 365, 'dry', 0.01),

  /* -------- АЛКОГОЛЬ (лицензия) -------- */
  I('wine_red_house', 'Вино красное house', 'l', 1250, 365, 'dry', 0.02),
  I('wine_white_house', 'Вино белое house', 'l', 1250, 365, 'dry', 0.02),
  I('wine_red_premium', 'Вино красное premium', 'l', 4000, 365, 'dry', 0.02),
  I('prosecco', 'Просекко', 'l', 2200, 365, 'dry', 0.02),
  I('beer_draft_light', 'Пиво разливное светлое', 'l', 260, 30, 'refrigerated', 0.03),
  I('beer_draft_dark', 'Пиво разливное тёмное', 'l', 320, 30, 'refrigerated', 0.03),
  I('vodka', 'Водка', 'l', 1300, 365, 'dry', 0.01),
  I('gin', 'Джин', 'l', 1700, 365, 'dry', 0.01),
  I('whiskey', 'Виски', 'l', 3200, 365, 'dry', 0.01),
  I('vermouth', 'Вермут', 'l', 1100, 180, 'dry', 0.02),
];

export const INGREDIENTS_MAP: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((i) => [i.id, i]),
);

/** Категории для UI-группировки склада. */
export const INGREDIENT_CATEGORIES: { id: string; label: string; match: (id: string) => boolean }[] = [
  { id: 'meat', label: 'Мясо и птица', match: (id) => /^(chicken|beef|pork|lamb|turkey|duck|veal|bacon|sausage|prosciutto)/.test(id) },
  { id: 'fish', label: 'Рыба и морепродукты', match: (id) => /^(salmon|dorado|sea_bass|cod|shrimp|mussels|octopus|squid)/.test(id) },
  { id: 'dairy', label: 'Молочные продукты и яйца', match: (id) => /^(butter|cream|milk|sour|cheese|egg|yogurt|curd|ice_cream|condensed)/.test(id) },
  { id: 'veg', label: 'Овощи, фрукты, зелень', match: (id) => /^(tomato|cucumber|lettuce|spinach|arugula|avocado|potato|sweet_potato|onion|garlic|beet|carrot|cabbage|pepper|zucchini|eggplant|mushroom|corn|peas|lemon|lime|orange|apple|banana|pear|berries|strawberry|pineapple|ginger|herbs|basil|mint|cilantro|edamame)/.test(id) },
  { id: 'grocery', label: 'Бакалея', match: (id) => /^(flour|breadcrumbs|rice|quinoa|buckwheat|pasta|gnocchi|oats|semolina|sugar|salt|pepper|olive|sunflower|vinegar|soy|sriracha|tomato|passata|coconut|honey|chocolate|cocoa|coffee|tea|yeast|vanilla|nuts|almonds|pecan|chickpeas|lentils|tahini|sauces|capers|olives|anchovy|pickles|tofu|seaweed)/.test(id) },
  { id: 'bread', label: 'Хлеб и выпечка', match: (id) => /^(bread|bun|pita|phylo)/.test(id) },
  { id: 'drinks', label: 'Напитки', match: (id) => /^(sparkling|still|juice|mors|syrup|tonic|mint_dry)/.test(id) },
  { id: 'alcohol', label: 'Алкоголь', match: (id) => /^(wine|prosecco|beer|vodka|gin|whiskey|vermouth)/.test(id) },
];
