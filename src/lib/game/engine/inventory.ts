/**
 * Модуль склада (ТЗ §12): партии, FIFO, закупки, потери.
 *
 * FIFO: сначала партии с более ранним arrivedAt, при равенстве — раньше expiresAt.
 * Списание в момент начала приготовления. Нет ингредиента → блюдо недоступно.
 * Обычная закупка: оплата сегодня → доставка завтра.
 * Срочная: оплата сегодня → доставка сегодня, цена +35% (в unitCost партии, без двойного учёта).
 */
import type { Dish, GameDate, InventoryBatch, InventoryState, Restaurant, ProcurementPolicyId } from '../types';
import { INGREDIENTS_MAP } from '../content/ingredients';
import { dishOf } from '../content/resolve';
import { STORAGE_LOSS_PER_DAY, THEFT, URGENT_PURCHASE_MARKUP } from '../config/finance.config';
import { activeProcurement, procPriceMult, procShelfLifeMult, procSupplyErrorChance, procSpoilRates, isLegacy, BALANCE_V2_5 } from '../config/balance2.config';
import type { Rng } from '../rng';
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
export function canPrepare(state: InventoryState, dish: Dish, count: number): boolean {
  if (!dish) return false;
  for (const item of dish.recipe) {
    if (availableQuantity(state, item.ingredientId) < item.quantity * count * (1 + dish.prepWastePercent) - 0.0001) {
      return false;
    }
  }
  return true;
}

/** Сколько порций блюда можно приготовить (по минимуму ингредиентов). */
export function maxPortions(state: InventoryState, dish: Dish): number {
  if (!dish) return 0;
  let min = Infinity;
  for (const item of dish.recipe) {
    const per = item.quantity * (1 + dish.prepWastePercent);
    if (per <= 0) continue;
    min = Math.min(min, Math.floor(availableQuantity(state, item.ingredientId) / per));
  }
  return min === Infinity ? 0 : Math.max(0, min);
}

/** Списать ингредиенты на count порций. Возвращает COGS, ₽.
 *  Принимает объект блюда (кастомные блюда из состояния — см. content/resolve.ts).
 *  v2 §15 «Шеф»: portionFactor < 1 — стандартизация порций после сокращения
 *  карты (расход входов на порцию ниже, FC −1 п.п.): реальные списания FIFO. */
export function consumeForDish(state: InventoryState, dish: Dish, count: number, portionFactor = 1): number {
  if (!dish || count <= 0) return 0;
  let cost = 0;
  const f = Math.max(0.8, Math.min(1, portionFactor));
  for (const item of dish.recipe) {
    const need = item.quantity * count * (1 + dish.prepWastePercent) * f;
    const res = consumeFifo(state, item.ingredientId, need);
    cost += res.cost;
  }
  return cost;
}

/** Оформить закупку: оплата сразу (транзакция делает вызывающий), доставка завтра/сегодня.
 *  v2 §10: foodIdx — инфляционный множитель закупочных цен недели (передаёт
 *  вызывающий, у которого есть сложность; 1 = без инфляции). */
