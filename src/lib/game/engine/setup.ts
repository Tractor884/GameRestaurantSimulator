/**
 * СТАРТОВЫЙ СЦЕНАРИЙ (ТЗ §9) и действия игрока.
 * Открытие: район → помещение → ремонт → оборудование → кредит → меню → штат.
 * Бюджет: 12 млн собственные + кредит до min(20 млн, 1.5 × собственные).
 */
import type {
  EquipmentLevel,
  GameDate,
  GameState,
  PlayerAction,
  PremisesSize,
  RenovationLevel,
  Restaurant,
  RoleId,
  StaffShifts,
  LoanState,
  GameEvent,
  Dish,
} from '../types';
import { DIFFICULTIES } from '../config/difficulty.config';
import { LOCATIONS_MAP, LOCATIONS } from '../config/locations.config';
import {
  PREMISES_SIZES,
  RENOVATION_LEVELS,
  EQUIPMENT_LEVELS,
  EQUIPMENT_COSTS,
  VERANDA,
  ALCOHOL_LICENSE,
} from '../config/premises.config';
import { STAFF_ROLES, ROLE_IDS } from '../config/staffRoles.config';
import { INGREDIENTS_MAP } from '../content/ingredients';
import { DISHES_MAP, STARTER_MENU_IDS } from '../content/dishes';
import { dishOf } from '../content/resolve';
import { annuityPayment, LOANS } from '../config/loans.config';
import { placePurchase, buildAutoOrder } from './inventory';
import { addTransaction, clamp } from './core';
import { EVENT_TEMPLATES_MAP } from '../config/risks.config';

export interface SetupOptions {
  seed: number;
  restaurantName: string;
  locationId: string;
  /** Сложность (ТЗ §36): novice | standard | professional. По умолчанию standard. */
  difficultyId?: string;
  premisesSize: PremisesSize;
  renovation: RenovationLevel;
  loanAmount: number;
  equipment: { kitchen: EquipmentLevel; coffee: EquipmentLevel; hall: EquipmentLevel };
  veranda: boolean;
  alcoholLicense: boolean;
  menuIds?: string[];
  initialCoverDays?: number;
}

/** Дефолтный график смен (сбалансированный старт, калиброван по загрузкам станций).
 * ПОКРЫТИЕ ЛАНЧА: утренние смены официантов/поваров усилены под пик 12–15 ч
 * (раньше 2 официанта на 36 посадок/час давали перегруз 1.9× и выгорание).
 * АУДИТ (диагностика): (1) холодный цех был устойчивым узким местом
 * (топ-3 часа 1.38 при цели 0.85–1.15) — будни утром теперь 3 повара;
 * (2) воскресенье УТРОМ был 0 хостес — при высоком спросе теряли до 200
 * гостей/день (посадка = 0 без хостес) — теперь 1. */
export function defaultSchedule(): Record<RoleId, StaffShifts[]> {
  const mk = (fn: (day: number) => StaffShifts): StaffShifts[] => [0, 1, 2, 3, 4, 5, 6].map(fn);
  return {
    manager: mk(() => ({ morning: 1, evening: 0 })),
    head_chef: mk((d) => (d === 6 ? { morning: 1, evening: 0 } : { morning: 1, evening: 1 })),
    // Будни: 4 утром (ланч-пик 12–15) + 2 вечером; выходные плотнее.
    hot_cook: mk((d) => (d >= 5 ? { morning: 3, evening: 3 } : { morning: 4, evening: 2 })),
    // Холодный цех обслуживает холод И десерты. Зонд почасовых загрузок:
    // пики — вечера Сб/Вс (салатно-закусочный ужин), ланч холодом лёгкий.
    // Будни 2+1, выходные 2+2: ДЕФОРТНЫЙ ГРАФИК НАМЕРЕННО НЕ ОПТИМАЛЕН
    // (аудит §2.4) — игрок видит загрузку станций на экране «График» и может
    // высвободить смены. Полная нагрузка вечерних часов ≈ 0.9–1.15.
    cold_cook: mk((d) => (d >= 5 ? { morning: 2, evening: 2 } : { morning: 2, evening: 1 })),
    prep_cook: mk((d) => (d >= 5 ? { morning: 0, evening: 0 } : { morning: 1, evening: 1 })),
    barista: mk(() => ({ morning: 1, evening: 1 })),
    // 4 официанта утром (ланч-пик), 3–4 вечером (ужин).
    waiter: mk((d) => (d === 4 || d === 5 ? { morning: 4, evening: 4 } : { morning: 4, evening: 3 })),
    hostess: mk(() => ({ morning: 1, evening: 1 })),
    cleaner: mk(() => ({ morning: 1, evening: 1 })),
    dishwasher: mk(() => ({ morning: 1, evening: 1 })),
  };
}

