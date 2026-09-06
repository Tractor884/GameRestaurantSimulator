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
  | 'payroll'
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

export interface MenuState {
  dishes: string[]; // id включённых блюд
  prices: Record<string, number>; // текущая цена продажи, ₽
  stopList: string[]; // стоп-лист
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
}

export interface MarketingCampaign {
  channelId: string;
  weeklyBudget: number; // ₽/нед
  startWeek: number;
  durationWeeks: number;
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
}

export interface ReputationState {
  rating: number; // эффективный рейтинг 1..5 (Байес)
  priorRating: number;
  priorReviews: number;
  windowReviews: Review[]; // последние 100 отзывов
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

export interface Restaurant {
  id: string;
  name: string;
  locationId: string;
  premisesSize: PremisesSize;
  areaM2: number;
  seats: number;
  verandaActive: boolean;
  verandaSeats: number;
  renovation: RenovationLevel;
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
  /** Накопители для недельного расчёта. */
  accrued: {
    payrollGross: number; // начислено зарплаты за текущую неделю
    taxProfit: number; // накопленная налогооблагаемая прибыль квартала
    rentPaidWeeks: number; // для контроля месячных платежей
  };
}

export interface PnlReport {
  week: number;
  revenue: number;
  cogs: number; // себестоимость проданного (FIFO)
  wasteCost: number; // порча + ошибки кухни + потери хранения
  grossProfit: number;
  payroll: number; // gross
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
}

export interface GameState {
  version: string;
  seed: number;
  week: number; // текущая неделя 1..52+
  day: number; // 0..6 — следующий день к симуляции
  phase: GamePhase;
  status: GameStatus;
  difficultyId: string;
  restaurant: Restaurant | null;
  history: HistoryState;
  activeEvents: GameEvent[];
  weekResult: WeekSimulationResult | null; // отчёт последней недели
  lastDayResult: DaySimulationResult | null;
}