export function placePurchase(
  restaurant: Restaurant,
  ingredientId: string,
  quantity: number,
  urgent: boolean,
  date: GameDate,
  foodIdx = 1,
): { unitCost: number; paid: number; arrivesAt: GameDate } {
  const ing = INGREDIENTS_MAP[ingredientId];
  const policyMult = procPriceMult(activeProcurement(restaurant));
  const baseCost = ing.baseCost * foodIdx * policyMult;
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

/** Доставить заказы, пришедшие к этому дню. Возвращает стоимость доставки
 *  и число сбоев поставки. v2 §9: срок годности партий × множитель режима
 *  (эконом ×0,8 / премиум ×1,15); rng (ОТДЕЛЬНЫЙ поток 'supply' от дня) кидает
 *  недовоз/брак — эконом чаще, премиум реже (legacy — выключено). */
export function processDeliveries(
  restaurant: Restaurant,
  date: GameDate,
  rng?: Rng,
): { value: number; supplyErrors: number } {
  const inv = restaurant.inventory;
  const policy = activeProcurement(restaurant);
  const shelfMult = procShelfLifeMult(policy);
  const errorChance = procSupplyErrorChance(policy);
  const arrived: typeof inv.pendingOrders = [];
  const still: typeof inv.pendingOrders = [];
  for (const order of inv.pendingOrders) {
    if (dayIndex(order.arrivesAt) <= dayIndex(date)) arrived.push(order);
    else still.push(order);
  }
  inv.pendingOrders = still;
  let value = 0;
  let supplyErrors = 0;
  for (const order of arrived) {
    const ing = INGREDIENTS_MAP[order.ingredientId];
    // v2 §9: недовоз/брак — оплатили всё, пришло ×0,75. Виден через
    // стоп-листы, счётчик сбоев и подсказку на складе.
    let quantity = order.quantity;
    if (rng && errorChance > 0 && rng.chance(errorChance)) {
      quantity = order.quantity * 0.75;
      supplyErrors++;
    }
    // Срок годности — в ДНЯХ (не неделях!): иначе множители режима §9
    // (эконом ×0,8 / премиум ×1,15) не действуют для скоропорта 1–7 дней.
    const shelfDays = Math.max(1, Math.round(ing.shelfLifeDays * shelfMult));
    const expIdx = dayIndex(date) + shelfDays;
    const expiresAt: GameDate = { week: Math.floor(expIdx / 7) + 1, day: expIdx % 7, hour: 8 };
    inv.batches.push({
      ingredientId: order.ingredientId,
      quantity,
      unitCost: order.unitCost,
      arrivedAt: { ...date, hour: 8 },
      expiresAt,
    });
    value += order.paid;
  }
  return { value, supplyErrors };
}

/**
 * Конец дня (ТЗ §12.4): порча, потери хранения, воровство.
 * Возвращает сумму списаний, ₽ (в WasteCost) + метрики свежести склада
 * (аудит: «закупки впрок» должны поднимать санитарный риск, а не только
 * списывать деньги — expiredCount улавливает только полностью умершие
 * партии, nearExpiryCount — «на грани», их много именно при переполненном
 * скоропортом складе).
 */
export function processEndOfDayLosses(
  restaurant: Restaurant,
  date: GameDate,
): { wasteCost: number; expiredCount: number; nearExpiryCount: number } {
  const inv = restaurant.inventory;
  let wasteCost = 0;
  let expiredCount = 0;
  let nearExpiryCount = 0;
  const todayIdx = dayIndex(date);
  // v2 §9: порча зависит от режима закупки — эконом: +доля/день (порча
  // «съедает скидку» при запасах впрок), премиум: естественная порча ×0,7.
  const spoil = procSpoilRates(activeProcurement(restaurant));
  const surviving: InventoryBatch[] = [];
  for (const batch of inv.batches) {
    // 1. Просроченные партии — полный список.
    if (dayIndex(batch.expiresAt) <= dayIndex(date)) {
      wasteCost += batch.quantity * batch.unitCost;
      expiredCount++;
      continue;
    }
    // Близкая экспирация: партия умрёт в ближайшие 2 дня (для сан. риска).
    if (dayIndex(batch.expiresAt) - todayIdx <= 2) nearExpiryCount++;
    // 2. Естественные потери при хранении (× режим закупки §9).
    const ing = INGREDIENTS_MAP[batch.ingredientId];
    const lossRate = STORAGE_LOSS_PER_DAY[ing?.storage ?? 'dry'] * spoil.mult + spoil.add;
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
  return { wasteCost: Math.round(wasteCost), expiredCount, nearExpiryCount };
}

/** Оценка потребности в ингредиентах на N дней (для автозаказа UI).
 * КАЛИБРОВКА: фактический заказ ≈ 3.9 позиции/гостя (замер по тестам),
 * закладываем с запасом 15% чтобы не ловить стоп-листы. */
export function estimateIngredientNeeds(restaurant: Restaurant, days: number, expectedGuestsPerDay: number): Record<string, number> {
  const needs: Record<string, number> = {};
  const dishes = restaurant.menu.dishes
    .map((id) => dishOf(restaurant.menu, id))
    .filter((d): d is Dish => Boolean(d));
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

/** Рекомендованный автозаказ: потребность − остатки, округление вверх.
 *  v2 §16.1 (этап 5): ингредиенты алкогольных позиций меню заказываются с
 *  множителем «минимальной партии» (×1,5 moderate / ×2 агр) — поставщики
 *  крепкого возят коробками: капитал замораживается в запасах. */
export function buildAutoOrder(restaurant: Restaurant, days: number, expectedGuestsPerDay: number): { ingredientId: string; quantity: number }[] {
  const needs = estimateIngredientNeeds(restaurant, days, expectedGuestsPerDay);
  // ×1,5 «минимальная партия» — только у ЛИЦЕНЗИАТА: без лицензия алкоголь
  // не продаётся, заказывать его входы коробками бессмысленно.
  const alcMult =
    isLegacy() || !restaurant.licenses.alcohol?.active ? 1 : BALANCE_V2_5.alcohol.alcoholOrderMult;
  const alcoholIngredients = new Set<string>();
  if (alcMult > 1) {
    for (const id of restaurant.menu.dishes) {
      const d = dishOf(restaurant.menu, id);
      if (d?.requiresAlcoholLicense) {
        for (const item of d.recipe) alcoholIngredients.add(item.ingredientId);
      }
    }
  }
  const out: { ingredientId: string; quantity: number }[] = [];
  for (const [ingId, need] of Object.entries(needs)) {
    const have = availableQuantity(restaurant.inventory, ingId);
    const missing = need - have;
    if (missing > 0.05) {
      const ing = INGREDIENTS_MAP[ingId];
      // Штучные — целыми, весовые — с шагом 0.5.
      const step = ing.unit === 'pc' ? 1 : 0.5;
      const mult = alcoholIngredients.has(ingId) ? alcMult : 1;
      out.push({ ingredientId: ingId, quantity: Math.ceil((missing * mult) / step) * step });
    }
  }
  return out;
}
