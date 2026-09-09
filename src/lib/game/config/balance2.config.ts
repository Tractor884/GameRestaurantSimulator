/**
 * БАЛАНСИРОВКА V2 (docs/BALANCING-V2.md) — единый источник констант этапов.
 *
 * Пресеты:
 *  - 'legacy'     — поведение калибровки 2.0 (откат, A/B в бенчмарках);
 *  - 'moderate'   — «мягкая посадка»: пассив 8–10%, хороший игрок 13–16%;
 *  - 'aggressive' — точное попадание в целевые зоны §3: пассив 6–9%.
 *
 * Решение заказчика (§23): дефолтный пресет — moderate.
 *
 * ЭТАП 1 «Экономический скелет» (этот файл + хуки в движке):
 *  §10 инфляция food/wage/util — три независимых процесса, цены меню НЕ
 *     индексируются автоматически (игрок обязан переоценивать меню);
 *  §11.1 налог на прибыль 25% (РФ-2025; legacy-пресет сохраняет 15%);
 *  §5.1 прогрессивные накладные (скобки как налоговые) + ₽/гость;
 *  §6 аренда: квартальная индексация + цепочка арендодателя (событие →
 *     отказ → повтор → ультиматум; переезд всегда «с сохранением»).
 *
 * ЭТАП 2 «Люди» (BALANCE_V2_2 + хуки):
 *  §5.2 переработки: γ × Overload × ФОТ по худшей станции недели, кап;
 *     побочно — усталость растёт быстрее в перегрузочные дни;
 *  §7 E-цепочка: увольнения от усталости/морали (фикс «текучесть = 0»),
 *     событие staff_resignation с платным подбором замены, метрика
 *     текучести rolling-52 (BSC + качество сервиса), износ от перегруза;
 *  §8 (механизм D): неотвеченные отзывы 1–2★ — конверсия, возвратность,
 *     юр. риск; действие «Ответить на отзывы» на экране отзывов.
 *
 * ЭТАП 3 «Закупка и меню» (BALANCE_V2_3 + хуки):
 *  §9 G-режимы: эконом ↔ премиум (цены/качество входа/срок/порча/ошибки
 *     поставки/цель автозаказа), переключение с лагом 2 нед + 50 тыс ₽;
 *     пресеты автозаказа «3/7 дней» удалены — цель берётся из режима;
 *  §14 меню-усталость: свежесть категорий (возвратные «приедаются»),
 *     новизна новых блюд (буст спроса), сезонные спецпредложения
 *     сбрасывают свежесть категории (анти-абьюз — кулдаун).
 *
 * Сложности: Novice получает инфляцию ×0.7 (§21 риск «двойного наказания»),
 * Professional — без поправок.
 */
import type { Rng } from '../rng';
import type { ProcurementPolicyId, DishCategory } from '../types';
import { MENU_CATEGORIES } from './menu.config';

export type BalancePreset = 'legacy' | 'moderate' | 'aggressive';

/** Выбранный пресет (решение заказчика №1: moderate). Функция-обёртка — чтобы TS
 *  не сужал литеральный тип константы до 'moderate' (сравнение с 'aggressive'
 *  в выборке таблиц ниже тогда считалось бы ошибкой TS2367).
 *  Откат/переключение без правки кода (§20): BALANCE_PRESET=legacy bun run …
 *  В браузере env отсутствует → всегда дефолт 'moderate'. */
function presetChoice(): BalancePreset {
  const env = typeof process !== 'undefined' ? process.env?.BALANCE_PRESET : undefined;
  if (env === 'legacy' || env === 'moderate' || env === 'aggressive') return env;
  return 'moderate';
}

export const BALANCE_V2_PRESET: BalancePreset = presetChoice();

/* ============================= ЭТАП 1: КОНСТАНТЫ ============================= */

export interface OverheadBracket {
  /** Верхняя граница скобки по недельной выручке, ₽ (null = ∞). */
  upTo: number | null;
  /** Ставка на рубль выручки в этой скобке. */
  rate: number;
}

export interface Balance2Phase1 {
  inflation: {
    /** Годовая инфляция закупочных цен, доли. */
    food: number;
    /** Годовая индексация окладов (шаг раз в квартал), доли. */
    wage: number;
    /** Годовая инфляция коммунальных, доли. */
    util: number;
    /** Поправка сложности: Novice мягче (§21). */
    noviceFactor: number;
  };
  overhead: {
    /** База накладных, ₽/нед (индексируется коммунальной инфляцией). */
    base: number;
    /** Расходники на гостя, ₽. */
    perGuest: number;
    /** Прогрессивные скобки по выручке. */
    brackets: OverheadBracket[];
    /** Кап: накладные ≤ доли выручки недели. */
    capShare: number;
  };
  rent: {
    /** Квартальный индекс договора, доли (i в RentQ = Rent0 × (1+i)^Q). */
    quarterlyIndex: number;
    /** Шаг события «арендодатель» (первое предложение). */
    eventStep: number;
    /** Множитель шага при повторном предложении (после отказа). */
    repeatStepMultiplier: number;
    /** Шаг ультиматума (2 отказа подряд), доли. */
    ultimatumStep: number;
    /** Отношения с арендодателем: старт / отказ / согласие. */
    relationStart: number;
    refusalRelation: number;
    acceptRelation: number;
    /** Первый разговор: неделя = firstTalkMin + rng(firstTalkSpread). */
    firstTalkMin: number;
    firstTalkSpread: number;
    /** После отказа следующий разговор через N недель. */
    refuseNextIn: number;
    /** После второго отказа — ультиматум через N недель. */
    ultimatumIn: number;
    /** Переезд: цена, просадка спроса, срок, новая аренда = база × фактор. */
    relocationCost: number;
    relocationDemandFactor: number;
    relocationDemandWeeks: number;
    relocationRentFactor: number;
    /** Хорошие отношения (≥ порога) снижают квартальный индекс. */
    relationReliefAt: number;
    relationRelief: number;
  };
}

const PHASE1_MODERATE: Balance2Phase1 = {
  // КАЛИБРОВКА ПО ГЕЙТАМ §20 (прогон balance-v2-test, базовая линия legacy Q2 19,3%):
  // стартовые значения §17 давали Q2 15,0% → ворота ≤13% требуют усиления
  // (двигок с измерения §19 дрейфнул: сезонная коммуналка, эквайринг в P&L).
  inflation: { food: 0.084, wage: 0.104, util: 0.096, noviceFactor: 0.7 },
  overhead: {
    base: 58_000,
    perGuest: 14,
    brackets: [
      { upTo: 3_400_000, rate: 0.015 },
      { upTo: 3_700_000, rate: 0.038 },
      { upTo: null, rate: 0.08 },
    ],
    capShare: 0.075,
  },
  rent: {
    quarterlyIndex: 0.021,
    eventStep: 0.07,
    repeatStepMultiplier: 1.5,
    ultimatumStep: 0.1,
    relationStart: 60,
    refusalRelation: 20,
    acceptRelation: 10,
    firstTalkMin: 13,
    firstTalkSpread: 10,
    refuseNextIn: 16,
    ultimatumIn: 8,
    relocationCost: 2_000_000,
    relocationDemandFactor: 0.75,
    relocationDemandWeeks: 3,
    relocationRentFactor: 1.1,
    relationReliefAt: 80,
    relationRelief: 0.005,
  },
};

