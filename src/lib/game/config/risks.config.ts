/**
 * Конфиг рисков (ТЗ §19) и событий (ТЗ §20).
 * Риски 0–100. События: не раньше 4-й недели, 1–2 в месяц,
 * EventProbability = BaseProbability × (Risk/100)^elasticity × difficulty × random.
 */
import type { EventCriticality, EventResolution, GameEventEffect, RiskType } from '../types';

export const RISK_LIMITS = {
  min: 0,
  max: 100,
  /** Естественная релаксация рисков в день. */
  dailyRelax: 0.3,
};

export interface RiskDriver {
  id: string;
  riskType: RiskType;
  description: string;
}

export const RISKS_META: Record<RiskType, { name: string; description: string; driversUp: string[]; driversDown: string[] }> = {
  sanitary: {
    name: 'Санитарный риск',
    description: 'Проверки, просрочка, отравления. Растёт от грязи и порчи продуктов.',
    driversUp: ['низкая чистота', 'просроченные партии', 'ошибки кухни', 'жалобы на чистоту'],
    driversDown: ['уборка', 'санобработка', 'контроль склада'],
  },
  technical: {
    name: 'Технический риск',
    description: 'Поломки оборудования и инженерии.',
    driversUp: ['износ оборудования', 'перегрузка кухни', 'нет обслуживания'],
    driversDown: ['плановое обслуживание', 'ремонт', 'модернизация'],
  },
  staff: {
    name: 'Кадровый риск',
    description: 'Увольнения, прогулы, выгорание.',
    driversUp: ['перегрузка', 'усталость', 'низкая мораль', 'текучка'],
    driversDown: ['нормальные графики', 'мотивация', 'полный штат'],
  },
  legal: {
    name: 'Юридический риск',
    description: 'Штрафы и лицензионные нарушения.',
    driversUp: ['продажа алкоголя без лицензии', 'жалобы', 'просроченные документы'],
    driversDown: ['соблюдение лицензий', 'комплаенс-мероприятия'],
  },
  reputation: {
    name: 'Репутационный риск',
    description: 'Скандалы и поток негатива.',
    driversUp: ['скандалы', 'негативные отзывы', 'ушедшие без посадки гости'],
    driversDown: ['ответы на отзывы', 'компенсации', 'хороший сервис'],
  },
  financial: {
    name: 'Финансовый риск',
    description: 'Кассовые разрывы и долги.',
    driversUp: ['отрицательный прогноз денег', 'просрочки', 'долговая нагрузка'],
    driversDown: ['денежный запас', 'положительный поток', 'снижение долга'],
  },
};

/* ============================= СОБЫТИЯ ============================= */

export interface EventTemplate {
  id: string;
  title: string;
  description: string;
  criticality: EventCriticality;
  /** Движущий риск. */
  riskType: RiskType;
  /** Минимальный уровень риска для срабатывания (кроме критических условий). */
  minRisk: number;
  /** Базовая вероятность в неделю при риске 100. */
  baseProbability: number;
  riskElasticity: number;
  effect: GameEventEffect;
  /** Варианты реакции игрока (тип-совместим с EventResolution, включая tone).
   *  ЕДИНАЯ СИСТЕМА «СОБЫТИЯ = ДИЛЕММЫ»: у каждого шаблона есть резолюции,
   *  хотя бы одна — бесплатная (cost: 0). Эффекты применяются ТОЛЬКО в
   *  момент решения (игроком на экране «События» или авто-закрытием
   *  просрочки в weekclose — 3:1 в пользу негативного исхода). */
  resolutions?: EventResolution[];
}

