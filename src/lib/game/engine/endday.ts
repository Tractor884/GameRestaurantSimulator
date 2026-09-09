/**
 * КОНЕЦ ДНЯ (ТЗ §7.3): отзывы, рейтинг, возвратные когорты, риски, события,
 * чистота/комфорт, износ оборудования.
 */
import type {
  GameDate,
  GameEvent,
  GameState,
  Restaurant,
  Review,
  RiskChange,
  RiskType,
  SegmentId,
  ReviewSourceId,
} from '../types';
import { SEGMENTS, SEGMENT_IDS } from '../config/segments.config';
import { REPUTATION_CONFIG } from '../config/reputation.config';
import { RETURNS_CONFIG } from '../config/returns.config';
import { REVIEW_CHANNELS, REVIEW_SOURCES, REVIEW_SOURCES_MAP, pickReviewTemplate } from '../config/reviews.config';
import { EVENT_CONFIG, EVENT_TEMPLATES, type EventTemplate } from '../config/risks.config';
import { DIFFICULTIES } from '../config/difficulty.config';
import { CLEANING } from '../config/marketing.config';
import { RENOVATION_LEVELS, EQUIPMENT_LEVELS } from '../config/premises.config';
import { MARKETING_CHANNELS_MAP } from '../config/marketing.config';
import { RISK_LIMITS } from '../config/risks.config';
import { BALANCE_V2_2, BALANCE_V2_4, isLegacy, unansweredReturningFactor, categoryFreshnessFactor, eventCostScale } from '../config/balance2.config';
import { dishOf } from '../content/resolve';
import { deriveRng, hashSeed, type Rng } from '../rng';
import { clamp, dayIndex, addTransaction } from './core';
import { eventFineMult } from './permanent';
import { EVENT_TEMPLATES_MAP } from '../config/risks.config';

/* ============================= ОТЗЫВЫ И РЕЙТИНГ ============================= */

/**
 * Генерация отзывов за день (ТЗ §16).
 * ReviewProbability = BaseSegmentProbability × SatisfactionModifier × RandomFactor.
 * SatisfactionModifier = 1 + |S − 70| / sensitivity — крайности отзывчивее.
 * Счётчик id — в restaurant.reputation (аудит §6.1), а не module-level:
 * после загрузки сейва id не дублируются.
 */
export function generateReviews(
  restaurant: Restaurant,
  date: GameDate,
  seatedBySegment: Record<SegmentId, number>,
  satisfaction: number,
  rng: Rng,
): Review[] {
  const reviews: Review[] = [];
  const sMod = 1 + Math.abs(satisfaction - 70) / REPUTATION_CONFIG.satisfactionModifierSensitivity;
  for (const segId of SEGMENT_IDS) {
    const guests = seatedBySegment[segId];
    if (guests < 1) continue;
    const seg = SEGMENTS[segId];
    const p = seg.reviewProbability * sMod;
    const expected = guests * p;
    let count = Math.floor(expected);
    if (rng.chance(expected - count)) count++;
    for (let i = 0; i < count; i++) {
      const noise = rng.float(-REPUTATION_CONFIG.reviewNoise, REPUTATION_CONFIG.reviewNoise);
      const score = clamp(satisfaction / 20 + noise, 1, 5);
      const scandal = satisfaction < 45 && rng.chance(0.06);
      const srcIdx = rng.int(0, REVIEW_SOURCES.length);
      const sourceId = REVIEW_SOURCES[Math.abs(srcIdx) % REVIEW_SOURCES.length].id as ReviewSourceId;
      const template = pickReviewTemplate(score, rng.int(0, 64));
      restaurant.reputation.reviewCounter = (restaurant.reputation.reviewCounter ?? 0) + 1;
      reviews.push({
        id: `rev-${restaurant.reputation.reviewCounter}-${date.week}-${date.day}`,
        date: { ...date },
        segmentId: segId,
        score: Math.round(score * 10) / 10,
        weight: scandal ? REPUTATION_CONFIG.scandalWeight : 1,
        // Живой текст: шаблон по диапазону оценки + сегментная окраска + площадка.
        text: scandal
          ? `${template.text} ${segmentFlavor(segId)} — ${REVIEW_SOURCES_MAP[sourceId]}.`
          : `${template.text} ${segmentFlavor(segId)} — ${REVIEW_CHANNELS[Math.abs(srcIdx) % REVIEW_CHANNELS.length]}.`,
        scandal,
        sourceId,
      });
    }
  }
  return reviews;
}