const PHASE1_AGGRESSIVE: Balance2Phase1 = {
  // Строго выше moderate по каждому рычагу; точная калибровка — на приёмке
  // по своему гейту (S0 Q2 ≤ 10%, §20).
  inflation: { food: 0.1, wage: 0.11, util: 0.105, noviceFactor: 0.7 },
  overhead: {
    // КАЛИБРОВКА (гейты агресс. Q3 ≤ 9 / A ≤ 10): perGuest 14→21 ₽ —
    // после фикса loanInterest (этап 4) пассив/A сидели на 0,2–0,4 п.п.
    // выше целей; +7 ₽/гостя ≈ −0,3 п.п. маржи на выручке 4 млн/нед.
    base: 50_000,
    perGuest: 21,
    brackets: [
      { upTo: 3_200_000, rate: 0.02 },
      { upTo: 3_700_000, rate: 0.04 },
      { upTo: null, rate: 0.075 },
    ],
    capShare: 0.085,
  },
  rent: {
    quarterlyIndex: 0.024,
    eventStep: 0.07,
    repeatStepMultiplier: 1.5,
    ultimatumStep: 0.12,
    relationStart: 55,
    refusalRelation: 20,
    acceptRelation: 10,
    firstTalkMin: 12,
    firstTalkSpread: 10,
    refuseNextIn: 16,
    ultimatumIn: 8,
    relocationCost: 2_000_000,
    relocationDemandFactor: 0.75,
    relocationDemandWeeks: 3,
    relocationRentFactor: 1.1,
    relationReliefAt: 80,
    relationRelief: 0.005,
  },
};

export const BALANCE_V2: Balance2Phase1 =
  BALANCE_V2_PRESET === 'aggressive' ? PHASE1_AGGRESSIVE : PHASE1_MODERATE;

/* ============================= ЭТАП 2: КОНСТАНТЫ ============================= */

export interface Balance2Phase2 {
  overtime: {
    /** Загрузка станции, с которой начинаются переработки. */
    threshold: number;
    /** γ: доля недельного ФОТ за каждый пункт перегруза свыше порога. */
    gamma: number;
    /** Кап переработок от недельного ФОТ. */
    capShare: number;
    /** Ускорение прироста усталости в перегрузочные дни (§5.2 «побочно»). */
    fatigueBoost: number;
  };
  quit: {
    /** Фон увольнений на сотрудника в неделю. */
    qBase: number;
    /** Вклад усталости (свыше fatigueFloor). */
    qFatigue: number;
    fatigueFloor: number;
    fatigueRange: number;
    /** Вклад морали (ниже moraleCeil). */
    qMorale: number;
    moraleCeil: number;
    /** v2 калибровка: вклад плотности графика (смен на человека сверх нормы 5/нед).
     *  Дифференцирует недоукомплектованный штат (S5/C) от полного (S0/S4):
     *  у полных пулов perPerson ≤ 1 → вклад 0. */
    qShift: number;
    /** Максимум увольнений одной роли за неделю (анти-обвал). */
    maxPerRole: number;
    /** Стоимость подбора замены (событие staff_resignation). */
    hiringCost: number;
    /** Мораль коллег при каждом увольнении («текучка заражает»). */
    moraleHit: number;
    /** Кадровый риск за каждое «молчаливое» увольнение. */
    staffRiskPer: number;
  };
  turnover: {
    /** Порог текучести для штрафов (доля). */
    bscThreshold: number;
    /** −0.1 балла BSC «Персонал» за каждый п.п. сверх порога. */
    bscPenaltyPerPp: number;
    /** −0.15 к качеству сервиса (удовлетворённость) за п.п., кап. */
    servicePenaltyPerPp: number;
    servicePenaltyCap: number;
  };
  wear: {
    /** w: ускорение износа за каждый пункт перегруза станций. */
    w: number;
  };
  reviews: {
    /** Порог «требует ответа»: score ≤ negThreshold (см. врезку калибровки §8). */
    negThreshold: number;
    /** Юр. риск в неделю за каждый неотвеченный отзыв (кап от U). */
    legalPerUnanswered: number;
    legalCapU: number;
    /** Конверсия новых гостей: −0.8% за каждый U (кап от U). */
    convPerUnanswered: number;
    convCapU: number;
    /** Возвратность: −0.2 п.п. за каждые 5 U (кап −3 п.п.). */
    retPerFive: number;
    retCap: number;
    /** Стоимость «Ответить на отзывы» (рабочее время управляющего). */
    replyCost: number;
    /** Прирост приора рейтинга за ответ (кап за один ответ). */
    replyRatingPerU: number;
    replyRatingCapU: number;
    replyRatingMax: number;
  };
}

const PHASE2_MODERATE: Balance2Phase2 = {
  // КАЛИБРОВКА ПО ГЕЙТАМ ЭТАПА 2 (§20): γ снижена 0.35→0.25 (и порог
  // поднят 0.85→0.9: эталонная загрузка живёт в 0.85–1.0), чтобы A
  // осталась в 10–12,5% при платных заменах; порог усталости 85 — потому
  // что у дефолтного графика «горящие» роли (повара/хостес/бариста) реально
  // живут на 80–100 усталости: порог 55 из §17 выжигал пассива до 90%+
  // текучести (замер). При floor 85 пассив ≈ фон 0.4%/нед ≈ 18–28% годовых,
  // сценарий C (−25% штата) — 77% за счёт морали и всеобщего перегруза.
  overtime: { threshold: 0.9, gamma: 0.25, capShare: 0.08, fatigueBoost: 1.25 },
  quit: {
    qBase: 0.004,
    qFatigue: 0.0025,
    fatigueFloor: 85,
    fatigueRange: 15,
    qMorale: 0.05,
    moraleCeil: 35,
    qShift: 0.03,
    maxPerRole: 1,
    hiringCost: 30_000,
    moraleHit: 2,
    staffRiskPer: 3,
  },
  turnover: {
    bscThreshold: 0.25,
    bscPenaltyPerPp: 0.1,
    servicePenaltyPerPp: 0.2,
    servicePenaltyCap: 8,
  },
  wear: { w: 0.8 },
  reviews: {
    // Врезка калибровки §8: в движке у здорового ресторана score отзывов
    // ≥ 3.4 почти всегда (satisfaction 70+ / 20 + шум) — «1–2★» из текста
    // никогда не срабатывал бы. Порог расширен до 3.5: копятся отзывы,
    // «требующие ответа» (умеренный негатив и ниже).
    negThreshold: 3.5,
    legalPerUnanswered: 0.3,
    legalCapU: 30,
    // Конверсия: 0.008→0.006 (кап −9%): при −12% Q4 пассива уходил в минус
    // ниже целевой зоны §18 (5–8%); −9% остаётся в коридоре «−8…−12%» §8.
    convPerUnanswered: 0.006,
    convCapU: 15,
    retPerFive: 0.002,
    retCap: 0.03,
    replyCost: 15_000,
    // Цель §8 «S4 еженедельно → +0.3–0.5 рейтинга за год»: влияние приора
    // на рейтинг ≈ 0.6 → прирост приора ≤ ~0.013 за ответ.
    replyRatingPerU: 0.013,
    replyRatingCapU: 5,
    replyRatingMax: 0.05,
  },
};

