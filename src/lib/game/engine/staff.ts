/**
 * Модуль персонала (ТЗ §14): доступность, покрытие графика, мощность станций,
 * усталость, ошибки, зарплата.
 *
 * График: роль × день недели × {morning: 08–16, evening: 15–23}.
 * Payroll = Σ(hourlyRate × scheduledHours) — ТЗ §14.10, оплата почасовая.
 * Доступность = Hired × Attendance × Adaptation × Fatigue.
 */
import type { GameDate, Restaurant, RoleId, StaffState, StationType } from '../types';
import { STAFF_ROLES, STAFF_DYNAMICS, ROLE_IDS } from '../config/staffRoles.config';
import { EQUIPMENT_LEVELS } from '../config/premises.config';
import { STATIONS } from '../config/staffRoles.config';
import { clamp } from './core';

/** Почасовая ставка роли: оклад / 167 ч. */
export function hourlyRate(roleId: RoleId): number {
  return STAFF_ROLES[roleId].monthlySalary / 167;
}

/** Персонал роли в час (смена 8–16 / 15–23, час 15 — пересечение). */
export function staffOnDuty(staff: StaffState, roleId: RoleId, day: number, hour: number): number {
  const shifts = staff.schedule[roleId]?.[day];
  if (!shifts) return 0;
  let count = 0;
  if (hour < 15) count += shifts.morning;
  else if (hour === 15) count += shifts.morning + shifts.evening;
  else count += shifts.evening;
  return count;
}

/** Эффективный (фактически работающий) персонал роли в час. */
export function effectiveStaff(staff: StaffState, roleId: RoleId, day: number, hour: number): number {
  const scheduled = staffOnDuty(staff, roleId, day, hour);
  if (scheduled <= 0) return 0;
  const pool = staff.pools[roleId];
  if (!pool || pool.count <= 0) return 0;
  // На смену выходит не больше, чем есть людей в пуле.
  const attendance = 1 - STAFF_DYNAMICS.absenceProbability;
  // Адаптация новичков: newHires — счётчик неадаптированных, тает на 1/день.
  const newHires = Math.min(pool.newHires, pool.count);
  const adaptation = pool.count > 0 ? 1 - 0.25 * (newHires / pool.count) : 1;
  const fatigueFactor = 1 - 0.4 * (pool.fatigue / 100);
  // Выходит min(запланировано, численность пула) × доступность.
  const onShift = Math.min(scheduled, pool.count);
  return Math.max(0, onShift * attendance * adaptation * fatigueFactor);
}

/** Организационный множитель смены: управляющий/шеф на смене. */
export function organizationFactor(staff: StaffState, day: number, hour: number): number {
  let f = 0.92; // без руководителей — хаос
  const manager = staffOnDuty(staff, 'manager', day, hour);
  const chef = staffOnDuty(staff, 'head_chef', day, hour);
  if (manager > 0) f += (STAFF_ROLES.manager.organizationFactor ?? 1.1) - 1;
  if (chef > 0) f += (STAFF_ROLES.head_chef.organizationFactor ?? 1.08) - 1;
  return Math.min(1.2, f);
}

/**
 * Мощность станции (ТЗ §11.3):
 *   StationCapacity = Σ(StaffOnStation × BaseThroughput × weights)
 *                   × EquipmentFactor × FatigueFactor(общий) × OrganizationFactor
 */
export function stationCapacity(restaurant: Restaurant, station: StationType, day: number, hour: number): number {
  const staff = restaurant.staff;
  let units = 0;
  for (const roleId of ROLE_IDS) {
    const cfg = STAFF_ROLES[roleId];
    const weight = cfg.stationWeights[station] ?? 0;
    if (weight <= 0) continue;
    units += effectiveStaff(staff, roleId, day, hour) * weight;
  }
  // Кофе-станция зависит от кофемашины, остальная кухня — от кухонной зоны.
  const zone = station === 'coffee' ? restaurant.equipment.coffee : restaurant.equipment.kitchen;
  const equipFactor = EQUIPMENT_LEVELS[zone.level].throughputFactor * (1 - zone.wear / 250);
  const avgFatigue = averageFatigue(staff);
  const fatigueFactor = 1 - 0.4 * (avgFatigue / 100);
  const org = organizationFactor(staff, day, hour);
  return Math.max(0, units * STATIONS[station].baseThroughput * equipFactor * fatigueFactor * org);
}

