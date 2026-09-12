/**
 * СИМУЛЯЦИЯ ДНЯ (ТЗ §7, §28).
 * Порядок: плановые решения → доставки → почасовой цикл → конец дня.
 * Функция чистая: входное состояние не мутируется (клон через structuredClone).
 *
 * АРХИТЕКТУРА ПАУЗЫ «ЭКСТРЕННЫХ РЕШЕНИЙ» (ТЗ §8.4–8.6, дорожная карта §12.5):
 *   День = startDayRun → runHoursUntil → finishDay.
 *   simulateDay() гонит все три фазы подряд (поведение ИДЕНТИЧНО прежнему —
 *   rng-потоки и порядок операций не менялись; эталоны калибровки 2.0 живы).
 *   Экстренная пауза (emergency.ts) останавливает runHoursUntil ПОСЛЕ обеденного
 *   пика: игрок применяет решения, затем resumeDay доигрывает вечер и финализирует.
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
  EmergencyActionId,
  StationType,
} from '../types';
import { deriveRng, hashSeed, type Rng } from '../rng';
import { SEGMENT_IDS } from '../config/segments.config';
import { FINANCE } from '../config/finance.config';
import { DIFFICULTIES } from '../config/difficulty.config';
import { LOCATIONS_MAP } from '../config/locations.config';
import { monthOfDay, dayOfYear } from '../config/demandProfiles.config';
import { STAFF_ROLES, ROLE_IDS } from '../config/staffRoles.config';
import type { RoleId } from '../types';
import { cloneState, addTransaction, workingHours, dayIndex, clamp } from './core';
import { hourlyDemand, emptyReturning } from './demand';
import { dishOf } from '../content/resolve';
import { recipeCost } from '../content/dishes';
import { simulateHour, type QueueEntry } from './hour';
import { processDeliveries, processEndOfDayLosses, buildAutoOrder, placePurchase } from './inventory';
import { accruePayrollDay, updateFatigue, averageFatigue, dayCoverage } from './staff';
import { closeWeek } from './weekclose';
import { payrollWageMult } from './permanent';
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
import { reviewNeedsReply } from '../config/reviews.config';
import { activeProcurement, procAutoCoverDays } from '../config/procurement.config';
import { OVERTIME } from '../config/inflation.config';

/** Накопители дня (двигаются по часам; при паузе — замораживаются в контексте). */
export interface DayTotals {
  revenue: number;
  cogs: number;
  guests: number;
  lost: number;
  tips: number;
  satisfactionWeighted: number;
  satisfactionCount: number;
  dishesSold: Record<string, number>;
  stopListHits: number;
  seatedBySegment: Record<SegmentId, number>;
  kitchenOverloadHours: number;
  /** v10 §5.2: пиковая загрузка худшей станции за день (для переработок/усталости). */
  peakStationLoad: number;
  staffLoadSum: number;
  /** Позиций продано (для относительных порогов: стоп-листы к объёму). */
  orders: number;
  // ТЕЛЕМЕТРИЯ (аудит): выручка/себестоимость по категориям + возвратный трафик.
  categoryRevenue: Partial<Record<import('../types').DishCategory, number>>;
  categoryCogs: Partial<Record<import('../types').DishCategory, number>>;
  returningGuests: number;
}

/** Контекст «бегущего» дня. Живёт в памяти сторы во время паузы (НЕ в сейвах:
 *  после перезагрузки страницы день детерминированно переигрывается с начала). */
export interface DayRunContext {
  date: GameDate;
  hours: number[];
  hourIndex: number; // индекс следующего часа к симуляции
  hourLogs: HourLog[];
  queue: QueueEntry[];
  seatsBusy: number;
  totals: DayTotals;
  returningDay: Record<SegmentId, number>;
  rngs: { demand: Rng; orders: Rng; reviews: Rng; events: Rng; supply: Rng };
  /** БАЛ-v2 §9: сбои поставки за день (телеметрия склада/UI). */
  supplyErrors: number;
  /** Модификаторы экстренных решений (§8.4): применяются к ОСТАВШИМСЯ часам. */
  emergency: {
    applied: EmergencyActionId[];
    demandLift: number; // множитель нового спроса (walk-ins)
    discount: number; // скидка на оставшиеся часы (доля); цены масштабируются и восстанавливаются
    satisfactionBonus: number; // добавка к удовлетворённости оставшихся часов
    tempStopList: string[]; // «сложные» блюда, скрытые до конца дня
  };
}

