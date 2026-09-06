/**
 * Модуль склада (ТЗ §12): партии, FIFO, закупки, потери.
 *
 * FIFO: сначала партии с более ранним arrivedAt, при равенстве — раньше expiresAt.
 * Списание в момент начала приготовления. Нет ингредиента → блюдо недоступно.
 * Обычная закупка: оплата сегодня → доставка завтра.
 * Срочная: оплата сегодня → доставка сегодня, цена +35% (в unitCost партии, без двойного учёта).
 */
import type { GameDate, InventoryBatch, InventoryState, Restaurant } from '../types';
import { INGREDIENTS_MAP } from '../content/ingredients';
import { DISHES_MAP } from '../content/dishes';
import { STORAGE_LOSS_PER_DAY, THEFT, URGENT_PURCHASE_MARKUP } from '../config/finance.config';
import { dayIndex } from './core';

/** Доступно ли количество ингредиента (с учётом всех партий FIFO). */
export function availableQuantity(state: InventoryState, ingredientId: string): number {
  return state.batches
    .filter((b) => b.ingredientId === ingredientId && !isExpired(b))
    .reduce((s, b) => s + b.quantity, 0);
}

export function isExpired(batch: InventoryBatch, now?: GameDate): boolean {
  if (!now) return false;
  return dayIndex(batch.expiresAt) <= dayIndex(now);
}

/** Списание по FIFO. Возвращает себестоимость списанного (COGS), ₽. */
export function consumeFifo(
  state: InventoryState,
  ingredientId: string,
  quantity: number,
): { cost: number; consumed: number } {
  const batches = state.batches
    .filter((b) => b.ingredientId === ingredientId)
    .sort((a, b) => {
      const da = dayIndex(a.arrivedAt);
      const db = dayIndex(b.arrivedAt);
      if (da !== db) return da - db;
      return dayIndex(a.expiresAt) - dayIndex(b.expiresAt);
    });
  let remaining = quantity;
  let cost = 0;
  for (const batch of batches) {
    if (remaining <= 0.0001) break;
    if (isExpired(batch)) continue; // просроченное не тратим (списывается в waste)
    const take = Math.min(batch.quantity, remaining);
    batch.quantity -= take;
    remaining -= take;
    cost += take * batch.unitCost;
  }
  state.batches = state.batches.filter((b) => b.quantity > 0.0001);
  return { cost, consumed: quantity - Math.max(0, remaining) };
}

/** Может ли кухня приготовить count порций блюда (все ингредиенты в наличии)? */
export function canPrepare(state: InventoryState, dishId: string, count: number): boolean {
  const dish = DISHES_MAP[dishId];
  if (!dish) return false;
  for (const item of dish.recipe) {
    if (availableQuantity(state, item.ingredientId) < item.quantity * count * (1 + dish.prepWastePercent) - 0.0001) {
      return false;
    }
  }
  return true;
}

/** Сколько порций блюда можно приготовить (по минимуму ингредиентов). */
export function maxPortions(state: InventoryState, dishId: string): number {
  const dish = DISHES_MAP[dishId];
  if (!dish) return 0;
  let min = Infinity;
  for (const item of dish.recipe) {
    const per = item.quantity * (1 + dish.prepWastePercent);
    if (per <= 0) continue;
    min = Math.min(min, Math.floor(availableQuantity(state, item.ingredientId) / per));
  }
  return min === Infinity ? 0 : Math.max(0, min);
}

/** Списать ингредиенты на count порций. Возвращает COGS, ₽. */
export function consumeForDish(state: InventoryState, dishId: string, count: number): number {
  const dish = DISHES_MAP[dishId];
  if (!dish || count <= 0) return 0;
  let cost = 0;
  for (const item of dish.recipe) {
    const need = item.quantity * count * (1 + dish.prepWastePercent);
    const res = consumeFifo(state, item.ingredientId, need);
    cost += res.cost;
  }
  return cost;
}

/** Оформить закупку: оплата сразу (транзакция делает вызывающий), доставка завтра/сегодня. */
export function placePurchase(
  restaurant: Restaurant,
  ingredientId: string,
  quantity: number,
  urgent: boolean,
  date: GameDate,
): { unitCost: number; paid: number; arrivesAt: GameDate } {
  const ing = INGREDIENTS_MAP[ingredientId];
  const baseCost = ing.baseCost;
  const unitCost = urgent ? baseCost * (1 + URGENT_PURCHASE_MARKUP) : baseCost;
  const paid = Math.round(unitCost * quantity);
  const arrivesAt: GameDate = urgent
    ? { ...date }
    : date.day >= 6
      ? { week: date.week + 1, day: 0, hour: 8 }
      : { week: date.week, day: date.day + 1, hour: 8 };
  restaurant.inventory.pendingOrders.push({
    ingredientId,
    quantity,
    unitCost,
    paid,
    orderedAt: { ...date },
    arrivesAt,
    urgent,
  });
  return { unitCost, paid, arrivesAt };
}