/** Средняя усталость по работающим ролям. */
export function averageFatigue(staff: StaffState): number {
  let sum = 0;
  let count = 0;
  for (const roleId of ROLE_IDS) {
    const pool = staff.pools[roleId];
    if (pool.count > 0) {
      sum += pool.fatigue * pool.count;
      count += pool.count;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Покрытие графика роли за день: min(1, доступно/запланировано). */
export function roleCoverage(staff: StaffState, roleId: RoleId, day: number): number {
  const shifts = staff.schedule[roleId]?.[day];
  if (!shifts) return 1;
  const scheduled = shifts.morning + shifts.evening;
  if (scheduled <= 0) return 1;
  const pool = staff.pools[roleId];
  return Math.min(1, (pool?.count ?? 0) / Math.ceil(scheduled));
}

/** Среднее покрытие всех ролей за день. */
export function dayCoverage(staff: StaffState, day: number): number {
  let sum = 0;
  let n = 0;
  for (const roleId of ROLE_IDS) {
    const shifts = staff.schedule[roleId]?.[day];
    if (shifts && shifts.morning + shifts.evening > 0) {
      sum += roleCoverage(staff, roleId, day);
      n++;
    }
  }
  return n > 0 ? sum / n : 1;
}

/** Нагрузка официантов в час: гости / (официанты × 12). */
export function waiterLoad(restaurant: Restaurant, guestsThisHour: number, day: number, hour: number): number {
  const waiters = effectiveStaff(restaurant.staff, 'waiter', day, hour);
  if (waiters <= 0) return 3; // нет официантов — коллапс
  return guestsThisHour / (waiters * (STAFF_ROLES.waiter.guestsPerHour ?? 12));
}

/** Начисление зарплаты за день (gross), ₽. Часы: смена = 8 часов. */
export function accruePayrollDay(restaurant: Restaurant, date: GameDate): number {
  const staff = restaurant.staff;
  let gross = 0;
  for (const roleId of ROLE_IDS) {
    const shifts = staff.schedule[roleId]?.[date.day];
    if (!shifts) continue;
    // Оплачиваем запланированные смены, но не больше, чем может закрыть штат (×1.4 переработки).
    const poolCap = staff.pools[roleId]?.count ?? 0;
    const paidShifts = Math.min(shifts.morning + shifts.evening, Math.ceil(poolCap * 1.4));
    gross += paidShifts * 8 * hourlyRate(roleId);
  }
  return Math.round(gross);
}

/** Обновление усталости в конце дня (ТЗ §14.8). */
export function updateFatigue(restaurant: Restaurant, dayLoads: { load: number }[], diffFatigueRate: number): void {
  const avgLoad = dayLoads.length > 0 ? dayLoads.reduce((s, l) => s + l.load, 0) / dayLoads.length : 0.5;
  const staff = restaurant.staff;
  for (const roleId of ROLE_IDS) {
    const pool = staff.pools[roleId];
    if (pool.count <= 0) continue;
    const growth = avgLoad > STAFF_DYNAMICS.fatigueLoadThreshold
      ? (avgLoad - 1) * STAFF_DYNAMICS.fatigueRate * diffFatigueRate
      : -STAFF_DYNAMICS.restRecovery;
    pool.fatigue = clamp(pool.fatigue + growth, 0, 100);
    // Мораль: усталость и перегрузка давят, чаевые поднимают (в day.ts).
    const targetMorale = clamp(85 - pool.fatigue * 0.5 - Math.max(0, avgLoad - 1) * 30, 0, 100);
    pool.morale += (targetMorale - pool.morale) * 0.3;
    pool.morale = clamp(pool.morale, 0, 100);
    // Адаптация новичков тает.
    pool.newHires = Math.max(0, pool.newHires - 1);
  }
}

/** Увольнение случайного сотрудника роли (событие). */
export function applyQuit(restaurant: Restaurant, roleId: RoleId): boolean {
  const pool = restaurant.staff.pools[roleId];
  if (pool.count <= 1) return false;
  pool.count -= 1;
  return true;
}

/** Текучка: шанс увольнения при низкой морали (вызывается в конце недели). */
export function weeklyTurnover(restaurant: Restaurant, rngChance: () => number): string[] {
  const fired: string[] = [];
  for (const roleId of ROLE_IDS) {
    const pool = restaurant.staff.pools[roleId];
    if (pool.count <= 0) continue;
    if (pool.morale < STAFF_DYNAMICS.quitMoraleThreshold) {
      const p = STAFF_DYNAMICS.quitChanceAtZeroMorale * (1 - pool.morale / STAFF_DYNAMICS.quitMoraleThreshold);
      if (rngChance() < p * pool.count) {
        pool.count -= 1;
        fired.push(STAFF_ROLES[roleId].name);
      }
    }
  }
  return fired;
}
