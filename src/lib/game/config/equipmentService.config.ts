/**
 * ПРОФИЛАКТИКА ОБОРУДОВАНИЯ (запрос пользователя, v8).
 *
 * Профилактика ДЕШЕВЛЕ ремонта (8% балансовой стоимости против
 * стоимости × износ × 40% у ремонта) и работает НА ПЕРЕД:
 *  - износ −12 сразу + окно защиты protectionDays: износ растёт ×0,5,
 *    вероятность поломок (техриск) ×0,55;
 *  - долге отсутствие обслуживания (> neglectDays с последнего ТО)
 *    — обратное: износ ×1,3, вероятность поломок ×1,6.
 *
 * Ремонт и покупка нового оборудования также обновляют lastServicedAt
 * (новое/отремонтированное = обслуженное). Состояние детерминировано
 * от абсолютного дня — в сейвах только одно число на зону.
 */
export const EQUIPMENT_SERVICE = {
  /** Стоимость профилактики: доля балансовой стоимости зоны. */
  costShare: 0.08,
  /** Профилактика снимает столько износа. */
  wearReduction: 12,
  /** Окно защиты после ТО, дней. */
  protectionDays: 28,
  /** Износ растёт ×N внутри окна защиты. */
  wearMultProtected: 0.5,
  /** Множитель вероятности поломок внутри окна защиты (техриск-цель). */
  breakMultProtected: 0.55,
  /** «Запущенность»: столько дней без ТО, дней. */
  neglectDays: 56,
  /** Износ растёт ×N при запущенности. */
  wearMultNeglected: 1.3,
  /** Множитель вероятности поломок при запущенности. */
  breakMultNeglected: 1.6,
  /** Профилактика снижает техриск сразу (сервис осмотрел — спокойнее). */
  techRiskDrop: 4,
} as const;

export type ServiceStatus = 'protected' | 'fresh' | 'neglected';

/** Статус обслуживания зоны на абсолютный день. */
export function serviceStatus(lastServicedAt: number | undefined, absDay: number): ServiceStatus {
  if (lastServicedAt == null) return 'fresh';
  const since = absDay - lastServicedAt;
  if (since >= 0 && since <= EQUIPMENT_SERVICE.protectionDays) return 'protected';
  if (since > EQUIPMENT_SERVICE.neglectDays) return 'neglected';
  return 'fresh';
}

/** Множитель роста износа зоны. */
export function wearMult(status: ServiceStatus): number {
  if (status === 'protected') return EQUIPMENT_SERVICE.wearMultProtected;
  if (status === 'neglected') return EQUIPMENT_SERVICE.wearMultNeglected;
  return 1;
}

/** Множитель вероятности поломок зоны. */
export function breakMult(status: ServiceStatus): number {
  if (status === 'protected') return EQUIPMENT_SERVICE.breakMultProtected;
  if (status === 'neglected') return EQUIPMENT_SERVICE.breakMultNeglected;
  return 1;
}
