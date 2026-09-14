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
  | 'owner_replaced' // финал «Управленца сменили» (БАЛ-v2 §13.2, v8)
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
  | 'dishwasher'
  | 'secretary'; // админ-роль: бумаги/юр. риск (БАЛ v2 §backlog)

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
  | 'bonus' // премии штату (благосостояние)
  | 'training' // тренинги персонала
  | 'insurance' // медстраховка персонала
  | 'dividend' // дивиденды владельцу (БАЛ-v2 §13, v8)
  | 'overtime' // сверхурочные (БАЛ-v2 §5.2, v10)
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
  /** Кастомные блюда (CSV-импорт ТЗ §35.3–35.4). Живут в состоянии —
   *  доступны всем системам движка и переживают сейв/загрузку. */
  customDishes: Dish[];
  /** Возраст блюд в меню, недель (меню-усталость §14, v10). */
  dishAges?: Record<string, number>;
  /** Неделя снятия блюда с меню (детекция ротации §14, v10). */
  offSince?: Record<string, number>;
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

/** Режим закупки (БАЛ-v2 §9, «механизм G»): политика снабжения. */
export type ProcurementPolicyId = 'economy' | 'standard' | 'premium';

export interface ProcurementState {
  /** Активный режим (влияет на цены/качество входа/сроки/порчу/сбои/цель автозаказа). */
  policy: ProcurementPolicyId;
  /** Переключение в работе: оплачено, активация через switchLagWeeks. */
  pendingSwitch: { to: ProcurementPolicyId; orderedAt: number } | null;
}

export interface InventoryState {
  batches: InventoryBatch[];
  pendingOrders: PurchaseOrder[]; // оплачено, ждём доставки
  /** Режим закупки (БАЛ-v2 §9; миграция v7 — дефолт standard). */
  procurement?: ProcurementState;
  /** Сбои поставки за текущую неделю (телеметрия склада, БАЛ-v2 §9). */
  supplyErrorsWeek?: number;
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
  /** ТЕКУЧЕСТЬ (26-b): счётчики найма/увольнений за игру + недельные
   *  снапшоты штатной численности (последние 13 недель = «квартал» для KPI
   *  текучести; снапшот пишется на закрытии недели ПОСЛЕ увольнений недели). */
  turnover?: {
    hiredTotal: number;
    quitTotal: number; // ушли сами (мораль/события/шеф)
    firedTotal: number; // уволены игроком
    /** Неденедельные срезы штата; quitFired — накопленные quit+fired
     *  НА МОМЕНТ снапшота (Δ окна снапшотов = текучесть квартала). */
    snapshots: { week: number; headcount: number; quitFired?: number }[];
  };
  /** Медстраховка персонала: 4% недельного ФОТ, мораль стабильнее,
   *  риск увольнений ×0.6 (миграция v6). */
  insurance?: boolean;
  /** День последней премии (абс. индекс) — кулдаун 14 дней (v6). */
  lastBonusDay?: number;
  /** День последнего тренинга роли — кулдаун 21 день (v6). */
  trainedAt?: Partial<Record<RoleId, number>>;
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
  /** Сезонная летняя веранда (26-b): разрешение покупается с апреля на
   *  вкладке «Лицензии»; работает с boughtMonth+1 по сентябрь; в октябре
   *  обязателен демонтаж (иначе порча мебели + юр. риск). */
  veranda?: {
    boughtWeek: number;
    boughtMonth: number; // 4=апрель … 9=сентябрь (опоздавшим сезон не окупится)
    /** Демонтирована (вовремя или с экрана «Лицензии»). */
    removed?: boolean;
    /** Неделя демонтажа (для статуса на «Лицензиях»). */
    removedWeek?: number;
    /** Мебель/оборудование испорчены (ветка «оставить до весны»). */
    spoiled?: boolean;
  };
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
  /** Абс. день последнего обслуживания (профилактика/ремонт/установка):
   *  защита от поломок ≤ protectionDays, «запущенность» после neglectDays
   *  (миграция v8; undefined = нейтрально). */
  lastServicedAt?: number;
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
  /** Неотвеченные отзывы ≤3,5★ (БАЛ-v2 §8 «механизм D»; миграция v7). */
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
  /** Санитарная система HACCP (v9): аудит → окно соответствия; запущенность
   *  без аудита → санитарная цель выше. */
  haccp?: HaccpState;
  cleanliness: number; // 0..100
  comfort: number; // 0..100
  atmosphere: number; // 0..100
  openHours: { start: number; end: number }; // 8..23
  weekendEnd: number; // пт/сб до 23 или 24
  /** Цепочка арендодателя (БАЛ-v2 §6, v8): индексация, разговоры, ультиматум. */
  landlord?: LandlordState;
  /** Перманентные эффекты дилемм (БАЛ-v2 §15, v8): «до конца игры». */
  permanentEffects?: PermanentEffects;
  /** Окна триггеров дилемм (v8, обновляются на weekclose). */
  lastDilemmaWeek?: number;
  fatigueHighWeeks?: number;
  ratingHighWeeks?: number;
  leverageHighWeeks?: number;
}

