/**
 * ============================================================================
 * ТИПЫ ДАННЫХ ИГРЫ «Экономический симулятор ресторана» (ТЗ 4.0)
 * ============================================================================
 * Соглашения (ТЗ §2.5 Экономического движка):
 *  - деньги: целые рубли (₽);
 *  - доли и проценты: десятичные дроби (0.30 = 30%);
 *  - весовые продукты: кг/л, точность 0.001;
 *  - штучные продукты: целые числа;
 *  - время: минуты или часы, единица указана в имени поля.
 * ============================================================================
 */

/* ============================= ИГРОВОЕ ВРЕМЯ ============================= */

/** Игровая дата. Неделя 1..52, день 0..6 (0 = понедельник), час 8..23. */
export interface GameDate {
  week: number;
  day: number; // 0..6
  hour: number; // 8..23
}

export type GamePhase = 'setup' | 'managing' | 'gameover';

export type GameStatus =
  | 'bankrupt'
  | 'owner_replaced'
  | 'survived_12'
  | 'stable'
  | 'sustainable'
  | 'excellent'
  | 'open'; // игра продолжается

/* ============================= СПРАВОЧНИКИ ============================= */

export type SegmentId =
  | 'breakfast' // завтракающие
  | 'business_lunch'
  | 'office_evening'
  | 'family'
  | 'youth'
  | 'tourist'
  | 'premium'
  | 'evening'; // вечерние гости

export type StationType =
  | 'hot_kitchen'
  | 'cold_kitchen'
  | 'prep'
  | 'coffee'
  | 'dessert'
  | 'bar_service';

export type RoleId =
  | 'manager'
  | 'head_chef'
  | 'hot_cook'
  | 'cold_cook'
  | 'prep_cook'
  | 'barista'
  | 'waiter'
  | 'hostess'
  | 'cleaner'
  | 'dishwasher';

export type DishCategory =
  | 'breakfast'
  | 'salad'
  | 'soup'
  | 'appetizer'
  | 'hot'
  | 'garnish'
  | 'dessert'
  | 'non_alc_drink'
  | 'coffee'
  | 'alcohol'
  | 'lunch'; // бизнес-ланч наборы

export type StorageType = 'dry' | 'refrigerated' | 'frozen';

export type Unit = 'kg' | 'l' | 'pc';

export type RiskType =
  | 'sanitary'
  | 'technical'
  | 'staff'
  | 'legal'
  | 'reputation'
  | 'financial';

export type EquipmentLevel = 'basic' | 'standard' | 'professional';

export type RenovationLevel = 'cosmetic' | 'standard' | 'improved' | 'premium';

export type PremisesSize = 'small' | 'medium' | 'large';

export type LocationType =
  | 'center'
  | 'business'
  | 'sleeping'
  | 'tourist'
  | 'metro'
  | 'park'
  | 'premium';

export type TransactionType =
  | 'sale'
  | 'purchase'
  | 'emergency'
  | 'payroll'
  | 'overtime' // v2 §5.2: сверхурочные (ТК РФ, ×1.5)
  | 'social_contribution'
  | 'rent'
  | 'utilities'
  | 'marketing'
  | 'repair'
  | 'maintenance'
  | 'loan_disbursement'
  | 'loan_payment'
  | 'loan_interest'
  | 'tax'
  | 'fine'
  | 'license'
  | 'equipment'
  | 'deposit'
  | 'renovation'
  | 'dividend' // v2 §13: дивиденды владельцу
  | 'other';

/* ============================= КОНТЕНТ ============================= */

export interface Ingredient {
  id: string;
  name: string;
  unit: Unit; // единица закупки
  baseCost: number; // ₽ за единицу (базовая оптовая цена)
  shelfLifeDays: number; // срок годности в днях
  storage: StorageType;
  wastePercent: number; // потери при подготовке (доля)
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number; // в единицах ингредиента (кг/л/шт)
}