/** Доставить заказы, пришедшие к этому дню. Возвращает стоимость доставки. */
export function processDeliveries(restaurant: Restaurant, date: GameDate): number {
  const inv = restaurant.inventory;
  const arrived: typeof inv.pendingOrders = [];
  const still: typeof inv.pendingOrders = [];
  for (const order of inv.pendingOrders) {
    if (dayIndex(order.arrivesAt) <= dayIndex(date)) arrived.push(order);
    else still.push(order);
  }
  inv.pendingOrders = still;
  let value = 0;
  for (const order of arrived) {
    const ing = INGREDIENTS_MAP[order.ingredientId];
    const expiresAt: GameDate = {
      week: date.week + Math.ceil(ing.shelfLifeDays / 7),
      day: date.day,
      hour: 8,
    };
    inv.batches.push({
      ingredientId: order.ingredientId,
      quantity: order.quantity,
      unitCost: order.unitCost,
      arrivedAt: { ...date, hour: 8 },
      expiresAt,
    });
    value += order.paid;
  }
  return value;
}

/**
 * Конец дня (ТЗ §12.4): порча, потери хранения, воровство.
 * Возвращает сумму списаний, ₽ (в WasteCost).
 */
export function processEndOfDayLosses(restaurant: Restaurant, date: GameDate): { wasteCost: number; expiredCount: number } {
  const inv = restaurant.inventory;
  let wasteCost = 0;
  let expiredCount = 0;
  const surviving: InventoryBatch[] = [];
  for (const batch of inv.batches) {
    // 1. Просроченные партии — полный список.
    if (dayIndex(batch.expiresAt) <= dayIndex(date)) {
      wasteCost += batch.quantity * batch.unitCost;
      expiredCount++;
      continue;
    }
    // 2. Естественные потери при хранении.
    const ing = INGREDIENTS_MAP[batch.ingredientId];
    const lossRate = STORAGE_LOSS_PER_DAY[ing?.storage ?? 'dry'];
    const loss = Math.min(batch.quantity, batch.quantity * lossRate);
    batch.quantity -= loss;
    wasteCost += loss * batch.unitCost;
    // 3. Воровство при высоком кадровом риске.
    if (restaurant.risks.staff > THEFT.riskThreshold) {
      const steal = batch.quantity * THEFT.lossFraction;
      batch.quantity -= steal;
      wasteCost += steal * batch.unitCost;
    }
    if (batch.quantity > 0.0001) surviving.push(batch);
  }
  inv.batches = surviving;
  return { wasteCost: Math.round(wasteCost), expiredCount };
}

/** Оценка потребности в ингредиентах на N дней (для автозаказа UI).
 * КАЛИБРОВКА: фактический заказ ≈ 3.9 позиции/гостя (замер по тестам),
 * закладываем с запасом 15% чтобы не ловить стоп-листы. */
export function estimateIngredientNeeds(restaurant: Restaurant, days: number, expectedGuestsPerDay: number): Record<string, number> {
  const needs: Record<string, number> = {};
  const dishes = restaurant.menu.dishes
    .map((id) => DISHES_MAP[id])
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  const totalPop = dishes.reduce((s, d) => s + d.basePopularity, 0) || 1;
  const ITEMS_PER_GUEST = 3.9 * 1.08; // позиции/гостя × лёгкий страховой запас
  for (const dish of dishes) {
    const dishShare = dish.basePopularity / totalPop;
    const orders = expectedGuestsPerDay * days * ITEMS_PER_GUEST * dishShare;
    for (const item of dish.recipe) {
      const perDay = item.quantity * expectedGuestsPerDay * ITEMS_PER_GUEST * dishShare * (1 + dish.prepWastePercent);
      // СКОРОПОРТ: не заказываем больше, чем реально израсходуется за срок годности
      // (иначе — еженедельная порча и санитарная спираль).
      const ing = INGREDIENTS_MAP[item.ingredientId];
      const perishCap = ing ? perDay * Math.max(1, Math.min(days, Math.ceil(ing.shelfLifeDays * 0.75))) : Infinity;
      const want = Math.min(item.quantity * orders * (1 + dish.prepWastePercent), perishCap);
      needs[item.ingredientId] = (needs[item.ingredientId] ?? 0) + want;
    }
  }
  return needs;
}

/** Рекомендованный автозаказ: потребность − остатки, округление вверх. */
export function buildAutoOrder(restaurant: Restaurant, days: number, expectedGuestsPerDay: number): { ingredientId: string; quantity: number }[] {
  const needs = estimateIngredientNeeds(restaurant, days, expectedGuestsPerDay);
  const out: { ingredientId: string; quantity: number }[] = [];
  for (const [ingId, need] of Object.entries(needs)) {
    const have = availableQuantity(restaurant.inventory, ingId);
    const missing = need - have;
    if (missing > 0.05) {
      const ing = INGREDIENTS_MAP[ingId];
      // Штучные — целыми, весовые — с шагом 0.5.
      const step = ing.unit === 'pc' ? 1 : 0.5;
      out.push({ ingredientId: ingId, quantity: Math.ceil(missing / step) * step });
    }
  }
  return out;
}