/** Санитарная система HACCP (v9). */
export interface HaccpState {
  /** Абсолютный день последнего аудита. */
  lastAuditDay: number;
  /** Сколько аудитов проведено за игру (для статистики). */
  audits: number;
}

/** Состояние отношений с арендодателем (БАЛ-v2 §6). */
export interface LandlordState {
  /** Отношения 0..100: ≥80 снижает квартальный индекс аренды. */
  relation: number;
  /** Число отказов подряд (2 → ультиматум). */
  refusals: number;
  /** Неделя следующего разговора (0 = диалог открыт, новых не назначаем). */
  nextTalkWeek: number;
  /** Базовая аренда договора, ₽/мес. */
  rentBase: number;
  /** Суммарный шаг индексации от договорённостей (доли). */
  stepSum: number;
}

/** Перманентные эффекты дилемм (§15): применяются движком до конца игры. */
export interface PermanentEffects {
  /** «Шеф» (согласие): FC −1 п.п., средний чек −3%. */
  chefMenuCut?: boolean;
  /** «Шеф» (отказ): увольнения ×mult до untilWeek, затем шанс ухода шефа. */
  chefQuitRisk?: { mult: number; untilWeek: number };
  /** «Инспектор» (взятка): скандал p/год. */
  bribeFlag?: boolean;
  /** «Инспектор» (отказ): штрафы событий ×refuseFineMult навсегда. */
  hardInspections?: boolean;
  /** «Банк» (отказ): кредитный лимит урезан (доля). */
  creditLimitShare?: number;
  /** «Франшиза» (согласие): спрос ×mult навсегда. */
  franchiseDemand?: number;
  /** «Франшиза» (согласие): доля выручки сети навсегда. */
  franchiseOwnerShare?: number;
  /** «Доставка» (согласие): комиссия агрегатора — доля ВСЕЙ выручки навсегда. */
  deliveryShare?: number;
  /** «Франшиза» (отказ): престиж +N к BSC «Клиенты». */
  prestigeBonus?: number;
  /** «Кризис» (поднять): оклады ×mult навсегда. */
  wageRaise?: number;
  /** «Кризис» (держаться): усталость ×qFatigueMult, найм дороже — окно. */
  staffCrisis?: { qFatigueMult: number; hireMult: number; untilWeek: number };
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
  /** Счётчик транзакций — в GameState (аудит §6.1): уникальность id после загрузки сейва. */
  txCounter: number;
  /** Накопители для недельного расчёта. */
  accrued: {
    payrollGross: number; // начислено зарплаты за текущую неделю
    taxProfit: number; // накопленная налогооблагаемая прибыль квартала
    rentPaidWeeks: number; // для контроля месячных платежей
  };
  /** Доверие владельца 0..100 (БАЛ-v2 §13.2, v8): ≥70 — бонусы вероятнее,
   *  <35 — «Разговор с владельцем», <15 — финал «Управленца сменили». */
  ownerTrust?: number;
  /** Дивиденды: история и активное предложение квартала (v8). */
  dividends?: DividendsState;
  /** Инфляция (БАЛ-v2 §10, v10): индексы закупок/ФОТ/коммуналки, шаг раз в квартал. */
  inflation?: InflationState;
}

/** Индексы инфляции (v10): растут квартальными шагами, детерминированно. */
export interface InflationState {
  /** Множитель закупочных цен ингредиентов (1.0 на старте). */
  foodIdx: number;
  /** Множитель окладов (применяется к начислению ФОТ). */
  wageIdx: number;
  /** Множитель коммунальных (поверх сезонного). */
  utilIdx: number;
  /** Число прошедших шагов индексации (для индикации). */
  steps: number;
}

