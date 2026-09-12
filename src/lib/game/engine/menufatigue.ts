/**
 * МЕНЮ-УСТАЛОСТЬ (БАЛ-v2 §14, запрос пользователя): basePopularity блюд
 * −5–10% за квартал без ротации + новизна новых блюд.
 *
 * ДВА КАНАЛА (оба детерминированы возрастом блюда, без ГСЧ):
 *  1. Микс (hour.ts): вес блюда в заказах × dishFreshnessFactor(age) —
 *     приевшиеся блюда продаются хуже, новинки лучше; общий спрос категории
 *     не меняется, меняется распределение.
 *  2. Возвратные гости (endday.ts): returning × menuFreshnessFactor(menu) —
 *     постоянным гостям приедается статичное меню целиком (канал живёт даже
 *     при равномерной усталости, когда канал 1 взаимно гасится нормировкой).
 *
 * РОТАЦИЯ: блюдо, снятое с меню на 4+ недели и возвращённое, — снова «новое»
 * (возраст 0, +6% новизны). Быстрое снятие-возврат (< 4 недель) возраст
 * НЕ сбрасывает — абьюз «снял-вернул за день» не работает.
 */
import type { MenuState, Restaurant } from '../types';
import { dishOf } from '../content/resolve';
import { MENU_FATIGUE } from '../config/menu.config';

/** Возраст блюда в меню (недели), 0 для новых/мигрированных сейвов. */
export function dishAge(menu: MenuState, dishId: string): number {
  return menu.dishAges?.[dishId] ?? 0;
}

/**
 * Фактор свежести блюда по возрасту:
 *   недели 0–3: +6% (новинка) → линейный спад до 0 к 10-й неделе;
 *   после grace-недель: −0,625%/нед (−7,5% за квартал, запрос 5–10%);
 *   кап усталости −30% (сильно приевшееся блюдо).
 */
export function dishFreshnessFactor(ageWeeks: number): number {
  const f = MENU_FATIGUE;
  const novelty =
    ageWeeks <= f.noveltyWeeks
      ? f.noveltyBoost
      : ageWeeks < f.noveltyFadeUntil
        ? f.noveltyBoost * (f.noveltyFadeUntil - ageWeeks) / (f.noveltyFadeUntil - f.noveltyWeeks)
        : 0;
  const fatigue = Math.max(-f.cap, -f.ratePerWeek * Math.max(0, ageWeeks - f.graceWeeks));
  return Math.max(0.05, 1 + novelty + fatigue);
}

/**
 * Свежесть меню целиком (для возвратного спроса): средневзвешенный фактор
 * по basePopularity блюд в меню. Статичное меню: ~−7,5% к концу первого
 * квартала (кап −12% на возвратных ≈ −2,5% выручки — ёмкостный рикошет
 * смягчает эффект, как показал замер v1.0.0).
 */
export function menuFreshnessFactor(restaurant: Restaurant): number {
  const menu = restaurant.menu;
  if (!menu.dishes || menu.dishes.length === 0) return 1;
  let sum = 0;
  let weight = 0;
  for (const id of menu.dishes) {
    const dish = dishOf(menu, id);
    if (!dish) continue;
    sum += dish.basePopularity * dishFreshnessFactor(dishAge(menu, id));
    weight += dish.basePopularity;
  }
  const factor = weight > 0 ? sum / weight : 1;
  // Кап давления на возвратных: −12% (мягче пер-блюдного −30%).
  return Math.max(1 - MENU_FATIGUE.returningCap, Math.min(1.06, factor));
}

/** Прибавить неделю возраста всем блюдам в меню (закрытие недели). */
export function bumpDishAges(menu: MenuState): void {
  menu.dishAges ??= {};
  for (const id of menu.dishes) {
    menu.dishAges[id] = (menu.dishAges[id] ?? 0) + 1;
  }
}

/**
 * Блюдо добавляется в меню: если оно вернулось после 4+ недель вне меню —
 * «ротация», возраст 0 (новинка). Быстрый возврат — возраст сохраняется.
 * Возвращает true, если блюдо считается новинкой (возраст сброшен).
 */
export function noteDishAdded(menu: MenuState, dishId: string, week: number): boolean {
  menu.dishAges ??= {};
  menu.offSince ??= {};
  const off = menu.offSince[dishId];
  if (off != null && week - off < MENU_FATIGUE.rotationOffWeeks) {
    // Сняли и быстро вернули — усталость помнится (анти-абьюз).
    menu.dishAges[dishId] = menu.dishAges[dishId] ?? 0;
    return false;
  }
  menu.dishAges[dishId] = 0;
  return true;
}

/** Блюдо снимается с меню: запоминаем неделю снятия (для детекции ротации). */
export function noteDishRemoved(menu: MenuState, dishId: string, week: number): void {
  menu.offSince ??= {};
  menu.offSince[dishId] = week;
}

/** Подпись усталости для UI: «Приелось −9%» / «Новинка +6%» / null. */
export function freshnessBadge(ageWeeks: number): { label: string; tone: 'novelty' | 'stale' | 'very-stale' } | null {
  const factor = dishFreshnessFactor(ageWeeks);
  const delta = Math.round((factor - 1) * 100);
  if (delta >= 3) return { label: `Новинка +${delta}%`, tone: 'novelty' };
  if (delta <= -12) return { label: `Приелось ${delta}%`, tone: 'very-stale' };
  if (delta <= -3) return { label: `Приелось ${delta}%`, tone: 'stale' };
  return null;
}