export interface Dish {
  id: string;
  name: string;
  category: DishCategory;
  station: StationType;
  recipe: RecipeItem[];
  recommendedPrice: number; // ₽, ориентир FoodCost 28-34%
  baseQuality: number; // 0..100 качество рецепта
  basePopularity: number; // 0..100 относительная популярность
  prepMinutes: number;
  prepWastePercent: number; // технологические потери блюда
  seasonMonths?: number[]; // месяцы сезонности 1..12 (undefined = всегда)
  requiresAlcoholLicense?: boolean;
}

/* ============================= СОСТОЯНИЕ РЕСТОРАНА ============================= */

/** v2 §9: режим закупки (эконом ↔ премиум). */
export type ProcurementPolicyId = 'economy' | 'standard' | 'premium';

/** v2 §9: состояние политики закупки. Переключение — не мгновенное:
 *  лаг 2 нед (переговоры/контракт) + разовая оплата 50 тыс ₽. */
export interface ProcurementState {
  policy: ProcurementPolicyId;
  /** Заказ на переключение «в полёте» (активируется в weekclose через лаг). */
  pendingSwitch: { to: ProcurementPolicyId; orderedAt: number } | null;
}

export interface MenuState {
  dishes: string[]; // id включённых блюд
  prices: Record<string, number>; // текущая цена продажи, ₽
  stopList: string[]; // стоп-лист
  /** Кастомные блюда (CSV-импорт ТЗ §35.3–35.4). Живут в состоянии —
   *  доступны всем системам движка и переживают сейв/загрузку. */
  customDishes: Dish[];
  /** v2 §14.1: недели с последнего изменения категории (новое блюдо,
   *  удаление, смена цены). Возвратные гости «приедаются». */
  categoryFreshness?: Record<string, number>;
  /** v2 §14.3: неделя последнего ЭФФЕКТИВНОГО сброса свежести (анти-абьюз
   *  «двигаем цены на 1 ₽» — сброс не чаще раза в cooldown нед). */
  lastFreshReset?: Record<string, number>;
  /** v2 §14.2: неделя добавления блюда в меню (новизна — буст спроса). */
  dishAddedAt?: Record<string, number>;
}

export interface InventoryBatch {
  ingredientId: string;
  quantity: number; // остаток в единицах
  unitCost: number; // ₽ за единицу (для FIFO и COGS)
  arrivedAt: GameDate;
  expiresAt: GameDate;
}

export interface PurchaseOrder {
  ingredientId: string;
  quantity: number;
  unitCost: number; // с учётом наценки срочной закупки
  paid: number; // оплаченная сумма, ₽
  orderedAt: GameDate;
  arrivesAt: GameDate; // завтра при обычной, сегодня при срочной
  urgent: boolean;
}

export interface InventoryState {
  batches: InventoryBatch[];
  pendingOrders: PurchaseOrder[]; // оплачено, ждём доставки
  /** v2 §9: режим закупки (эконом/стандарт/премиум). */
  procurement?: ProcurementState;
}

/** Смена: утро 08–16, вечер 15–23 (пересечение 15–16 для передачи). */
export interface StaffShifts {
  morning: number; // количество сотрудников
  evening: number;
}

export interface StaffPool {
  count: number; // нанятых сотрудников роли
  fatigue: number; // средняя усталость 0..100
  morale: number; // мораль 0..100
  newHires: number; // счётчик неадаптировавшихся новичков (тает на 1/день)
}

export interface StaffState {
  pools: Record<RoleId, StaffPool>;
  /** График: роль → день недели (0..6) → смены. */
  schedule: Record<RoleId, StaffShifts[]>;
  /** Временный вызов персонала «на сегодня» (экстренное решение ТЗ §8.4).
   *  Живёт только внутри симулируемого дня — очищается при финализации дня
   *  и не попадает в сейвы. */
  callIns?: { day: number; roleId: RoleId; count: number }[];
}

