/**
 * САНИТАРНЫЙ КОНТРОЛЬ / HACCP (запрос пользователя, v9).
 *
 * HACCP (Hazard Analysis and Critical Control Points) — система контроля
 * критических точек: приёмка поставок, температурные журналы, ротация
 * запасов, гигиена персонала. В игре — «аудит HACCP» вместо паники:
 *
 *  - аудит стоит 35 000 ₽ (внешний лаборант + обучение персонала журналам);
 *  - сразу снижает санитарный риск −6 и открывает окно соответствия
 *    protectionDays: ЦЕЛЬ санитарного риска ×0,75 (дисциплина сроков,
 *    температур и приёмки держит риск ниже);
 *  - долгое отсутствие аудита (> neglectDays) — обратный эффект: цель
 *    санитарного риска ×1,3 (журналы не ведутся, приёмка «на глаз»,
 *    проверки находят систематику, а не случайность).
 *
 * Генеральная уборка (deepCleaning, 120 тыс) и режим закупки остаются
 * отдельными рычагами: HACCP — про СИСТЕМУ, уборка — про разовую чистоту.
 * Состояние детерминировано от абсолютного дня — в сейве два числа.
 */
export const HACCP = {
  /** Стоимость аудита HACCP: ₽ разово. */
  auditCost: 35_000,
  /** Аудит сразу снижает санитарный риск. */
  riskDrop: 6,
  /** Окно соответствия после аудита, дней. */
  protectionDays: 28,
  /** Цель санитарного риска ×N внутри окна соответствия. */
  targetMultCompliant: 0.75,
  /** «Запущенность»: столько дней без аудита. */
  neglectDays: 56,
  /** Цель санитарного риска ×N при запущенности. */
  targetMultNeglected: 1.3,
} as const;

export type HaccpStatus = 'compliant' | 'ok' | 'neglected';

/** Статус санитарной системы на абсолютный день. */
export function haccpStatus(lastAuditDay: number | undefined, absDay: number): HaccpStatus {
  if (lastAuditDay == null) return 'ok';
  const since = absDay - lastAuditDay;
  if (since >= 0 && since <= HACCP.protectionDays) return 'compliant';
  if (since > HACCP.neglectDays) return 'neglected';
  return 'ok';
}

/** Множитель ЦЕЛИ санитарного риска (endday.updateRisks). */
export function haccpTargetMult(status: HaccpStatus): number {
  if (status === 'compliant') return HACCP.targetMultCompliant;
  if (status === 'neglected') return HACCP.targetMultNeglected;
  return 1;
}