function segmentFlavor(segId: SegmentId): string {
  const map: Record<SegmentId, string> = {
    breakfast: 'Завтракал у вас.',
    business_lunch: 'Обедал по бизнес-ланчу.',
    office_evening: 'Заглянули с коллегами после работы.',
    family: 'Были всей семьёй.',
    youth: 'Тусовались вечером.',
    tourist: 'Гости города, забрели по рекомендации.',
    premium: 'Ужин делового уровня.',
    evening: 'Ужинали вечером.',
  };
  return map[segId];
}

/**
 * Эффективный рейтинг — байесовский с окном свежести (ТЗ §16.5).
 * EffectiveRating = (prior×n + Σ Score×Weight×Freshness) / (prior + Σ Weight×Freshness).
 *
 * reputationSpeed (сложность ТЗ §36): делит вес приора. Математика:
 * при prior=45 и speed=1.6 фактический приор = 28 «виртуальных отзывов» —
 * новые отзывы перевешивают прошлое быстрее, рейтинг «живее»; при speed=0.6
 * приор = 75 — инертный рейтинг, ошибки прощаются дольше.
 */
export function recomputeRating(restaurant: Restaurant, now: GameDate, reputationSpeed = 1): void {
  const rep = restaurant.reputation;
  let weightedSum = 0;
  let weightSum = 0;
  for (const r of rep.windowReviews) {
    const ageDays = Math.max(0, dayIndex(now) - dayIndex(r.date));
    const freshness = 0.5 + 0.5 * Math.max(0, (28 - ageDays) / 28);
    weightedSum += r.score * r.weight * freshness;
    weightSum += r.weight * freshness;
  }
  const prior = Math.max(1, (rep.priorReviews ?? REPUTATION_CONFIG.priorReviews) / reputationSpeed);
  const priorRating = rep.priorRating ?? REPUTATION_CONFIG.priorRating;
  rep.rating =
    weightSum > 0
      ? Math.round(((prior * priorRating + weightedSum) / (prior + weightSum)) * 100) / 100
      : priorRating;
  rep.rating = clamp(rep.rating, 1, 5);
}

export function addReviews(restaurant: Restaurant, reviews: Review[], now: GameDate, reputationSpeed = 1): void {
  restaurant.reputation.windowReviews.push(...reviews);
  // Окно: последние 100 отзывов (ТЗ §16.6).
  if (restaurant.reputation.windowReviews.length > REPUTATION_CONFIG.windowSize) {
    restaurant.reputation.windowReviews.splice(0, restaurant.reputation.windowReviews.length - REPUTATION_CONFIG.windowSize);
  }
  recomputeRating(restaurant, now, reputationSpeed);
}

/* ============================= ВОЗВРАТНЫЕ ГОСТИ ============================= */

/** Создание когорт обслуженных гостей дня (ТЗ §17.1). */
export function createCohorts(
  restaurant: Restaurant,
  date: GameDate,
  seatedBySegment: Record<SegmentId, number>,
  satisfaction: number,
): void {
  // Лояльность работает только от АКТИВНЫХ кампаний (завершённые затухают).
  const loyaltyActive = restaurant.marketing.campaigns.some((c) => c.channelId === 'loyalty' && c.endedWeek == null);
  const loyaltyFactor = loyaltyActive
    ? Math.min(RETURNS_CONFIG.marketingLoyaltyFactorMax, 1.15)
    : 1;
  for (const segId of SEGMENT_IDS) {
    const guests = seatedBySegment[segId];
    if (guests < 0.5) continue;
    const seg = SEGMENTS[segId];
    const returnProb =
      seg.baseLoyalty * Math.pow(satisfaction / 100, seg.loyaltyElasticity) * loyaltyFactor;
    restaurant.customerMemory.cohorts.push({
      date: { ...date },
      segmentId: segId,
      guests,
      satisfaction,
      returnProbability: returnProb,
      ageDays: 0,
      remainingReturnPotential: guests * returnProb,
    });
  }
}