function emptyTotals(): DayTotals {
  return {
    revenue: 0,
    cogs: 0,
    guests: 0,
    lost: 0,
    tips: 0,
    satisfactionWeighted: 0,
    satisfactionCount: 0,
    dishesSold: {},
    stopListHits: 0,
    seatedBySegment: { ...emptyReturning() } as Record<SegmentId, number>,
    kitchenOverloadHours: 0,
    peakStationLoad: 0,
    staffLoadSum: 0,
    orders: 0,
    categoryRevenue: {},
    categoryCogs: {},
    returningGuests: 0,
  };
}

export function simulateDay(
  state: GameState,
  decisions: DayDecisions,
  seed: number,
): { result: DaySimulationResult; state: GameState } {
  void decisions; // плановые решения применяются UI-действиями между днями (MVP)
  const { draft, run } = startDayRun(state, seed);
  runHoursUntil(draft, run);
  return finishDay(draft, run, seed);
}

/** ФАЗА 1. Начало дня: доставки, кампании, автозаказ, возвратный спрос. */
export function startDayRun(state: GameState, seed: number): { draft: GameState; run: DayRunContext } {
  const draft = cloneState(state);
  const restaurant = draft.restaurant;
  if (!restaurant) throw new Error('startDayRun: ресторан не создан');

  const date: GameDate = { week: draft.week, day: draft.day, hour: restaurant.openHours.start };
  const daySeed = hashSeed(seed, draft.week, draft.day);
  const run: DayRunContext = {
    date,
    hours: workingHours(restaurant, date.day),
    hourIndex: 0,
    hourLogs: [],
    queue: [],
    seatsBusy: 0,
    totals: emptyTotals(),
    returningDay: returningDemandForDay(restaurant, date),
    rngs: {
      demand: deriveRng(daySeed, 'demand'),
      orders: deriveRng(daySeed, 'orders'),
      reviews: deriveRng(daySeed, 'reviews'),
      events: deriveRng(daySeed, 'events'),
      // БАЛ-v2 §9: ОТДЕЛЬНЫЙ поток сбоев поставки — не сдвигает
      // детерминизм существующих бросков дня (§21 «не трогаем rng»).
      supply: deriveRng(daySeed, 'supply'),
    },
    supplyErrors: 0,
    emergency: { applied: [], demandLift: 1, discount: 0, satisfactionBonus: 0, tempStopList: [] },
  };

  // БАЛ-v2 §9: доставки со сбоем поставки (режим закупки), телеметрия в день.
  const delivery = processDeliveries(restaurant, date, run.rngs.supply);
  run.supplyErrors = delivery.supplyErrors;
  restaurant.inventory.supplyErrorsWeek = (restaurant.inventory.supplyErrorsWeek ?? 0) + delivery.supplyErrors;

  // КАМПАНИИ: завершение по сроку (ТЗ §21.6). Раньше кампания жила вечно —
  // «осталось 0 недель», но бейдж «Активна» и списание бюджета продолжались.
  // Теперь при исчерпании срока помечаем endedWeek: деньги не списываются,
  // а эффект затухает ~2 недели (см. demand.marketingFactor).
  for (const c of restaurant.marketing.campaigns) {
    if (c.endedWeek == null && date.week >= c.startWeek + c.durationWeeks) {
      c.endedWeek = date.week;
    }
  }
  // Полностью затухшие (2+ недели после конца) — удаляем из списка.
  restaurant.marketing.campaigns = restaurant.marketing.campaigns.filter(
    (c) => c.endedWeek == null || date.week - c.endedWeek < 2,
  );

  // Автозаказ «завхоза» (ТЗ §12.5): нормальная доставка с лагом 1 день,
  // скоропорт ограничен сроком годности (анти-спираль порчи).
  // БАЛ-v2 §9: цель покрытия — из режима закупки (эконом 1,5 / стандарт 2,0
  // (= дефолт движка) / премиум 3,5 дн).
  if (restaurant.marketing.autoPurchase?.enabled) {
    const logs = draft.history.dayLogs;
    const recentGuests = logs.slice(-3).reduce((s, l) => s + l.kpi.guests, 0) / Math.max(1, Math.min(3, logs.length));
    const loc = LOCATIONS_MAP[restaurant.locationId];
    const expected = recentGuests > 10 ? recentGuests : loc.baseTraffic * 0.75;
    const coverDays = procAutoCoverDays(activeProcurement(restaurant));
    const order = buildAutoOrder(restaurant, coverDays, expected);
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

  return { draft, run };
}

/** ФАЗА 2. Почасовой цикл. stopBeforeHour: симулировать часы [текущий, stopBefore)
 *  — для экстренной паузы после обеденного пика. */
export function runHoursUntil(draft: GameState, run: DayRunContext, stopBeforeHour?: number): void {
  const restaurant = draft.restaurant;
  if (!restaurant) throw new Error('runHoursUntil: ресторан не создан');
  const { date, totals, rngs, emergency } = run;

  while (run.hourIndex < run.hours.length) {
    const hour = run.hours[run.hourIndex];
    if (stopBeforeHour != null && hour >= stopBeforeHour) break;

    const demand = hourlyDemand(draft, restaurant, { ...date, hour }, hour, rngs.demand);
    // Возвратный спрос распределяем по часам по предпочтениям сегмента.
    const returningHour = { ...emptyReturning() } as Record<SegmentId, number>;
    for (const segId of SEGMENT_IDS) {
      const share = returningShareForHour(segId, hour);
      returningHour[segId] = (run.returningDay[segId] ?? 0) * share;
    }

    // ЭКСТРЕННАЯ СКИДКА (§8.4): вечерний трафик живее (walk-ins),
    // возвратные когорты не масштабируем — они уже «придут» своей памятью.
    if (emergency.demandLift !== 1) {
      for (const segId of SEGMENT_IDS) demand.newDemand[segId] *= emergency.demandLift;
    }

    const hourResult = simulateHour(
      draft,
      restaurant,
      { ...date, hour },
      hour,
      { newDemand: demand.newDemand, returning: returningHour },
      run.queue,
      run.seatsBusy,
      rngs.orders,
    );
    run.seatsBusy = hourResult.seatsBusy;
    run.hourIndex += 1;

    // КОМПЕНСАЦИЯ ОЖИДАЮЩИМ (§8.4): напиток за ожидание — мягкая
    // добавка к удовлетворённости оставшихся часов.
    if (emergency.satisfactionBonus > 0) {
      hourResult.satisfaction = clamp(hourResult.satisfaction + emergency.satisfactionBonus, 0, 100);
      hourResult.hourLog.satisfaction = Math.round(hourResult.satisfaction);
    }

    run.hourLogs.push(hourResult.hourLog);
    totals.revenue += hourResult.revenue;
    totals.cogs += hourResult.cogs;
    totals.guests += hourResult.hourLog.seated;
    totals.lost += hourResult.lostGuests;
    totals.tips += hourResult.tips;
    totals.orders += hourResult.hourLog.orders;
    totals.satisfactionWeighted += hourResult.satisfaction * hourResult.hourLog.seated;
    totals.satisfactionCount += hourResult.hourLog.seated;
    totals.stopListHits += hourResult.stopListHits;
    totals.returningGuests += SEGMENT_IDS.reduce((s, k) => s + (returningHour[k] ?? 0), 0);
    for (const [dishId, count] of Object.entries(hourResult.dishesSold)) {
      totals.dishesSold[dishId] = (totals.dishesSold[dishId] ?? 0) + count;
      const dish = dishOf(restaurant.menu, dishId);
      if (dish) {
        const price = restaurant.menu.prices[dishId] ?? dish.recommendedPrice;
        totals.categoryRevenue[dish.category] = (totals.categoryRevenue[dish.category] ?? 0) + price * count;
        // Оценка себестоимости по техкарте (≈ FIFO-цена закупки).
        totals.categoryCogs[dish.category] = (totals.categoryCogs[dish.category] ?? 0) + recipeCost(dish) * count;
      }
    }
    for (const segId of SEGMENT_IDS) totals.seatedBySegment[segId] += hourResult.seated[segId] ?? 0;
    const maxLoad = Math.max(0, ...Object.values(hourResult.hourLog.stationLoads).map((v) => v ?? 0));
    if (maxLoad > 1) totals.kitchenOverloadHours += 1;
    // v10 §5.2: пик худшей станции за день (порог переработок — 0,90).
    totals.peakStationLoad = Math.max(totals.peakStationLoad, maxLoad);
    totals.staffLoadSum += Math.max(
      hourResult.hourLog.waiterLoad,
      ...Object.values(hourResult.hourLog.stationLoads).map((v) => v ?? 0),
    );
  }
}

/** ФАЗА 3. Конец дня: финансы, отзывы, риски, события, KPI, журнал, время.
 *  Возвращает финальное состояние и отчёт; ОДНОКРАТНО двигает время (день/неделя).
 *  Снимает временные модификаторы экстренных решений (цены/стоп-лист/вызовы). */
export function finishDay(
  draft: GameState,
  run: DayRunContext,
  seed: number,
): { result: DaySimulationResult; state: GameState } {
  const restaurant = draft.restaurant;
  if (!restaurant) throw new Error('finishDay: ресторан не создан');
  const { date, totals, hourLogs, emergency, rngs } = run;
  const guests = Math.round(totals.guests);
  const satisfaction = totals.satisfactionCount > 0 ? totals.satisfactionWeighted / totals.satisfactionCount : 0;

  // — Снять временные модификаторы экстренных решений (только на сегодня) —
  if (emergency.discount > 0) {
    const k = 1 - emergency.discount;
    for (const id of Object.keys(restaurant.menu.prices)) {
      restaurant.menu.prices[id] = Math.round(restaurant.menu.prices[id] / k);
    }
  }
  if (emergency.tempStopList.length > 0) {
    restaurant.menu.stopList = restaurant.menu.stopList.filter((id) => !emergency.tempStopList.includes(id));
  }
  restaurant.staff.callIns = [];

  // ===== 3. ФИНАНСЫ ДНЯ =====
  // Выручка: валовая в P&L; в кассу — минус эквайринг (ТЗ §18.3).
  const netRevenue = Math.round(totals.revenue * (1 - FINANCE.acquiringRate));
  if (netRevenue > 0) {
    addTransaction(restaurant, date, 'sale', netRevenue, 'in', `Выручка за день: ${guests} гостей`);
  }
  // Маркетинг: дневные расходы ТОЛЬКО активных кампаний (ТЗ §21.2).
  const marketingDaily = restaurant.marketing.campaigns
    .filter((c) => c.endedWeek == null)
    .reduce((s, c) => s + c.weeklyBudget / 7, 0);
  if (marketingDaily > 0) {
    addTransaction(restaurant, date, 'marketing', Math.round(marketingDaily), 'out', 'Маркетинг: дневной бюджет');
  }
  // Начисление зарплаты (ТЗ §14.10): выплата в конце недели.
  // ДИЛЕММА «Кризис» (поднять оклады, §15): ФОТ ×wageRaise навсегда.
  const payroll = accruePayrollDay(restaurant, date);
  restaurant.finance.accrued.payrollGross += Math.round(payroll * payrollWageMult(restaurant));

  // ===== 4. КОНЕЦ ДНЯ =====
  const { wasteCost, expiredCount, nearExpiryCount } = processEndOfDayLosses(restaurant, date);
  updateCleanliness(restaurant, guests);
  updateComfortAtmosphere(restaurant, monthOfDay(dayOfYear(date.week, date.day)));
  updateEquipmentWear(restaurant, totals.kitchenOverloadHours > 0 ? 1.2 : 0.7, date);
  // Усталость: пофункциональные нагрузки (пик по «горячим» часам дня).
  // v10 §5.2: перегрузочный день (пик станций > 0,90) — прирост усталости ×1,2
  // («после 8 часов — сверхурочная смена», запрос пользователя).
  const roleLoads = buildRoleLoads(hourLogs);
  const overloadMult = totals.peakStationLoad > OVERTIME.threshold ? OVERTIME.fatigueBoost : 1;
  updateFatigue(restaurant, date, roleLoads, DIFFICULTIES[draft.difficultyId]?.staffFatigueRate ?? 1, overloadMult);
  const avgStaffLoad = run.hours.length > 0 ? totals.staffLoadSum / run.hours.length : 0;

  // Чаевые → мораль персонала (ТЗ §14.11).
  if (guests > 0) {
    const tipPerGuest = totals.tips / Math.max(1, guests);
    const moraleBonus = clamp(tipPerGuest / 100, 0, 0.5);
    for (const pool of Object.values(restaurant.staff.pools)) {
      pool.morale = clamp(pool.morale + moraleBonus, 0, 100);
    }
  }

  // Отзывы и рейтинг (ТЗ §16). reputationSpeed — множитель сложности (ТЗ §36):
  // у «Профессионала» рейтинг живее реагирует на свежие отзывы (§6.8 паспорта).
  const reviews: Review[] = generateReviews(restaurant, date, totals.seatedBySegment, satisfaction, rngs.reviews);
  addReviews(restaurant, reviews, date, DIFFICULTIES[draft.difficultyId]?.reputationSpeed ?? 1);
  // БАЛ-v2 §8 (механизм D): неотвеченные отзывы копятся каждый день (порог
  // «требует ответа» — 3,5★ и ниже, врезка калибровки §8). Игнор работы с
  // репутацией → конверсия/возвратность (в demand/endday) + юр. риск (weekclose).
  {
    const negToday = reviews.filter((r) => reviewNeedsReply(r.score)).length;
    restaurant.reputation.unansweredNeg = (restaurant.reputation.unansweredNeg ?? 0) + negToday;
  }

  // Возвратные когорты (ТЗ §17).
  createCohorts(restaurant, date, totals.seatedBySegment, satisfaction);

  // Риски (ТЗ §19).
  const negativeReviews = reviews.filter((r) => r.score <= 2.5).length;
  const riskChanges: RiskChange[] = updateRisks(restaurant, {
    expiredCount,
    nearExpiryCount,
    lostGuests: totals.lost,
    negativeReviews,
    kitchenOverloadHours: totals.kitchenOverloadHours,
    avgStaffLoad,
    cashWarning: restaurant.finance.cash < DIFFICULTIES[draft.difficultyId]?.cashBuffer * 0.3,
    date,
  });

  // События (ТЗ §20): некритические применяются сразу, критические — на паузу.
  const events: GameEvent[] = checkEvents(draft, restaurant, date, rngs.events);
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
    returningGuests: Math.round(totals.returningGuests),
    categoryRevenue: Object.fromEntries(
      Object.entries(totals.categoryRevenue).map(([k, v]) => [k, Math.round(v ?? 0)]),
    ),
    categoryCogs: Object.fromEntries(
      Object.entries(totals.categoryCogs).map(([k, v]) => [k, Math.round(v ?? 0)]),
    ),
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

  // ===== 8. ЖУРНАЛ ДНЯ И ПРОДВИЖЕНИЕ ВРЕМЕНИ =====
  // Дневные транзакции фиксируем ДО закрытия недели (платежи недели — на день 6,
  // час 23 — не должны попадать в отчёт конкретного дня).
  const dayTransactions = restaurant.finance.transactions.filter(
    (t) => dayIndex(t.date) === dayIndex(date),
  );
  draft.history.dayLogs.push({
    date,
    hourLogs,
    kpi,
    transactions: dayTransactions,
    reviews,
    events,
    riskChanges,
    warnings,
    supplyErrors: run.supplyErrors > 0 ? run.supplyErrors : undefined,
  });
  while (draft.history.dayLogs.length > 7) draft.history.dayLogs.shift();

  if (pendingCritical.length > 0) {
    draft.activeEvents.push(...pendingCritical);
    // Время всё равно идёт: день прожит, деньги двигались. Раньше критическое
    // событие «замораживало» счётчик дня — повторная симуляция того же дня
    // задваивала выручку. Диалог решения остаётся на паузе до выбора игрока.
  }
  if (draft.day >= 6) {
    // Граница недели: закрытие финансов (зарплата/аренда/налоги/кредиты, BSC,
    // weekStats) — теперь работает и при игре «по дням».
    closeWeek(draft, seed);
    draft.day = 0;
    draft.week += 1;
  } else {
    draft.day += 1;
  }

  const result: DaySimulationResult = {
    date,
    hourLogs,
    transactions: dayTransactions,
    reviews,
    events,
    riskChanges,
    kpi,
    warnings,
    invariantReport,
    emergencyActions: emergency.applied.length > 0 ? [...emergency.applied] : undefined,
    supplyErrors: run.supplyErrors > 0 ? run.supplyErrors : undefined,
  };

  draft.lastDayResult = result;
  return { result, state: draft };
}

/**
 * Пофункциональные нагрузки за день для модели усталости (ТЗ §14.8):
 *  - кухонные роли — ВЗВЕШЕННАЯ загрузка их станций (шеф-повар с весом 0.5
 *    на горячем цехе не выгорает как чистый повар горячего);
 *  - официанты — гостей на официанта;
 *  - хостес/уборщики/посудомойщики — фактический поток против их пропускной
 *    (посудомойщик с машиной — ~60 позиций/час, уборщик — ~45 посадок/час).
 * Берём среднее по 3 busiest часам: одиночный пик не выжигает людей,
 * но устойчивый перегруз обеда/ужина накапливает усталость.
 */
function buildRoleLoads(hourLogs: HourLog[]): Partial<Record<RoleId, number>> {
  const loads: Partial<Record<RoleId, number>> = {};
  const busy = hourLogs.filter((h) => h.seated >= 3);
  const sample = busy.length >= 3 ? busy : hourLogs;
  for (const roleId of ROLE_IDS) {
    const cfg = STAFF_ROLES[roleId];
    const stations = Object.keys(cfg.stationWeights) as StationType[];
    if (roleId === 'waiter') {
      loads[roleId] = peakOf(sample.map((h) => h.waiterLoad));
    } else if (stations.length > 0) {
      // Взвешенная загрузка: Σ(вес роли на станции × загрузка станции).
      loads[roleId] = peakOf(
        sample.map((h) =>
          stations.reduce((s, st) => s + (cfg.stationWeights[st] ?? 0) * (h.stationLoads[st] ?? 0), 0),
        ),
      );
    } else if (roleId === 'hostess') {
      loads[roleId] = peakOf(sample.map((h) => h.seated / 45));
    } else if (roleId === 'cleaner') {
      loads[roleId] = peakOf(sample.map((h) => h.seated / 45));
    } else if (roleId === 'dishwasher') {
      // Посудомойщик с машиной: ~70 «посудных» позиций/час; посуда ≈ 55% позиций
      // (напитки и кофе посуду почти не создают).
      loads[roleId] = peakOf(sample.map((h) => (h.orders * 0.55) / 70));
    }
    // manager — организационная роль: её усталость задают смены (в updateFatigue).
  }
  return loads;
}

/** Среднее по топ-3 часам (пик без одноразовых выбросов). */
function peakOf(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => b - a);
  const top = sorted.slice(0, 3);
  return top.length > 0 ? top.reduce((s, v) => s + v, 0) / top.length : 0;
}