const PHASE2_AGGRESSIVE: Balance2Phase2 = {
  // КАЛИБРОВКА (гейты агресс. Q3 ≤ 9 / A ≤ 10): γ 0,40→0,45 — пассив и A
  // сидели на 0,2–0,4 п.п. выше целей при фиксе loanInterest (этап 4 честно
  // понизил проценты в P&L, агрессии не хватало).
  overtime: { threshold: 0.85, gamma: 0.45, capShare: 0.12, fatigueBoost: 1.35 },
  quit: {
    qBase: 0.006,
    qFatigue: 0.004,
    fatigueFloor: 80,
    fatigueRange: 20,
    qMorale: 0.07,
    moraleCeil: 40,
    qShift: 0.05,
    maxPerRole: 2,
    hiringCost: 40_000,
    moraleHit: 3,
    staffRiskPer: 4,
  },
  turnover: {
    bscThreshold: 0.22,
    bscPenaltyPerPp: 0.12,
    servicePenaltyPerPp: 0.25,
    servicePenaltyCap: 10,
  },
  wear: { w: 1.2 },
  reviews: {
    negThreshold: 3.5,
    legalPerUnanswered: 0.35,
    legalCapU: 30,
    convPerUnanswered: 0.006,
    convCapU: 15,
    retPerFive: 0.002,
    retCap: 0.03,
    replyCost: 20_000,
    replyRatingPerU: 0.013,
    replyRatingCapU: 5,
    replyRatingMax: 0.05,
  },
};

export const BALANCE_V2_2: Balance2Phase2 =
  BALANCE_V2_PRESET === 'aggressive' ? PHASE2_AGGRESSIVE : PHASE2_MODERATE;

/* ============================= ЭТАП 3: КОНСТАНТЫ ============================= */

export interface ProcurementConfig {
  /** Множитель закупочных цен по режиму. */
  priceMult: Record<ProcurementPolicyId, number>;
  /** Дельта качества входа → качество блюда (§9: средний чек не растёт,
   *  рейтинг/удовлетворённость реагируют). */
  inputQuality: Record<ProcurementPolicyId, number>;
  /** Множитель срока годности партий. */
  shelfLifeMult: Record<ProcurementPolicyId, number>;
  /** Базовый шанс недовоза/брака поставки (на заказ). */
  supplyErrorBase: number;
  /** Множитель шанса ошибки поставки. */
  supplyErrorMult: Record<ProcurementPolicyId, number>;
  /** Эконом: дополнительная дневная порча (доля партии). */
  spoilAddPerDay: Record<ProcurementPolicyId, number>;
  /** Премиум: множитель естественной порчи (−30%). */
  spoilMult: Record<ProcurementPolicyId, number>;
  /** Автозаказ: целевые дни покрытия из режима (§9). */
  autoCoverDays: Record<ProcurementPolicyId, number>;
  /** Разовая стоимость переключения режима, ₽. */
  switchCost: number;
  /** Лаг переключения (переговоры/контракт), недель. */
  switchLagWeeks: number;
  /** §9: дельта качества на премиальных категориях (эластичность ≤ 0.9)
   *  усиливается — «эконом» на премиальном меню бьёт по рейтингу сильнее. */
  premiumCatQualityMult: number;
}

export interface MenuFatigueConfig {
  /** Свежесть живёт бесплатно столько недель (§14.1: −fRate×(w−grace)). */
  grace: number;
  /** Скорость приедания за неделю (на возвратных). */
  fRate: number;
  /** Кап штрафа к спросу категории от возвратных. */
  cap: number;
  /** Буст спроса нового блюда (§14.2). */
  noveltyBoost: number;
  /** Полные недели буста. */
  noveltyFullWeeks: number;
  /** Неделя, к которой буст гаснет до нуля. */
  noveltyZeroWeek: number;
  /** Анти-абьюз: эффективный сброс свежести не чаще раза в N недель. */
  resetCooldownWeeks: number;
}

export interface Balance2Phase3 {
  procurement: ProcurementConfig;
  menu: MenuFatigueConfig;
}

const PHASE3_MODERATE: Balance2Phase3 = {
  procurement: {
    priceMult: { economy: 0.93, standard: 1.0, premium: 1.03 },
    inputQuality: { economy: -7, standard: 0, premium: 5 },
    shelfLifeMult: { economy: 0.8, standard: 1.0, premium: 1.2 },
    supplyErrorBase: 0.015,
    supplyErrorMult: { economy: 1.5, standard: 1.0, premium: 0.7 },
    spoilAddPerDay: { economy: 0.0015, standard: 0, premium: 0 },
    spoilMult: { economy: 1.0, standard: 1.0, premium: 0.6 },
    autoCoverDays: { economy: 1.5, standard: 2.0, premium: 3.5 },
    switchCost: 50_000,
    switchLagWeeks: 2,
    premiumCatQualityMult: 1.5,
  },
  menu: {
    // §14.1: RegularFactor = 1 − 0.004 × max(0, w − 8), кап −12% (возвратные
    // ≈ 21,5% трафика → общий эффект кап ≈ −2,6% выручки).
    grace: 10,
    fRate: 0.004,
    cap: 0.12,
    noveltyBoost: 0.06,
    noveltyFullWeeks: 3,
    noveltyZeroWeek: 10,
    resetCooldownWeeks: 8,
  },
};