export interface MarketingCampaign {
  channelId: string;
  weeklyBudget: number; // ₽/нед
  startWeek: number;
  durationWeeks: number;
  /** Неделя, когда кампания завершилась (задаётся движком при исчерпании срока).
   *  undefined = кампания ещё идёт и списывает бюджет.
   *  После завершения эффект затухает ~2 недели («послесвечение»), затем кампания удаляется. */
  endedWeek?: number;
}

export interface MarketingState {
  campaigns: MarketingCampaign[];
  cleaningBudget: number; // ₽/нед на клининг
  /** Автозаказ на старте дня (модель завхоза): норм daily-доставка с лагом 1 день. */
  autoPurchase: { enabled: boolean; coverDays: number };
}

export interface LicenseState {
  alcohol: { active: boolean; paidUntil: GameDate | null; annualCost: number } | null;
}

export interface LoanState {
  principal: number; // выданная сумма
  remaining: number; // остаток основного долга
  annualRate: number; // годовая ставка, доля
  termMonths: number;
  payment: number; // аннуитетный платёж ₽/4 недели
  disbursementWeek: number;
  nextPaymentWeek: number;
  overduePayments: number;
}

export interface EquipmentZone {
  level: EquipmentLevel;
  wear: number; // износ 0..100
  value: number; // балансовая стоимость, ₽
}

export interface EquipmentState {
  kitchen: EquipmentZone; // горячий + холодный цех + заготовка
  coffee: EquipmentZone;
  hall: EquipmentZone; // зал + посуда
}

export interface Review {
  id: string;
  date: GameDate;
  segmentId: SegmentId;
  score: number; // 1..5
  weight: number; // вес (скандальные ×3..×10)
  text: string;
  scandal: boolean;
  /** Источник отзыва (Карты / Агрегатор / Соцсети / Сарафан) — для фильтра на экране отзывов. */
  sourceId?: ReviewSourceId;
}

export type ReviewSourceId = 'maps' | 'aggregator' | 'social' | 'word_of_mouth';

export interface ReputationState {
  rating: number; // эффективный рейтинг 1..5 (Байес)
  priorRating: number;
  priorReviews: number;
  windowReviews: Review[]; // последние 100 отзывов
  /** Счётчик отзывов — В GameState (аудит §6.1): раньше был module-level и
   * после загрузки сейва id отзывов дублировались. */
  reviewCounter: number;
  /** v2 §8 (механизм D): неотвеченные отзывы 1–2★. Растёт каждый день,
   *  давит на конверсию новых гостей, возвратность и юр. риск; сбрасывается
   *  действием «Ответить на отзывы» (ReviewsScreen). */
  unansweredNeg?: number;
}

export interface ServedCohort {
  date: GameDate;
  segmentId: SegmentId;
  guests: number;
  satisfaction: number; // 0..100
  returnProbability: number;
  ageDays: number;
  remainingReturnPotential: number;
}

export interface CustomerMemory {
  cohorts: ServedCohort[];
}

/** v2 §6: переговоры с арендодателем (индексация, эскалация отказов, ультиматум). */
export interface LandlordState {
  /** Отношения 0..100 (старт 60): ≥80 — скидка индексации, отказы снижают. */
  relation: number;
  /** Подряд идущие отказы (2 → ультиматум). */
  refusals: number;
  /** Неделя следующего разговора (0 = разговор не назначен). */
  nextTalkWeek: number;
  /** Стартовая месячная аренда — база индексации. */
  rentBase: number;
  /** Сумма шагей событий (доли: 0.04, 0.06, 0.10…). */
  stepSum: number;
}

/** v2 §15: перманентные эффекты дилемм («до конца игры»). Отображаются в
 *  SettingsScreen → «Долгосрочные решения». Все поля опциональны (миграция v9). */