/**
 * Возвратный спрос на день по сегментам (ТЗ §17.5):
 *   ReturnGuests(day) = cohort.guests × returnProb × delayProb(day) × decay
 * Затухание 0.85^ageWeeks, когорты живут 12 недель.
 * v2 §8 (механизм D): неотвеченные отзывы давят на возвратность
 * (−0,2 п.п. за каждые 5, кап −3 п.п.) — «заметили и запомнили».
 * v2 §14.1: статичное меню приедается возвратным (фактор свежести).
 */
export function menuFatigueFactor(restaurant: Restaurant): number {
  if (isLegacy()) return 1;
  const menu = restaurant.menu;
  if (!menu.categoryFreshness) return 1;
  // Веса категорий — суммы популярности активных блюд (замер спроса);
  // категория без блюд веса не даёт.
  const popByCat: Record<string, number> = {};
  let total = 0;
  for (const id of menu.dishes) {
    const d = dishOf(menu, id);
    if (!d) continue;
    popByCat[d.category] = (popByCat[d.category] ?? 0) + d.basePopularity;
    total += d.basePopularity;
  }
  if (total <= 0) return 1;
  let factor = 0;
  for (const [cat, pop] of Object.entries(popByCat)) {
    factor += (pop / total) * categoryFreshnessFactor(menu.categoryFreshness[cat] ?? 0);
  }
  return factor;
}

export function returningDemandForDay(
  restaurant: Restaurant,
  date: GameDate,
): Record<SegmentId, number> {
  const out = {
    breakfast: 0, business_lunch: 0, office_evening: 0, family: 0,
    youth: 0, tourist: 0, premium: 0, evening: 0,
  } as Record<SegmentId, number>;
  const todayIdx = dayIndex(date);
  const retFactor = unansweredReturningFactor(restaurant.reputation.unansweredNeg ?? 0);
  const fatigue = menuFatigueFactor(restaurant);
  const surviving: typeof restaurant.customerMemory.cohorts = [];
  for (const cohort of restaurant.customerMemory.cohorts) {
    cohort.ageDays = todayIdx - dayIndex(cohort.date);
    const ageWeeks = Math.floor(cohort.ageDays / 7);
    if (ageWeeks > RETURNS_CONFIG.maxReturnWeeks) continue; // когорта умерла
    const [minDelay, maxDelay] = RETURNS_CONFIG.segmentReturnDelays[cohort.segmentId];
    const window = maxDelay - minDelay + 1;
    if (cohort.ageDays < minDelay) {
      surviving.push(cohort);
      continue;
    }
    const delayIdx = cohort.ageDays - minDelay;
    if (delayIdx > window) {
      surviving.push(cohort);
      continue;
    }
    const decay = Math.pow(RETURNS_CONFIG.decayFactorPerWeek, ageWeeks);
    // Равномерно по дням окна задержки: P/окно × затухание
    // (× §8 неотвеченные × §14 свежесть меню — «приелось, ходим реже»).
    const guests = (cohort.remainingReturnPotential / window) * decay * retFactor * fatigue;
    out[cohort.segmentId] += guests;
    surviving.push(cohort);
  }
  restaurant.customerMemory.cohorts = surviving;
  return out;
}

/** Распределение возвратного спроса сегмента по часам (по предпочтениям сегмента). */
export function returningShareForHour(segmentId: SegmentId, hour: number): number {
  const seg = SEGMENTS[segmentId];
  const weights = Object.values(seg.hourWeights).reduce((s, w) => s + w, 0);
  const w = seg.hourWeights[hour] ?? 0;
  return weights > 0 ? w / weights : 0;
}

/* ============================= РИСКИ ============================= */