export const EVENT_CONFIG = {
  /** События начинаются не раньше этой недели (ТЗ §20.1). */
  minWeek: 4,
  /** Целевое ожидание: 1–2 события в месяц (ТЗ §20.2). */
  eventsPerMonthTarget: 1.5,
  riskElasticity: 1.2,
  /** АУДИТ (§4.5): «фон внешнего мира» — события случаются даже при идеальном
   * управлении и низких рисках: проверки приходят к всем, техника ломается,
   * блогеры пишут. 0.026/день ≈ 1 событие в 5.5 недель. Риски по-прежнему
   * увеличивают вероятность (risk-driven ветка ниже) и открывают тяжёлые
   * события (высокий minRisk). Диагностика до правки: 0 событий за 16 недель
   * здоровой игры — «спокойно до скуки». */
  backgroundDailyProbability: 0.03,
  /** Фоновые события — только «лёгкие» шаблоны (minRisk ≤ этого порога) +
   * позитивные за рейтинг: отравления и воровство требуют плохого управления. */
  backgroundMaxMinRisk: 40,
};

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'sanitary_inspection',
    title: 'Внеплановая проверка Роспотребнадзора',
    description:
      'Инспектор на пороге. Чистота зала и сроки годности на складе решают исход: штраф или чистый протокол.',
    criticality: 'critical',
    riskType: 'sanitary',
    minRisk: 30,
    baseProbability: 0.05,
    riskElasticity: 1.4,
    effect: {},
    resolutions: [
      {
        label: 'Работать как есть, принять проверку',
        cost: 0,
        effectDelta: { cash: -120_000, riskDelta: { sanitary: -10, reputation: 5 } },
        note: 'Штраф 120 тыс ₽ за найденные нарушения (зависит от чистоты).',
        tone: 'negative',
      },
      {
        label: 'Срочная санобработка перед проверкой (80 тыс ₽)',
        cost: 80_000,
        effectDelta: { riskDelta: { sanitary: -25 } },
        note: 'Нарушения замяли: чисто, протокол без штрафов.',
        tone: 'neutral',
      },
    ],
  },
  {
    id: 'fridge_breakdown',
    title: 'Поломка холодильника',
    description: 'Основная холодильная камера дала течь хладагента. Часть продуктов под угрозой.',
    criticality: 'critical',
    riskType: 'technical',
    minRisk: 35,
    baseProbability: 0.05,
    riskElasticity: 1.3,
    effect: {},
    resolutions: [
      {
        label: 'Экстренный ремонт (150 тыс ₽)',
        cost: 150_000,
        effectDelta: { riskDelta: { technical: -12 } },
        note: 'Ремонт за ночь, продукты спасены.',
        tone: 'neutral',
      },
      {
        label: 'Продать скоропорт в убыток',
        cost: 0,
        effectDelta: { cash: -40_000, riskDelta: { sanitary: 8 } },
        note: 'Потеря 30% холодильного стока и нервов поваров.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'coffee_machine_break',
    title: 'Умерла кофемашина',
    description: 'Группа-coffee не держит давление. Кофейная станция работает на 30% до ремонта.',
    criticality: 'normal',
    riskType: 'technical',
    minRisk: 25,
    baseProbability: 0.06,
    riskElasticity: 1.3,
    effect: { equipmentBreak: true, cash: -60_000, demandBoost: 0.92, demandBoostWeeks: 1 },
    resolutions: [
      {
        label: 'Срочный ремонт кофемашины (90 000 ₽)',
        cost: 90_000,
        effectDelta: { riskDelta: { technical: -10 } },
        note: 'Мастер за ночь: станция работает завтра, спрос не страдает.',
        tone: 'neutral',
      },
      {
        label: 'Работать без кофе неделю',
        cost: 0,
        effectDelta: { equipmentBreak: true, cash: -30_000, demandBoost: 0.92, demandBoostWeeks: 1 },
        note: 'Кофейная карта недоступна: −30 тыс продаж, гости уходят за кофе дальше.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'cook_quit',
    title: 'Повар уволился',
    description: 'Устал от перегрузок: «Иду в другое место, там платят больше и график человеческий».',
    criticality: 'normal',
    riskType: 'staff',
    minRisk: 30,
    baseProbability: 0.07,
    riskElasticity: 1.2,
    effect: { staffQuit: 1 },
    resolutions: [
      {
        label: 'Срочный подбор повара (40 000 ₽)',
        cost: 40_000,
        hire: { roleId: 'hot_cook' },
        note: 'Хедхантинг: новый повар со следующего дня, неделя адаптации.',
        tone: 'neutral',
      },
      {
        label: 'Оставить вакансию открытой',
        cost: 0,
        effectDelta: { staffQuit: 1 },
        note: 'Цех недоукомплектован: перегрузка соседей, растут ошибки и усталость.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'food_poisoning',
    title: 'Жалоба на отравление',
    description: 'Гость пишет в соцсетях об отравлении. Разбираемся с санитарной безопасностью.',
    criticality: 'critical',
    riskType: 'sanitary',
    minRisk: 55,
    baseProbability: 0.04,
    riskElasticity: 1.6,
    effect: {},
    resolutions: [
      {
        label: 'Компенсировать гостю (50 тыс ₽)',
        cost: 50_000,
        effectDelta: { riskDelta: { reputation: -5 } },
        note: 'Гость доволен, пост не вышел.',
        tone: 'neutral',
      },
      {
        label: 'Игнорировать жалобу',
        cost: 0,
        effectDelta: { cash: -30_000, riskDelta: { reputation: 18, sanitary: 10 } },
        note: 'Вирусный негатив, штраф от Роспотребнадзора.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'blogger_negative',
    title: 'Разнос от фуд-блогера',
    description: 'Известный блогер опубликовал злой обзор: «Сервис — катастрофа».',
    criticality: 'normal',
    riskType: 'reputation',
    minRisk: 30,
    baseProbability: 0.05,
    riskElasticity: 1.3,
    effect: { demandBoost: 0.75, demandBoostWeeks: 2, riskDelta: { reputation: 10 } },
    resolutions: [
      {
        label: 'Пригласить блогера на повторный визит (30 000 ₽)',
        cost: 30_000,
        effectDelta: { riskDelta: { reputation: -6 } },
        note: 'Личное приглашение и лучшее столик: блогер смягчился, повторного разбора не будет.',
        tone: 'neutral',
      },
      {
        label: 'Игнорировать',
        cost: 0,
        effectDelta: { demandBoost: 0.75, demandBoostWeeks: 2, riskDelta: { reputation: 10 } },
        note: 'Пост гуляет по сети: спрос −25% на 2 недели, репутационный риск растёт.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'theft',
    title: 'Воровство на складе',
    description: 'Инвентаризация выявила недостачу. Половина склада «испарилась».',
    criticality: 'normal',
    riskType: 'staff',
    minRisk: 60,
    baseProbability: 0.05,
    riskElasticity: 1.2,
    effect: { cash: -70_000, riskDelta: { staff: 5 } },
    resolutions: [
      {
        label: 'Видеонаблюдение и инвентаризация (120 000 ₽)',
        cost: 120_000,
        effectDelta: { riskDelta: { staff: -12 } },
        note: 'Камеры, учёт и жёсткий контроль: кадровые риски заметно ниже.',
        tone: 'neutral',
      },
      {
        label: 'Списать недостачу',
        cost: 0,
        effectDelta: { cash: -70_000, riskDelta: { staff: 5 } },
        note: 'Убыток списан в расходы, воровство продолжается.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'ventilation_fail',
    title: 'Сбой вентиляции',
    description: 'Вытяжка не справляется: на кухне жара, скорость цехов упала на 30%.',
    criticality: 'normal',
    riskType: 'technical',
    minRisk: 40,
    baseProbability: 0.05,
    riskElasticity: 1.2,
    effect: { cash: -120_000, riskDelta: { technical: -8, staff: 6 } },
    resolutions: [
      {
        label: 'Экстренный ремонт вентиляции (140 000 ₽)',
        cost: 140_000,
        effectDelta: { riskDelta: { technical: -10, staff: -3 } },
        note: 'Бригада за ночь: кухня дышит, цеха держат темп.',
        tone: 'neutral',
      },
      {
        label: 'Терпеть жару на кухне',
        cost: 0,
        effectDelta: { cash: -60_000, riskDelta: { technical: 5, staff: 6 } },
        note: 'Качество и скорость падают — потери продаж, люди изнывают.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'fire_inspection',
    title: 'Пожарная проверка',
    description: 'Проверка эвакуационных выходов и датчиков. Нашли просроченный огнетушитель.',
    criticality: 'normal',
    riskType: 'legal',
    minRisk: 30,
    baseProbability: 0.04,
    riskElasticity: 1.3,
    effect: { cash: -90_000, riskDelta: { legal: -15 } },
    resolutions: [
      {
        label: 'Заменить огнетушители и датчики (100 000 ₽)',
        cost: 100_000,
        effectDelta: { riskDelta: { legal: -18 } },
        note: 'Предписание закрыто без штрафа: система безопасности обновлена.',
        tone: 'neutral',
      },
      {
        label: 'Заплатить штраф',
        cost: 0,
        effectDelta: { cash: -90_000, riskDelta: { legal: -8 } },
        note: 'Штраф оплачен, предписание частично закрыто — юр. риск остаётся.',
        tone: 'negative',
      },
    ],
  },
  {
    id: 'owner_bonus',
    title: 'Бонус от владельца',
    description: 'Владелец доволен отчётом и перевёл поощрение на развитие.',
    criticality: 'positive',
    riskType: 'financial',
    minRisk: 0,
    baseProbability: 0.04,
    riskElasticity: 0.8,
    effect: { cash: 400_000 },
    resolutions: [
      {
        label: 'Принять бонус на развитие',
        cost: 0,
        effectDelta: { cash: 400_000 },
        note: '400 тыс ₽ на счёт: инвеструйте в то, что окупится.',
        tone: 'positive',
      },
      {
        label: 'Направить бонус команде (премия)',
        cost: 0,
        effectDelta: { riskDelta: { staff: -5 } },
        note: 'Деньги ушли людям: мораль и лояльность выросли.',
        tone: 'neutral',
      },
    ],
  },
  {
    id: 'media_feature',
    title: 'Публикация в городском медиа',
    description: 'Вас включили в гид «Куда пойти в Москве». Резкий наплыв любопытных.',
    criticality: 'positive',
    riskType: 'reputation',
    minRisk: 0,
    baseProbability: 0.05,
    riskElasticity: 0.8,
    effect: { demandBoost: 1.3, demandBoostWeeks: 2 },
    resolutions: [
      {
        label: 'Подготовиться к наплыву: добавить смены (60 000 ₽)',
        cost: 60_000,
        effectDelta: { demandBoost: 1.35, demandBoostWeeks: 2 },
        note: 'Усиленные смена и закупка: наплыв конвертируется в выручку и хорошие отзывы.',
        tone: 'positive',
      },
      {
        label: 'Ничего не менять',
        cost: 0,
        effectDelta: { demandBoost: 1.15, demandBoostWeeks: 1 },
        note: 'Гости пришли, но зал и кухня затрещали — часть ушла недовольной.',
        tone: 'neutral',
      },
    ],
  },
  {
    id: 'festival_invite',
    title: 'Приглашение на гастрофестиваль',
    description: 'Стенд на фестивале еды: выручка с события и новые гости.',
    criticality: 'positive',
    riskType: 'reputation',
    minRisk: 0,
    baseProbability: 0.04,
    riskElasticity: 0.8,
    effect: { cash: 250_000, demandBoost: 1.15, demandBoostWeeks: 1 },
    resolutions: [
      {
        label: 'Участвовать: стенд на фестивале (50 000 ₽)',
        cost: 50_000,
        effectDelta: { cash: 250_000, demandBoost: 1.2, demandBoostWeeks: 1 },
        note: 'Стенд окупился: выручка с события 250 тыс ₽ + волна новых гостей.',
        tone: 'positive',
      },
      {
        label: 'Отказаться',
        cost: 0,
        effectDelta: {},
        note: 'Тихая неделя без событий: ни расходов, ни новой аудитории.',
        tone: 'neutral',
      },
    ],
  },
];

export const EVENT_TEMPLATES_MAP: Record<string, EventTemplate> = Object.fromEntries(
  EVENT_TEMPLATES.map((t) => [t.id, t]),
);