const PHASE3_AGGRESSIVE: Balance2Phase3 = {
  procurement: {
    // КАЛИБРОВКА (гейт агресс. «премиум FC ≤ 33%»): цена премиума 1,10→1,03 —
    // при ×1,10 FC премиума структурно > 34% (рецептурный пол + 2,8 п.п.
    // от наценки). Дифференциация пресетов — через сбои/порчу/качество/усталость.
    priceMult: { economy: 0.93, standard: 1.0, premium: 1.03 },
    inputQuality: { economy: -7, standard: 0, premium: 5 },
    shelfLifeMult: { economy: 0.8, standard: 1.0, premium: 1.15 },
    supplyErrorBase: 0.025,
    supplyErrorMult: { economy: 1.5, standard: 1.0, premium: 0.7 },
    spoilAddPerDay: { economy: 0.002, standard: 0, premium: 0 },
    // КАЛИБРОВКА (гейт агресс. «премиум FC ≤ 33%»): 0,7→0,6 (как в moderate)
    // — премиальный скоропорт живёт дольше, списаний меньше.
    spoilMult: { economy: 1.0, standard: 1.0, premium: 0.6 },
    autoCoverDays: { economy: 1.5, standard: 2.0, premium: 3.5 },
    switchCost: 50_000,
    switchLagWeeks: 2,
    premiumCatQualityMult: 1.6,
  },
  menu: {
    grace: 8,
    fRate: 0.008,
    cap: 0.18,
    noveltyBoost: 0.08,
    noveltyFullWeeks: 3,
    noveltyZeroWeek: 10,
    resetCooldownWeeks: 8,
  },
};

export const BALANCE_V2_3: Balance2Phase3 =
  BALANCE_V2_PRESET === 'aggressive' ? PHASE3_AGGRESSIVE : PHASE3_MODERATE;

/* ============================= ЭТАП 4 · ФИНАНСОВАЯ ДИСЦИПЛИНА ============================= */

export interface Balance2Phase4 {
  /** v2 §12: скользящий штраф NetDebt/Equity. */
  leverage: {
    /** l: прирост финриска за единицу превышения плеча. */
    driftPerExcess: number;
    /** Кап прироста финриска в неделю. */
    riskCapPerWeek: number;
    /** Плечо, с которого начинается дрейф (0,5 по ТЗ). */
    driftFrom: number;
    /** Пока плечо выше — финриск НЕ релаксирует естественным образом
     *  («банки не забывают долг»). */
    noRelaxAbove: number;
    /** Новый кредит: ставка +2 п.п. при плече выше порога. */
    rateSurchargeAt: number;
    rateSurchargePP: number;
    /** Отказ банка: плечо выше порога ИЛИ DSCR ниже. */
    refuseLeverage: number;
    refuseDscr: number;
    /** Плечо на закрытии квартала, дающее −4 к доверию. */
    trustPenaltyAt: number;
    trustPenalty: number;
  };
  /** v2 §13: дивиденды и доверие владельца. */
  dividends: {
    /** Доля FCF квартала в предложении. */
    fcfShare: number;
    /** Доля прибыли «сверх» 3% квартальной выручки. */
    profitShare: number;
    profitThresholdRevShare: number;
    /** Стартовое доверие владельца. */
    trustStart: number;
    /** Выплата ≥ 0,7 × предложение. */
    trustPayGood: number;
    /** Выплата < 0,3 × предложение при сильном FCF. */
    trustPayLow: number;
    /** Нулевая выплата при положительном предложении. */
    trustPayZero: number;
    /** FCF ниже этой доли предложения → штраф мягче (−6 вместо −10). */
    weakFcfShare: number;
    /** Доверие для ×1,5 к событию owner_bonus. */
    trustBonusAt: number;
    /** Доверие для дилеммы «Разговор с владельцем». */
    trustDilemmaAt: number;
    /** Финал «Управленца сменили». */
    trustReplaced: number;
    /** Дилемма: принудительная доля кассы. */
    dilemmaCashShare: number;
    /** Дилемма: выплата успокаивает владельца. */
    dilemmaTrustRelief: number;
    /** Дилемма: отказ. */
    dilemmaTrustRefuse: number;
    dilemmaRiskRefuse: number;
  };
}

const PHASE4_MODERATE: Balance2Phase4 = {
  leverage: {
    driftPerExcess: 2.0,
    riskCapPerWeek: 4,
    driftFrom: 0.5,
    noRelaxAbove: 0.5,
    rateSurchargeAt: 1.0,
    rateSurchargePP: 0.02,
    refuseLeverage: 2.0,
    refuseDscr: 1.5,
    trustPenaltyAt: 1.5,
    trustPenalty: 4,
  },
  dividends: {
    // КАЛИБРОВКА (гейт кассы §13.3): при 0,30/0,10 дивиденды съедали лишь ~26%
    // годового прироста кассы пассива (замер: 8,2 млн при приросте ~20 млн) —
    // касса продолжала копиться. Доли подняты до 0,40/0,12: предложение ≈ 11 млн/год,
    // касса пассива к финалу ≈ 21 млн (взнос 12 + 10).
    fcfShare: 0.4,
    profitShare: 0.12,
    profitThresholdRevShare: 0.03,
    trustStart: 60,
    trustPayGood: 8,
    trustPayLow: 6,
    trustPayZero: 10,
    weakFcfShare: 0.6,
    trustBonusAt: 70,
    trustDilemmaAt: 35,
    trustReplaced: 15,
    dilemmaCashShare: 0.1,
    dilemmaTrustRelief: 6,
    dilemmaTrustRefuse: 10,
    dilemmaRiskRefuse: 10,
  },
};

const PHASE4_AGGRESSIVE: Balance2Phase4 = {
  leverage: {
    driftPerExcess: 3.0,
    riskCapPerWeek: 6,
    driftFrom: 0.5,
    noRelaxAbove: 0.5,
    rateSurchargeAt: 1.0,
    rateSurchargePP: 0.02,
    refuseLeverage: 1.8,
    refuseDscr: 1.6,
    trustPenaltyAt: 1.2,
    trustPenalty: 4,
  },
  dividends: {
    fcfShare: 0.4,
    profitShare: 0.12,
    profitThresholdRevShare: 0.03,
    trustStart: 55,
    trustPayGood: 8,
    trustPayLow: 7,
    trustPayZero: 12,
    weakFcfShare: 0.6,
    trustBonusAt: 70,
    trustDilemmaAt: 40,
    // КАЛИБРОВКА (гейт агресс. «смена управленца»): 15→18 — агрессивный
    // владелец менее терпелив (S5 останавливался на 16).
    trustReplaced: 18,
    dilemmaCashShare: 0.12,
    dilemmaTrustRelief: 6,
    dilemmaTrustRefuse: 10,
    dilemmaRiskRefuse: 12,
  },
};

export const BALANCE_V2_4: Balance2Phase4 =
  BALANCE_V2_PRESET === 'aggressive' ? PHASE4_AGGRESSIVE : PHASE4_MODERATE;

/* ============================= ЭТАП 5 · ПРЕИМУЩЕСТВА И СОБЫТИЯ ============================= */

