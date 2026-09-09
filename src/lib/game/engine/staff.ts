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
import { BALANCE_V2_2, BALANCE_V2_5, isLegacy, quitProbability } from '../config/balance2.config';
import { quitProbMult, qFatigueMult } from './permanent';
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
  // ЭКСТРЕННЫЙ ВЫЗОВ «на сегодня» (ТЗ §8.4): внешний temps добавляется
  // ПОВЕРХ графика и не ограничен пулом (приходит со стороны, КПД 0.95).
  // Поле живёт только внутри симулируемого дня (очищается в finishDay).
  let callIns = 0;
  for (const ci of staff.callIns ?? []) {
    if (ci.day === day && ci.roleId === roleId && hour >= 15) callIns += ci.count;
  }
  if (scheduled <= 0 && callIns > 0) return callIns * 0.95;
  if (scheduled <= 0) return 0;
  const pool = staff.pools[roleId];
  if (!pool || pool.count <= 0) return callIns > 0 ? callIns * 0.95 : 0;
  // На смену выходит не больше, чем есть людей в пуле.
  const attendance = 1 - STAFF_DYNAMICS.absenceProbability;
  // Адаптация новичков: newHires — счётчик неадаптированных, тает на 1/день.
  const newHires = Math.min(pool.newHires, pool.count);
  const adaptation = pool.count > 0 ? 1 - 0.25 * (newHires / pool.count) : 1;
  // Усталость бьёт по мощности МЯГКО и с порога 50 (само насыщение не перегружает
  // кухню — только реальное выгорание). До 50 — без штрафа; 100 → −15%.
  // Максимум нарочно мал: глубокая спираль «усталость→перегруз→усталость»
  // делала бы выгорание невосстановимым даже после найма.
  const fatigueFactor = 1 - 0.15 * Math.max(0, pool.fatigue - 50) / 50;
  // Выходит min(запланировано, численность пула) × доступность.
  const onShift = Math.min(scheduled, pool.count);
  return Math.max(0, onShift * attendance * adaptation * fatigueFactor) + callIns * 0.95;
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
 *                   × EquipmentFactor × OrganizationFactor
 *
 * ВАЖНО (баланс): усталость учитывается ОДИН раз — на уровне effectiveStaff
 * (per-pool, см. выше). Раньше stationCapacity дополнительно умножал на
 * среднюю усталость всего штата: двойной штраф давал −64% мощности при
 * усталости 100 и разгонял спираль «усталость → перегруз → усталость».
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
  const org = organizationFactor(staff, day, hour);
  return Math.max(0, units * STATIONS[station].baseThroughput * equipFactor * org);
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

/** Начисление зарплаты за день (gross), ₽. Часы: смена = 8 часов.
 *  v2 §10: индексация окладов шагом раз в квартал (wageMult передаёт день).
 *  hourlyRate() остаётся БАЗОВОЙ ставкой — индекс живёт в начислениях. */
export function accruePayrollDay(restaurant: Restaurant, date: GameDate, wageMult = 1): number {
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
  return Math.round(gross * wageMult);
}

/**
 * Обновление усталости в конце дня (ТЗ §14.8) — ПОРОЛЕВАЯ модель.
 *
 * ИСПРАВЛЕНИЕ БАГА «усталость не накапливается»: раньше порог сравнивался со
 * средним по ВСЕМ часам максимальной загрузкой. В здоровом ресторане пик
 * приходится на 2–3 часа, остальные часы недогружены — среднее почти никогда
 * не превышало 1.0, и усталость вечно «отдыхала». Теперь для каждой роли:
 *
 *   roleLoad = максимум загрузки станций роли (для официанта — гостей на чел.)
 *   shiftPressure = запланированные смены / численность пула
 *     (1 человек на 2 смены в день = 12-часовой день = давление 2.0)
 *   load = max(roleLoad, shiftPressure)
 *
 * Правила роста/восстановления — НЕПРЕРЫВНАЯ кривая (баланс):
 *   рост/день = (load − 0.9) × 12, ограничен [−5; +10]
 *   • равновесие при пиковой загрузке 90% — «нормальный тяжёлый день» стабилен;
 *   • 110% загрузки → +2.4/день → «жёлтая» усталость за ~2 недели;
 *   • 130–150% перегруз → +4.8…7/день → красная зона за месяц;
 *   • щадящий день и выходной (0 смен) → восстановление −3…−5/день.
 * Усталость бьёт по мощности только с порога 50 (до −15% при 100) — сигнал,
 * а не капкан: наймите людей или ослабьте график → усталость падает.
 */
