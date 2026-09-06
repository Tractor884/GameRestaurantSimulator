/**
 * Конфиг возвратных гостей (ТЗ §17).
 * ReturnProbability = baseLoyalty × (Satisfaction/100)^elasticity × marketingLoyaltyFactor
 * Затухание когорты: Decay = 0.85^ageWeeks, максимум 12 недель.
 */
import type { SegmentId } from '../types';

export interface ReturnsConfig {
  maxReturnWeeks: number;
  decayFactorPerWeek: number;
  segmentReturnDelays: Record<SegmentId, [number, number]>;
  marketingLoyaltyFactorMax: number; // эффект канала лояльности
}

export const RETURNS_CONFIG: ReturnsConfig = {
  maxReturnWeeks: 12,
  decayFactorPerWeek: 0.85,
  segmentReturnDelays: {
    breakfast: [1, 3],
    business_lunch: [1, 7],
    office_evening: [3, 14],
    family: [7, 21],
    youth: [3, 14],
    tourist: [30, 90],
    premium: [14, 45],
    evening: [3, 21],
  },
  marketingLoyaltyFactorMax: 1.25,
};