export interface AlcoholConfig {
  /** Лицензия, ₽/год (legacy — 500 тыс). */
  licenseAnnual: number;
  /** Комплаенс (журнал учёта, охрана, декларации), ₽/мес. legacy = 0. */
  complianceMonthly: number;
  /** P(инцидент)/нед = base + slope × max(0,(доля алкоголя − ref)/range). */
  incidentBase: number;
  incidentShareSlope: number;
  incidentShareRef: number;
  incidentShareRange: number;
  /** Инцидент: репутационный риск +N, компенсация [min, max] ₽. */
  incidentReputation: number;
  incidentCompensation: [number, number];
  /** Полиция: ожидание проверок/год и диапазон штрафа, ₽. */
  policePerYear: number;
  policeFine: [number, number];
  /** Усталость официантов (бармены в этой модели) растёт ×N при лицензии. */
  bartenderFatigueMult: number;
  /** Автозаказ алкоголя: объём ×N («замороженный капитал», мин. партия). */
  alcoholOrderMult: number;
  /** Пьяный инцидент за квартал ≥ 2 → дилемма «Ограничить продажи вечером». */
  incidentDilemmaAt: number;
}

export interface VerandaConfig {
  setupCost: number;
  monthlyCost: number;
  /** Доля дождливых дней сезона: трафик веранды ×trafficMult. */
  weatherDaysShare: number;
  weatherTrafficMult: number;
  /** Общий буст спроса (срезается погодой) — обычно 1,0 (буст сегментный). */
  demandLift: number;
  /** СЕГМЕНТНЫЙ буст: «ужин на веранде» — вечер/туристы/премиум. */
  segmentLift: Partial<Record<string, number>>;
  /** Рекомендованный сезонный найм (официанты). */
  seasonalWaiters: number;
  /** Демонтаж/хранение в конце сезона, ₽ (разово). */
  dismantlingCost: number;
}

export interface ExposureConfig {
  sRev: number;
  sInv: number;
  maxScale: number;
  revRef: number;
  invRef: number;
}

export interface DilemmasConfig {
  /** Не чаще одной дилеммы в квартал. */
  perQuarter: number;
  /** Триггер «Шеф»: средняя усталость > порога столько недель подряд. */
  fatigueAvg: number;
  fatigueWeeks: number;
  /** Триггер «Инспектор»: юридический риск. */
  legalRisk: number;
  /** Триггер «Реструктуризация»: кредитное плечо. */
  leverage: number;
  /** Триггер «Франшиза»: рейтинг столько недель подряд. */
  rating: number;
  ratingWeeks: number;
  /** Триггер «Кадровый кризис»: текучесть rolling-52. */
  turnover: number;
  /** «Шеф»: FC −N п.п. (доля списаний и порчи) и чек −N%. */
  chefFCPP: number;
  chefCheckPct: number;
  /** «Шеф» (отказ): увольнения ×1,5 на N нед, затем chef_quit с шансом 40%. */
  chefQuitMult: number;
  chefQuitWeeks: number;
  chefQuitChance: number;
  /** «Инспектор»: взятка ₽, Legal −N, скандал p/год. */
  bribeCost: number;
  bribeLegalDrop: number;
  bribeScandalYearly: number;
  /** «Инспектор» (отказ): штрафы ×N, Legal −N. */
  refuseFineMult: number;
  refuseLegalDrop: number;
  /** «Реструктуризация»: срок +N мес, ставка +N п.п., платёж ×N. */
  restructureTermMonths: number;
  restructureRatePP: number;
  restructurePaymentMult: number;
  /** «Реструктуризация» (отказ): кредитный лимит ×N навсегда. */
  refuseLimitShare: number;
  /** «Франшиза»: спрос ×N навсегда, доля владельцу с выручки. */
  franchiseDemandMult: number;
  franchiseOwnerShare: number;
  /** «Франшиза» (отказ): престиж +N к BSC «Клиенты». */
  franchisePrestige: number;
  /** «Кризис»: оклады ×N навсегда. */
  crisisRaiseMult: number;
  /** «Кризис» (отказ): qFatigue ×N, мораль −N, найм ×N на N нед. */
  crisisQFatigueMult: number;
  crisisMoraleHit: number;
  crisisHireMult: number;
  crisisHireWeeks: number;
}

export interface Balance2Phase5 {
  alcohol: AlcoholConfig;
  veranda: VerandaConfig;
  exposure: ExposureConfig;
  dilemmas: DilemmasConfig;
}

const PHASE5_MODERATE: Balance2Phase5 = {
  alcohol: {
    licenseAnnual: 550_000,
    complianceMonthly: 12_000,
    // КАЛИБРОВКА (замер diag-stage5): фактическая доля алкоголя в выручке
    // «бар-акцента» = 4–5% (4 позиции в контенте) — формула §16.1 переприкорована
    // к этой шкале: base 0,05 + 0,05×(доля−3%)/4% → при 4% ≈ 0,06/нед ≈ 3,1/год.
    // Исходные «доля −15%/20%» давали P=0,02/нед — 1 инцидент/год (гейт 2–4 мёртв);
    // base 0,03 дал λ≈2,2 — измерено 1 (P(X≤1)≈35%, слишком разбросанно).
    incidentBase: 0.05,
    incidentShareSlope: 0.05,
    incidentShareRef: 0.03,
    incidentShareRange: 0.04,
    incidentReputation: 8,
    incidentCompensation: [30_000, 60_000],
    policePerYear: 1.5,
    policeFine: [30_000, 80_000],
    bartenderFatigueMult: 1.25,
    alcoholOrderMult: 1.5,
    incidentDilemmaAt: 2,
  },
  veranda: {
    setupCost: 900_000,
    monthlyCost: 70_000,
    weatherDaysShare: 0.25,
    weatherTrafficMult: 0.5,
    // КАЛИБРОВКА (diag-stage5): равномерный буст спроса растил НИЗКОЧЕКОВЫХ
    // гостей (очередь выживает по терпению) — чек падал на 4%, маржа сезона
    // уходила в минус. Буст теперь СЕГМЕНТНЫЙ: вечер/туристы/премиум — «ужин
    // на веранде с вином» — целевая аудитория уличного сезона.
    demandLift: 1.0,
    segmentLift: {
      evening: 1.15,
      tourist: 1.12,
      premium: 1.1,
      family: 1.06,
      office_evening: 1.04,
      youth: 1.02,
      business_lunch: 1.0,
      breakfast: 0.95,
    },
    seasonalWaiters: 2,
    dismantlingCost: 60_000,
  },
  exposure: {
    sRev: 0.5,
    sInv: 0.4,
    maxScale: 2.0,
    revRef: 4_150_000,
    invRef: 1_200_000,
  },
  dilemmas: {
    perQuarter: 1,
    fatigueAvg: 70,
    fatigueWeeks: 3,
    legalRisk: 45,
    leverage: 1.0,
    rating: 4.6,
    ratingWeeks: 4,
    turnover: 0.4,
    chefFCPP: 0.01,
    chefCheckPct: 0.03,
    chefQuitMult: 1.5,
    chefQuitWeeks: 8,
    chefQuitChance: 0.4,
    bribeCost: 120_000,
    bribeLegalDrop: 20,
    bribeScandalYearly: 0.05,
    refuseFineMult: 1.6,
    refuseLegalDrop: 5,
    restructureTermMonths: 12,
    restructureRatePP: 0.015,
    restructurePaymentMult: 0.75,
    refuseLimitShare: 0.7,
    franchiseDemandMult: 1.04,
    franchiseOwnerShare: 0.05,
    franchisePrestige: 2,
    crisisRaiseMult: 1.12,
    crisisQFatigueMult: 1.3,
    crisisMoraleHit: 5,
    crisisHireMult: 1.5,
    crisisHireWeeks: 26,
  },
};

