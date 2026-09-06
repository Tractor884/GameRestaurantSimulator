/**
 * РЕЗОЛЬВЕР БЛЮД: базовый контент (dishes.ts) + кастомные блюда из состояния.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ: dishes.ts — чистые статичные данные (DISHES_MAP),
 * а кастомные блюда (CSV-импорт ТЗ §35.3–35.4) живут в GameState.restaurant.menu.
 * Раньше движок читал только DISHES_MAP — кастомные блюда были бы невидимы
 * для спроса, кухни, FIFO и телеметрии. Все точки обращения движка к блюдам
 * обязаны идти через этот резолвер.
 *
 * АНТИПАТТЕРН (аудит §6.1): НЕ кэшировать кастомные блюда в module-level
 * переменных — после загрузки сейва они бы «залипали» из прошлой игры.
 * Резолвер читает состояние при каждом вызове (массивы маленькие, O(n) дёшево).
 */
import { DISHES_MAP, DISHES } from './dishes';
import type { Dish, MenuState, Restaurant } from '../types';

/** Одно блюдо по id: сначала кастомные, затем базовый справочник. */
export function dishOf(menu: MenuState, id: string): Dish | undefined {
  const customs = menu.customDishes;
  if (customs && customs.length > 0) {
    const custom = customs.find((d) => d.id === id);
    if (custom) return custom;
  }
  return DISHES_MAP[id];
}

/** Все доступные движку блюда (базовые + кастомные). */
export function allDishes(menu: MenuState): Dish[] {
  const customs = menu.customDishes;
  if (!customs || customs.length === 0) return DISHES;
  return [...DISHES, ...customs];
}

/** Карта id → блюдо (для UI-списков и CSV-экспорта). */
export function dishMapOf(menu: MenuState): Record<string, Dish> {
  const customs = menu.customDishes;
  if (!customs || customs.length === 0) return DISHES_MAP;
  const out: Record<string, Dish> = { ...DISHES_MAP };
  for (const d of customs) out[d.id] = d;
  return out;
}

/** Удобная обёртка для ресторана целиком. */
export function restaurantDish(r: Restaurant, id: string): Dish | undefined {
  return dishOf(r.menu, id);
}