export function updateFatigue(
  restaurant: Restaurant,
  date: GameDate,
  roleLoads: Partial<Record<RoleId, number>>,
  diffFatigueRate: number,
  /** v2 §5.2: ускорение прироста в перегрузочные дни (пик станций > 1.0). */
  overloadBoost = 1,
): void {
  const staff = restaurant.staff;
  const avgLoad = averageLoadOfLoads(roleLoads);
  // v2 §16.1 (этап 5): «бармены» (в модели — официанты, обслуживающие
  // бар-станцию) при активном алкоголе устают быстрее (×1,25 moderate):
  // спиртное = доп. нагрузка на сервис и уборку.
  const bartenderBoost =
    restaurant.licenses.alcohol?.active && !isLegacy()
      ? BALANCE_V2_5.alcohol.bartenderFatigueMult
      : 1;
  for (const roleId of ROLE_IDS) {
    const pool = staff.pools[roleId];
    if (pool.count <= 0) continue;
    const shifts = staff.schedule[roleId]?.[date.day];
    const scheduled = shifts ? shifts.morning + shifts.evening : 0;
    // Давление графика: сколько смен сегодня приходится на одного человека.
    const shiftPressure = scheduled > 0 ? scheduled / pool.count : 0;
    const roleLoad = Math.max(roleLoads[roleId] ?? 0, shiftPressure);
    // Непрерывная кривая (см. комментарий к функции): кап −5/+10 держит окно
    // реакции игрока даже при катастрофическом дне.
    let growth = (roleLoad - 0.9) * 12;
    if (scheduled === 0) growth = Math.min(growth, -STAFF_DYNAMICS.restRecovery * 0.9);
    growth = clamp(growth, -5, 10);
    // Сложность (ТЗ §36) staffFatigueRate ускоряет НАКОПЛЕНИЕ усталости, но НЕ
    // восстановление: отдых — физиологический процесс одной скорости на любой
    // сложности (иначе Professional «выздоравливал» бы тоже в ×1.3 быстрее и
    // множитель взаимно гасился на равновесии, что показал difficulty-test).
    // v2 §5.2: в перегрузочные дни прирост дополнительно ×overloadBoost;
    // v2 §16.1: официанты с активным баром — ещё ×bartenderBoost.
    const roleBoost = roleId === 'waiter' ? overloadBoost * bartenderBoost : overloadBoost;
    const scaled = growth > 0 ? growth * diffFatigueRate * roleBoost : growth;
    pool.fatigue = clamp(pool.fatigue + scaled, 0, 100);
    // Мораль: усталость и перегрузка давят, чаевые поднимают (в day.ts).
    const targetMorale = clamp(85 - pool.fatigue * 0.5 - Math.max(0, roleLoad - 1) * 30, 0, 100);
    pool.morale += (targetMorale - pool.morale) * 0.3;
    pool.morale = clamp(pool.morale, 0, 100);
    // Адаптация новичков тает.
    pool.newHires = Math.max(0, pool.newHires - 1);
  }
}

/** Средняя нагрузка по ролям (для кадрового риска). */
function averageLoadOfLoads(loads: Partial<Record<RoleId, number>>): number {
  const vals = Object.values(loads).filter((v): v is number => typeof v === 'number' && v > 0);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0.5;
}