/** Обновление рисков в конце дня (ТЗ §19.2): clamp(Risk + рост − снижение, 0, 100). */
export function updateRisks(
  restaurant: Restaurant,
  ctx: {
    expiredCount: number;
    nearExpiryCount: number;
    lostGuests: number;
    negativeReviews: number;
    kitchenOverloadHours: number;
    avgStaffLoad: number;
    cashWarning: boolean;
    /** v2 §12.2: кредитное плечо выше порога — финриск не релаксирует. */
    leverageHigh?: boolean;
  },
): RiskChange[] {
  const changes: RiskChange[] = [];
  const push = (riskType: RiskType, delta: number, reason: string) => {
    const old = restaurant.risks[riskType];
    const v = clamp(old + delta, RISK_LIMITS.min, RISK_LIMITS.max);
    restaurant.risks[riskType] = v;
    const real = v - old;
    if (Math.abs(real) >= 0.5) changes.push({ riskType, delta: Math.round(real * 10) / 10, reason });
  };

  // САННИТАРНЫЙ — целевая модель (как у технического и репутационного):
  // цель отражает текущее положение дел (просрочка дня + грязь + склад
  // «на грани» — АУДИТ: переполненный скоропортом склад должен повышать
  // санриск до зон срабатывания проверок/отравлений, а не только списывать
  // деньги; замер сценария D: риск 9.9 при порче 14.5% выручки), риск
  // тянется к ней со скоростью 0.25/день.
  {
    const sanTarget = clamp(
      8 +
        Math.min(ctx.expiredCount, 10) * 2.5 +
        Math.min(ctx.nearExpiryCount, 15) * 1.6 +
        Math.max(0, 60 - restaurant.cleanliness) * 1.1,
      0,
      100,
    );
    const old = restaurant.risks.sanitary;
    const v = clamp(old + (sanTarget - old) * 0.25, RISK_LIMITS.min, RISK_LIMITS.max);
    restaurant.risks.sanitary = v;
    const real = v - old;
    if (Math.abs(real) >= 0.5) {
      changes.push({
        riskType: 'sanitary',
        delta: Math.round(real * 10) / 10,
        reason: real >= 0 ? 'просрочка и чистота' : 'чистота и контроль сроков',
      });
    }
  }
  // Технический риск отслеживает УРОВЕНЬ износа (не копит его): target = износ.
  const avgWear = (restaurant.equipment.kitchen.wear + restaurant.equipment.coffee.wear) / 2;
  const techTarget = Math.min(95, avgWear * 0.9 + ctx.kitchenOverloadHours * 2.5);
  {
    const old = restaurant.risks.technical;
    const v = clamp(old + (techTarget - old) * 0.25, RISK_LIMITS.min, RISK_LIMITS.max);
    restaurant.risks.technical = v;
    const real = v - old;
    if (Math.abs(real) >= 0.5) changes.push({ riskType: 'technical', delta: Math.round(real * 10) / 10, reason: 'износ оборудования' });
  }
  // КАДРОВЫЙ — целевая модель: цель = перегрузка дня + мораль + усталость.
  // Медленный дрейф −0.3/день заменён движением к цели (0.2/день), иначе
  // кадровый риск после волны увольнений «залипал» у 100.
  {
    const pools = Object.values(restaurant.staff.pools);
    const people = pools.reduce((s, p) => s + p.count, 0);
    const avgMorale = people > 0 ? pools.reduce((s, p) => s + p.morale * p.count, 0) / people : 70;
    const avgFatigue = people > 0 ? pools.reduce((s, p) => s + p.fatigue * p.count, 0) / people : 0;
    const staffTarget = clamp(
      8 +
        Math.max(0, ctx.avgStaffLoad - 1.05) * 25 +
        Math.max(0, 45 - avgMorale) * 1.4 +
        Math.max(0, avgFatigue - 50) * 0.8,
      0,
      100,
    );
    const old = restaurant.risks.staff;
    const v = clamp(old + (staffTarget - old) * 0.2, RISK_LIMITS.min, RISK_LIMITS.max);
    restaurant.risks.staff = v;
    const real = v - old;
    if (Math.abs(real) >= 0.5) {
      changes.push({
        riskType: 'staff',
        delta: Math.round(real * 10) / 10,
        reason: real >= 0 ? 'нагрузка и мораль' : 'график и мораль стабилизируются',
      });
    }
  }
  // РЕПУТАЦИОННЫЙ РИСК — целевая модель (исправление «застревания на 100»).
  // Раньше: риск только рос от ушедших гостей и негатива, а падал на фиксированные
  // 0.45/день — при 100 подъём вверх доминировал всегда, риск месяцами не снижался.
  // Теперь риск тянется к «цели», отражающей текущее положение дел:
  //   база 12 (фон недовольства всегда есть)
  //   + ушедшие из очереди гости и негативные отзывы дня
  //   + низкий рейтинг (держит цель высокой, пока репутация не восстановлена)
  //   + скандальные отзывы в окне.
  // Скорость 0.25/день: восстановление со 100 до ~20 занимает ~2 недели стабильного
  // хорошего сервиса — наказание за скандал остаётся ощутимым, но обратимым.
  {
    const scandals = restaurant.reputation.windowReviews.filter((r) => r.scandal).length;
    const repTarget = clamp(
      12 +
        ctx.lostGuests * 0.55 +
        ctx.negativeReviews * 4 +
        Math.max(0, 3.6 - restaurant.reputation.rating) * 25 +
        scandals * 3,
      0,
      100,
    );
    const old = restaurant.risks.reputation;
    const v = clamp(old + (repTarget - old) * 0.25, RISK_LIMITS.min, RISK_LIMITS.max);
    restaurant.risks.reputation = v;
    const real = v - old;
    if (Math.abs(real) >= 0.5) {
      changes.push({
        riskType: 'reputation',
        delta: Math.round(real * 10) / 10,
        reason: real >= 0 ? 'очередь, негатив и рейтинг' : 'хороший сервис гасит негатив',
      });
    }
  }
  // Юридический: медленный дрейф. v2 §16.1 (этап 5): у лицензиата по алкоголю
  // — постоянная регуляторная нагрузка (журнал учёта, декларации, участковый):
  // +0,36/день вместо +0,15 → LegalRisk ~13 → ~35 за год (гейт S1 25–50).
  const licenseeLegalDrift = restaurant.licenses.alcohol?.active && !isLegacy() ? 0.36 : 0.15;
  push('legal', licenseeLegalDrift - RISK_LIMITS.dailyRelax, 'текущий комплаенс');
  // Финансовый: прогноз денег и просрочки. v2 §12.2: пока кредитное плечо
  // выше 0,5 — риск НЕ рассасывается («банки не забывают долг»): естественная
  // релаксация отключена, работает только недельный дрейф левериджа.
  push(
    'financial',
    ctx.cashWarning ? 1.5 : ctx.leverageHigh ? 0 : -RISK_LIMITS.dailyRelax,
    ctx.leverageHigh && !ctx.cashWarning ? 'плечо держит риск' : 'денежная позиция',
  );
  return changes;
}