/** Дефолтный штат: ceil(смен в неделю / 5) по ролям. */
export function defaultPools(): Record<RoleId, { count: number; fatigue: number; morale: number; newHires: number }> {
  const schedule = defaultSchedule();
  const pools = {} as Record<RoleId, { count: number; fatigue: number; morale: number; newHires: number }>;
  for (const roleId of ROLE_IDS) {
    const shifts = schedule[roleId].reduce((s, d) => s + d.morning + d.evening, 0);
    pools[roleId] = {
      count: Math.max(1, Math.ceil(shifts / 5)),
      fatigue: 10,
      morale: 70,
      // Все — новички: адаптация 7 дней (ТЗ §14.5).
      newHires: Math.max(1, Math.ceil(shifts / 5)),
    };
  }
  return pools;
}

/** Создание новой игры (визард открытия, ТЗ §9.2). Сложность ТЗ §36 задаётся opts.difficultyId. */
export function createGame(opts: SetupOptions): GameState {
  const loc = LOCATIONS_MAP[opts.locationId] ?? LOCATIONS[1];
  const prem = PREMISES_SIZES[opts.premisesSize];
  // Старые вызовы без difficultyId и битые id → Стандарт (сейвы миграцией не затронуты).
  const diff = DIFFICULTIES[opts.difficultyId ?? 'standard'] ?? DIFFICULTIES.standard;
  const date: GameDate = { week: 1, day: 0, hour: 8 };

  const renovationCost = prem.areaM2 * loc.renovationCostPerM2[opts.renovation];
  const equipCost =
    EQUIPMENT_COSTS[opts.equipment.kitchen].kitchen +
    EQUIPMENT_COSTS[opts.equipment.coffee].coffee +
    EQUIPMENT_COSTS[opts.equipment.hall].hall;
  const rentMonthly = Math.round(prem.areaM2 * loc.rentPerM2);
  const deposit = rentMonthly * loc.depositMonths;
  const utilitiesMonthly = Math.round(prem.areaM2 * loc.utilitiesPerM2);
  const verandaCost = opts.veranda ? VERANDA.setupCost : 0;
  const licenseCost = opts.alcoholLicense ? ALCOHOL_LICENSE.annualCost : 0;

  const loanAmount = clamp(opts.loanAmount, 0, Math.min(LOANS.maxTotalDebt, diff.loanLimitMultiplier * diff.ownerEquity));
  const loan: LoanState = {
    principal: loanAmount,
    remaining: loanAmount,
    annualRate: diff.loanRate,
    termMonths: diff.loanTermMonths,
    payment: annuityPayment(loanAmount, diff.loanRate, diff.loanTermMonths),
    disbursementWeek: 1,
    nextPaymentWeek: 5,
    overduePayments: 0,
  };

  const menuIds = opts.menuIds && opts.menuIds.length >= 12 ? opts.menuIds : STARTER_MENU_IDS;
  const prices: Record<string, number> = {};
  for (const id of menuIds) {
    // createGame: меню стартует только из базового справочника (кастомных ещё нет).
    const dish = DISHES_MAP[id];
    if (dish) prices[id] = dish.recommendedPrice;
  }

  const restaurant: Restaurant = {
    id: 'r1',
    name: opts.restaurantName,
    locationId: loc.id,
    premisesSize: opts.premisesSize,
    areaM2: prem.areaM2,
    seats: prem.seats,
    verandaActive: false,
    verandaSeats: opts.veranda ? VERANDA.seats : 0,
    renovation: opts.renovation,
    rentMonthly,
    depositPaid: deposit,
    utilitiesMonthly,
    menu: { dishes: [...menuIds], prices, stopList: [], customDishes: [] },
    inventory: { batches: [], pendingOrders: [] },
    staff: { pools: defaultPools(), schedule: defaultSchedule() },
    finance: {
      cash: 0,
      transactions: [],
      loans: loanAmount > 0 ? [loan] : [],
      txCounter: 0,
      accrued: { payrollGross: 0, taxProfit: 0, rentPaidWeeks: 0 },
    },
    reputation: {
      rating: 3.9,
      priorRating: 3.9,
      priorReviews: 45,
      reviewCounter: 0,
      windowReviews: [],
    },
    customerMemory: { cohorts: [] },
    marketing: { campaigns: [], cleaningBudget: 45_000, autoPurchase: { enabled: true, coverDays: 2 } },
    licenses: opts.alcoholLicense
      ? { alcohol: { active: true, paidUntil: { week: 53, day: 0, hour: 8 }, annualCost: ALCOHOL_LICENSE.annualCost } }
      : { alcohol: null },
    risks: { sanitary: 15, technical: 20, staff: 18, legal: 10, reputation: 10, financial: 15 },
    equipment: {
      kitchen: { level: opts.equipment.kitchen, wear: 5, value: EQUIPMENT_COSTS[opts.equipment.kitchen].kitchen },
      coffee: { level: opts.equipment.coffee, wear: 5, value: EQUIPMENT_COSTS[opts.equipment.coffee].coffee },
      hall: { level: opts.equipment.hall, wear: 5, value: EQUIPMENT_COSTS[opts.equipment.hall].hall },
    },
    cleanliness: 70,
    comfort: RENOVATION_LEVELS[opts.renovation].comfortBase,
    atmosphere: RENOVATION_LEVELS[opts.renovation].atmosphereBase,
    openHours: { start: 8, end: 23 },
    weekendEnd: 24,
  };

  // ===== ДЕНЬГИ ОТКРЫТИЯ =====
  const state: GameState = {
    version: '1.0.0',
    seed: opts.seed,
    week: 1,
    day: 0,
    phase: 'managing',
    status: 'open',
    difficultyId: diff.id,
    options: { middayPause: true, builtinIllustrations: false, mainView: 'report' },
    restaurant,
    history: {
      dayLogs: [],
      weekStats: [],
      riskHistory: [],
      reviewsAll: 0,
      cumulativeNetProfit: 0,
      positiveOpWeeks: 0,
      lowRatingWeeks: 0,
    },
    activeEvents: [],
    weekResult: null,
    lastDayResult: null,
  };

  addTransaction(restaurant, date, 'other', diff.ownerEquity, 'in', 'Взнос владельца');
  if (loanAmount > 0) {
    addTransaction(restaurant, date, 'loan_disbursement', loanAmount, 'in', 'Кредит на открытие');
  }
  addTransaction(restaurant, date, 'renovation', renovationCost, 'out', `Ремонт: ${RENOVATION_LEVELS[opts.renovation].label}`);
  addTransaction(restaurant, date, 'equipment', equipCost, 'out', 'Оборудование (кухня, кофе, зал)');
  addTransaction(restaurant, date, 'deposit', deposit, 'out', `Депозит по аренде (${loc.depositMonths} мес)`);
  if (verandaCost > 0) {
    addTransaction(restaurant, date, 'equipment', verandaCost, 'out', 'Летняя веранда: установка');
    restaurant.verandaActive = true;
  }
  if (licenseCost > 0) {
    addTransaction(restaurant, date, 'license', licenseCost, 'out', 'Лицензия на алкоголь (год)');
  }

  // ===== СТАРТОВЫЕ ЗАКУПКИ =====
  // Автозаказ на 4 дня работы с доставкой «до открытия» (стартовый сток).
  const expectedGuests = loc.baseTraffic * 0.75; // 75% от потенциала — рабочая оценка
  const autoOrder = buildAutoOrder(restaurant, opts.initialCoverDays ?? 4, expectedGuests);
  let purchases = 0;
  for (const item of autoOrder) {
    const res = placePurchase(restaurant, item.ingredientId, item.quantity, false, date);
    purchases += res.paid;
  }
  if (purchases > 0) {
    addTransaction(restaurant, date, 'purchase', purchases, 'out', 'Стартовая закупка продуктов');
    // Стартовый сток доставлен сразу (симулируем «доставку до открытия»).
    for (const order of restaurant.inventory.pendingOrders) {
      const ing = INGREDIENTS_MAP[order.ingredientId];
      restaurant.inventory.batches.push({
        ingredientId: order.ingredientId,
        quantity: order.quantity,
        unitCost: order.unitCost,
        arrivedAt: { ...date },
        expiresAt: {
          week: 1 + Math.ceil(ing.shelfLifeDays / 7),
          day: 0,
          hour: 8,
        },
      });
    }
    restaurant.inventory.pendingOrders = [];
  }

  return state;
}

