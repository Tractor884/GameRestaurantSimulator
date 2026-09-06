/**
 * ПОЧАСОВАЯ ЦЕПОЧКА СИМУЛЯЦИИ (ТЗ §14):
 *   Demand → Arrivals → Queue → Seating → Orders → DishSelection
 *   → Kitchen stations → FIFO consumption → Revenue → Satisfaction
 *
 * Очередь: подшаги 15 минут; гости уходят при превышении лимита ожидания.
 * Посадка: min(мощность хостес, пропускная способность зала, свободные места).
 * Заказы: когорты (час × сегмент × гости), выбор блюд по DishScore.
 * Кухня: станции ограничивают исполнение (StationFulfillmentRate).
 * Официанты: ServiceFulfillmentRate ограничивает обслуженных гостей.
 */
import type { Dish, GameDate, HourLog, Restaurant, SegmentId, StationType, GameState } from '../types';
import { SEGMENTS, SEGMENT_IDS } from '../config/segments.config';
import { DISHES_MAP } from '../content/dishes';
import { MENU_CATEGORIES } from '../config/menu.config';
import { QUEUE_CONFIG, dayPeriod } from '../config/queue.config';
import { SATISFACTION } from '../config/satisfaction.config';
import { DIFFICULTIES } from '../config/difficulty.config';
import { EQUIPMENT_LEVELS } from '../config/premises.config';
import type { Rng } from '../rng';
import { clamp } from './core';
import { consumeForDish, maxPortions } from './inventory';
import { effectiveStaff, stationCapacity, waiterLoad, organizationFactor, averageFatigue } from './staff';
import { estimatedCheck } from './demand';

/* ============================= ОЧЕРЕДЬ И ПОСАДКА ============================= */

interface QueueEntry {
  segmentId: SegmentId;
  guests: number;
  waitedMinutes: number;
}

function processQueueAndSeating(
  restaurant: Restaurant,
  arrivalsBySegment: Record<SegmentId, number>,
  returningBySegment: Record<SegmentId, number>,
  queue: QueueEntry[],
  date: GameDate,
  hour: number,
  seatsBusy: number,
): {
  seated: Record<SegmentId, number>;
  lost: number;
  queueAvg: number;
  seatsBusyAfter: number;
  avgWaitSeated: number;
} {
  const totalSeats = restaurant.seats + (restaurant.verandaActive ? restaurant.verandaSeats : 0);

  const period = dayPeriod(hour);
  const stay = QUEUE_CONFIG.stayHoursByPeriod[period];

  // Скорость освобождения столов зависит от уборщиков (ТЗ §9.5).
  const cleaners = effectiveStaff(restaurant.staff, 'cleaner', date.day, hour);
  const neededCleaners = Math.max(1, totalSeats / 35);
  const clearFactor = clamp(0.75 + 0.25 * Math.min(1, cleaners / neededCleaners), 0.75, 1.0);
  const releaseRate = (1 / stay) * clearFactor;
  const releaseDuringHour = seatsBusy * releaseRate;

  // Хостес ограничивает посадку (ТЗ §9.3).
  const hostess = effectiveStaff(restaurant.staff, 'hostess', date.day, hour);
  const hostessCap = hostess * QUEUE_CONFIG.hostessGuestsPerHour;
  // Пропускная способность зала: места / длительность сидения × комфорт.
  const comfortFactor = clamp(restaurant.comfort / 70, 0.8, 1.15);
  const hallThroughput = (totalSeats / stay) * comfortFactor * 0.6;
  // Свободные места за час + освобождённые.
  const freeCapacity = Math.max(0, totalSeats - seatsBusy) + releaseDuringHour;
  const seatingCapacity = Math.max(0, Math.min(hostessCap, hallThroughput, freeCapacity));

  const seated = emptySeg();
  let lost = 0;
  let queueSum = 0;
  let waitSum = 0;
  let waitCount = 0;

  // 4 подшага по 15 минут (ТЗ §9.6). ПОРЯДОК: старение → уходы → приходы → посадка.
  // Пришедший в подшаге гость может сесть сразу (wait=0), как в ТЗ §9.6 п.5.
  const stepCap = seatingCapacity / 4;
  let capacityLeft = seatingCapacity;

  for (let step = 0; step < 4; step++) {
    // 1. Очередь стареет; гости с превышением лимита уходят (ТЗ §9.7).
    const stayed: QueueEntry[] = [];
    for (const q of queue) {
      q.waitedMinutes += QUEUE_CONFIG.queueStepMinutes;
      const maxWait = SEGMENTS[q.segmentId].maxQueueMinutes;
      if (q.waitedMinutes > maxWait) lost += q.guests;
      else stayed.push(q);
    }
    queue.length = 0;
    queue.push(...stayed);

    // 2. Новые пришедшие за подшаг.
    for (const segId of SEGMENT_IDS) {
      const arrive = (arrivalsBySegment[segId] + returningBySegment[segId]) / 4;
      if (arrive > 0.01) queue.push({ segmentId: segId, guests: arrive, waitedMinutes: 0 });
    }

    // 3. Посадка: сначала самые ждущие.
    queue.sort((a, b) => b.waitedMinutes - a.waitedMinutes);
    const remaining: QueueEntry[] = [];
    for (const q of queue) {
      if (capacityLeft < 0.05) {
        remaining.push(q);
        continue;
      }
      const take = Math.min(q.guests, capacityLeft);
      if (take > 0.01) {
        const frac = take / Math.max(0.01, q.guests);
        seated[q.segmentId] += take;
        waitSum += q.waitedMinutes * frac;
        waitCount += frac;
        capacityLeft -= take;
        q.guests -= take;
      }
      if (q.guests > 0.05) remaining.push(q);
    }
    queue.length = 0;
    queue.push(...remaining);
    queueSum += queue.reduce((s, q) => s + q.guests, 0);
  }

  const seatedTotal = sumSeg(seated);
  const seatsBusyAfter = Math.min(totalSeats, Math.max(0, seatsBusy - releaseDuringHour + seatedTotal));

  return {
    seated,
    lost: Math.round(lost),
    queueAvg: queueSum / 4,
    seatsBusyAfter,
    avgWaitSeated: waitCount > 0 ? waitSum / waitCount : 0,
  };
}