export interface PermanentEffects {
  /** §15 дилемма «Шеф»: меню сокращено на 20% — FC −1 п.п., чек −3%
   *  (стандартизация порций: расход входов ×0,97, позиции в заказе ×0,97). */
  chefMenuCut?: boolean;
  /** §15: окно риска увольнений ×1,5 (8 нед), затем chef_quit с шансом 40%. */
  chefQuitRisk?: { mult: number; untilWeek: number };
  /** §15 «Инспектор»: взятка заплачена — риск скандала 5%/год. */
  bribeFlag?: boolean;
  /** §15: отказ инспектору — проверки жёстче, штрафы ×1,6 навсегда. */
  hardInspections?: boolean;
  /** §15: отказ от реструктуризации — кредитный лимит ×0,7 навсегда. */
  creditLimitShare?: number;
  /** §15 «Франшиза»: спрос +4% навсегда. */
  franchiseDemand?: number;
  /** §15 «Франшиза»: доля владельцу сети с выручки навсегда. */
  franchiseOwnerShare?: number;
  /** §15 «Кадровый кризис»: оклады ×1,12 навсегда (текучесть в норме). */
  wageRaise?: number;
  /** §15 «Кадровый кризис» (отказ): qFatigue ×1,3 + найм ×1,5 на 26 нед. */
  staffCrisis?: { qFatigueMult: number; hireMult: number; untilWeek: number };
  /** §15: отказ от франшизы — престиж +2 к перспективе «Клиенты» BSC. */
  prestigeBonus?: number;
  /** §16.1: «Ограничить продажи вечером» — алкоголь недоступен после 18:00. */
  alcoholEveningRestrict?: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  locationId: string;
  premisesSize: PremisesSize;
  areaM2: number;
  seats: number;
  verandaActive: boolean;
  verandaSeats: number;
  /** v2 §16.2: демонтаж веранды оплачен в этом сезоне (сбрасывается весной
   *  при повторном открытии — плата разовая за сезон). */
  verandaDismantledWeek?: number;
  /** v2 §16.1: недели «пьяных инцидентов» текущего квартала (для дилеммы
   *  «Ограничить продажи вечером» при повторе). Сбрасываются на закрытии
   *  квартала. */
  alcoholIncidents?: number[];
  /** v2 §15: неделя последней дилеммы (не чаще 1/квартал). */
  lastDilemmaWeek?: number;
  /** v2 §15: подряд недель со средней усталостью > 70 (триггер шефа). */
  fatigueHighWeeks?: number;
  /** v2 §15: подряд недель с рейтингом > 4,6 (триггер франшизы). */
  ratingHighWeeks?: number;
  /** v2 §15: подряд недель с плечом > 1,0 (триггер банка, окно 2 нед). */
  leverageHighWeeks?: number;
  /** v2 §15: перманентные эффекты дилемм. миграция v9. */
  permanentEffects?: PermanentEffects;
  renovation: RenovationLevel;
  /** v2 §6: цепочка арендодателя (индексация, переговоры, ультиматум). */
  landlord: LandlordState;
  rentMonthly: number; // ₽/мес
  depositPaid: number; // ₽ (разово)
  utilitiesMonthly: number; // ₽/мес
  menu: MenuState;
  inventory: InventoryState;
  staff: StaffState;
  finance: FinanceState;
  reputation: ReputationState;
  customerMemory: CustomerMemory;
  marketing: MarketingState;
  licenses: LicenseState;
  risks: Record<RiskType, number>; // 0..100
  equipment: EquipmentState;
  cleanliness: number; // 0..100
  comfort: number; // 0..100
  atmosphere: number; // 0..100
  openHours: { start: number; end: number }; // 8..23
  weekendEnd: number; // пт/сб до 23 или 24
  /** v2 §12.2: неделя последнего кассового разрыва (кулдаун 4 нед, миграция v8). */
  lastCashGapWeek?: number;
}

/* ============================= ФИНАНСЫ ============================= */