/* ============================= ДЕЙСТВИЯ ИГРОКА ============================= */

export interface ActionResult {
  ok: boolean;
  message: string;
}

function dateNow(state: GameState): GameDate {
  return { week: state.week, day: state.day, hour: 8 };
}

export function toggleMenuDish(state: GameState, dishId: string): ActionResult {
  const r = state.restaurant!;
  const dish = dishOf(r.menu, dishId);
  if (!dish) return { ok: false, message: 'Блюдо не найдено' };
  const idx = r.menu.dishes.indexOf(dishId);
  if (idx >= 0) {
    r.menu.dishes.splice(idx, 1);
    return { ok: true, message: `«${dish.name}» убрано из меню` };
  }
  r.menu.dishes.push(dishId);
  if (!r.menu.prices[dishId]) r.menu.prices[dishId] = dish.recommendedPrice;
  return { ok: true, message: `«${dish.name}» добавлено в меню` };
}

export function setDishPrice(state: GameState, dishId: string, price: number): ActionResult {
  const r = state.restaurant!;
  const dish = dishOf(r.menu, dishId);
  if (!dish) return { ok: false, message: 'Блюдо не найдено' };
  if (price < dish.recommendedPrice * 0.5 || price > dish.recommendedPrice * 1.5) {
    return { ok: false, message: 'Цена вне допустимого диапазона (±50% от рекомендуемой)' };
  }
  r.menu.prices[dishId] = Math.round(price);
  return { ok: true, message: 'Цена обновлена' };
}

