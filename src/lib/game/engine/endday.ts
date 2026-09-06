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
} from '../types';
import { SEGMENTS, SEGMENT_IDS } from '../config/segments.config';
import { REPUTATION_CONFIG } from '../config/reputation.config';
import { RETURNS_CONFIG } from '../config/returns.config';
import { REVIEW_CHANNELS } from '../config/reviews.config';
import { EVENT_CONFIG, EVENT_TEMPLATES, type EventTemplate } from '../config/risks.config';
import { DIFFICULTIES } from '../config/difficulty.config';
import { CLEANING } from '../config/marketing.config';
import { RENOVATION_LEVELS, EQUIPMENT_LEVELS } from '../config/premises.config';
import { MARKETING_CHANNELS_MAP } from '../config/marketing.config';
import { RISK_LIMITS } from '../config/risks.config';
import type { Rng } from '../rng';
import { clamp, dayIndex, addTransaction } from './core';
import { SEGMENTS as SEGS } from '../config/segments.config';

/* ============================= ОТЗЫВЫ И РЕЙТИНГ ============================= */

let reviewCounter = 0;

/**
 * Генерация отзывов за день (ТЗ §16).
 * ReviewProbability = BaseSegmentProbability × SatisfactionModifier × RandomFactor.
 * SatisfactionModifier = 1 + |S − 70| / 50 — крайности отзывчивее.
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
      reviews.push({
        id: `rev-${++reviewCounter}-${date.week}-${date.day}`,
        date: { ...date },
        segmentId: segId,
        score: Math.round(score * 10) / 10,
        weight: scandal ? REPUTATION_CONFIG.scandalWeight : 1,
        text: scandal
          ? 'Отвратительный опыт: ждали, ошиблись с заказом, никто не извинился. Расскажу всем!'
          : `«${segmentText(segId, score)}» — ${REVIEW_CHANNELS[rng.int(0, REVIEW_CHANNELS.length)]}`,
        scandal,
      });
    }
  }
  return reviews;
}

function segmentText(segId: SegmentId, score: number): string {
  const base = SEGS[segId].name;
  return score >= 4 ? `${base}: остались довольны` : score >= 3 ? `${base}: средние впечатления` : `${base}: недовольны`;
}

/**
 * Эффективный рейтинг — байесовский с окном свежести (ТЗ §16.5).
 * EffectiveRating = (prior×n + Σ Score×Weight×Freshness) / (prior + Σ Weight×Freshness).
 */
export function recomputeRating(restaurant: Restaurant, now: GameDate): void {
  const rep = restaurant.reputation;
  let weightedSum = 0;
  let weightSum = 0;
  for (const r of rep.windowReviews) {
    const ageDays = Math.max(0, dayIndex(now) - dayIndex(r.date));
    const freshness = 0.5 + 0.5 * Math.max(0, (28 - ageDays) / 28);
    weightedSum += r.score * r.weight * freshness;
    weightSum += r.weight * freshness;
  }
  const prior = rep.priorReviews ?? REPUTATION_CONFIG.priorReviews;
  const priorRating = rep.priorRating ?? REPUTATION_CONFIG.priorRating;
  rep.rating =
    weightSum > 0
      ? Math.round(((prior * priorRating + weightedSum) / (prior + weightSum)) * 100) / 100
      : priorRating;
  rep.rating = clamp(rep.rating, 1, 5);
}

export function addReviews(restaurant: Restaurant, reviews: Review[], now: GameDate): void {
  restaurant.reputation.windowReviews.push(...reviews);
  // Окно: последние 100 отзывов (ТЗ §16.6).
  if (restaurant.reputation.windowReviews.length > REPUTATION_CONFIG.windowSize) {
    restaurant.reputation.windowReviews.splice(0, restaurant.reputation.windowReviews.length - REPUTATION_CONFIG.windowSize);
  }
  recomputeRating(restaurant, now);
}

/* ============================= ВОЗВРАТНЫЕ ГОСТИ ============================= */