/** Состояние дивидендов (БАЛ-v2 §13). */
export interface DividendsState {
  /** Последние выплаты (для графика доверия). */
  history: { quarter: number; week: number; proposed: number; paid: number; trustDelta: number }[];
  /** Активное предложение (живёт до решения игрока). */
  lastProposal: {
    quarter: number;
    week: number;
    fcf: number;
    netProfit: number;
    revenue: number;
    proposed: number;
  } | null;
  /** Касса на начало квартала: FCF_кв = Δ кассы (все платежи уже честно
   *  проходят через транзакции — тело кредита, оборудование, лицензии). */
  quarterStartCash: number;
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
  /** Медстраховка персонала за неделю (благосостояние, опционально). */
  insurance?: number;
  /** Сверхурочные за неделю (БАЛ-v2 §5.2, v10): γ × перегруз × ФОТ. */
  overtime?: number;
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
  /** Выплаченные дивиденды владельцу (БАЛ-v2 §13, v8). */
  dividendsPaid: number;
  /** Сверхурочные (БАЛ-v2 §5.2, v10). */
  overtimePaid: number;
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
  /** Среднее ожидание СЕВШИХ за час, мин (26-b: видимость работы хостес;
   *  «хостес не справляется → очередь растёт → ожидание длиннее»). */
  waitMinutes?: number;
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
  /** Средневзвешенное ожидание севших гостей за день, мин (26-b).
  *  Вес — число севших в часе (часLogs.waitMinutes × seated). */
  avgWaitMinutes?: number;
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
  /** Сбои поставки за день (БАЛ-v2 §9, только при >0). */
  supplyErrors?: number;
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
  /** ЕДИНАЯ СИСТЕМА «СОБЫТИЯ = ДИЛЕММЫ» (запрос пользователя): неделя,
   *  после закрытия которой нерешённое событие закрывается автоматически
   *  (взвешенный случайный выбор 3:1 в пользу негативного исхода).
   *  Если не задано — считается date.week + 2. */
  deadlineWeek?: number;
  /** Динамические резолюции системных событий (дилеммы §15, дивиденды §13,
   *  арендодатель §6, уход шефа) — приоритетнее шаблона (v8). */
  resolutions?: EventResolution[];
}

/** Тональность исхода ветки решения — для взвешенного авто-выбора просроченных
 *  событий (вес negative = 3, прочие = 1) и подсказки игроку в UI. */
export type EventTone = 'negative' | 'neutral' | 'positive';

/** Вариант реакции игрока. Базовые поля совместимы с шаблонами risks.config;
 *  спец-теги включают собственную логику применения в resolveEvent. */
export interface EventResolution {
  label: string;
  cost: number; // ₽ (снимается generic-веткой до спец-логики)
  note: string;
  effectDelta?: GameEventEffect;
  /** Тег ветки дилеммы (dilemmas.ts применяет эффекты сам). */
  dilemma?: string;
  /** Дивиденды: доля выплаты от предложения (§13). */
  dividend?: { fraction: number };
  /** «Разговор с владельцем»: принудительная выплата доли кассы. */
  ownerForcePay?: { cashShare: number };
  /** «Разговор с владельцем»: отказ. */
  ownerRefuse?: { trust: number; risk: number };
  /** Цепочка арендодателя (§6). */
  landlord?: 'accept' | 'refuse' | 'accept_ultimatum' | 'relocate';
  /** Сезонная веранда (26-b): демонтаж вовремя / оставить до весны. */
  veranda?: 'dismantle' | 'leave';
  /** Платный найм замены (уход шефа). */
  hire?: { roleId: RoleId };
  /** Тональность исхода (авто-закрытие просрочки 3:1 в пользу негативного,
   *  иконка-подсказка в UI). Отсутствие тона = нейтральная ветка. */
  tone?: EventTone;
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

/** Пользовательские настройки геймплея и вида (переживают сейв). */
export interface GameOptions {
  /** Пауза «экстренных решений» после обеденного пика (ТЗ §8.4–8.6). */
  middayPause: boolean;
  /** Встроенные иллюстрации (P0a). Выкл по умолчанию: приоритет — свои
   *  картинки через «Иллюстрации» (миграция v5). */
  builtinIllustrations?: boolean;
  /** Активная вкладка главного экрана (миграция v5). */
  mainView?: 'report' | 'scene' | 'hall';
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
  /** Сбои поставки за день (БАЛ-v2 §9, только при >0). */
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
  /** Переезды по ультиматуму арендодателя (спец-финал §20, v8). */
  relocations?: number;
  /** История квартальных разборов (v9): переживает затирание weekResult
   *  следующей неделей — экран «Квартальный разбор» показывает все. */
  quarterlyReviews?: QuarterlyReview[];
  /** Решённые события (v11, единая система «события = дилеммы»): журнал
   *  последних решений с заметкой об исходе — переживает обрезку dayLogs
   *  (7 дней) и затирание weekResult; экран «События» показывает в истории. */
  resolvedEvents?: GameEvent[];
}

export interface GameState {
  version: string;
  seed: number;
  week: number; // текущая неделя 1..52+
  day: number; // 0..6 — следующий день к симуляции
  phase: GamePhase;
  status: GameStatus;
  difficultyId: string;
  /** Ник игрока (Task 28: регистрация по нику для рейтинга среди друзей).
   *  Опционально — старые сейвы (до Task 28) ника не имеют; финальный экран
   *  в этом случае предложит ввести ник перед отправкой в рейтинг. */
  playerNick?: string;
  /** Пользовательские настройки геймплея (мигрируются: v4). */
  options: GameOptions;
  restaurant: Restaurant | null;
  history: HistoryState;
  activeEvents: GameEvent[];
  weekResult: WeekSimulationResult | null; // отчёт последней недели
  lastDayResult: DaySimulationResult | null;
}
