/**
 * ============================================================================
 * КОМПОЗИТНАЯ СЦЕНА ЗАЛА (VISUAL_STATE_MAP §10–§11, ГЛАВНЫЙ ЭКРАН)
 * ============================================================================
 * Сводное визуальное состояние: очередь, пол, посуда, кофе, пар/дым,
 * настроение гостей + топ-сегменты, стафф в зале, предписание на входе.
 * Pure-функция от GameState.
 */

import type { GameState, RoleId, SegmentId } from '@/lib/game/types';
import type { GuestSpriteId, GuestMood, QueueLevel, SceneVisualState } from './types';
import { getCoffeeDisplay } from './equipment';
import { THRESHOLDS } from './thresholds';
import { getStaffRoleMood, peakKitchenLoad, isUnderstaffed } from './characters';

/** Максимальная средняя очередь за день (§11). */
function maxQueueAvg(state: GameState): number {
  const logs = state.lastDayResult?.hourLogs ?? [];
  let q = 0;
  for (const h of logs) q = Math.max(q, h.queueAvg);
  return q;
}

function queueLevel(q: number): QueueLevel {
  if (q > THRESHOLDS.queue.large) return 'large';
  if (q >= THRESHOLDS.queue.medium) return 'medium';
  if (q >= THRESHOLDS.queue.small) return 'small';
  return 'none';
}

/** Общее настроение гостей дня (§10). */
export function getGuestMoodOfDay(state: GameState): GuestMood {
  const kpi = state.lastDayResult?.kpi;
  if (!kpi) return 'neutral';
  const total = kpi.guests + kpi.lostGuests;
  const lostShare = total > 0 ? kpi.lostGuests / total : 0;
  if (kpi.satisfaction >= THRESHOLDS.satisfaction.happy && lostShare < THRESHOLDS.lostShare.happy) {
    return 'happy';
  }
  if (kpi.satisfaction < THRESHOLDS.satisfaction.unhappy || lostShare > THRESHOLDS.lostShare.unhappy) {
    return 'unhappy';
  }
  return 'neutral';
}

/** Сегмент движка → спрайт гостей (ASSET_LIST §3). */
const SEGMENT_TO_SPRITE: Record<SegmentId, GuestSpriteId> = {
  business_lunch: 'business',
  office_evening: 'business',
  family: 'family',
  breakfast: 'family',
  evening: 'couple_evening',
  tourist: 'tourist',
  youth: 'youth',
  premium: 'premium',
};

/** Топ-2-3 сегмента последних дней по трафику (§10). */
function topGuestSegments(state: GameState): GuestSpriteId[] {
  const cohorts = state.restaurant?.customerMemory.cohorts ?? [];
  const recent = cohorts.filter((c) => c.ageDays <= 2);
  const bySegment = new Map<SegmentId, number>();
  for (const c of recent) {
    bySegment.set(c.segmentId, (bySegment.get(c.segmentId) ?? 0) + c.guests);
  }
  return [...bySegment.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([seg]) => SEGMENT_TO_SPRITE[seg])
    .filter((v, i, arr) => arr.indexOf(v) === i); // дедупликация спрайтов
}

/** Сцена §11. */
export function getRestaurantVisualState(state: GameState): SceneVisualState {
  const r = state.restaurant;

  // Очередь.
  const queue = queueLevel(maxQueueAvg(state));

  // Пол: чистота ≥75 выкл; 35–74 слой (α 40% при ≥50 — компонент); <35 heavy.
  const cleanliness = r?.cleanliness ?? 100;
  const floor = cleanliness >= THRESHOLDS.cleanliness.off ? 'off' : cleanliness >= THRESHOLDS.cleanliness.heavy ? 'on' : 'heavy';

  // Посуда: недокомплект мойщиков/уборщиков или износ зала (§11).
  const dishesOn =
    isUnderstaffed(state, 'cleaner' as RoleId) ||
    isUnderstaffed(state, 'dishwasher' as RoleId) ||
    (r?.equipment.hall.wear ?? 0) >= THRESHOLDS.dishesWear;

  // Кухня: пар/дым по пиковой загрузке (§11).
  const peak = peakKitchenLoad(state);
  const kitchen = peak >= THRESHOLDS.kitchenLoad.critical ? 'heavy' : peak >= THRESHOLDS.kitchenLoad.warning ? 'on' : 'off';

  // Предписание на входе: активные сан/юр события (§11).
  let notice: SceneVisualState['notice'] = 'none';
  for (const e of state.activeEvents) {
    if (e.resolved) continue;
    const delta = e.effect.riskDelta ?? {};
    if ((delta.sanitary ?? 0) > 0) notice = 'sanitary';
    else if ((delta.legal ?? 0) > 0 && notice === 'none') notice = 'legal';
  }

  return {
    queue,
    floor,
    dishes: dishesOn ? 'on' : 'off',
    coffee: getCoffeeDisplay(state),
    kitchen,
    guestMood: getGuestMoodOfDay(state),
    guestSegments: topGuestSegments(state),
    staff: [
      { roleId: 'waiter', mood: getStaffRoleMood(state, 'waiter') },
      { roleId: 'hostess', mood: getStaffRoleMood(state, 'hostess') },
    ],
    notice,
  };
}