/* ============================= СОБЫТИЯ ============================= */

/**
 * Проверка событий в конце дня (ТЗ §20.3).
 * ДВА МЕХАНИЗМА (аудит §4.5):
 *  1. ФОН ВНЕШНЕГО МИРА — backgroundDailyProbability: события случаются и при
 *     идеальном управлении (проверки, поломки, блогеры, удача). Только шаблоны
 *     с minRisk ≤ backgroundMaxMinRisk (+позитивные за рейтинг ≥ 4.05):
 *     «тяжёлые» события (отравление, воровство) требуют плохого управления.
 *  2. РИСК-ДРАЙВЕН — EventProbability = Base/7 × (Risk/100)^elasticity × difficulty.
 *     Риски повышают вероятность и открывают тяжёлые шаблоны.
 * Критические события требуют решения игрока (пауза симуляции).
 */
export function checkEvents(
  state: GameState,
  restaurant: Restaurant,
  date: GameDate,
  rng: Rng,
): GameEvent[] {
  if (date.week < EVENT_CONFIG.minWeek) return [];
  const diff = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.standard;
  const events: GameEvent[] = [];

  // 1. Фон внешнего мира: не зависит от рисков игрока.
  if (rng.chance(EVENT_CONFIG.backgroundDailyProbability * diff.eventFrequency)) {
    const eligible = EVENT_TEMPLATES.filter((t) => {
      if (t.systemOnly) return false; // v2: только программное создание
      if (t.criticality === 'positive') return restaurant.reputation.rating >= 4.05;
      return t.minRisk <= EVENT_CONFIG.backgroundMaxMinRisk;
    });
    if (eligible.length > 0) {
      events.push(instantiateEvent(rng.pick(eligible), date));
      return events;
    }
  }

  // 2. Риск-драйвенная ветка (как раньше).
  for (const template of EVENT_TEMPLATES) {
    if (template.systemOnly) continue; // v2: только программное создание
    // v2 §13.2: «Бонус от владельца» ключуется на ДОВЕРИИ, не на финриске:
    // у дисциплинированных игроков финриск низкий (и бонус не должен пропадать),
    // у прогоревших доверие низкое (и бонус несправедлив).
    const isOwnerBonus = template.id === 'owner_bonus' && !isLegacy();
    const risk = isOwnerBonus ? (restaurant.finance.ownerTrust ?? 60) : restaurant.risks[template.riskType];
    if (risk < template.minRisk) continue;
    if (template.criticality === 'positive' && restaurant.reputation.rating < 4.05) {
      // Позитивные события — за заслуги: высокий рейтинг.
      continue;
    }
    let p = (template.baseProbability / 7) * Math.pow(risk / 100, template.riskElasticity) * diff.eventFrequency;
    // v2 §13.2: доверие ≥ 70 → бонус владельца вероятнее (×1,5);
    // доверие < 45 → реже (×0,6, владелец экономит на вас).
    if (isOwnerBonus) {
      const trust = restaurant.finance.ownerTrust ?? 60;
      if (trust >= BALANCE_V2_4.dividends.trustBonusAt) p *= 1.5;
      else if (trust < 45) p *= 0.6;
    }
    if (rng.chance(Math.min(0.25, p))) {
      events.push(instantiateEvent(template, date));
      break; // не больше одного события в день
    }
  }
  return events;
}

