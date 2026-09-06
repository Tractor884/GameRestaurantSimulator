/**
 * СИМУЛЯЦИЯ ДНЯ (ТЗ §7, §28).
 * Порядок: плановые решения → доставки → почасовой цикл → конец дня.
 * Функция чистая: входное состояние не мутируется (клон через structuredClone).
 */
import type {
  DayKPI,
  DaySimulationResult,
  DayDecisions,
  GameDate,
  GameState,
  HourLog,
  InvariantReport,
  Review,
  RiskChange,
  SegmentId,
  GameEvent,
} from '../types';
import { deriveRng, hashSeed } from '../rng';
import { SEGMENT_IDS } from '../config/segments.config';
import { FINANCE } from '../config/finance.config';
import { DIFFICULTIES } from '../config/difficulty.config';
import { LOCATIONS_MAP } from '../config/locations.config';
import { monthOfDay, dayOfYear } from '../config/demandProfiles.config';
import { cloneState, addTransaction, workingHours, dayIndex, clamp } from './core';
import { hourlyDemand, emptyReturning } from './demand';
import { simulateHour, type QueueEntry } from './hour';
import { processDeliveries, processEndOfDayLosses, buildAutoOrder, placePurchase } from './inventory';
import { accruePayrollDay, updateFatigue, averageFatigue, dayCoverage } from './staff';
import {
  generateReviews,
  addReviews,
  createCohorts,
  returningDemandForDay,
  returningShareForHour,
  updateRisks,
  checkEvents,
  applyEventEffects,
  updateCleanliness,
  updateComfortAtmosphere,
  updateEquipmentWear,
} from './endday';
import { checkInvariants } from './invariants';