export function toggleStopList(state: GameState, dishId: string): ActionResult {
  const r = state.restaurant!;
  const idx = r.menu.stopList.indexOf(dishId);
  if (idx >= 0) {
    r.menu.stopList.splice(idx, 1);
    return { ok: true, message: 'Блюдо возвращено в продажу' };
  }
  r.menu.stopList.push(dishId);
  return { ok: true, message: 'Блюдо в стоп-листе' };
}

/** Импорт НОВЫХ блюд (ТЗ §35.3–35.4): кастомные блюда попадают в состояние
 *  (menu.customDishes) и сразу включаются в меню по рекомендуемой цене.
 *  Дубликаты среди кастомных — обновление (replace). */
export function importCustomDishes(state: GameState, dishes: Dish[]): ActionResult {
  const r = state.restaurant!;
  if (dishes.length === 0) return { ok: false, message: 'Нет валидных блюд для импорта' };
  if (!r.menu.customDishes) r.menu.customDishes = [];
  let added = 0;
  let updated = 0;
  for (const dish of dishes) {
    const idx = r.menu.customDishes.findIndex((d) => d.id === dish.id);
    if (idx >= 0) {
      r.menu.customDishes[idx] = dish;
      updated++;
    } else {
      if (r.menu.customDishes.length >= 40) break; // лимит состояния
      r.menu.customDishes.push(dish);
      added++;
      r.menu.dishes.push(dish.id);
      if (!r.menu.prices[dish.id]) r.menu.prices[dish.id] = dish.recommendedPrice;
    }
  }
  const parts: string[] = [];
  if (added > 0) parts.push(`добавлено ${added}`);
  if (updated > 0) parts.push(`обновлено ${updated}`);
  return {
    ok: added + updated > 0,
    message: parts.length > 0 ? `Импорт блюд: ${parts.join(', ')}` : 'Лимит кастомных блюд (40) достигнут',
  };
}

export function purchaseIngredients(
  state: GameState,
  items: { ingredientId: string; quantity: number }[],
  urgent: boolean,
): ActionResult {
  const r = state.restaurant!;
  let total = 0;
  const date = dateNow(state);
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const res = placePurchase(r, item.ingredientId, item.quantity, urgent, date);
    total += res.paid;
  }
  if (total <= 0) return { ok: false, message: 'Пустой заказ' };
  if (r.finance.cash < total) return { ok: false, message: 'Недостаточно денег на закупку' };
  addTransaction(r, date, 'purchase', total, 'out',
    urgent ? 'Срочная закупка (+35%)' : 'Закупка продуктов');
  return { ok: true, message: `Закупка на ${Math.round(total).toLocaleString('ru-RU')} ₽` };
}