export interface FinancialTransaction {
  id: string;
  date: GameDate;
  type: TransactionType;
  amount: number; // ₽, всегда >= 0
  direction: 'in' | 'out';
  description: string;
}

export interface FinanceState {
  cash: number; // деньги на счёте, ₽
  transactions: FinancialTransaction[]; // последние ~200
  loans: LoanState[];
  /** v2 §13.2: доверие владельца (0–100, старт 60). миграция v8. */
  ownerTrust?: number;
  /** v2 §13: история дивидендов и последнее предложение. миграция v8. */
  dividends?: DividendState;
  /** v2 §12.1: плечо последнего закрытия недели (для LoansScreen/BSC). */
  leverage?: number;
  equityValue?: number;
  netDebt?: number;
  /** Счётчик транзакций — в GameState (аудит §6.1): уникальность id после загрузки сейва. */
  txCounter: number;
  /** Накопители для недельного расчёта. */
  accrued: {
    payrollGross: number; // начислено зарплаты за текущую неделю
    taxProfit: number; // накопленная налогооблагаемая прибыль квартала
    rentPaidWeeks: number; // для контроля месячных платежей
    /** v2 §13.1: накопители квартального FCF (сбрасываются на закрытии). */
    ocfQuarter?: number;
    principalQuarter?: number;
    equipQuarter?: number;
    licenseQuarter?: number;
  };
}

/** v2 §13: предложение дивидендов в конце квартала. */
export interface DividendProposal {
  quarter: number;
  week: number;
  fcf: number;
  netProfit: number;
  revenue: number;
  proposed: number;
}

/** v2 §13: факт выплаты/отказа. */
export interface DividendPayment {
  quarter: number;
  week: number;
  proposed: number;
  paid: number;
  trustDelta: number;
}

export interface DividendState {
  history: DividendPayment[];
  lastProposal: DividendProposal | null;
}

export interface PnlReport {
  week: number;
  revenue: number;
  cogs: number; // себестоимость проданного (FIFO)
  wasteCost: number; // порча + ошибки кухни + потери хранения
  grossProfit: number;
  payroll: number; // gross
  /** v2 §5.2: сверхурочные (gross; входят в ФОТ вместе с payroll). */
  overtime?: number;
  socialContributions: number;
  rentAccrued: number;
  utilitiesAccrued: number;
  marketing: number;
  maintenance: number;
  repairs: number;
  depreciation: number;
  licenseAmortization: number;
  otherOperating: number;
  operatingProfit: number; // EBITDA
  loanInterest: number;
  taxableProfit: number;
  tax: number;
  netProfit: number;
  acquiringFees: number;
}

export interface CashFlowReport {
  week: number;
  cashStart: number;
  netCashFromSales: number;
  purchases: number;
  payrollPaid: number;
  /** v2 §5.2: выплаченные сверхурочные. */
  overtimePaid?: number;
  socialPaid: number;
  rentPaid: number;
  utilitiesPaid: number;
  marketingPaid: number;
  maintenancePaid: number;
  repairsPaid: number;
  taxesPaid: number;
  loanPayments: number;
  finesPaid: number;
  licensePaid: number;
  equipmentPaid: number;
  loanDisbursements: number;
  ownerContributions: number;
  /** v2 §13: выплаченные дивиденды. */
  dividendsPaid?: number;
  eventIncome: number;
  cashEnd: number;
}

/* ============================= ДЕНЬ / НЕДЕЛЯ ============================= */

export interface HourLog {
  hour: number;
  demand: number; // потенциальный спрос
  arrivals: number;
  seated: number;
  lost: number; // ушли из очереди
  revenue: number;
  guestsServed: number;
  orders: number; // проданных позиций
  queueAvg: number; // средняя очередь, гостей
  satisfaction: number; // 0..100
  stationLoads: Partial<Record<StationType, number>>; // нагрузка станций
  waiterLoad: number;
}