/* ============================= ЗАКАЗЫ И КУХНЯ ============================= */

interface HourOrderResult {
  revenue: number;
  cogs: number;
  itemsSold: number;
  dishesSold: Record<string, number>;
  stationRequired: Partial<Record<StationType, number>>;
  stationLoads: Partial<Record<StationType, number>>;
  stopListHits: number;
  lostItems: number;
  avgDishQuality: number;
  errorRate: number;
}

function generateOrders(
  state: GameState,
  restaurant: Restaurant,
  seated: Record<SegmentId, number>,
  date: GameDate,
  hour: number,
  rng: Rng,
): HourOrderResult {
  const diff = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.standard;
  const alcoholOk = restaurant.licenses.alcohol?.active === true;
  const result: HourOrderResult = {
    revenue: 0,
    cogs: 0,
    itemsSold: 0,
    dishesSold: {},
    stationRequired: {},
    stationLoads: {},
    stopListHits: 0,
    lostItems: 0,
    avgDishQuality: 0,
    errorRate: 0,
  };
  const picks: { dish: Dish; count: number }[] = [];

  // Доступные блюда: меню − стоп-лист − лицензия − сезон (ТЗ §10.7).
  const month = monthOfDate(date);
  const availableDishes: Dish[] = restaurant.menu.dishes
    .map((id) => DISHES_MAP[id])
    .filter((d): d is Dish => Boolean(d))
    .filter((d) => !restaurant.menu.stopList.includes(d.id))
    .filter((d) => !d.requiresAlcoholLicense || alcoholOk)
    .filter((d) => !d.seasonMonths || d.seasonMonths.length === 0 || d.seasonMonths.includes(month));

  for (const segId of SEGMENT_IDS) {
    const guests = seated[segId];
    if (guests < 0.05) continue;
    const seg = SEGMENTS[segId];
    for (const [cat, prob] of Object.entries(seg.orderProbabilities)) {
      if (!prob || prob <= 0) continue;
      const qty = seg.categoryQuantities[cat as Dish['category']] ?? 1;
      const variance = rng.float(0.8, 1.2);
      const expected = guests * prob * qty * variance;
      if (expected < 0.05) continue;
      const dishesInCat = availableDishes.filter((d) => d.category === cat);
      if (dishesInCat.length === 0) {
        // Категории нет в меню — Availability-пенальти (ТЗ §15.8).
        result.lostItems += expected;
        result.stopListHits += expected;
        continue;
      }
      // DishScore = BasePopularity × PriceFactor × Availability × Quality (ТЗ §10.4–10.6).
      const elasticity =
        MENU_CATEGORIES[cat as Dish['category']].elasticity * diff.demandElasticity;
      const weights = dishesInCat.map((d) => {
        const price = restaurant.menu.prices[d.id] ?? d.recommendedPrice;
        const priceFactor = Math.pow(d.recommendedPrice / Math.max(1, price), elasticity);
        const available = maxPortions(restaurant.inventory, d.id) > 0 ? 1 : 0;
        return Math.max(0, d.basePopularity * priceFactor * available * (d.baseQuality / 80));
      });
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      if (totalWeight <= 0) {
        result.lostItems += expected;
        result.stopListHits += expected;
        continue;
      }
      for (let i = 0; i < dishesInCat.length; i++) {
        const count = expected * (weights[i] / totalWeight);
        if (count > 0.02) picks.push({ dish: dishesInCat[i], count });
      }
    }
  }

  // Мощности станций (ТЗ §11.6): StationFulfillmentRate = min(1, cap/required).
  const stations: StationType[] = ['hot_kitchen', 'cold_kitchen', 'prep', 'coffee', 'dessert', 'bar_service'];
  for (const st of stations) result.stationRequired[st] = 0;
  for (const p of picks) {
    result.stationRequired[p.dish.station] = (result.stationRequired[p.dish.station] ?? 0) + p.count;
  }
  const fulfillment: Partial<Record<StationType, number>> = {};
  for (const st of stations) {
    const required = result.stationRequired[st] ?? 0;
    const capacity = stationCapacity(restaurant, st, date.day, hour);
    result.stationLoads[st] = required > 0 ? required / Math.max(0.1, capacity) : 0;
    fulfillment[st] = required > 0 ? Math.min(1, capacity / required) : 1;
  }

  // Официанты (ТЗ §11.7).
  const guestsSeated = sumSeg(seated);
  const waiters = effectiveStaff(restaurant.staff, 'waiter', date.day, hour);
  const waiterCap = waiters * 12;
  const serviceFulfillment = guestsSeated > 0 ? Math.min(1, waiterCap / guestsSeated) : 1;

  // Исполнение: FIFO-списание и выручка только по факту (ТЗ §14.9).
  let qualitySum = 0;
  let countSum = 0;
  for (const p of picks) {
    const stFf = fulfillment[p.dish.station] ?? 1;
    const served = p.count * stFf * serviceFulfillment;
    const lost = p.count - served;
    if (lost > 0.01) result.lostItems += lost;
    if (served <= 0.02) continue;
    const portions = Math.floor(served);
    const partial = served - portions;
    const portionsActual = portions + (partial > 0 && rng.chance(partial) ? 1 : 0);
    if (portionsActual <= 0) continue;
    const price = restaurant.menu.prices[p.dish.id] ?? p.dish.recommendedPrice;
    result.revenue += price * portionsActual;
    result.cogs += consumeForDish(restaurant.inventory, p.dish.id, portionsActual);
    result.itemsSold += portionsActual;
    result.dishesSold[p.dish.id] = (result.dishesSold[p.dish.id] ?? 0) + portionsActual;
    qualitySum += p.dish.baseQuality * portionsActual;
    countSum += portionsActual;
  }
  result.avgDishQuality = countSum > 0 ? qualitySum / countSum : 0;

  // Ошибки персонала (ТЗ §14.9): base × (1+fatigue/100) × min(maxLoad,2.5)^1.5.
  // Насыщение: пустая станция уже теряет позиции (Availability),
  // взрывной рост ошибок от деления на ноль недопустим.
  const maxLoad = Math.min(2.5, Math.max(1, ...Object.values(result.stationLoads).map((v) => v ?? 0)));
  const fatigue = averageFatigue(restaurant.staff);
  result.errorRate = Math.min(0.3, 0.02 * (1 + fatigue / 100) * Math.pow(maxLoad, 1.5));

  return result;
}

