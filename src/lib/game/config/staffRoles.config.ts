/**
 * Конфиг ролей персонала (ТЗ §14.1) и станций кухни (ТЗ §11).
 *
 * МАТЕМАТИКА LABOR COST (ТЗ §30: 25–32% с взносами):
 *   Здоровый штат 70-местного зала ~26–32 чел × средняя зарплата ~87 тыс ₽
 *   ≈ 2.4–2.8 млн ₽ gross + 30% взносов ≈ 3.1–3.6 млн ₽/мес.
 *   При выручке 12–14 млн ₽/мес → Labor Cost 25–28% ✓
 *
 * Почасовая ставка = месячный оклад / 167 часов.
 */
import type { RoleId, StationType } from '../types';

export interface StaffRoleConfig {
  id: RoleId;
  name: string;
  shortName: string;
  monthlySalary: number; // gross ₽
  /** Вклад в станции: вес × baseThroughput станции. */
  stationWeights: Partial<Record<StationType, number>>;
  /** Для официантов: гостей в час на официанта (ТЗ §11.7). */
  guestsPerHour?: number;
  /** Множитель организации (управляющий/шеф). */
  organizationFactor?: number;
  description: string;
}

export const STAFF_ROLES: Record<RoleId, StaffRoleConfig> = {
  manager: {
    id: 'manager',
    name: 'Управляющий',
    shortName: 'Упр.',
    monthlySalary: 180_000,
    stationWeights: {},
    organizationFactor: 1.12,
    description: 'Держит операционку в порядке: +12% к организации смены, быстрее уборка столов.',
  },
  head_chef: {
    id: 'head_chef',
    name: 'Шеф-повар',
    shortName: 'Шеф',
    monthlySalary: 170_000,
    stationWeights: { hot_kitchen: 0.5, cold_kitchen: 0.3, prep: 0.3 },
    organizationFactor: 1.08,
    description: 'Кулинарное сердце кухни: добавляет мощность цехам и снижает ошибки.',
  },
  hot_cook: {
    id: 'hot_cook',
    name: 'Повар горячего цеха',
    shortName: 'Повар гор.',
    monthlySalary: 115_000,
    stationWeights: { hot_kitchen: 1 },
    description: 'Основная мощность горячего цеха: ~14 блюд/час каждый.',
  },
  cold_cook: {
    id: 'cold_cook',
    name: 'Повар холодного цеха',
    shortName: 'Повар хол.',
    monthlySalary: 95_000,
    stationWeights: { cold_kitchen: 1, dessert: 1 },
    description: 'Салаты, закуски и десерты: холодный цех + кондитерская.',
  },
  prep_cook: {
    id: 'prep_cook',
    name: 'Заготовщик',
    shortName: 'Загот.',
    monthlySalary: 75_000,
    stationWeights: { prep: 1, hot_kitchen: 0.35, cold_kitchen: 0.35 },
    description: 'Заготовки ускоряют оба цеха: +35% к их мощности.',
  },
  barista: {
    id: 'barista',
    name: 'Бариста',
    shortName: 'Бариста',
    monthlySalary: 80_000,
    stationWeights: { coffee: 1 },
    description: 'Кофейная станция: ~40 напитков/час.',
  },
  waiter: {
    id: 'waiter',
    name: 'Официант',
    shortName: 'Офиц.',
    monthlySalary: 70_000,
    stationWeights: { bar_service: 0.6 },
    guestsPerHour: 12,
    description: 'Обслуживает ~12 гостей/час и разливает напитки. Чаевые идут персоналу.',
  },
  hostess: {
    id: 'hostess',
    name: 'Хостес',
    shortName: 'Хостес',
    monthlySalary: 65_000,
    stationWeights: {},
    description: 'Сажает гостей: до 45 гостей/час. Без хостес посадка падает вдвое.',
  },
  cleaner: {
    id: 'cleaner',
    name: 'Уборщик',
    shortName: 'Уборщ.',
    monthlySalary: 48_000,
    stationWeights: {},
    description: 'Чистота зала и скорость уборки столов. Экономия здесь = санитарный риск.',
  },
  dishwasher: {
    id: 'dishwasher',
    name: 'Посудомойщик',
    shortName: 'Посудом.',
    monthlySalary: 45_000,
    stationWeights: {},
    description: 'Чистая посуда = скорость подачи. Не хватает — сервис буксует.',
  },
};

export const ROLE_IDS = Object.keys(STAFF_ROLES) as RoleId[];

/* ============================= СТАНЦИИ ============================= */

export interface StationConfig {
  id: StationType;
  name: string;
  /** Блюд/напитков в час на единицу персонала (вес из роли). */
  baseThroughput: number;
}

export const STATIONS: Record<StationType, StationConfig> = {
  hot_kitchen: { id: 'hot_kitchen', name: 'Горячий цех', baseThroughput: 14 },
  cold_kitchen: { id: 'cold_kitchen', name: 'Холодный цех', baseThroughput: 22 },
  prep: { id: 'prep', name: 'Заготовка', baseThroughput: 30 },
  coffee: { id: 'coffee', name: 'Кофейная станция', baseThroughput: 40 },
  dessert: { id: 'dessert', name: 'Кондитерская', baseThroughput: 18 },
  bar_service: { id: 'bar_service', name: 'Бар напитков', baseThroughput: 30 },
};

/* ============================= ПЕРСОНАЛ: ДИНАМИКА ============================= */

export const STAFF_DYNAMICS = {
  /** Адаптация: первые дни 0.70–0.85 (ТЗ §14.5). */
  adaptationDays: 7,
  adaptationStartFactor: 0.7,
  adaptationEndFactor: 0.85,
  /** Усталость (ТЗ §14.8). */
  fatigueRate: 18, // прирост за день при перегрузке ×1.5
  fatigueLoadThreshold: 1.0,
  restRecovery: 6, // восстановление за день без перегрузки
  /** Ошибки (ТЗ §14.9). */
  baseErrorRate: 0.02, // доля ошибок на позицию
  errorExponent: 1.5,
  /** Прогулы (ТЗ §14.4). */
  absenceProbability: 0.03,
  /** Текучка: шанс увольнения в неделю при низкой морали. */
  quitMoraleThreshold: 35,
  quitChanceAtZeroMorale: 0.08,
};