export interface DayKPI {
  guests: number; // обслужено гостей
  lostGuests: number;
  revenue: number; // валовая выручка
  netRevenue: number; // минус эквайринг
  avgCheck: number; // выручка / гости
  ordersCount: number;
  cogs: number;
  wasteCost: number;
  foodCost: number; // (COGS+Waste)/FoodRevenue
  satisfaction: number;
  tips: number;
  payrollAccrued: number;
  dishesTop: { dishId: string; count: number }[];
  stopListHits: number; // сколько раз блюдо не смогли продать
  /** ТЕЛЕМЕТРИЯ (аудит баланса): возвратный трафик дня, до потерь очереди. */
  returningGuests: number;
  /** ТЕЛЕМЕТРИЯ: выручка и себестоимость (оценка по техкартам) по категориям блюд. */
  categoryRevenue: Partial<Record<DishCategory, number>>;
  categoryCogs: Partial<Record<DishCategory, number>>;
}

export interface DayLog {
  date: GameDate;
  hourLogs: HourLog[];
  kpi: DayKPI;
  transactions: FinancialTransaction[];
  reviews: Review[];
  events: GameEvent[];
  riskChanges: RiskChange[];
  warnings: string[];
}

export interface WeekStat {
  week: number;
  revenue: number;
  guests: number;
  avgCheck: number;
  cogs: number;
  wasteCost: number;
  payroll: number;
  netProfit: number;
  cashEnd: number;
  rating: number;
  satisfaction: number;
  foodCost: number;
  laborCost: number;
  bsc: number;
  /** Доля возвратных гостей в трафике (аудит: 15–30% для зрелого ресторана). */
  returningShare: number;
  /** v2 §7.2: численность штата на конец недели (для метрики текучести). */
  headcount?: number;
}

export interface RiskChange {
  riskType: RiskType;
  delta: number;
  reason: string;
}

export interface RiskHistoryEntry {
  week: number;
  values: Record<RiskType, number>;
  mainDrivers: string[];
}

/* ============================= СОБЫТИЯ ============================= */

export type EventCriticality = 'critical' | 'normal' | 'positive';

export interface GameEventEffect {
  cash?: number; // +/- ₽
  demandBoost?: number; // множитель спроса
  demandBoostWeeks?: number;
  ratingBoost?: number; // добавка к окну отзывов (вес)
  riskDelta?: Partial<Record<RiskType, number>>;
  stopRandomDish?: boolean;
  staffQuit?: number; // количество уволившихся
  equipmentBreak?: boolean;
}

/** Динамический вариант решения события (v2: цепочка арендодателя §6.2). */
export interface EventResolution {
  label: string;
  cost: number;
  note: string;
  /** Специальная логика арендодателя (engine/landlord.ts). */
  landlord?: 'accept' | 'refuse' | 'accept_ultimatum' | 'relocate';
  /** v2 §7.1: сразу нанять замену уволившемуся (staff_resignation). */
  hire?: { roleId: RoleId };
  /** v2 §13: выплата дивидендов (owner_dividend) — доля предложения. */
  dividend?: { fraction: number };
  /** v2 §13.2: дилемма «Разговор с владельцем» — принудительная доля кассы. */
  ownerForcePay?: { cashShare: number };
  /** v2 §13.2: отказ владельцу в дилемме. */
  ownerRefuse?: { trust: number; risk: number };
  /** v2 §15 (этап 5): ветка дилеммы — специальная обработка в
   *  engine/dilemmas.ts (перманентные эффекты, реструктуризация и т.д.). */
  dilemma?:
    | 'chef_accept' // «Шеф»: сократить меню (FC −1 п.п., чек −3%)
    | 'chef_refuse' // «Шеф»: отказ (увольнения ×1,5 на 8 нед → chef_quit 40%)
    | 'bribe_pay' // «Инспектор»: взятка (Legal −20, скандал 5%/год)
    | 'bribe_refuse' // «Инспектор»: отказ (штрафы ×1,6)
    | 'restructure' // «Банк»: реструктуризация (платёж −25%, срок +12)
    | 'restructure_refuse' // «Банк»: отказ (лимит ×0,7 навсегда)
    | 'franchise_accept' // «Франшиза»: спрос +4%, доля владельцу 5%
    | 'franchise_refuse' // «Франшиза»: престиж +2 BSC «Клиенты»
    | 'raise' // «Кризис»: оклады +12% навсегда
    | 'hold' // «Кризис»: держаться (qFatigue ×1,3, найм ×1,5)
    | 'curb_evening' // «Алкоголь»: крепкое до 18:00
    | 'keep_selling'; // «Алкоголь»: продолжать как есть
}