export function instantiateEvent(template: EventTemplate, date: GameDate): GameEvent {
  return {
    id: `evt-${template.id}-${date.week}-${date.day}`,
    date: { ...date, hour: 22 },
    templateId: template.id,
    title: template.title,
    description: template.description,
    criticality: template.criticality,
    effect: structuredClone(template.effect),
    resolved: false,
  };
}

/** Применить эффекты некритического события (немедленно). */
export function applyEventEffects(state: GameState, restaurant: Restaurant, event: GameEvent): void {
  const e = event.effect;
  if (e.cash && e.cash !== 0) {
    // v2 §11.2/§15 (этап 5): негативные суммы ШАБЛОНОВ ПУЛА масштабируются
    // экспозицией («крупный ресторан крупнее и платит»), штрафы — ещё и
    // жёсткостью проверок (отказ инспектору ×1,6). Системные события
    // (дивиденды/разрывы/дилеммы) создаются движком с уже честными суммами.
    if (e.cash < 0) {
      const scaled = Math.round(e.cash * poolEventScale(state, event, restaurant));
      addTransaction(restaurant, event.date, 'fine', -scaled, 'out', `Событие: ${event.title}`);
    } else {
      addTransaction(restaurant, event.date, 'other', e.cash, 'in', `Событие: ${event.title}`);
    }
  }
  if (e.riskDelta) {
    for (const [k, v] of Object.entries(e.riskDelta)) {
      const key = k as RiskType;
      restaurant.risks[key] = clamp(restaurant.risks[key] + (v ?? 0), 0, 100);
    }
  }
  if (e.staffQuit) {
    // v2 §21: выбор роли — детерминированный поток от (seed, нед, день);
    // раньше Math.random() — прогоны с staffQuit-событиями не
    // воспроизводились (разброс текучести C между запусками баланса).
    const rng = deriveRng(hashSeed(state.seed, event.date.week, event.date.day), 'staff-quit');
    const roles = ['hot_cook', 'waiter', 'cold_cook', 'dishwasher'] as const;
    const role = rng.pick(roles);
    const pool = restaurant.staff.pools[role as keyof typeof restaurant.staff.pools];
    if (pool && pool.count > 1) pool.count -= 1;
  }
  if (e.equipmentBreak) {
    restaurant.equipment.coffee.wear = clamp(restaurant.equipment.coffee.wear + 25, 0, 100);
  }
  event.resolved = true;
  state.activeEvents.push(event);
}