/* ============================= УДОВЛЕТВОРЁННОСТЬ ============================= */

/**
 * Satisfaction = 25% Food + 20% Speed + 15% ServiceQ + 15% Clean
 *              + 10% PriceFair + 10% Atmosphere + 5% Availability (ТЗ §15).
 */
function computeSatisfaction(
  restaurant: Restaurant,
  date: GameDate,
  hour: number,
  order: HourOrderResult,
  seated: Record<SegmentId, number>,
  avgWaitSeated: number,
  estCheckBySegment: Record<SegmentId, number>,
): number {
  const w = SATISFACTION.weights;
  const items = order.itemsSold + 0.001;

  // FoodQuality (ТЗ §15.2).
  const fw = SATISFACTION.foodQualityWeights;
  const stationOverload = Math.max(0, ...Object.values(order.stationLoads).map((v) => v ?? 0));
  const execution = clamp(100 - Math.max(0, stationOverload - 1) * 120, 0, 100);
  const equipLevel = restaurant.equipment.kitchen.level;
  const equipQuality =
    (EQUIPMENT_LEVELS[equipLevel].qualityFactor * 100) * (1 - restaurant.equipment.kitchen.wear / 200);
  const fatigue = averageFatigue(restaurant.staff);
  const foodQuality =
    fw.recipeBase * (order.avgDishQuality || 55) +
    fw.ingredientFreshness * 72 +
    fw.stationExecution * execution +
    fw.equipmentQuality * equipQuality +
    fw.staffFatiguePenalty * (100 - fatigue) +
    fw.errorPenalty * clamp(100 - order.errorRate * 500, 0, 100);

  // ServiceSpeed (ТЗ §15.3): штраф за минуты сверх ожидания.
  const serviceSpeed = clamp(
    100 - SATISFACTION.waitPenaltyPerMinute * Math.max(0, avgWaitSeated - SATISFACTION.expectedWaitMinutes),
    0,
    100,
  );

  // ServiceQuality (ТЗ §15.4).
  const org = organizationFactor(restaurant.staff, date.day, hour);
  const serviceQuality = clamp(
    100 - order.errorRate * 400 - fatigue * 0.35 - (1 - org) * 150,
    0,
    100,
  );

  // PriceFairness по сегментам (ТЗ §15.6).
  let pfSum = 0;
  let pfCount = 0;
  for (const segId of SEGMENT_IDS) {
    if (seated[segId] < 0.05) continue;
    const seg = SEGMENTS[segId];
    const est = estCheckBySegment[segId] || seg.budget;
    const gap = seg.budget > 0 ? est / seg.budget - 1 : 0;
    pfSum += clamp(100 - gap * 100 * seg.priceSensitivity, 0, 100) * seated[segId];
    pfCount += seated[segId];
  }
  const priceFairness = pfCount > 0 ? pfSum / pfCount : 70;

  // Availability (ТЗ §15.8): пустая кухня обязана резать удовлетворённость —
  // это главный контур обратной связи «закупки → сервис → отзывы → спрос» (ТЗ §50).
  const lostItemRate = order.lostItems / items;
  const guestsSeatedNow = sumSeg(seated);
  const availability = clamp(100 - lostItemRate * SATISFACTION.lostItemPenalty * 3, 0, 100);
  const emptyKitchenPenalty = guestsSeatedNow > 5 && order.itemsSold === 0 ? 35 : 0;

  const satisfaction =
    (w.foodQuality * foodQuality +
    w.serviceSpeed * serviceSpeed +
    w.serviceQuality * serviceQuality +
    w.cleanliness * restaurant.cleanliness +
    w.priceFairness * priceFairness +
    w.atmosphere * restaurant.atmosphere +
    w.availability * availability) - emptyKitchenPenalty;

  return clamp(satisfaction, 0, 100);
}

