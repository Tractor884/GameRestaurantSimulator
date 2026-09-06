/**
 * Модуль спроса (ТЗ §8, §13.4).
 *
 * NewDemand(segment, hour) =
 *   BaseTraffic(location)
 * × DayProfile(dayOfWeek)
 * × HourProfile(hour)                        [Σ за день = 1]
 * × SegmentShare(location, segment, hour, day) [Σ по сегментам = 1]
 * × SeasonFactor(month) × HolidayFactor
 * × ReputationFactor(rating)
 * × PriceQualityFactor(segment) = PricePerception × QualityPerception
 * × MarketingFactor(segment)
 * × EventFactor(active events)
 * × RandomFactor(rng) ∈ [0.9, 1.1]
 * × CompetitionFactor(location)
 */
import type { GameDate, GameState, Restaurant, SegmentId } from '../types';
import { SEGMENTS, SEGMENT_IDS } from '../config/segments.config';
import { LOCATIONS_MAP } from '../config/locations.config';
import {
  DAY_PROFILES,
  HOLIDAYS,
  HOUR_PROFILES,
  RANDOM_FACTOR_RANGE,
  dayOfYear,
  monthOfDay,
} from '../config/demandProfiles.config';
import { MARKETING_CHANNELS_MAP, MARKETING_LIMITS } from '../config/marketing.config';
import { reputationFactor } from '../config/reputation.config';
import { DIFFICULTIES } from '../config/difficulty.config';
import { dishOf } from '../content/resolve';
import type { Rng } from '../rng';
import { workingHours } from './core';

export interface DemandFactors {
  reputation: number;
  quality: Record<SegmentId, number>;
  marketing: Record<SegmentId, number>;
  event: number;
  season: number;
  holiday: number;
}

/** Средняя цена категории в текущем меню (взвешено популярностью), ₽. */
export function avgCategoryPrices(restaurant: Restaurant): Record<string, number> {
  const sums: Record<string, { w: number; s: number }> = {};
  for (const dishId of restaurant.menu.dishes) {
    const dish = dishOf(restaurant.menu, dishId);
    if (!dish) continue;
    const price = restaurant.menu.prices[dishId] ?? dish.recommendedPrice;
    const bucket = (sums[dish.category] ??= { w: 0, s: 0 });
    bucket.w += dish.basePopularity;
    bucket.s += dish.basePopularity * price;
  }
  const out: Record<string, number> = {};
  for (const [cat, b] of Object.entries(sums)) out[cat] = b.w > 0 ? b.s / b.w : 0;
  return out;
}

/** Ожидаемый чек сегмента по текущему меню (ТЗ §13.5: AverageCheck). */
export function estimatedCheck(restaurant: Restaurant, segmentId: SegmentId): number {
  const seg = SEGMENTS[segmentId];
  const prices = avgCategoryPrices(restaurant);
  let sum = 0;
  for (const [cat, p] of Object.entries(seg.orderProbabilities)) {
    const price = prices[cat];
    if (price && p) sum += p * price;
  }
  return sum;
}

/**
 * MarketingFactor(segment) = clamp(1 + Σ(ChannelLift × Affinity), 0.8, 2.0).
 *
 * ЗАВЕРШЁННЫЕ КАМПАНИИ (ТЗ §21.6 «пост-эффект»): после окончания срока кампания
 * перестаёт стоить денег, но спрос падает не мгновенно — люди уже запомнили
 * ресторан. Остаточный лифт затухает вдвое каждую неделю (0.5^нед) и обнуляется
 * через 2 недели — «инерция узнаваемости». Это делает паузы между кампаниями
 * мягкими и объяснимыми: сразу после остановки спрос держится, затем сползает.
 */
export function marketingFactor(restaurant: Restaurant, segmentId: SegmentId, nowWeek = 0): number {
  let lift = 0;
  for (const c of restaurant.marketing.campaigns) {
    const channel = MARKETING_CHANNELS_MAP[c.channelId];
    if (!channel) continue;
    const dailySpend = c.weeklyBudget / 7;
    const channelLift = channel.maxLift * (1 - Math.exp(-dailySpend / channel.scale));
    let residual = 1;
    if (c.endedWeek != null) {
      // Недель с момента завершения: 0 → полный эффект, далее −50%/нед.
      residual = Math.pow(0.5, Math.max(0, nowWeek - c.endedWeek));
    }
    lift += channelLift * (channel.affinity[segmentId] ?? 0.3) * residual;
  }
  return Math.max(MARKETING_LIMITS.minFactor, Math.min(MARKETING_LIMITS.maxFactor, 1 + lift));
}

/** ReputationFactor по кусочной таблице. */
export function demandReputationFactor(rating: number): number {
  return reputationFactor(rating);
}

/** QualityPerceptionFactor (ТЗ §8.7): история удовлетворённости или рейтинг. */
export function qualityPerceptionFactor(state: GameState): number {
  const logs = state.history.dayLogs;
  if (logs.length >= 3) {
    const s = logs.slice(-7).reduce((sum, l) => sum + l.kpi.satisfaction, 0) / Math.min(7, logs.length);
    return Math.max(0.5, Math.min(1.3, 0.6 + 0.4 * (s / 100)));
  }
  const rating = state.restaurant?.reputation.rating ?? 3.9;
  return Math.max(0.5, Math.min(1.3, 0.5 + rating / 10));
}

