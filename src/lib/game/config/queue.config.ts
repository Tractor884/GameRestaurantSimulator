/**
 * Конфиг очереди (ТЗ §9). Подшаги по 15 минут.
 * SeatingCapacityPerHour = min(хостес, места/EffectiveStayHours × ComfortFactor × VerandaFactor)
 */
import type { SegmentId } from '../types';

export interface QueueConfig {
  queueStepMinutes: number;
  /** Лимит ожидания по сегментам берётся из segments.config (ТЗ §29.2). */
  lostGuestSatisfactionPenalty: number; // -удовлетворённость за ушедшего
  queueReputationImpact: number; // вклад ушедших в репутационный риск
  baseTableClearMinutes: number; // базовое время уборки стола
  /** Средняя длительность сидения по периодам, ч. */
  stayHoursByPeriod: { breakfast: number; lunch: number; dinner: number };
  hostessGuestsPerHour: number; // хостес сажает гостей/час
}

export const QUEUE_CONFIG: QueueConfig = {
  queueStepMinutes: 15,
  lostGuestSatisfactionPenalty: 20,
  queueReputationImpact: 0.2,
  baseTableClearMinutes: 8,
  stayHoursByPeriod: { breakfast: 1.0, lunch: 1.1, dinner: 1.7 },
  hostessGuestsPerHour: 45,
};

/** Период дня по часу (ТЗ §4.4). */
export function dayPeriod(hour: number): 'breakfast' | 'lunch' | 'dinner' {
  if (hour < 12) return 'breakfast';
  if (hour < 17) return 'lunch';
  return 'dinner';
}

export const MAX_QUEUE_MINUTES_FALLBACK = 15;
export type SegmentQueueMap = Record<SegmentId, number>;