const PHASE5_AGGRESSIVE: Balance2Phase5 = {
  alcohol: {
    licenseAnnual: 600_000,
    complianceMonthly: 15_000,
    // ×1,3 к базе и наклону инцидентов (§16.1 агр), шкала доли как в moderate.
    incidentBase: 0.065,
    incidentShareSlope: 0.065,
    incidentShareRef: 0.03,
    incidentShareRange: 0.04,
    incidentReputation: 8,
    incidentCompensation: [30_000, 60_000],
    policePerYear: 2.5,
    policeFine: [30_000, 80_000],
    bartenderFatigueMult: 1.3,
    alcoholOrderMult: 2.0,
    incidentDilemmaAt: 2,
  },
  veranda: {
    setupCost: 1_000_000,
    monthlyCost: 80_000,
    weatherDaysShare: 0.3,
    weatherTrafficMult: 0.45,
    demandLift: 1.0,
    segmentLift: {
      evening: 1.15,
      tourist: 1.12,
      premium: 1.1,
      family: 1.06,
      office_evening: 1.04,
      youth: 1.02,
      business_lunch: 1.0,
      breakfast: 0.95,
    },
    seasonalWaiters: 3,
    dismantlingCost: 80_000,
  },
  exposure: {
    sRev: 0.7,
    sInv: 0.6,
    maxScale: 2.5,
    revRef: 4_150_000,
    invRef: 1_200_000,
  },
  dilemmas: {
    ...PHASE5_MODERATE.dilemmas,
    // Агрессивный пресет: давление приходит раньше и жёстче.
    fatigueWeeks: 2,
    legalRisk: 40,
    rating: 4.55,
    crisisMoraleHit: 7,
  },
};

/** legacy: преимущества «как в 2.0» — лицензия 500 тыс без комплаенса и
 *  инцидентов, веранда 800/60 тыс без погоды, экспозиция и дилеммы выключены. */
const PHASE5_LEGACY: Balance2Phase5 = {
  alcohol: {
    licenseAnnual: 500_000,
    complianceMonthly: 0,
    incidentBase: 0,
    incidentShareSlope: 0,
    incidentShareRef: 0.15,
    incidentShareRange: 0.2,
    incidentReputation: 0,
    incidentCompensation: [0, 0],
    policePerYear: 0,
    policeFine: [0, 0],
    bartenderFatigueMult: 1,
    alcoholOrderMult: 1,
    incidentDilemmaAt: 99,
  },
  veranda: {
    setupCost: 800_000,
    monthlyCost: 60_000,
    weatherDaysShare: 0,
    weatherTrafficMult: 1,
    demandLift: 1,
    segmentLift: {},
    seasonalWaiters: 0,
    dismantlingCost: 0,
  },
  exposure: { sRev: 0, sInv: 0, maxScale: 1, revRef: 4_150_000, invRef: 1_200_000 },
  dilemmas: {
    ...PHASE5_MODERATE.dilemmas,
    perQuarter: 0, // дилеммы §15 полностью выключены
  },
};

export const BALANCE_V2_5: Balance2Phase5 = isLegacy()
  ? PHASE5_LEGACY
  : BALANCE_V2_PRESET === 'aggressive'
    ? PHASE5_AGGRESSIVE
    : PHASE5_MODERATE;

/* ============================= ХЕЛПЕРЫ ЭТАПА 5 ============================= */

/** §16.1: стоимость алкогольной лицензии (год) по пресету. */
export function alcoholLicenseAnnual(): number {
  return isLegacy()
    ? 500_000 // premises.config (калибровка 2.0)
    : BALANCE_V2_5.alcohol.licenseAnnual;
}

/** §16.2: параметры веранды по пресету (setup/мес/демонтаж). */
export function verandaParams(): { setupCost: number; monthlyCost: number; dismantlingCost: number } {
  if (isLegacy()) return { setupCost: 800_000, monthlyCost: 60_000, dismantlingCost: 0 };
  const v = BALANCE_V2_5.veranda;
  return { setupCost: v.setupCost, monthlyCost: v.monthlyCost, dismantlingCost: v.dismantlingCost };
}

/** §11.2: масштаб сумм событий (штрафы/недостачи/компенсации) по экспозиции.
 *  RevRef = 4,15 млн; InventoryValue против 1,2 млн. Вероятности НЕ зависят
 *  от богатства — только суммы. legacy → 1. */
export function eventCostScale(weekRevenue: number, inventoryValue: number): number {
  const e = BALANCE_V2_5.exposure;
  const revPart = e.sRev * Math.max(0, weekRevenue / e.revRef - 1);
  const invPart = e.sInv * Math.max(0, inventoryValue / e.invRef - 1);
  return Math.max(1, Math.min(e.maxScale, 1 + revPart + invPart));
}

/** §16.1: вероятность «пьяного инцидента» в неделю по доле алкоголя в выручке. */
export function alcoholIncidentChance(alcoholShare: number): number {
  const a = BALANCE_V2_5.alcohol;
  const over = Math.max(0, (alcoholShare - a.incidentShareRef) / a.incidentShareRange);
  return a.incidentBase + a.incidentShareSlope * over;
}

/* ============================= ХЕЛПЕРЫ ЭТАПА 1 ============================= */

export function isLegacy(): boolean {
  return BALANCE_V2_PRESET === 'legacy';
}

/** Ставка налога на прибыль: РФ-2025 = 25% (§11.1), legacy = 15%. */
export function profitTaxRate(): number {
  return isLegacy() ? 0.15 : 0.25;
}