/** EventFactor ∈ [0.3, 2.0]: произведение активных бустов спроса. */
export function eventDemandFactor(state: GameState, week: number): number {
  let f = 1;
  for (const e of state.activeEvents) {
    if (e.effect.demandBoost && e.effect.demandBoostWeeks) {
      const until = e.date.week + e.effect.demandBoostWeeks;
      if (week <= until) f *= e.effect.demandBoost;
    }
  }
  return Math.max(0.3, Math.min(2.0, f));
}

/** Сезонный и праздничный множители. */
export function seasonHolidayFactors(locationId: string, date: GameDate): { season: number; holiday: number } {
  const loc = LOCATIONS_MAP[locationId];
  const month = monthOfDay(dayOfYear(date.week, date.day));
  const season = loc.seasonProfile[month - 1] ?? 1;
  const doy = dayOfYear(date.week, date.day);
  const holiday = HOLIDAYS.find((h) => Math.abs(h.dayOfYear - doy) <= 1)?.factor ?? 1;
  return { season, holiday };
}

/**
 * Итоговый спрос по сегментам на час. Возвращает гостей по сегментам.
 * Именно здесь работает вся цепочка множителей ТЗ §8.2.
 */
export function hourlyDemand(
  state: GameState,
  restaurant: Restaurant,
  date: GameDate,
  hour: number,
  rng: Rng,
): { newDemand: Record<SegmentId, number>; returning: Record<SegmentId, number> } {
  const loc = LOCATIONS_MAP[restaurant.locationId];
  const diff = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.standard;
  const isWeekend = date.day >= 5;
  const hourIdx = hour - 8;
  const hours = workingHours(restaurant, date.day);

  // Часовой профиль локации (нормализованный под фактические часы работы).
  const rawProfile = HOUR_PROFILES[isWeekend ? 'weekend' : 'weekday'][loc.type];
  const visible = hours.map((h) => rawProfile[h - 8]);
  const visibleSum = visible.reduce((a, b) => a + b, 0) || 1;
  const hourProfile = rawProfile[hourIdx] / visibleSum;

  const dayProfile = DAY_PROFILES[loc.type][date.day];
  const { season, holiday } = seasonHolidayFactors(restaurant.locationId, date);
  const repFactor = demandReputationFactor(restaurant.reputation.rating);
  const quality = qualityPerceptionFactor(state);
  const eventFactor = eventDemandFactor(state, date.week);
  const base = loc.baseTraffic * dayProfile * hourProfile * season * holiday * repFactor * eventFactor * loc.competitionFactor;

  // Доли сегментов в этот час: baseShare × hourWeight × dayWeight, нормировка.
  const weights: Record<string, number> = {};
  let total = 0;
  for (const segId of SEGMENT_IDS) {
    const seg = SEGMENTS[segId];
    const baseShare = loc.segmentShares[segId] ?? 0;
    const hw = seg.hourWeights[hour] ?? 0;
    const dw = seg.dayWeights[date.day];
    const w = baseShare * hw * dw;
    weights[segId] = w;
    total += w;
  }
  // Если ни у одного сегмента нет веса в этот час — спроса нет.
  if (total <= 0) return { newDemand: emptyDemand(), returning: emptyReturning() };

  const newDemand = emptyDemand();
  for (const segId of SEGMENT_IDS) {
    const seg = SEGMENTS[segId];
    const share = weights[segId] / total;
    if (share <= 0) continue;
    // PriceQualityFactor: цена + качество.
    const est = estimatedCheck(restaurant, segId);
    const gap = seg.budget > 0 ? est / seg.budget - 1 : 0;
    const pricePerception = Math.max(0.3, Math.min(1.5, 1 - seg.priceSensitivity * diff.demandElasticity * gap));
    const pq = pricePerception * quality;
    const mf = marketingFactor(restaurant, segId, date.week);
    const rand = rng.float(RANDOM_FACTOR_RANGE[0], RANDOM_FACTOR_RANGE[1]);
    newDemand[segId] = Math.max(0, base * share * pq * mf * rand);
  }

  const returning = emptyReturning();
  return { newDemand, returning };
}

/** Возвратный спрос дня по сегментам (считается в returns.ts, передаётся сюда). */
export function emptyDemand(): Record<SegmentId, number> {
  return {
    breakfast: 0, business_lunch: 0, office_evening: 0, family: 0,
    youth: 0, tourist: 0, premium: 0, evening: 0,
  };
}

export function emptyReturning(): Record<SegmentId, number> {
  return { ...emptyDemand() };
}

/** Предел спроса за весь день (для KPI guest_flow). */
export function potentialDailyDemand(state: GameState, restaurant: Restaurant, date: GameDate): number {
  const loc = LOCATIONS_MAP[restaurant.locationId];
  const isWeekend = date.day >= 5;
  const dayProfile = DAY_PROFILES[loc.type][date.day];
  const { season, holiday } = seasonHolidayFactors(restaurant.locationId, date);
  return loc.baseTraffic * dayProfile * season * holiday * loc.competitionFactor;
}