/** Увольнение случайного сотрудника роли (событие). */
export function applyQuit(restaurant: Restaurant, roleId: RoleId): boolean {
  const pool = restaurant.staff.pools[roleId];
  if (pool.count <= 1) return false;
  pool.count -= 1;
  return true;
}

/**
 * Текучка в конце недели.
 *
 * v2 §7.1 (moderate/aggressive) — ФИКС БАГА «текучесть = 0%»: раньше
 * увольнения зависели ТОЛЬКО от морали < 35, до которой движок почти никогда
 * не опускал пулы (мораль тянется к цели ≥ 50 даже при перегрузе) — люди
 * не увольнялись никогда. Теперь для каждого сотрудника роли:
 *
 *   P(увольнение/нед) = qBase + qFatigue × max(0,(F−55)/45) + qMorale × max(0,(35−M)/35)
 *
 * Фон 0.4%/нед ≈ 20% годовой текучести здорового ресторана (реалистично);
 * при усталости 90 — +7,8%/нед: месяц перегрузки почти гарантирует потерю.
 *
 * Возвращает список увольнений [{roleId, reason}] (для событий/лога).
 * legacy — прежний мораль-триггер калибровки 2.0 (совместимость A/B).
 */
export function weeklyTurnover(
  restaurant: Restaurant,
  rngChance: () => number,
  /** v2 §15: текущая неделя — для окон дилеммных множителей (def 0 = без окон). */
  week = 0,
): { roleId: RoleId; reason: string }[] {
  const quit: { roleId: RoleId; reason: string }[] = [];
  for (const roleId of ROLE_IDS) {
    const pool = restaurant.staff.pools[roleId];
    if (pool.count <= 0) continue;
    if (isLegacy()) {
      // Прежняя логика (калибровка 2.0): только глубокая мораль.
      if (pool.morale < STAFF_DYNAMICS.quitMoraleThreshold) {
        const p =
          STAFF_DYNAMICS.quitChanceAtZeroMorale *
          (1 - pool.morale / STAFF_DYNAMICS.quitMoraleThreshold);
        if (rngChance() < p * pool.count) {
          pool.count -= 1;
          quit.push({ roleId, reason: 'мораль' });
        }
      }
      continue;
    }
    // v2: вероятность на сотрудника; за неделю с роли уходит ≤ maxPerRole чел.
    // Третий член (калибровка): плотность графика — смен на человека сверх
    // нормы 5/нед. Полный штат (S0/S4) не превышает норму → вклад 0;
    // недоукомплектованный (сценарий C/S5 «экономия на ФОТ») — люди
    // пашут двойные смены и уходят быстрее.
    const cfg = BALANCE_V2_2.quit;
    const weekShifts = (restaurant.staff.schedule[roleId] ?? []).reduce(
      (s, d) => s + d.morning + d.evening,
      0,
    );
    const shiftPerPerson = weekShifts / Math.max(1, 5 * pool.count);
    // v2 §15 (этап 5): дилеммные множители вероятности — «шеф обижен»
    // (×1,5 в окне 8 нед) и «кадровый кризис» (qFatigue ×1,3 в окне 26 нед).
    const chefMult = quitProbMult(restaurant, week);
    const qFat = qFatigueMult(restaurant, week);
    const p =
      quitProbability(pool.fatigue, pool.morale, shiftPerPerson) * chefMult * qFat;
    let left = Math.min(cfg.maxPerRole, pool.count - 1); // хотя бы 1 человек остаётся
    for (let i = 0; i < pool.count && left > 0; i++) {
      if (rngChance() < p) {
        pool.count -= 1;
        left--;
        const reason =
          pool.fatigue > cfg.fatigueFloor && pool.fatigue >= 65 ? 'усталость' : 'причины';
        quit.push({ roleId, reason });
      }
    }
    if (quit.some((q) => q.roleId === roleId)) {
      // «Текучка заражает»: мораль коллег проседает.
      for (const other of Object.values(restaurant.staff.pools)) {
        other.morale = clamp(other.morale - cfg.moraleHit, 0, 100);
      }
    }
  }
  return quit;
}
