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
  ProcurementPolicyId,
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
import { addTransaction, clamp, dayIndex } from './core';
import { EVENT_TEMPLATES_MAP } from '../config/risks.config';
import { REVIEWS_V2 } from '../config/reviews.config';
import { PROCUREMENT, PROC_LABELS } from '../config/procurement.config';
import { DIVIDENDS } from '../config/dividends.config';
import { LANDLORD } from '../config/landlord.config';
import { EQUIPMENT_SERVICE } from '../config/equipmentService.config';
import { HACCP } from '../config/haccp.config';
import { deriveRng, hashSeed } from '../rng';
import { monthOfDay, dayOfYear, MONTHS_RU, MONTHS_RU_GEN, MONTHS_RU_PREP } from '../config/demandProfiles.config';
import { noteHired, noteFired } from './staff';
import { initLandlordState, applyLandlordResolution } from './landlord';
import { applyDividendDecision, applyOwnerForcePay, applyOwnerRefuse } from './dividends';
import { applyDilemmaResolution } from './dilemmas';
import { quitStaffRole } from './endday';
import { hireCostMult } from './permanent';
import { noteDishAdded, noteDishRemoved } from './menufatigue';

export interface SetupOptions {
  seed: number;
  restaurantName: string;
  /** Ник игрока (Task 28): 2–24 символа, обязателен в визарде; идёт в рейтинг. */
  nick?: string;
  locationId: string;
  /** Сложность (ТЗ §36): novice | standard | professional. По умолчанию standard. */
  difficultyId?: string;
  premisesSize: PremisesSize;
  renovation: RenovationLevel;
  loanAmount: number;
  equipment: { kitchen: EquipmentLevel; coffee: EquipmentLevel; hall: EquipmentLevel };
  /** @deprecated (26-b): веранда больше не покупается в визарде — она стала
   *  сезонной лицензией на вкладке «Лицензии» (buyVerandaPermit, апрель+).
   *  Поле оставлено опциональным: его передают старые скрипты scripts/*.ts. */
  veranda?: boolean;
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
    // Секретарь — админ-роль: по умолчанию НЕ в графике (и не нанят).
    // Наймите в «Персонале» и назначьте смены в «Графике».
    secretary: mk(() => ({ morning: 0, evening: 0 })),
  };
}

/** Дефолтный штат: ceil(смен в неделю / 5) по ролям.
 *  Роли без запланированных смен (секретарь) стартуют НЕ нанятыми. */