export function hireStaff(state: GameState, roleId: RoleId, count: number): ActionResult {
  const r = state.restaurant!;
  const pool = r.staff.pools[roleId];
  pool.count += count;
  pool.newHires += count;
  return { ok: true, message: `Нанято: ${STAFF_ROLES[roleId].name} ×${count} (адаптация 7 дней)` };
}

export function fireStaff(state: GameState, roleId: RoleId, count: number): ActionResult {
  const r = state.restaurant!;
  const pool = r.staff.pools[roleId];
  if (pool.count - count < 0) return { ok: false, message: 'Недостаточно сотрудников' };
  pool.count -= count;
  return { ok: true, message: `Уволено: ${STAFF_ROLES[roleId].name} ×${count}` };
}

export function setScheduleShifts(
  state: GameState,
  roleId: RoleId,
  day: number,
  shifts: StaffShifts,
): ActionResult {
  const r = state.restaurant!;
  r.staff.schedule[roleId][day] = { morning: Math.max(0, shifts.morning), evening: Math.max(0, shifts.evening) };
  return { ok: true, message: 'График обновлён' };
}

export function startCampaign(
  state: GameState,
  channelId: string,
  weeklyBudget: number,
  durationWeeks: number,
): ActionResult {
  const r = state.restaurant!;
  r.marketing.campaigns = r.marketing.campaigns.filter((c) => c.channelId !== channelId);
  r.marketing.campaigns.push({
    channelId,
    weeklyBudget: Math.round(weeklyBudget),
    startWeek: state.week,
    durationWeeks,
  });
  return { ok: true, message: 'Кампания запущена' };
}

export function stopCampaign(state: GameState, channelId: string): ActionResult {
  const r = state.restaurant!;
  r.marketing.campaigns = r.marketing.campaigns.filter((c) => c.channelId !== channelId);
  return { ok: true, message: 'Кампания остановлена' };
}

export function setCleaningBudget(state: GameState, weekly: number): ActionResult {
  const r = state.restaurant!;
  r.marketing.cleaningBudget = Math.max(0, Math.round(weekly));
  return { ok: true, message: 'Бюджет клининга обновлён' };
}

export function buyEquipment(state: GameState, zone: 'kitchen' | 'coffee' | 'hall', level: EquipmentLevel): ActionResult {
  const r = state.restaurant!;
  const cost = EQUIPMENT_COSTS[level][zone];
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
  const z = r.equipment[zone];
  addTransaction(r, dateNow(state), 'equipment', cost, 'out', `Оборудование: ${EQUIPMENT_LEVELS[level].label} (${zone === 'kitchen' ? 'кухня' : zone === 'coffee' ? 'кофе' : 'зал'})`);
  z.level = level;
  z.wear = 5;
  z.value = cost;
  return { ok: true, message: 'Оборудование установлено' };
}

export function repairEquipment(state: GameState, zone: 'kitchen' | 'coffee' | 'hall'): ActionResult {
  const r = state.restaurant!;
  const z = r.equipment[zone];
  if (z.wear < 15) return { ok: false, message: 'Износ низкий — ремонт не нужен' };
  const cost = Math.round(z.value * (z.wear / 100) * 0.4);
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
  addTransaction(r, dateNow(state), 'repair', cost, 'out', `Ремонт оборудования (${zone === 'kitchen' ? 'кухня' : zone === 'coffee' ? 'кофе' : 'зал'})`);
  z.wear = Math.max(0, z.wear - 40);
  return { ok: true, message: 'Оборудование отремонтировано' };
}

export function deepCleaning(state: GameState): ActionResult {
  const r = state.restaurant!;
  const cost = 120_000;
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
  addTransaction(r, dateNow(state), 'maintenance', cost, 'out', 'Генеральная уборка');
  r.cleanliness = clamp(r.cleanliness + 18, 0, 100);
  r.risks.sanitary = clamp(r.risks.sanitary - 15, 0, 100);
  return { ok: true, message: 'Генеральная уборка проведена: −15 санитарного риска' };
}