/** Инфляционные ставки с поправкой сложности (Novice ×0.7, §21). */
function rates(difficultyId: string | undefined): { food: number; wage: number; util: number } {
  if (isLegacy()) return { food: 0, wage: 0, util: 0 };
  const r = BALANCE_V2.inflation;
  const f = difficultyId === 'novice' ? r.noviceFactor : 1;
  return { food: r.food * f, wage: r.wage * f, util: r.util * f };
}

/**
 * Индекс закупочных цен ингредиентов (§10): FoodIdx(W) = (1 + r/52)^(W−1).
 * Гладкий недельный процесс — партии дорожают постепенно.
 */
export function foodIndex(week: number, difficultyId?: string): number {
  const r = rates(difficultyId);
  return Math.pow(1 + r.food / 52, Math.max(0, week - 1));
}

/**
 * Индекс окладов (§10): применяется ШАГОМ раз в квартал —
 * WageIdx(W) = (1 + r/4)^floor((W−1)/13). Недели 1–13 = 1.0.
 * Скачок зарплат раз в квартал заметен в P&L недели 14/27/40.
 */
export function wageIndex(week: number, difficultyId?: string): number {
  const r = rates(difficultyId);
  const quarter = Math.floor(Math.max(0, week - 1) / 13);
  return Math.pow(1 + r.wage / 4, quarter);
}

/** Индекс коммунальных (§10): UtilIdx(W) = (1 + r/52)^(W−1). */
export function utilIndex(week: number, difficultyId?: string): number {
  const r = rates(difficultyId);
  return Math.pow(1 + r.util / 52, Math.max(0, week - 1));
}

/**
 * Прогрессивные накладные недели (§5.1):
 *   OverheadWeek = base × UtilIdx + β × Guests + Σ скобок(Revenue)
 *   + кап доли выручки. legacy → прежняя константа 60 000 ₽.
 */
export function weeklyOverhead(
  revenue: number,
  guests: number,
  week: number,
  difficultyId?: string,
): number {
  if (isLegacy()) return 60_000;
  const cfg = BALANCE_V2.overhead;
  const bracketPart = (rev: number): number => {
    let sum = 0;
    let lower = 0;
    for (const b of cfg.brackets) {
      const upper = b.upTo ?? Infinity;
      const portion = Math.max(0, Math.min(rev, upper) - lower);
      if (portion <= 0) break;
      sum += portion * b.rate;
      lower = upper;
    }
    return sum;
  };
  const raw = cfg.base * utilIndex(week, difficultyId) + cfg.perGuest * guests + bracketPart(revenue);
  const cap = revenue > 0 ? cfg.capShare * revenue : raw;
  return Math.round(Math.max(0, Math.min(raw, cap)));
}

/* ============================= АРЕНДА (§6) ============================= */

/** Квартальный индекс аренды с бонусом «хороших отношений». */
export function rentQuarterlyIndex(relation: number): number {
  if (isLegacy()) return 0;
  const cfg = BALANCE_V2.rent;
  return cfg.quarterlyIndex - (relation >= cfg.relationReliefAt ? cfg.relationRelief : 0);
}

/** Первый разговор с арендодателем: случайная неделя 8–23. */
export function firstLandlordTalkWeek(rng: Rng): number {
  const cfg = BALANCE_V2.rent;
  return cfg.firstTalkMin + Math.floor(rng.next() * cfg.firstTalkSpread);
}

/* ============================= ХЕЛПЕРЫ ЭТАПА 2 ============================= */

/** v2 §5.2: переработки недели.
 *  Overload = max(0, StationUtilMax − threshold); cost = γ × Overload × ФОТ,
 *  кап от ФОТ. legacy → 0 (механизм отсутствует в калибровке 2.0). */
export function weeklyOvertime(
  payrollGross: number,
  stationUtilMax: number,
): { cost: number; overload: number } {
  if (isLegacy() || payrollGross <= 0) return { cost: 0, overload: 0 };
  const cfg = BALANCE_V2_2.overtime;
  const overload = Math.max(0, stationUtilMax - cfg.threshold);
  const raw = cfg.gamma * overload * payrollGross;
  const cap = cfg.capShare * payrollGross;
  return { cost: Math.round(Math.max(0, Math.min(raw, cap))), overload };
}

/** v2 §7.1: недельная вероятность увольнения одного сотрудника роли.
 *  shiftPerPerson — смен на человека в неделю сверх нормы 5 (недоукомплект). */
export function quitProbability(fatigue: number, morale: number, shiftPerPerson = 0): number {
  const cfg = BALANCE_V2_2.quit;
  return Math.min(
    0.5,
    cfg.qBase +
      cfg.qFatigue * Math.max(0, (fatigue - cfg.fatigueFloor) / cfg.fatigueRange) +
      cfg.qMorale * Math.max(0, (cfg.moraleCeil - morale) / cfg.moraleCeil) +
      cfg.qShift * Math.max(0, shiftPerPerson - 1),
  );
}

/** v2 §7.2: текучесть rolling-52 = уволились / средняя численность. */
export function turnoverRate(resignations: number, avgHeadcount: number): number {
  if (avgHeadcount <= 0) return 0;
  return Math.min(1, resignations / avgHeadcount);
}

/** v2 §8 (механизм D): множитель конверсии новых гостей от неотвеченных отзывов. */
export function unansweredConvFactor(u: number): number {
  if (isLegacy()) return 1;
  const cfg = BALANCE_V2_2.reviews;
  return Math.max(0.5, 1 - cfg.convPerUnanswered * Math.min(u, cfg.convCapU));
}

/** v2 §8: множитель возвратности (кап −3 п.п.). */
export function unansweredReturningFactor(u: number): number {
  if (isLegacy()) return 1;
  const cfg = BALANCE_V2_2.reviews;
  return Math.max(1 - cfg.retCap, 1 - cfg.retPerFive * u);
}

/** v2 §7.2: сервис-штраф от текучести (в баллах удовлетворённости, кап −5).
 *  Применяется и к BSC, и к удовлетворённости дня (finishDay) — новички
 *  ошибаются, постоянные гости замечают смену лиц. */
export function turnoverServicePenalty(turnover: number): number {
  if (isLegacy()) return 0;
  const cfg = BALANCE_V2_2.turnover;
  if (turnover <= cfg.bscThreshold) return 0;
  const ppOver = (turnover - cfg.bscThreshold) * 100;
  return Math.min(cfg.servicePenaltyCap, cfg.servicePenaltyPerPp * ppOver);
}

/** v2 §8: порог «отзыв требует ответа» (калибровка: 3.5). */
export function reviewNeedsReply(score: number): boolean {
  if (isLegacy()) return false;
  return score <= BALANCE_V2_2.reviews.negThreshold;
}

/* ============================= ХЕЛПЕРЫ ЭТАПА 3 ============================= */

