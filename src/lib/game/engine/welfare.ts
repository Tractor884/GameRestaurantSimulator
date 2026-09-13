/**
 * ============================================================================
 * БЛАГОСОСТОЯНИЕ КОМАНДЫ (бэклог): премии, тренинги, медстраховка
 * ============================================================================
 * Три рычага удержания и развития персонала:
 *  - payBonus: разовая премия всему штату (мораль +, усталость −),
 *    с кулдауном 14 дней (частые премии обесцениваются — эффект ×0.5);
 *  - trainRole: тренинг роли (мгновенная адаптация новичков, усталость −,
 *    мораль +), кулдаун 21 день;
 *  - setInsurance: медстраховка персонала — 4% недельного ФОТ списывается
 *    при закрытии недели, мораль медленнее падает (decay ×0.24), риск
 *    увольнений ×0.6.
 *
 * ИНВАРИАНТЫ:
 *  - все деньги — только через addTransaction (единая точка учёта);
 *  - по умолчанию всё ВЫКЛЮЧЕНО → симуляция без действий игрока
 *    побайтово идентична прежней (эталоны engine-test живы);
 *  - эффекты детерминированы (без rng) — экранные подсказки честны.
 */

import type { GameState, RoleId } from '@/lib/game/types';
import { STAFF_ROLES, ROLE_IDS } from '@/lib/game/config/staffRoles.config';
import { hourlyRate } from './staff';
import { addTransaction, clamp, dayIndex } from './core';
import type { ActionResult } from './setup';

/** Абсолютный день игры (для кулдаунов). */
export function absoluteDay(state: GameState): number {
  return (state.week - 1) * 7 + state.day;
}

/** Оценка недельного ФОТ по графику смен (₽ gross, как на экране «Персонал»). */
export function weeklyPayrollEstimate(state: GameState): number {
  const staff = state.restaurant?.staff;
  if (!staff) return 0;
  let sum = 0;
  for (const roleId of ROLE_IDS) {
    const shifts = staff.schedule[roleId] ?? [];
    const total = shifts.reduce((s, sh) => s + sh.morning + sh.evening, 0);
    sum += total * 8 * hourlyRate(roleId);
  }
  return sum;
}

/* ── ПРЕМИЯ ВСЕМУ ШТАТУ ── */

/** Кулдаун премий: чаще — эффект ×0.5 («премии обесцениваются»). */
export const BONUS_COOLDOWN_DAYS = 14;
/** Стоимость: 30% недельного ФОТ, границы 25–500 тыс ₽. */
export const BONUS_PAYROLL_SHARE = 0.3;
export const BONUS_MIN = 25_000;
export const BONUS_MAX = 500_000;

export function bonusCost(state: GameState): number {
  return Math.round(
    Math.min(BONUS_MAX, Math.max(BONUS_MIN, weeklyPayrollEstimate(state) * BONUS_PAYROLL_SHARE)),
  );
}

export function payBonus(state: GameState): ActionResult {
  const r = state.restaurant;
  if (!r) return { ok: false, message: 'Нет ресторана' };
  const cost = bonusCost(state);
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег на премии' };

  const now = absoluteDay(state);
  const last = r.staff.lastBonusDay ?? -999;
  const cooled = now - last >= BONUS_COOLDOWN_DAYS;
  const moraleGain = cooled ? 12 : 6;
  const fatigueDrop = cooled ? 6 : 3;

  addTransaction(r, { week: state.week, day: state.day, hour: 20 }, 'bonus', cost, 'out', 'Премия всему штату');
  for (const pool of Object.values(r.staff.pools)) {
    pool.morale = clamp(pool.morale + moraleGain, 0, 100);
    pool.fatigue = clamp(pool.fatigue - fatigueDrop, 0, 100);
  }
  r.staff.lastBonusDay = now;
  return {
    ok: true,
    message: cooled
      ? `Премии выплачены: мораль +${moraleGain}, усталость −${fatigueDrop}`
      : `Премии выплачены (частые — эффект halves): мораль +${moraleGain}`,
  };
}

/* ── ТРЕНИНГ РОЛИ ── */

/** Кулдаун тренинга роли: 21 день. */
export const TRAINING_COOLDOWN_DAYS = 21;
/** Стоимость: 15 000 ₽ × сотрудников роли. */
export const TRAINING_COST_PER_PERSON = 15_000;

export function trainingCost(state: GameState, roleId: RoleId): number {
  const count = state.restaurant?.staff.pools[roleId]?.count ?? 0;
  return Math.max(TRAINING_COST_PER_PERSON, TRAINING_COST_PER_PERSON * count);
}

export function trainRole(state: GameState, roleId: RoleId): ActionResult {
  const r = state.restaurant;
  if (!r) return { ok: false, message: 'Нет ресторана' };
  const pool = r.staff.pools[roleId];
  if (!pool || pool.count <= 0) return { ok: false, message: 'В этой роли нет сотрудников' };

  const now = absoluteDay(state);
  const last = r.staff.trainedAt?.[roleId] ?? -999;
  if (now - last < TRAINING_COOLDOWN_DAYS) {
    return { ok: false, message: 'Тренинг этой роли был недавно (кулдаун 3 недели)' };
  }

  const cost = trainingCost(state, roleId);
  if (r.finance.cash < cost) return { ok: false, message: 'Недостаточно денег на тренинг' };

  addTransaction(
    r,
    { week: state.week, day: state.day, hour: 20 },
    'training',
    cost,
    'out',
    `Тренинг: ${STAFF_ROLES[roleId].name}`,
  );
  const newbies = pool.newHires;
  pool.newHires = 0;
  pool.morale = clamp(pool.morale + 5, 0, 100);
  pool.fatigue = clamp(pool.fatigue - 8, 0, 100);
  if (!r.staff.trainedAt) r.staff.trainedAt = {};
  r.staff.trainedAt[roleId] = now;
  return {
    ok: true,
    message: `Тренинг ${STAFF_ROLES[roleId].name}: адаптировано ${newbies} новичков, мораль +5, усталость −8`,
  };
}

/* ── МЕДСТРАХОВКА ── */

/** Стоимость страховки: 4% недельного ФОТ. */
export const INSURANCE_PAYROLL_SHARE = 0.04;

export function insuranceWeeklyCost(state: GameState): number {
  if (!state.restaurant?.staff.insurance) return 0;
  return Math.round(weeklyPayrollEstimate(state) * INSURANCE_PAYROLL_SHARE);
}

export function setInsurance(state: GameState, enabled: boolean): ActionResult {
  const r = state.restaurant;
  if (!r) return { ok: false, message: 'Нет ресторана' };
  if (r.staff.insurance === enabled) {
    return { ok: false, message: enabled ? 'Страховка уже активна' : 'Страховка уже выключена' };
  }
  r.staff.insurance = enabled;
  if (enabled) {
    const est = Math.round(weeklyPayrollEstimate(state) * INSURANCE_PAYROLL_SHARE);
    // Моральный эффект включения: разовый буст доверия.
    for (const pool of Object.values(r.staff.pools)) {
      pool.morale = clamp(pool.morale + 4, 0, 100);
    }
    return { ok: true, message: `Медстраховка включена: ~${est.toLocaleString('ru-RU')} ₽/нед, риск увольнений −40%` };
  }
  return { ok: true, message: 'Медстраховка выключена' };
}
