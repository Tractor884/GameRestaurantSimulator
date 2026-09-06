/**
 * Конфиг маркетинга (ТЗ §21).
 * ChannelLift = maxLift × (1 - exp(-dailySpend / scale))
 * MarketingFactor(сегмент) = clamp(1 + Σ(ChannelLift × Affinity), 0.8, 2.0)
 *
 * ПРИМЕР: соцсети, бюджет 100 тыс ₽/нед → 14.3 тыс ₽/день, scale 8000:
 *   Lift = 0.25 × (1 - e^(-1.79)) = 0.207 → молодёжь (+0.207) реагирует сильнее всех.
 */
import type { SegmentId } from '../types';

export interface MarketingChannelConfig {
  id: string;
  name: string;
  maxLift: number;
  scale: number; // ₽/день, при расходе scale достигается 63% maxLift
  minWeeklyBudget: number;
  maxWeeklyBudget: number;
  defaultWeeklyBudget: number;
  affinity: Partial<Record<SegmentId, number>>;
  description: string;
}

export const MARKETING_CHANNELS: MarketingChannelConfig[] = [
  {
    id: 'social_ads',
    name: 'Соцсети и таргет',
    maxLift: 0.25,
    scale: 8000,
    minWeeklyBudget: 20_000,
    maxWeeklyBudget: 350_000,
    defaultWeeklyBudget: 100_000,
    affinity: { youth: 1.0, tourist: 0.7, evening: 0.7, office_evening: 0.6, family: 0.6, breakfast: 0.5, business_lunch: 0.4, premium: 0.3 },
    description: 'Instagram*/VK-таргетинг. Лучший канал для молодёжи и туристов.',
  },
  {
    id: 'food_blogs',
    name: 'Фуд-блогеры',
    maxLift: 0.2,
    scale: 12_000,
    minWeeklyBudget: 30_000,
    maxWeeklyBudget: 400_000,
    defaultWeeklyBudget: 120_000,
    affinity: { tourist: 1.0, youth: 0.8, premium: 0.7, evening: 0.6, office_evening: 0.5, family: 0.4, business_lunch: 0.3, breakfast: 0.2 },
    description: 'Обзоры и посевы. Мощно гонит туристов и премиум.',
  },
  {
    id: 'search_maps',
    name: 'Карты и поиск',
    maxLift: 0.15,
    scale: 6000,
    minWeeklyBudget: 15_000,
    maxWeeklyBudget: 200_000,
    defaultWeeklyBudget: 70_000,
    affinity: { business_lunch: 1.0, tourist: 0.9, breakfast: 0.8, office_evening: 0.7, family: 0.6, evening: 0.5, youth: 0.5, premium: 0.4 },
    description: 'Топ выдачи в картах. Рабочая лошадка для ланчей и завтраков.',
  },
  {
    id: 'loyalty',
    name: 'Рассылки и лояльность',
    maxLift: 0.12,
    scale: 4000,
    minWeeklyBudget: 10_000,
    maxWeeklyBudget: 150_000,
    defaultWeeklyBudget: 50_000,
    affinity: { family: 0.9, business_lunch: 0.8, breakfast: 0.7, evening: 0.6, office_evening: 0.6, premium: 0.5, youth: 0.3, tourist: 0.1 },
    description: 'Email/push база гостей. Разгоняет возвратность, не новых.',
  },
  {
    id: 'outdoor',
    name: 'Наружная реклама',
    maxLift: 0.18,
    scale: 20_000,
    minWeeklyBudget: 40_000,
    maxWeeklyBudget: 500_000,
    defaultWeeklyBudget: 150_000,
    affinity: { youth: 0.7, breakfast: 0.6, office_evening: 0.6, business_lunch: 0.5, family: 0.5, evening: 0.4, tourist: 0.4, premium: 0.2 },
    description: 'Щиты у метро. Дорогой охват районной аудитории.',
  },
];

export const MARKETING_CHANNELS_MAP: Record<string, MarketingChannelConfig> = Object.fromEntries(
  MARKETING_CHANNELS.map((c) => [c.id, c]),
);

export const MARKETING_LIMITS = { minFactor: 0.8, maxFactor: 2.0 };

/** Бюджет клининга: 45 тыс ₽/нед = поддержание чистоты; свыше — рост качества. */
export const CLEANING = {
  baseWeeklyBudget: 45_000,
  cleanlinessEffectPerBudget: 0.00018, // очков чистоты за ₽/нед (примерно +8 при 90к)
  deepCleaningCost: 120_000, // разовая генеральная уборка
  deepCleaningEffect: 18,
};