/** Достаточная «форма» состояния для activeProcurement (без импорта типов). */
interface ProcurementStateLite {
  policy?: ProcurementPolicyId;
}

/** Активный режим закупки из состояния (дефолт standard; миграция v7). */
export function activeProcurement(restaurant: { inventory?: { procurement?: ProcurementStateLite } }): ProcurementPolicyId {
  return restaurant.inventory?.procurement?.policy ?? 'standard';
}

/** v2 §9: множитель закупочных цен (legacy → 1 у всех). */
export function procPriceMult(policy: ProcurementPolicyId): number {
  if (isLegacy()) return 1;
  return BALANCE_V2_3.procurement.priceMult[policy];
}

/** v2 §9: дельта качества входа для блюда категории (эластичность ≤ 0.9 —
 *  премиальные категории реагируют сильнее; legacy → 0). */
export function procInputQuality(policy: ProcurementPolicyId, category: DishCategory): number {
  if (isLegacy() || policy === 'standard') return 0;
  const cfg = BALANCE_V2_3.procurement;
  const delta = cfg.inputQuality[policy];
  const el = MENU_CATEGORIES[category]?.elasticity ?? 1;
  return el <= 0.9 ? delta * cfg.premiumCatQualityMult : delta;
}

/** v2 §9: множитель срока годности партий (legacy → 1). */
export function procShelfLifeMult(policy: ProcurementPolicyId): number {
  if (isLegacy()) return 1;
  return BALANCE_V2_3.procurement.shelfLifeMult[policy];
}

/** v2 §9: шанс недовоза/брака одной поставки (legacy → 0). */
export function procSupplyErrorChance(policy: ProcurementPolicyId): number {
  if (isLegacy()) return 0;
  const cfg = BALANCE_V2_3.procurement;
  return Math.min(0.25, cfg.supplyErrorBase * cfg.supplyErrorMult[policy]);
}

/** v2 §9: дневная порча партии: add (эконом) и mult (премиум). */
export function procSpoilRates(policy: ProcurementPolicyId): { add: number; mult: number } {
  if (isLegacy()) return { add: 0, mult: 1 };
  const cfg = BALANCE_V2_3.procurement;
  return { add: cfg.spoilAddPerDay[policy], mult: cfg.spoilMult[policy] };
}

/** v2 §9: цель автозаказа в днях покрытия — из режима (legacy → null,
 *  вызывающий использует ручное значение из состояния). */
export function procAutoCoverDays(policy: ProcurementPolicyId): number | null {
  if (isLegacy()) return null;
  return BALANCE_V2_3.procurement.autoCoverDays[policy];
}

/** v2 §14.1: фактор свежести категории для возвратных гостей
 *  (1 = свежо; 1 − кап … 1). legacy → 1. */
export function categoryFreshnessFactor(weeksSinceChange: number): number {
  if (isLegacy()) return 1;
  const cfg = BALANCE_V2_3.menu;
  const penalty = Math.min(cfg.cap, cfg.fRate * Math.max(0, weeksSinceChange - cfg.grace));
  return 1 - penalty;
}

/** v2 §14.2: фактор новизны блюда (+буст недели 1–3, спад к 10-й; legacy → 1). */
export function noveltyFactor(weeksSinceAdded: number): number {
  if (isLegacy()) return 1;
  const cfg = BALANCE_V2_3.menu;
  if (weeksSinceAdded < 0) return 1;
  if (weeksSinceAdded <= cfg.noveltyFullWeeks) return 1 + cfg.noveltyBoost;
  if (weeksSinceAdded >= cfg.noveltyZeroWeek) return 1;
  const tail = (weeksSinceAdded - cfg.noveltyFullWeeks) / (cfg.noveltyZeroWeek - cfg.noveltyFullWeeks);
  return 1 + cfg.noveltyBoost * (1 - tail);
}

/* ============================= ХЕЛПЕРЫ ЭТАПА 4 ============================= */

/** Балансовые величины недели (§12.1). equipmentResidual передаётся вызывающим. */
export function leverageOf(cash: number, inventoryValue: number, equipmentResidual: number, debt: number): {
  equity: number;
  netDebt: number;
  leverage: number;
} {
  const equity = cash + inventoryValue + equipmentResidual - debt;
  const netDebt = debt - cash;
  return { equity, netDebt, leverage: netDebt / Math.max(equity, 1) };
}

/** v2 §12.2: прирост финриска за неделю от плеча (кап). legacy → 0. */
export function leverageRiskDrift(leverage: number): number {
  if (isLegacy()) return 0;
  const cfg = BALANCE_V2_4.leverage;
  return Math.min(cfg.riskCapPerWeek, cfg.driftPerExcess * Math.max(0, leverage - cfg.driftFrom));
}

/** v2 §12.2: плечо «замораживает» релаксацию финриска (банки не забывают долг). */
export function leverageBlocksRelax(leverage: number): boolean {
  if (isLegacy()) return false;
  return leverage > BALANCE_V2_4.leverage.noRelaxAbove;
}

/** v2 §12.2: надбавка к ставке нового кредита при высоком плече. */
export function loanRateSurcharge(leverage: number): number {
  if (isLegacy()) return 0;
  const cfg = BALANCE_V2_4.leverage;
  return leverage > cfg.rateSurchargeAt ? cfg.rateSurchargePP : 0;
}

/** v2 §12.2: отказ банка в новом кредите (плечо ИЛИ DSCR). */
export function bankRefusesNewLoan(leverage: number, dscr: number): boolean {
  if (isLegacy()) return false;
  const cfg = BALANCE_V2_4.leverage;
  return leverage > cfg.refuseLeverage || dscr < cfg.refuseDscr;
}

/** v2 §13.1: предложение дивидендов на конец квартала. */
export function dividendProposal(fcfQuarter: number, netProfitQuarter: number, revenueQuarter: number): number {
  if (isLegacy()) return 0;
  const cfg = BALANCE_V2_4.dividends;
  const excess = Math.max(0, netProfitQuarter - cfg.profitThresholdRevShare * revenueQuarter);
  return Math.round(cfg.fcfShare * Math.max(0, fcfQuarter) + cfg.profitShare * excess);
}

/** v2 §13.2: изменение доверия владельца по факту выплаты. */
export function dividendTrustDelta(paid: number, proposed: number, fcfQuarter: number): number {
  if (isLegacy() || proposed <= 0) return 0;
  const cfg = BALANCE_V2_4.dividends;
  if (paid >= 0.7 * proposed) return cfg.trustPayGood;
  const strongFcf = fcfQuarter > cfg.weakFcfShare * proposed;
  if (paid <= 0.01) return strongFcf ? -cfg.trustPayZero : -cfg.trustPayLow;
  if (paid < 0.3 * proposed) return strongFcf ? -cfg.trustPayLow : 0;
  return 0;
}