export function defaultPools(): Record<RoleId, { count: number; fatigue: number; morale: number; newHires: number }> {
  const schedule = defaultSchedule();
  const pools = {} as Record<RoleId, { count: number; fatigue: number; morale: number; newHires: number }>;
  for (const roleId of ROLE_IDS) {
    const shifts = schedule[roleId].reduce((s, d) => s + d.morning + d.evening, 0);
    const headcount = shifts > 0 ? Math.max(1, Math.ceil(shifts / 5)) : 0;
    pools[roleId] = {
      count: headcount,
      fatigue: headcount > 0 ? 10 : 0,
      morale: 70,
      // Все — новички: адаптация 7 дней (ТЗ §14.5).
      newHires: headcount,
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
    // 26-b: веранда — СЕЗОННАЯ лицензия (покупается на «Лицензиях» с апреля),
    // на старте её нет никогда (opts.veranda из визарда больше не работает).
    verandaActive: false,
    verandaSeats: 0,
    renovation: opts.renovation,
    rentMonthly,
    depositPaid: deposit,
    utilitiesMonthly,
    // БАЛ-v2 §6 (v8): цепочка арендодателя — первый разговор на нед 8–23,
    // детерминировано от seed (отдельный rng-поток, существующие броски не сдвинуты).
    landlord: initLandlordState(
      rentMonthly,
      LANDLORD.firstTalkMin +
        Math.floor(deriveRng(hashSeed(opts.seed, 0), 'landlord').next() * LANDLORD.firstTalkSpread),
    ),
    // БАЛ-v2 §13 (v8): доверие владельца и дивиденды.
    // БАЛ-v2 §15 (v8): перманентные эффекты дилемм (пусто на старте).
    permanentEffects: {},
    lastDilemmaWeek: 0,
    fatigueHighWeeks: 0,
    ratingHighWeeks: 0,
    leverageHighWeeks: 0,
    // v9: санитарная система HACCP — открытие считается аудитом
    // (окно соответствия 28 дн с первого дня, дальше — решения игрока).
    haccp: { lastAuditDay: 0, audits: 0 },
    menu: {
      dishes: [...menuIds],
      prices,
      stopList: [],
      customDishes: [],
      // v10 §14: возраст блюд — стартовое меню «новое» (недели 0–3: +6% новизны).
      dishAges: Object.fromEntries(menuIds.map((id) => [id, 0] as const)),
      offSince: {},
    },
    inventory: { batches: [], pendingOrders: [], procurement: { policy: 'standard', pendingSwitch: null }, supplyErrorsWeek: 0 },
    staff: { pools: defaultPools(), schedule: defaultSchedule() },
    finance: {
      cash: 0,
      transactions: [],
      loans: loanAmount > 0 ? [loan] : [],
      txCounter: 0,
      accrued: { payrollGross: 0, taxProfit: 0, rentPaidWeeks: 0 },
      ownerTrust: DIVIDENDS.trustStart,
      dividends: { history: [], lastProposal: null, quarterStartCash: 0 },
      // v10 §10: инфляция — индексы 1.0 на старте, квартальные шаги в closeWeek.
      inflation: { foodIdx: 1, wageIdx: 1, utilIdx: 1, steps: 0 },
    },
    reputation: {
      rating: 3.9,
      priorRating: 3.9,
      priorReviews: 45,
      reviewCounter: 0,
      windowReviews: [],
      unansweredNeg: 0,
    },
    customerMemory: { cohorts: [] },
    marketing: { campaigns: [], cleaningBudget: 45_000, autoPurchase: { enabled: true, coverDays: 2 } },
    licenses: opts.alcoholLicense
      ? { alcohol: { active: true, paidUntil: { week: 53, day: 0, hour: 8 }, annualCost: ALCOHOL_LICENSE.annualCost } }
      : { alcohol: null },
    risks: { sanitary: 15, technical: 20, staff: 18, legal: 10, reputation: 10, financial: 15 },
    equipment: {
      kitchen: { level: opts.equipment.kitchen, wear: 5, value: EQUIPMENT_COSTS[opts.equipment.kitchen].kitchen, lastServicedAt: 0 },
      coffee: { level: opts.equipment.coffee, wear: 5, value: EQUIPMENT_COSTS[opts.equipment.coffee].coffee, lastServicedAt: 0 },
      hall: { level: opts.equipment.hall, wear: 5, value: EQUIPMENT_COSTS[opts.equipment.hall].hall, lastServicedAt: 0 },
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
    // Task 28: ник для рейтинга (старые сейвы/скрипты без ника → undefined,
    // финальный экран предложит ввести ник перед отправкой результата).
    playerNick: opts.nick?.trim() || undefined,
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
  if (licenseCost > 0) {
    addTransaction(restaurant, date, 'license', licenseCost, 'out', 'Лицензия на алкоголь (год)');
  }

  // БАЛ-v2 §13 (v8): касса на начало 1-го квартала — точка отсчёта FCF.
  restaurant.finance.dividends!.quarterStartCash = restaurant.finance.cash;

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
    // v10 §14: запоминаем неделю снятия — вернувшись после 4+ недель,
    // блюдо снова станет «новым» (ротация); быстрый возврат не сбрасывает возраст.
    noteDishRemoved(r.menu, dishId, state.week);
    return { ok: true, message: `«${dish.name}» убрано из меню (верните через 4+ недели — станет новинкой)` };
  }
  r.menu.dishes.push(dishId);
  if (!r.menu.prices[dishId]) r.menu.prices[dishId] = dish.recommendedPrice;
  // v10 §14: возраст блюда — по правилам ротации.
  const isRotation = noteDishAdded(r.menu, dishId, state.week);
  return {
    ok: true,
    message: isRotation
      ? `«${dish.name}» — новинка меню (+6% спроса первые недели)`
      : `«${dish.name}» добавлено в меню`,
  };
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
      // v10 §14: новое блюдо — новинка (+6% спроса первые недели).
      noteDishAdded(r.menu, dish.id, state.week);
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

/** Стоимость найма одного сотрудника роли: базово 0 (свои каналы), в окне
 *  кадрового кризиса (дилемма «держаться», §15) — хедхантинг ×1,5. */
export function staffHiringCost(state: GameState, roleId: RoleId, count: number): number {
  const r = state.restaurant!;
  const per = 30_000 * hireCostMult(r, state.week);
  return Math.round(per * count);
}

export function hireStaff(state: GameState, roleId: RoleId, count: number): ActionResult {
  const r = state.restaurant!;
  const pool = r.staff.pools[roleId];
  // ДИЛЕММА «Кризис» (держаться, §15): в окне кризиса персонал ищут через
  // агентства — подбор платный (30 тыс ₽ × hireMult за человека).
  const cost = staffHiringCost(state, roleId, count);
  if (cost > 0) {
    if (r.finance.cash < cost) return { ok: false, message: `Недостаточно денег на подбор (${cost.toLocaleString('ru-RU')} ₽)` };
    addTransaction(
      r,
      dateNow(state),
      'other',
      cost,
      'out',
      `Подбор персонала: ${STAFF_ROLES[roleId].name} ×${count} (агентство, окно кризиса)`,
    );
  }
  pool.count += count;
  pool.newHires += count;
  // ТЕКУЧЕСТЬ (26-b): найм в счётчик (KPI «Персонал»).
  noteHired(r, count);
  return {
    ok: true,
    message: `Нанято: ${STAFF_ROLES[roleId].name} ×${count} (адаптация 7 дней)${cost > 0 ? ` — подбор ${cost.toLocaleString('ru-RU')} ₽` : ''}`,
  };
}

export function fireStaff(state: GameState, roleId: RoleId, count: number): ActionResult {
  const r = state.restaurant!;
  const pool = r.staff.pools[roleId];
  if (pool.count - count < 0) return { ok: false, message: 'Недостаточно сотрудников' };
  pool.count -= count;
  // ТЕКУЧЕСТЬ (26-b): увольнение игроком в счётчик (KPI «Персонал»).
  noteFired(r, count);
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
  // Новое оборудование = обслуженное: окно профилактики стартует с монтажа.
  z.lastServicedAt = dayIndex(dateNow(state));
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
  // Ремонт включает сервисное обслуживание: окно профилактики обновляется.
  z.lastServicedAt = dayIndex(dateNow(state));
  return { ok: true, message: 'Оборудование отремонтировано' };
}

/** ПРОФИЛАКТИКА ОБОРУДОВАНИЯ (v8, запрос пользователя): плановое ТО зоны.
 *  ДЕШЕВЛЕ ремонта (8% стоимости против стоимости×износ×40%), работает
 *  на перед: износ −12 + окно защиты 28 дн (износ ×0,5, поломки ×0,55).
 *  Долгое отсутствие ТО (56+ дн) — обратный эффект: износ ×1,3, поломки ×1,6. */
export function serviceEquipment(state: GameState, zone: 'kitchen' | 'coffee' | 'hall'): ActionResult {
  const r = state.restaurant!;
  const z = r.equipment[zone];
  const cost = Math.max(20_000, Math.round(z.value * EQUIPMENT_SERVICE.costShare));
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег на ТО' };
  const zoneName = zone === 'kitchen' ? 'кухня' : zone === 'coffee' ? 'кофе' : 'зал';
  addTransaction(
    r,
    dateNow(state),
    'maintenance',
    cost,
    'out',
    `Профилактическое обслуживание: ${zoneName} (инженер, регламент, расходники)`,
  );
  z.wear = Math.max(0, z.wear - EQUIPMENT_SERVICE.wearReduction);
  z.lastServicedAt = dayIndex(dateNow(state));
  r.risks.technical = clamp(r.risks.technical - EQUIPMENT_SERVICE.techRiskDrop, 0, 100);
  return {
    ok: true,
    message: `ТО проведено (${zoneName}): износ −${EQUIPMENT_SERVICE.wearReduction}, защита от поломок на ${EQUIPMENT_SERVICE.protectionDays} дн`,
  };
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

/** Аудит HACCP (v9): система санитарного контроля (критические точки —
 *  приёмка поставок, температурные журналы, ротация запасов, гигиена
 *  персонала). Дешевле генеральной уборки и работает «на систему»:
 *  − 35 000 ₽ разово (лаборант + обучение журналам);
 *  − санриск −6 сразу + окно соответствия 28 дн (цель санриска ×0,75);
 *  − без аудита 56+ дней — обратный эффект (цель ×1,3: журналы брошены). */
export function haccpAudit(state: GameState): ActionResult {
  const r = state.restaurant!;
  if (r.finance.cash < HACCP.auditCost) return { ok: false, message: 'Недостаточно денег на аудит' };
  addTransaction(
    r,
    dateNow(state),
    'maintenance',
    HACCP.auditCost,
    'out',
    `Аудит HACCP №${(r.haccp?.audits ?? 0) + 1}: лаборант, журналы, обучение персонала`,
  );
  r.haccp = { lastAuditDay: dayIndex(dateNow(state)), audits: (r.haccp?.audits ?? 0) + 1 };
  r.risks.sanitary = clamp(r.risks.sanitary - HACCP.riskDrop, 0, 100);
  return {
    ok: true,
    message: `Аудит HACCP пройден: санриск −${HACCP.riskDrop}, окно соответствия ${HACCP.protectionDays} дн`,
  };
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

/* ====================== СЕЗОННАЯ ЛЕТНЯЯ ВЕРАНДА (26-b) ====================== */

/** Рабочих месяцев сезона осталось при покупке в boughtMonth
 *  (апрель → 5 … август → 1, сентябрь+ → 0: сезон пропущен). */
export function verandaSeasonMonths(boughtMonth: number): number {
  return Math.max(0, VERANDA.seasonLastMonth - boughtMonth);
}

/** Покупка разрешения и установка веранды (вкладка «Лицензии»).
 *  Разрешение продаётся с АПРЕЛЯ; веранда работает со СЛЕДУЮЩЕГО месяца
 *  после покупки по СЕНТЯБРЬ (куплено в апреле → 5 рабочих месяцев).
 *  Фиксированная цена + сокращающийся сезон = ранние зарабатывают,
 *  опоздавшие не окупаются (сентябрь покупаем, но предупреждаем — игрок
 *  имеет право на ошибку). */
export function buyVerandaPermit(state: GameState): ActionResult {
  const r = state.restaurant!;
  const month = monthOfDay(dayOfYear(state.week, state.day));
  if (r.licenses.veranda) return { ok: false, message: 'Разрешение на веранду уже получено' };
  if (month < VERANDA.permitFromMonth) {
    return { ok: false, message: `Разрешение продаётся с апреля (сейчас ${MONTHS_RU[month - 1]})` };
  }
  if (r.finance.cash < VERANDA.setupCost) {
    return { ok: false, message: `Недостаточно денег: нужно ${VERANDA.setupCost.toLocaleString('ru-RU')} ₽` };
  }
  addTransaction(r, dateNow(state), 'license', VERANDA.setupCost, 'out', 'Летняя веранда: разрешение и установка');
  r.licenses.veranda = { boughtWeek: state.week, boughtMonth: month };
  r.verandaSeats = VERANDA.seats;
  const openMonth = Math.min(12, month + 1);
  const workMonths = verandaSeasonMonths(month);
  if (workMonths <= 0) {
    // Куплено в сентябре (или позже): веранду уже не окупить — но не запрещаем.
    return {
      ok: true,
      message: `Разрешение получено, но веранда откроется только в ${MONTHS_RU_PREP[openMonth - 1]} — сезон уже пропущен, деньги потрачены зря`,
    };
  }
  const monthsWord = workMonths === 1 ? 'рабочий месяц' : workMonths >= 5 ? 'рабочих месяцев' : 'рабочих месяца';
  return {
    ok: true,
    message: `Разрешение получено: веранда заработает с ${MONTHS_RU_GEN[openMonth - 1]} (${workMonths} ${monthsWord} сезона)`,
  };
}

/** Демонтаж веранды «по погоде» с вкладки «Лицензии» (с октября).
 *  Если висит нерешённое событие veranda_teardown — закрываем его
 *  заранее (игрок сделал то же самое своими руками). */
export function dismantleVeranda(state: GameState): ActionResult {
  const r = state.restaurant!;
  const permit = r.licenses.veranda;
  if (!permit) return { ok: false, message: 'Веранда не установлена' };
  if (permit.removed) return { ok: false, message: 'Веранда уже демонтирована' };
  if (permit.spoiled) return { ok: false, message: 'Поздно: мебель и оборудование уже испорчены' };
  const month = monthOfDay(dayOfYear(state.week, state.day));
  if (month < VERANDA.seasonLastMonth + 1) {
    return { ok: false, message: 'Демонтаж по погоде возможен с октября' };
  }
  if (r.finance.cash < VERANDA.removalCost) {
    return { ok: false, message: `Недостаточно денег на демонтаж (${VERANDA.removalCost.toLocaleString('ru-RU')} ₽)` };
  }
  addTransaction(r, dateNow(state), 'other', VERANDA.removalCost, 'out', 'Демонтаж веранды');
  permit.removed = true;
  permit.removedWeek = state.week;
  r.verandaActive = false;
  // Критическое событие veranda_teardown (если висит) закрывается руками игрока.
  const pending = state.activeEvents.find((e) => e.templateId === 'veranda_teardown' && !e.resolved);
  if (pending) {
    pending.resolved = true;
    pending.resolutionNote = 'Демонтировано заранее с экрана Лицензии';
    state.activeEvents = state.activeEvents.filter((e) => e.id !== pending.id);
    journalResolved(state, pending);
  }
  return {
    ok: true,
    message: `Веранда демонтирована за ${VERANDA.removalCost.toLocaleString('ru-RU')} ₽ — мебель и оборудование сохранены до следующего сезона`,
  };
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

/** Решение события (ТЗ §20.4, ЕДИНАЯ СИСТЕМА «СОБЫТИЯ = ДИЛЕММЫ»):
 *  тонкая обёртка — находит нерешённое событие в activeEvents и делегирует
 *  ядру применения applyEventResolution. ДИНАМИЧЕСКИЕ РЕЗОЛЮЦИИ (v8):
 *  системные события (дилеммы §15, дивиденды §13, арендодатель §6, уход
 *  шефа) несут собственные варианты — они приоритетнее шаблона; спец-теги
 *  (dilemma/dividend/landlord/…) включают собственную логику применения. */
export function resolveEvent(state: GameState, eventId: string, resolutionIndex: number): ActionResult {
  const event = state.activeEvents.find((e) => e.id === eventId);
  if (!event) return { ok: false, message: 'Событие не найдено' };
  if (event.resolved) return { ok: false, message: 'Событие уже решено' };
  return applyEventResolution(state, event, resolutionIndex, { auto: false });
}

/** ЯДРО применения резолюции события (вызывается решением игрока и
 *  авто-закрытием просрочки — autoResolveOverdueEvents).
 *
 *  opts.auto: ветка выбрана системой по истечении дедлайна. Отличия:
 *   - НЕ отказываем из-за нехватки кассы: платим min(cost, cash)
 *     (касса не уходит в минус), в заметку события добавляется
 *     «(денег хватило не на всё)»;
 *   - ветки без спец-логики применяются как обычно (generic-ветка
 *     расширена staffQuit/equipmentBoost/demand-носителем).
 *  Деньги — только через addTransaction (инвариант движка). */
export function applyEventResolution(
  state: GameState,
  event: GameEvent,
  resolutionIndex: number,
  opts: { auto?: boolean } = {},
): ActionResult {
  const auto = opts.auto === true;
  const dynamicRes = event.resolutions;
  const template = EVENT_TEMPLATES_MAP[event.templateId];
  const options = dynamicRes ?? template?.resolutions;
  const res = options?.[resolutionIndex];
  if (!res) return { ok: false, message: 'Неверный вариант' };
  const r = state.restaurant!;

  // Оплата платной ветки. Ручное решение: кассы не хватает — отказ.
  // Авто-решение (просрочка): платим что есть, помечаем shortPay.
  let shortPay = false;
  const payBranchCost = (label: string): boolean => {
    if (res.cost > 0) {
      if (auto) {
        const pay = Math.min(res.cost, Math.max(0, r.finance.cash));
        if (pay < res.cost) shortPay = true;
        if (pay > 0) addTransaction(r, event.date, 'other', pay, 'out', label);
      } else {
        if (r.finance.cash < res.cost) return false;
        addTransaction(r, event.date, 'other', res.cost, 'out', label);
      }
    }
    return true;
  };
  /** Финализация: пометить решённым, записать заметку, убрать из активных
   *  и сохранить в журнал решённых (история на экране «События»). */
  const closeEvent = (note: string, message?: string): ActionResult => {
    event.resolved = true;
    event.resolutionNote = shortPay ? `${note} (денег хватило не на всё)` : note;
    state.activeEvents = state.activeEvents.filter((e) => e.id !== event.id);
    journalResolved(state, event);
    return { ok: true, message: message ?? event.resolutionNote };
  };

  // ===== СПЕЦ-ВЕТКИ СИСТЕМНЫХ СОБЫТИЙ (полная логика до generic-обработки) =====

  // Дивиденды (§13): платёж идёт типом 'dividend' и может быть ограничен кассой.
  const dividendAction = res.dividend;
  if (dividendAction) {
    if (!auto && res.cost > 0 && r.finance.cash < Math.min(res.cost, 100_000)) {
      return { ok: false, message: 'Недостаточно денег на этот вариант' };
    }
    const out = applyDividendDecision(state, event, dividendAction.fraction);
    if (!out.ok) return out;
    return closeEvent(out.message);
  }
  // «Разговор с владельцем»: принудительная выплата доли кассы.
  const forcePayAction = res.ownerForcePay;
  if (forcePayAction) {
    const out = applyOwnerForcePay(state, event, forcePayAction.cashShare);
    if (!out.ok) return out;
    return closeEvent(out.message);
  }
  // «Разговор с владельцем»: отказ.
  const ownerRefuseAction = res.ownerRefuse;
  if (ownerRefuseAction) {
    const out = applyOwnerRefuse(state, event, ownerRefuseAction.trust, ownerRefuseAction.risk);
    if (!out.ok) return out;
    return closeEvent(out.message);
  }
  // Арендодатель (§6): шаги индексации/отказ/ультиматум/переезд.
  const landlordAction = res.landlord;
  if (landlordAction) {
    const note = applyLandlordResolution(state, landlordAction, event.date.week);
    return closeEvent(note);
  }
  // СЕЗОННАЯ ВЕРАНДА (26-b): демонтаж вовремя / оставить до весны.
  // Спец-тег включает логику порчи мебели и юр. риска «без разрешения».
  const verandaAction = res.veranda;
  if (verandaAction) {
    const permit = r.licenses.veranda;
    if (!permit) return closeEvent('Веранда уже не числится за рестораном');
    if (verandaAction === 'dismantle') {
      if (permit.removed) return closeEvent('Веранда уже демонтирована — повторно платить не нужно');
      if (!payBranchCost('Демонтаж веранды')) {
        return { ok: false, message: 'Недостаточно денег на демонтаж' };
      }
      permit.removed = true;
      permit.removedWeek = state.week;
      r.verandaActive = false;
      return closeEvent('Веранда убрана вовремя: мебель и оборудование сохранены до следующего сезона');
    }
    // 'leave': веранда остаётся под дождём и заморозками.
    if (permit.spoiled) return closeEvent('Мебель и оборудование веранды уже испорчены');
    permit.spoiled = true;
    r.verandaActive = false;
    addTransaction(
      r,
      event.date,
      'fine',
      VERANDA.spoilageCost,
      'out',
      'Порча мебели и оборудования веранды (дожди и заморозки)',
    );
    r.risks.legal = clamp(r.risks.legal + VERANDA.lateLegalRisk, 0, 100);
    return closeEvent(
      `Веранда стояла под дождём и заморозками: мебель и оборудование испорчены ` +
        `(−${Math.round(VERANDA.spoilageCost / 1000)} тыс ₽), юридический риск +${VERANDA.lateLegalRisk} (работа без разрешения)`,
    );
  }
  // Дилемма (§15): перманентные эффекты применяет dilemmas.ts.
  // Платные ветки (взятка) проводят деньги честным типом 'other'.
  const dilemmaTag = res.dilemma;
  if (dilemmaTag) {
    if (!payBranchCost(`Решение дилеммы: ${event.title}`)) {
      return { ok: false, message: 'Недостаточно денег на этот вариант' };
    }
    const note = applyDilemmaResolution(state, event, dilemmaTag);
    return closeEvent(note);
  }
  // Платный найм замены (уход шефа §15): подбор + найм роли.
  const hireAction = res.hire;
  if (hireAction) {
    if (!payBranchCost(`Хедхантинг: ${STAFF_ROLES[hireAction.roleId].name}`)) {
      return { ok: false, message: 'Недостаточно денег на подбор' };
    }
    const pool = r.staff.pools[hireAction.roleId];
    pool.count += 1;
    pool.newHires += 1;
    // ТЕКУЧЕСТЬ (26-b): найм через событие — в счётчик.
    noteHired(r, 1);
    return closeEvent(
      res.note,
      `Новый ${STAFF_ROLES[hireAction.roleId].name} выходит со следующего дня`,
    );
  }

  // ===== GENERIC-ВЕТКА (шаблонные события пула) =====
  if (!payBranchCost(`Решение события: ${event.title}`)) {
    return { ok: false, message: 'Недостаточно денег на этот вариант' };
  }
  const delta = res.effectDelta ?? {};
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
  if (delta.staffQuit) {
    // Тот же детерминированный поток 'staff-quit', что и в прежнем
    // applyEventEffects (роль от seed × дня события) — хелпер в endday.ts.
    quitStaffRole(state, r, event, delta.staffQuit);
  }
  if (delta.equipmentBreak) {
    r.equipment.coffee.wear = clamp(r.equipment.coffee.wear + 25, 0, 100);
  }
  if (delta.demandBoost) {
    // Временный множитель спроса живёт в activeEvents (механизм
    // eventDemandFactor, как у relocation_downturn). Окно начинается с
    // недели РЕШЕНИЯ: выбрали «работать без кофе» — неделя без кофе идёт
    // от решения, а не от происшествия.
    state.activeEvents.push({
      id: `${event.id}-demand`,
      date: { week: state.week, day: state.day, hour: 22 },
      templateId: event.templateId,
      title: event.title,
      description: 'Последствия решения действуют на спрос ограниченное время.',
      criticality: 'normal',
      effect: {
        demandBoost: delta.demandBoost,
        demandBoostWeeks: delta.demandBoostWeeks ?? 1,
      },
      resolved: true,
    });
  }
  return closeEvent(res.note);
}

/** Журнал решённых событий (v11): история на экране «События» — переживает
 *  обрезку dayLogs (7 дней) и затирание weekResult. Повторный вызов с тем же
 *  id (авто-суффикс «Срок истёк» после применения) обновляет запись. */
function journalResolved(state: GameState, event: GameEvent): void {
  const journal = (state.history.resolvedEvents ??= []);
  const snapshot = structuredClone(event);
  const existing = journal.findIndex((e) => e.id === event.id);
  if (existing >= 0) journal[existing] = snapshot;
  else journal.push(snapshot);
  if (journal.length > 30) state.history.resolvedEvents = journal.slice(-30);
}

/** АВТО-ЗАКРЫТИЕ ПРОСРОЧЕННЫХ СОБЫТИЙ (ЕДИНАЯ СИСТЕМА «СОБЫТИЯ = ДИЛЕММЫ",
 *  запрос пользователя): если решение не принято за 2 недели (deadlineWeek
 *  ?? date.week + 2), вариант выбирается случайно с коэффициентом 3:1 в
 *  пользу негативного исхода (tone = 'negative' → вес 3, прочие → 1).
 *
 *  ДЕТЕРМИНИЗМ (§21): ОДИН rng-поток 'event-timeout' на неделю —
 *  deriveRng(hashSeed(seed, week)); все события недели тянут из него по
 *  очереди в СТАБИЛЬНОМ порядке массива activeEvents. Math.random запрещён.
 *
 *  Вызывается из closeWeek (weekclose.ts) ДО формирования результата
 *  недели; возвращает автозакрытые события (для истории недели и тостов). */
export function autoResolveOverdueEvents(state: GameState, week: number): GameEvent[] {
  const rng = deriveRng(hashSeed(state.seed, week), 'event-timeout');
  const closed: GameEvent[] = [];
  for (let i = 0; i < state.activeEvents.length; ) {
    const event = state.activeEvents[i];
    if (event.resolved) {
      i++; // синтетические носители demand-эффекта не трогаем
      continue;
    }
    const deadline = event.deadlineWeek ?? event.date.week + 2;
    if (deadline > week) {
      i++;
      continue;
    }
    const options = event.resolutions ?? EVENT_TEMPLATES_MAP[event.templateId]?.resolutions;
    if (!options || options.length === 0) {
      // Вариантов нет — событие закрывается без последствий.
      event.resolved = true;
      event.resolutionNote = 'Срок истёк: последствий можно было избежать, но время вышло';
      journalResolved(state, event);
      closed.push(event);
      dropFromActive(state, event);
      continue;
    }
    // Взвешенный выбор ОДНИМ броском rng.next(): negative = 3, прочие = 1.
    const weights = options.map((o) => (o.tone === 'negative' ? 3 : 1));
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = rng.next() * total;
    let idx = options.length - 1;
    for (let k = 0; k < options.length; k++) {
      roll -= weights[k];
      if (roll < 0) {
        idx = k;
        break;
      }
    }
    const out = applyEventResolution(state, event, idx, { auto: true });
    if (!out.ok) {
      // Ветка не применилась (экзотика: спец-ветка без состояния) —
      // закрываем событие без последствий, чтобы оно не висело вечно.
      event.resolved = true;
      event.resolutionNote = 'Срок истёк: последствий можно было избежать, но время вышло';
      journalResolved(state, event);
    } else {
      event.resolutionNote =
        `${event.resolutionNote ?? options[idx].note} — Срок истёк: решение принято без вас, ` +
        'случайно (3:1 в пользу негативного исхода)';
      // Обновляем запись журнала: суффикс «Срок истёк» дописан ПОСЛЕ
      // применения ветки (closeEvent уже сохранил заметку без него).
      journalResolved(state, event);
    }
    closed.push(event);
    dropFromActive(state, event);
  }
  return closed;
}

/** Убрать событие из activeEvents по САМОМУ ОБЪЕКТУ (не по индексу).
 *  ФИКС БАГА (найден смоуком 26-b): closeEvent внутри applyEventResolution
 *  делает `state.activeEvents = state.activeEvents.filter(...)` — массив
 *  ЗАМЕНЯЕТСЯ новым, и последующий splice(i, 1) по старому индексу удалял
 *  НЕВИНОВНОГО СОСЕДА (событие бесследно исчезало без решения и эффекта —
 *  событие демонтажа веранды могло «потеряться», не дождавшись авто-решения).
 *  Поиск по объекту корректен при любой замене массива. */
function dropFromActive(state: GameState, event: GameEvent): void {
  const pos = state.activeEvents.indexOf(event);
  if (pos >= 0) state.activeEvents.splice(pos, 1);
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

/** БАЛ-v2 §9 (G-режимы): переключить режим закупки. Оплата 50 тыс ₽ сразу,
 *  активация — через лаг 2 нед (переговоры/контракт). Ручные заказы и
 *  позиции не меняются — политика влияет на цены/качество входа/сроки/
 *  порчу/сбои поставки/цель автозаказа. */
export function setProcurementPolicy(state: GameState, policy: ProcurementPolicyId): ActionResult {
  const r = state.restaurant!;
  if (!r.inventory.procurement) r.inventory.procurement = { policy: 'standard', pendingSwitch: null };
  const proc = r.inventory.procurement;
  if (proc.policy === policy && !proc.pendingSwitch) {
    return { ok: false, message: 'Этот режим уже активен' };
  }
  if (proc.pendingSwitch) {
    return {
      ok: false,
      message: `Переключение уже в работе (на «${PROC_LABELS[proc.pendingSwitch.to].title}» с недели ${proc.pendingSwitch.orderedAt + PROCUREMENT.switchLagWeeks})`,
    };
  }
  const cost = PROCUREMENT.switchCost;
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
  addTransaction(
    r,
    { week: state.week, day: state.day, hour: 20 },
    'other',
    cost,
    'out',
    `Переключение режима закупки на «${PROC_LABELS[policy].title}»`,
  );
  proc.pendingSwitch = { to: policy, orderedAt: state.week };
  return {
    ok: true,
    message: `Переговоры с поставщиками начаты: режим «${PROC_LABELS[policy].title}» вступит в силу через ${PROCUREMENT.switchLagWeeks} нед`,
  };
}

/** БАЛ-v2 §8 (механизм D): «Ответить на отзывы» — рабочий день управляющего
 *  с ответами на все неотвеченные ≤3,5★. Стоимость 15 тыс ₽; U → 0;
 *  приор рейтинга +0,013 × min(U, 5) (кап +0,05) — публичная работа над
 *  ошибками заметна новым гостям; юр. риск −8 («проработали жалобы»). */
export function replyToReviews(state: GameState): ActionResult {
  const r = state.restaurant!;
  const u = r.reputation.unansweredNeg ?? 0;
  if (u <= 0) return { ok: false, message: 'Неотвеченных негативных отзывов нет' };
  const cost = REVIEWS_V2.replyCost;
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
  addTransaction(
    r,
    { week: state.week, day: state.day, hour: 20 },
    'other',
    cost,
    'out',
    'Ответы на отзывы: рабочее время управляющего',
  );
  r.reputation.unansweredNeg = 0;
  const priorGain = Math.min(
    REVIEWS_V2.replyRatingMax,
    REVIEWS_V2.replyRatingPerU * Math.min(u, REVIEWS_V2.replyRatingCapU),
  );
  r.reputation.priorRating = Math.min(5, r.reputation.priorRating + priorGain);
  r.risks.legal = clamp(r.risks.legal - 8, 0, 100); // «проработали жалобы»
  const n = Math.round(u);
  const plural = n % 10 === 1 && n % 100 !== 11 ? 'отзыв' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'отзыва' : 'отзывов';
  return {
    ok: true,
    message: `Отвечено на ${n} ${plural}: конверсия восстановлена, приор рейтинга +${priorGain.toFixed(2)}`,
  };
}