export function buyAlcoholLicense(state: GameState): ActionResult {
  const r = state.restaurant!;
  if (r.licenses.alcohol?.active) return { ok: false, message: 'Лицензия уже активна' };
  const cost = ALCOHOL_LICENSE.annualCost;
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
  addTransaction(r, dateNow(state), 'license', cost, 'out', 'Лицензия на алкоголь (год)');
  r.licenses.alcohol = {
    active: true,
    paidUntil: { week: state.week + 52, day: 0, hour: 8 },
    annualCost: ALCOHOL_LICENSE.annualCost,
  };
  return { ok: true, message: 'Лицензия получена: алкоголь доступен' };
}

export function repayLoan(state: GameState, loanIndex: number, amount: number): ActionResult {
  const r = state.restaurant!;
  const loan = r.finance.loans[loanIndex];
  if (!loan) return { ok: false, message: 'Кредит не найден' };
  const pay = Math.min(amount, loan.remaining);
  if (pay <= 0) return { ok: false, message: 'Долг уже закрыт' };
  if (r.finance.cash < pay) return { ok: false, message: 'Недостаточно денег' };
  addTransaction(r, dateNow(state), 'loan_payment', Math.round(pay), 'out', 'Досрочное погашение кредита');
  loan.remaining -= Math.round(pay);
  if (loan.remaining <= 1) {
    loan.remaining = 0;
    return { ok: true, message: 'Кредит полностью закрыт!' };
  }
  return { ok: true, message: 'Досрочное погашение принято' };
}

/** Решение критического события (ТЗ §20.4): выбор варианта реакции. */
export function resolveEvent(state: GameState, eventId: string, resolutionIndex: number): ActionResult {
  const event = state.activeEvents.find((e) => e.id === eventId);
  if (!event) return { ok: false, message: 'Событие не найдено' };
  const template = EVENT_TEMPLATES_MAP[event.templateId];
  if (!template?.resolutions) return { ok: false, message: 'Нет вариантов решения' };
  const res = template.resolutions[resolutionIndex];
  if (!res) return { ok: false, message: 'Неверный вариант' };
  const r = state.restaurant!;

  if (res.cost > 0) {
    if (r.finance.cash < res.cost) return { ok: false, message: 'Недостаточно денег на этот вариант' };
    addTransaction(r, event.date, 'other', res.cost, 'out', `Решение события: ${event.title}`);
  }
  const delta = res.effectDelta;
  if (delta.cash && delta.cash !== 0) {
    if (delta.cash > 0) addTransaction(r, event.date, 'other', delta.cash, 'in', event.title);
    else addTransaction(r, event.date, 'fine', -delta.cash, 'out', event.title);
  }
  if (delta.riskDelta) {
    for (const [k, v] of Object.entries(delta.riskDelta)) {
      const key = k as keyof typeof r.risks;
      r.risks[key] = clamp(r.risks[key] + (v ?? 0), 0, 100);
    }
  }
  if (delta.demandBoost) {
    event.effect.demandBoost = delta.demandBoost;
    event.effect.demandBoostWeeks = delta.demandBoostWeeks ?? 1;
  }
  event.resolved = true;
  event.resolutionNote = res.note;
  state.activeEvents = state.activeEvents.filter((e) => e.id !== eventId);
  return { ok: true, message: res.note };
}

/** Автозаказ: рекомендованный объём продуктов на N дней.
 * Ожидаемый трафик берём из факта прошлой недели, иначе — 75% потенциала района. */
export function autoOrderAction(state: GameState, days: number): ActionResult {
  const r = state.restaurant!;
  const loc = LOCATIONS_MAP[r.locationId];
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];
  const expected = lastWeek && lastWeek.guests > 0
    ? (lastWeek.guests / 7) * 1.25
    : loc.baseTraffic * 0.85;
  const order = buildAutoOrder(r, days, expected);
  if (order.length === 0) return { ok: false, message: 'Склад укомплектован' };
  return purchaseIngredients(state, order, false);
}

/** Переключение автозаказа «завхоза» (ежедневная дозакупка на старте дня). */
export function setAutoPurchase(state: GameState, enabled: boolean, coverDays: number): ActionResult {
  const r = state.restaurant!;
  r.marketing.autoPurchase = { enabled, coverDays: clamp(coverDays, 1, 5) };
  return {
    ok: true,
    message: enabled
      ? `Автозаказ включён: пополнение склада каждое утро на ${coverDays} дн.`
      : 'Автозаказ выключен: следите за складом вручную',
  };
}