export interface GameEvent {
  id: string;
  date: GameDate;
  templateId: string;
  title: string;
  description: string;
  criticality: EventCriticality;
  effect: GameEventEffect;
  resolved: boolean;
  resolutionNote?: string;
  /** Динамические варианты (приоритет над шаблоном): суммы зависят от пресета/состояния. */
  resolutions?: EventResolution[];
}

/* ============================= BSC / ПРОГНОЗ ============================= */

export interface BSCReport {
  week: number;
  total: number; // 0..100
  finance: number;
  client: number;
  process: number;
  staff: number;
  details: { metricId: string; value: number; score: number; label: string }[];
}

export interface ForecastReport {
  week: number; // неделя прогноза
  expectedRevenue: number;
  expectedGuests: number;
  expectedCashEnd: number;
  riskAdjustedCashEnd: number;
  minSafeCashEnd: number;
  bigPayments: { week: number; label: string; amount: number }[];
}

export interface QuarterlyReview {
  quarter: number;
  bscAvg: number;
  revenue: number;
  netProfit: number;
  rating: number;
  verdict: string;
  recommendations: string[];
}

export interface FinalScore {
  financialHealth: number; // 0..250
  customerHealth: number; // 0..200
  operationalHealth: number; // 0..200
  staffHealth: number; // 0..150
  growth: number; // 0..100
  riskManagement: number; // 0..100
  total: number; // 0..1000
}

/* ============================= РЕШЕНИЯ ИГРОКА ============================= */

export type PlayerActionType =
  | 'toggle_menu_dish'
  | 'set_price'
  | 'stop_list'
  | 'purchase'
  | 'urgent_purchase'
  | 'hire'
  | 'fire'
  | 'set_schedule'
  | 'marketing_campaign'
  | 'stop_campaign'
  | 'repair'
  | 'maintenance'
  | 'buy_equipment'
  | 'renovate'
  | 'license_alcohol'
  | 'cleaning_deep'
  | 'loan_repay'
  | 'loan_take'
  | 'resolve_event';

export interface PlayerAction {
  type: PlayerActionType;
  payload?: Record<string, unknown>;
}

export interface DayDecisions {
  plannedActions: PlayerAction[];
}

/* ====================== ЭКСТРЕННЫЕ РЕШЕНИЯ ВНУТРИ ДНЯ (ТЗ §8.4–8.6) ====================== */

/** Идентификаторы экстренных действий (ТЗ §8.4, дорожная карта §12.5). */
export type EmergencyActionId =
  | 'call_extra_staff' // вызов дополнительного персонала на вечер
  | 'queue_compensation' // компенсация ожидающим в очереди
  | 'evening_discount' // экстренная скидка на вечер
  | 'urgent_purchase' // срочная закупка недостающих ингредиентов
  | 'simplify_menu' // стоп-лист сложных блюд на вечер
  | 'express_sanitation' // экспресс-санобработка зала
  | 'urgent_repair'; // срочный ремонт оборудования

/** Проблема, обнаруженная в обеденный пик (мотивирует паузу). */
export interface MiddayProblem {
  id: 'queue' | 'kitchen' | 'stockout' | 'service' | 'cash' | 'sanitary' | 'equipment';
  title: string;
  detail: string;
  severity: 'high' | 'medium';
}