/** v2 §11.2/§15: множитель негативных сумм события = экспозиция (пул) ×
 *  жёсткость проверок (все штрафы). Вероятности НЕ зависят от богатства. */
export function poolEventScale(state: GameState, event: GameEvent, restaurant: Restaurant): number {
  if (isLegacy()) return 1;
  let scale = 1;
  const tpl = EVENT_TEMPLATES_MAP[event.templateId];
  if (tpl && !tpl.systemOnly) {
    const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];
    const weekRevenue = lastWeek?.revenue ?? 0;
    const inventoryValue = restaurant.inventory.batches.reduce((s, b) => s + b.quantity * b.unitCost, 0);
    scale = eventCostScale(weekRevenue, inventoryValue);
  }
  // §15 «Инспектор» (отказ): проверки жёстче — штрафы ×1,6 навсегда.
  return scale * eventFineMult(restaurant);
}

/* ============================= ЧИСТОТА, КОМФОРТ, ИЗНОС ============================= */

/** Обновление чистоты (ТЗ §15.5). */
export function updateCleanliness(restaurant: Restaurant, guestsToday: number): void {
  const budgetEffect = restaurant.marketing.cleaningBudget * CLEANING.cleanlinessEffectPerBudget;
  const cleanerCov = 1; // учтено в обороте столов
  const occupancyPressure = (guestsToday / Math.max(1, restaurant.seats)) * 4;
  const target = clamp(62 + budgetEffect + cleanerCov * 5 - occupancyPressure, 0, 100);
  restaurant.cleanliness += (target - restaurant.cleanliness) * 0.35;
  restaurant.cleanliness = clamp(restaurant.cleanliness, 0, 100);
}

/** Комфорт и атмосфера: ремонт, чистота, веранда, сезон. */
export function updateComfortAtmosphere(restaurant: Restaurant, month: number): void {
  const reno = RENOVATION_LEVELS[restaurant.renovation];
  const verandaBonus = restaurant.verandaActive && VERANDA_MONTHS.includes(month) ? 8 : 0;
  restaurant.comfort = clamp(reno.comfortBase + verandaBonus * 0.5, 0, 100);
  const hallEquip = EQUIPMENT_LEVELS[restaurant.equipment.hall.level].qualityFactor * 70;
  restaurant.atmosphere = clamp(
    restaurant.comfort * 0.5 + restaurant.cleanliness * 0.2 + hallEquip * 0.15 + (restaurant.reputation.rating - 3) * 15 + verandaBonus,
    0,
    100,
  );
}

const VERANDA_MONTHS = [5, 6, 7, 8, 9];

/** Износ оборудования: медленный темп (полный износ ~год игры), техобслуживание
 * (оплачивается еженедельно в week.ts) дополнительно замедляет.
 * v2 §7.3: ИЗНОС ОТ ПЕРЕГРУЗКИ — WearRateDay = base × (1 + w × max(0, util − 1)),
 * где util — пиковая загрузка станций дня (передаёт day.ts). При загрузке 1.15
 * оборудование изнашивается в 1.12 (mod) / 1.18 (agr) раза быстрее → раньше
 * поломки и дороже ремонт. legacy — прежняя зависимость от overload-флага. */
export function updateEquipmentWear(restaurant: Restaurant, kitchenLoad: number): void {
  const wearMultiplier = isLegacy()
    ? 0.6 + Math.max(0, kitchenLoad) * 0.8
    : 1 + BALANCE_V2_2.wear.w * Math.max(0, kitchenLoad - 1);
  const K = 0.12;
  restaurant.equipment.kitchen.wear = clamp(
    restaurant.equipment.kitchen.wear + EQUIPMENT_LEVELS[restaurant.equipment.kitchen.level].wearRate * K * wearMultiplier,
    0, 100,
  );
  restaurant.equipment.coffee.wear = clamp(
    restaurant.equipment.coffee.wear + EQUIPMENT_LEVELS[restaurant.equipment.coffee.level].wearRate * K * wearMultiplier * 0.8,
    0, 100,
  );
  restaurant.equipment.hall.wear = clamp(
    restaurant.equipment.hall.wear + EQUIPMENT_LEVELS[restaurant.equipment.hall.level].wearRate * K * 0.5,
    0, 100,
  );
}