export function simulateDay(
  state: GameState,
  decisions: DayDecisions,
  seed: number,
): { result: DaySimulationResult; state: GameState } {
  const draft = cloneState(state);
  const restaurant = draft.restaurant;
  if (!restaurant) throw new Error('simulateDay: ресторан не создан');

  const date: GameDate = { week: draft.week, day: draft.day, hour: restaurant.openHours.start };
  const daySeed = hashSeed(seed, draft.week, draft.day);
  const demandRng = deriveRng(daySeed, 'demand');
  const ordersRng = deriveRng(daySeed, 'orders');
  const reviewsRng = deriveRng(daySeed, 'reviews');
  const eventsRng = deriveRng(daySeed, 'events');

  // ===== 1. НАЧАЛО ДНЯ =====
  void decisions; // плановые решения применяются UI-действиями между днями (MVP)
  processDeliveries(restaurant, date);

  // Автозаказ «завхоза» (ТЗ §12.5): нормальная доставка с лагом 1 день,
  // скоропорт ограничен сроком годности (анти-спираль порчи).
  if (restaurant.marketing.autoPurchase?.enabled) {
    const logs = draft.history.dayLogs;
    const recentGuests = logs.slice(-3).reduce((s, l) => s + l.kpi.guests, 0) / Math.max(1, Math.min(3, logs.length));
    const loc = LOCATIONS_MAP[restaurant.locationId];
    const expected = recentGuests > 10 ? recentGuests : loc.baseTraffic * 0.75;
    const order = buildAutoOrder(restaurant, restaurant.marketing.autoPurchase.coverDays, expected);
    let total = 0;
    const placed: typeof restaurant.inventory.pendingOrders = [];
    for (const item of order) {
      const res = placePurchase(restaurant, item.ingredientId, item.quantity, false, date);
      total += res.paid;
      const justPlaced = restaurant.inventory.pendingOrders[restaurant.inventory.pendingOrders.length - 1];
      placed.push(justPlaced);
    }
    if (total > 0 && restaurant.finance.cash - total >= 0) {
      addTransaction(restaurant, date, 'purchase', total, 'out', 'Автозаказ (доставка завтра)');
    } else if (total > 0) {
      // Нет денег — откатываем ровно эти заказы (деньги из воздуха не появляются).
      restaurant.inventory.pendingOrders = restaurant.inventory.pendingOrders.filter((o) => !placed.includes(o));
    }
  }

  // Возвратный спрос дня (по сегментам), распределится по часам.
  const returningDay = returningDemandForDay(restaurant, date);

  // ===== 2. ПОЧАСОВОЙ ЦЕПЬ =====
  const hours = workingHours(restaurant, date.day);
  const hourLogs: HourLog[] = [];
  const queue: QueueEntry[] = [];
  let seatsBusy = 0;
  const totals = {
    revenue: 0,
    cogs: 0,
    guests: 0,
    lost: 0,
    tips: 0,
    satisfactionWeighted: 0,
    satisfactionCount: 0,
    dishesSold: {} as Record<string, number>,
    stopListHits: 0,
    seatedBySegment: { ...emptyReturning() } as Record<SegmentId, number>,
    kitchenOverloadHours: 0,
    staffLoadSum: 0,
  };

  for (const hour of hours) {
    const demand = hourlyDemand(draft, restaurant, { ...date, hour }, hour, demandRng);
    // Возвратный спрос распределяем по часам по предпочтениям сегмента.
    const returningHour = { ...emptyReturning() } as Record<SegmentId, number>;
    for (const segId of SEGMENT_IDS) {
      const share = returningShareForHour(segId, hour);
      returningHour[segId] = (returningDay[segId] ?? 0) * share;
    }

    const hourResult = simulateHour(
      draft,
      restaurant,
      { ...date, hour },
      hour,
      { newDemand: demand.newDemand, returning: returningHour },
      queue,
      seatsBusy,
      ordersRng,
    );
    seatsBusy = hourResult.seatsBusy;
    hourLogs.push(hourResult.hourLog);

    totals.revenue += hourResult.revenue;
    totals.cogs += hourResult.cogs;
    totals.guests += hourResult.hourLog.seated;
    totals.lost += hourResult.lostGuests;
    totals.tips += hourResult.tips;
    totals.satisfactionWeighted += hourResult.satisfaction * hourResult.hourLog.seated;
    totals.satisfactionCount += hourResult.hourLog.seated;
    totals.stopListHits += hourResult.stopListHits;
    for (const [dishId, count] of Object.entries(hourResult.dishesSold)) {
      totals.dishesSold[dishId] = (totals.dishesSold[dishId] ?? 0) + count;
    }
    for (const segId of SEGMENT_IDS) totals.seatedBySegment[segId] += hourResult.seated[segId] ?? 0;
    const maxLoad = Math.max(0, ...Object.values(hourResult.hourLog.stationLoads).map((v) => v ?? 0));
    if (maxLoad > 1) totals.kitchenOverloadHours += 1;
    totals.staffLoadSum += Math.max(
      hourResult.hourLog.waiterLoad,
      ...Object.values(hourResult.hourLog.stationLoads).map((v) => v ?? 0),
    );
  }

  const guests = Math.round(totals.guests);
  const satisfaction = totals.satisfactionCount > 0 ? totals.satisfactionWeighted / totals.satisfactionCount : 0;

  // ===== 3. ФИНАНСЫ ДНЯ =====
  // Выручка: валовая в P&L; в кассу — минус эквайринг (ТЗ §18.3).
  const netRevenue = Math.round(totals.revenue * (1 - FINANCE.acquiringRate));
  if (netRevenue > 0) {
    addTransaction(restaurant, date, 'sale', netRevenue, 'in', `Выручка за день: ${guests} гостей`);
  }
  // Маркетинг: дневные расходы кампаний (ТЗ §21.2).
  const marketingDaily = restaurant.marketing.campaigns.reduce((s, c) => s + c.weeklyBudget / 7, 0);
  if (marketingDaily > 0) {
    addTransaction(restaurant, date, 'marketing', Math.round(marketingDaily), 'out', 'Маркетинг: дневной бюджет');
  }
  // Начисление зарплаты (ТЗ §14.10): выплата в конце недели.
  const payroll = accruePayrollDay(restaurant, date);
  restaurant.finance.accrued.payrollGross += payroll;

  // ===== 4. КОНЕЦ ДНЯ =====
  const { wasteCost, expiredCount } = processEndOfDayLosses(restaurant, date);
  updateCleanliness(restaurant, guests);
  updateComfortAtmosphere(restaurant, monthOfDay(dayOfYear(date.week, date.day)));
  updateEquipmentWear(restaurant, totals.kitchenOverloadHours > 0 ? 1.2 : 0.7);
  const avgStaffLoad = hours.length > 0 ? totals.staffLoadSum / hours.length : 0;
  updateFatigue(restaurant, [{ load: avgStaffLoad }], DIFFICULTIES[draft.difficultyId]?.staffFatigueRate ?? 1);

  // Чаевые → мораль персонала (ТЗ §14.11).
  if (guests > 0) {
    const tipPerGuest = totals.tips / Math.max(1, guests);
    const moraleBonus = clamp(tipPerGuest / 100, 0, 0.5);
    for (const pool of Object.values(restaurant.staff.pools)) {
      pool.morale = clamp(pool.morale + moraleBonus, 0, 100);
    }
  }

  // Отзывы и рейтинг (ТЗ §16).
  const reviews: Review[] = generateReviews(restaurant, date, totals.seatedBySegment, satisfaction, reviewsRng);
  addReviews(restaurant, reviews, date);

  // Возвратные когорты (ТЗ §17).
  createCohorts(restaurant, date, totals.seatedBySegment, satisfaction);

  // Риски (ТЗ §19).
  const negativeReviews = reviews.filter((r) => r.score <= 2.5).length;
  const riskChanges: RiskChange[] = updateRisks(restaurant, {
    expiredCount,
    lostGuests: totals.lost,
    negativeReviews,
    kitchenOverloadHours: totals.kitchenOverloadHours,
    avgStaffLoad,
    cashWarning: restaurant.finance.cash < DIFFICULTIES[draft.difficultyId]?.cashBuffer * 0.3,
  });

  // События (ТЗ §20): некритические применяются сразу, критические — на паузу.
  const events: GameEvent[] = checkEvents(draft, restaurant, date, eventsRng);
  const pendingCritical: GameEvent[] = [];
  for (const event of events) {
    if (event.criticality === 'critical') {
      event.resolved = false;
      pendingCritical.push(event);
    } else {
      applyEventEffects(draft, restaurant, event);
    }
  }

  // ===== 5. KPI ДНЯ =====
  const dishesTop = Object.entries(totals.dishesSold)
    .map(([dishId, count]) => ({ dishId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const kpi: DayKPI = {
    guests,
    lostGuests: Math.round(totals.lost),
    revenue: Math.round(totals.revenue),
    netRevenue,
    avgCheck: guests > 0 ? Math.round(totals.revenue / guests) : 0,
    ordersCount: hourLogs.reduce((s, h) => s + h.orders, 0),
    cogs: Math.round(totals.cogs),
    wasteCost,
    foodCost: totals.revenue > 0 ? (totals.cogs + wasteCost) / totals.revenue : 0,
    satisfaction: Math.round(satisfaction),
    tips: totals.tips,
    payrollAccrued: payroll,
    dishesTop,
    stopListHits: totals.stopListHits,
  };

  // ===== 6. ПРЕДУПРЕЖДЕНИЯ (подсказки ТЗ §31.6) =====
  const warnings: string[] = [];
  if (kpi.foodCost > 0.35 && kpi.revenue > 0) {
    warnings.push('Food Cost выше 35%. Проверьте себестоимость популярных блюд или поднимите цены.');
  }
  if (restaurant.finance.cash < 500_000) {
    warnings.push('Денег на счёте меньше 500 тыс ₽ — риск кассового разрыва.');
  }
  if (dayCoverage(restaurant.staff, date.day) < 0.85) {
    warnings.push('График персонала закрыт не полностью — сервис просядет.');
  }
  if (totals.lost > guests * 0.08 && totals.lost > 5) {
    warnings.push('Гости уходят из очереди — узкое место в посадке (хостес/места/оборачиваемость).');
  }
  if (averageFatigue(restaurant.staff) > 60) {
    warnings.push('Персонал выгорает: растут ошибки и риск увольнений.');
  }
  if (restaurant.reputation.rating < 3.5) {
    warnings.push('Рейтинг ниже 3.5 — спрос падает, разберитесь с сервисом и отзывами.');
  }

  // ===== 7. ИНВАРИАНТЫ =====
  const invariantReport: InvariantReport = checkInvariants(draft);

  // ===== 8. ПРОДВИЖЕНИЕ ВРЕМЕНИ =====
  if (pendingCritical.length > 0) {
    draft.activeEvents.push(...pendingCritical);
  } else if (draft.day >= 6) {
    draft.day = 0;
    draft.week += 1;
  } else {
    draft.day += 1;
  }

  const result: DaySimulationResult = {
    date,
    hourLogs,
    transactions: restaurant.finance.transactions.filter((t) => dayIndex(t.date) === dayIndex(date)),
    reviews,
    events,
    riskChanges,
    kpi,
    warnings,
    invariantReport,
  };

  draft.lastDayResult = result;
  return { result, state: draft };
}