/** Карточка экстренного решения (ТЗ §8.6: название, стоимость, время, описание, последствия, риск). */
export interface EmergencyOption {
  id: EmergencyActionId;
  title: string;
  icon: string; // имя иконки lucide для UI
  cost: number; // ₽, оценивается на момент паузы
  time: string; // когда вступает в силу
  description: string;
  consequences: string[]; // ориентировочные последствия
  riskNote: string; // диапазон риска
  targets: MiddayProblem['id'][]; // какие проблемы лечит
}

/** Снимок дня на паузе (после обеденного пика, до ужина). */
export interface MiddaySnapshot {
  hour: number; // час паузы (например 16)
  guests: number; // гостей обслужено к паузе
  lostGuests: number;
  queueNow: number; // гостей в очереди сейчас
  revenueSoFar: number; // ₽
  satisfactionSoFar: number; // 0..100
  stationPeak: { station: StationType; load: number }[]; // топ-2 загрузки станций
  stopListHits: number;
  cash: number;
  problems: MiddayProblem[];
  options: EmergencyOption[];
}

/** Пользовательские настройки геймплея (переживают сейв). */
export interface GameOptions {
  /** Пауза «экстренных решений» после обеденного пика (ТЗ §8.4–8.6). */
  middayPause: boolean;
}

/* ============================= РЕЗУЛЬТАТЫ СИМУЛЯЦИИ ============================= */

export interface DaySimulationResult {
  date: GameDate;
  hourLogs: HourLog[];
  transactions: FinancialTransaction[];
  reviews: Review[];
  events: GameEvent[];
  riskChanges: RiskChange[];
  kpi: DayKPI;
  warnings: string[];
  invariantReport: InvariantReport;
  /** Экстренные решения, применённые в течение этого дня (пауза §8.4). */
  emergencyActions?: EmergencyActionId[];
  /** v2 §9: поставки пришли с недовозом/браком (режим закупки). */
  supplyErrors?: number;
}

export interface InvariantReport {
  ok: boolean;
  violations: string[];
}

export interface WeekSimulationResult {
  week: number;
  dayResults: DaySimulationResult[];
  pnl: PnlReport;
  cashFlow: CashFlowReport;
  bsc: BSCReport;
  forecast: ForecastReport[];
  events: GameEvent[];
  riskHistory: RiskHistoryEntry;
  quarterlyReview?: QuarterlyReview;
  finalScore?: FinalScore;
  gameStatus: GameStatus;
  gameOver: boolean;
}

/* ============================= ИГРОКОВОЕ СОСТОЯНИЕ ============================= */

export interface HistoryState {
  dayLogs: DayLog[]; // последние 7
  weekStats: WeekStat[]; // 52
  riskHistory: RiskHistoryEntry[]; // 52
  reviewsAll: number; // всего отзывов за игру
  cumulativeNetProfit: number;
  positiveOpWeeks: number; // подряд положительная операционная прибыль
  lowRatingWeeks: number; // подряд рейтинг < 2.0
  /** v2 §7.2: лог увольнений (rolling 52 нед) — база метрики текучести. */
  resignationLog?: { week: number; roleId: RoleId }[];
  /** v2 §20 (этап 6): счётчик переездов по ультиматуму арендодателя —
   *  база спец-финала «Переезд» в GameOverDialog. миграция v10. */
  relocations?: number;
}

export interface GameState {
  version: string;
  seed: number;
  week: number; // текущая неделя 1..52+
  day: number; // 0..6 — следующий день к симуляции
  phase: GamePhase;
  status: GameStatus;
  difficultyId: string;
  /** Пользовательские настройки геймплея (мигрируются: v4). */
  options: GameOptions;
  restaurant: Restaurant | null;
  history: HistoryState;
  activeEvents: GameEvent[];
  weekResult: WeekSimulationResult | null; // отчёт последней недели
  lastDayResult: DaySimulationResult | null;
}