/* ============================= ГЛАВНЫЙ ЧАС ============================= */

export interface HourSimResult {
  hourLog: HourLog;
  revenue: number;
  cogs: number;
  seated: Record<SegmentId, number>;
  tips: number;
  satisfaction: number;
  dishesSold: Record<string, number>;
  stopListHits: number;
  queueState: QueueEntry[];
  seatsBusy: number;
  lostGuests: number;
}

export function simulateHour(
  state: GameState,
  restaurant: Restaurant,
  date: GameDate,
  hour: number,
  demand: { newDemand: Record<SegmentId, number>; returning: Record<SegmentId, number> },
  queue: QueueEntry[],
  seatsBusy: number,
  rng: Rng,
): HourSimResult {
  const seat = processQueueAndSeating(
    restaurant,
    demand.newDemand,
    demand.returning,
    queue,
    date,
    hour,
    seatsBusy,
  );

  const order = generateOrders(state, restaurant, seat.seated, date, hour, rng);

  const estCheck = {} as Record<SegmentId, number>;
  for (const segId of SEGMENT_IDS) estCheck[segId] = estimatedCheck(restaurant, segId);

  const satisfaction = computeSatisfaction(
    restaurant,
    date,
    hour,
    order,
    seat.seated,
    seat.avgWaitSeated,
    estCheck,
  );

  // Чаевые (ТЗ §14.11): не выручка ресторана; влияют на мораль (в day.ts).
  const seatedTotal = sumSeg(seat.seated);
  let tips = 0;
  if (seatedTotal > 0.05 && order.revenue > 0) {
    for (const segId of SEGMENT_IDS) {
      const g = seat.seated[segId];
      if (g < 0.05) continue;
      const seg = SEGMENTS[segId];
      const guestRevenue = order.revenue * (g / seatedTotal);
      tips += guestRevenue * seg.tipRate * (0.5 + satisfaction / 200);
    }
  }
  tips = Math.round(tips);

  const hourLog: HourLog = {
    hour,
    demand: Math.round(seatedTotal + seat.lost + queueGuests(queue)),
    arrivals: Math.round(sumSeg(demand.newDemand) + sumSeg(demand.returning)),
    seated: Math.round(seatedTotal),
    lost: seat.lost,
    revenue: Math.round(order.revenue),
    guestsServed: Math.round(seatedTotal),
    orders: Math.round(order.itemsSold),
    queueAvg: Math.round((seat.queueAvg * 10)) / 10,
    satisfaction: Math.round(satisfaction),
    stationLoads: Object.fromEntries(
      Object.entries(order.stationLoads).map(([k, v]) => [k, Math.min(9.99, Math.round((v ?? 0) * 100) / 100)]),
    ),
    waiterLoad: Math.min(9.99, Math.round(waiterLoad(restaurant, seatedTotal, date.day, hour) * 100) / 100),
  };

  return {
    hourLog,
    revenue: order.revenue,
    cogs: order.cogs,
    seated: seat.seated,
    tips,
    satisfaction,
    dishesSold: order.dishesSold,
    stopListHits: Math.round(order.stopListHits),
    queueState: queue,
    seatsBusy: seat.seatsBusyAfter,
    lostGuests: seat.lost,
  };
}

/* ============================= ХЕЛПЕРЫ ============================= */

function emptySeg(): Record<SegmentId, number> {
  return {
    breakfast: 0, business_lunch: 0, office_evening: 0, family: 0,
    youth: 0, tourist: 0, premium: 0, evening: 0,
  };
}

function sumSeg(seg: Record<SegmentId, number>): number {
  return SEGMENT_IDS.reduce((s, k) => s + (seg[k] ?? 0), 0);
}

function queueGuests(queue: QueueEntry[]): number {
  return queue.reduce((s, q) => s + q.guests, 0);
}

function monthOfDate(date: GameDate): number {
  const doy = (date.week - 1) * 7 + date.day;
  return Math.min(12, Math.floor(doy / 30.4) + 1);
}

export type { QueueEntry };