/** Создание когорт обслуженных гостей дня (ТЗ §17.1). */
export function createCohorts(
  restaurant: Restaurant,
  date: GameDate,
  seatedBySegment: Record<SegmentId, number>,
  satisfaction: number,
): void {
  const loyaltyActive = restaurant.marketing.campaigns.some((c) => c.channelId === 'loyalty');
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
 */
export function returningDemandForDay(
  restaurant: Restaurant,
  date: GameDate,
): Record<SegmentId, number> {
  const out = {
    breakfast: 0, business_lunch: 0, office_evening: 0, family: 0,
    youth: 0, tourist: 0, premium: 0, evening: 0,
  } as Record<SegmentId, number>;
  const todayIdx = dayIndex(date);
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
    // Равномерно по дням окна задержки: P/окно × затухание.
    const guests = (cohort.remainingReturnPotential / window) * decay;
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
    lostGuests: number;
    negativeReviews: number;
    kitchenOverloadHours: number;
    avgStaffLoad: number;
    cashWarning: boolean;
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

  // Санитарный: просрочка (с насыщением — 1 партия ≠ катастрофа), грязь, ошибки.
  push('sanitary', Math.min(ctx.expiredCount, 10) * 0.6 + Math.max(0, 60 - restaurant.cleanliness) / 15 - RISK_LIMITS.dailyRelax, 'просрочка и чистота');
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
  // Кадровый: перегрузка и мораль.
  const avgMorale = SEGMENT_IDS.length > 0
    ? Object.values(restaurant.staff.pools).reduce((s, p) => s + p.morale * p.count, 0) /
      Math.max(1, Object.values(restaurant.staff.pools).reduce((s, p) => s + p.count, 0))
    : 70;
  push('staff', Math.max(0, ctx.avgStaffLoad - 1.05) * 5 + Math.max(0, 45 - avgMorale) / 15 - RISK_LIMITS.dailyRelax, 'нагрузка и мораль');
  // Репутационный: ушедшие гости и негатив.
  push('reputation', ctx.lostGuests * 0.03 + ctx.negativeReviews * 1.0 - RISK_LIMITS.dailyRelax - 0.15, 'очередь и отзывы');
  // Юридический: медленный дрейф.
  push('legal', 0.15 - RISK_LIMITS.dailyRelax, 'текущий комплаенс');
  // Финансовый: прогноз денег и просрочки.
  push('financial', ctx.cashWarning ? 1.5 : -RISK_LIMITS.dailyRelax, 'денежная позиция');
  return changes;
}

/* ============================= СОБЫТИЯ ============================= */

/**
 * Проверка событий в конце дня (ТЗ §20.3).
 * EventProbability = Base/7 × (Risk/100)^elasticity × difficulty × rng.
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
  for (const template of EVENT_TEMPLATES) {
    const risk = restaurant.risks[template.riskType];
    if (risk < template.minRisk) continue;
    if (template.criticality === 'positive' && restaurant.reputation.rating < 4.05) {
      // Позитивные события — за заслуги: высокий рейтинг.
      continue;
    }
    const p = (template.baseProbability / 7) * Math.pow(risk / 100, template.riskElasticity) * diff.eventFrequency;
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
    if (e.cash > 0) {
      addTransaction(restaurant, event.date, 'other', e.cash, 'in', `Событие: ${event.title}`);
    } else {
      addTransaction(restaurant, event.date, 'fine', -e.cash, 'out', `Событие: ${event.title}`);
    }
  }
  if (e.riskDelta) {
    for (const [k, v] of Object.entries(e.riskDelta)) {
      const key = k as RiskType;
      restaurant.risks[key] = clamp(restaurant.risks[key] + (v ?? 0), 0, 100);
    }
  }
  if (e.staffQuit) {
    const roles = ['hot_cook', 'waiter', 'cold_cook', 'dishwasher'];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const pool = restaurant.staff.pools[role as keyof typeof restaurant.staff.pools];
    if (pool && pool.count > 1) pool.count -= 1;
  }
  if (e.equipmentBreak) {
    restaurant.equipment.coffee.wear = clamp(restaurant.equipment.coffee.wear + 25, 0, 100);
  }
  event.resolved = true;
  state.activeEvents.push(event);
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
 * (оплачивается еженедельно в week.ts) дополнительно замедляет. */
export function updateEquipmentWear(restaurant: Restaurant, kitchenLoad: number): void {
  const loadFactor = 0.6 + Math.max(0, kitchenLoad) * 0.8;
  const K = 0.12;
  restaurant.equipment.kitchen.wear = clamp(
    restaurant.equipment.kitchen.wear + EQUIPMENT_LEVELS[restaurant.equipment.kitchen.level].wearRate * K * loadFactor,
    0, 100,
  );
  restaurant.equipment.coffee.wear = clamp(
    restaurant.equipment.coffee.wear + EQUIPMENT_LEVELS[restaurant.equipment.coffee.level].wearRate * K * loadFactor * 0.8,
    0, 100,
  );
  restaurant.equipment.hall.wear = clamp(
    restaurant.equipment.hall.wear + EQUIPMENT_LEVELS[restaurant.equipment.hall.level].wearRate * K * 0.5,
    0, 100,
  );
}
