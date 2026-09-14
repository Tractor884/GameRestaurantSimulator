/**
 * Конфиг помещений (ТЗ §11) и ремонта.
 *
 * ПОДБОР ПОМЕЩЕНИЙ (ТЗ §11.3): малое 50 мест/150 м², среднее 70/200, большое 90/250.
 * Ремонт: косметический → премиальный, влияет на комфорт/привлекательность.
 */
import type { EquipmentLevel, PremisesSize, RenovationLevel } from '../types';

export interface PremisesOption {
  size: PremisesSize;
  name: string;
  seats: number;
  areaM2: number;
  rentMultiplier: number; // разброс цен на помещения в районе
  conditionFactor: number; // стартовое состояние инженерии (износ)
}

export const PREMISES_SIZES: Record<PremisesSize, { seats: number; areaM2: number; label: string }> = {
  small: { seats: 50, areaM2: 150, label: 'Малое' },
  medium: { seats: 70, areaM2: 200, label: 'Среднее' },
  large: { seats: 90, areaM2: 250, label: 'Большое' },
};

export interface RenovationConfig {
  level: RenovationLevel;
  label: string;
  comfortBase: number; // базовый комфорт 0..100
  atmosphereBase: number;
  checkPotential: number; // множитель к восприятию цены премиум-гостями
  wearRate: number; // скорость износа в неделю
  description: string;
}

export const RENOVATION_LEVELS: Record<RenovationLevel, RenovationConfig> = {
  cosmetic: {
    level: 'cosmetic',
    label: 'Косметический',
    comfortBase: 52,
    atmosphereBase: 50,
    checkPotential: 0.92,
    wearRate: 0.5,
    description: 'Свежая краска и мелкий ремонт. Дёшево, но зал не впечатляет.',
  },
  standard: {
    level: 'standard',
    label: 'Стандартный',
    comfortBase: 68,
    atmosphereBase: 66,
    checkPotential: 1.0,
    wearRate: 0.35,
    description: 'Добротный интерьер casual dining. Базовый уровень для ТЗ.',
  },
  improved: {
    level: 'improved',
    label: 'Улучшенный',
    comfortBase: 80,
    atmosphereBase: 80,
    checkPotential: 1.08,
    wearRate: 0.28,
    description: 'Дизайнерский проект, внимание к деталям. Растут чеки и лояльность.',
  },
  premium: {
    level: 'premium',
    label: 'Премиальный',
    comfortBase: 92,
    atmosphereBase: 93,
    checkPotential: 1.15,
    wearRate: 0.22,
    description: 'Люкс-материалы и свет. Максимум привлекательности, максимум затрат.',
  },
};

/* ============================= ОБОРУДОВАНИЕ ============================= */

export interface EquipmentLevelConfig {
  level: EquipmentLevel;
  label: string;
  throughputFactor: number; // EquipmentFactor (ТЗ §11.4): 0.85 / 1.0 / 1.15
  qualityFactor: number;
  wearRate: number; // износ/неделю при эксплуатации
  maintenanceCostPerWeek: number; // ₽ плановое обслуживание
  breakRiskThreshold: number; // износ, после которого растёт риск поломки
}

export const EQUIPMENT_LEVELS: Record<EquipmentLevel, EquipmentLevelConfig> = {
  basic: {
    level: 'basic',
    label: 'Базовое',
    throughputFactor: 0.85,
    qualityFactor: 0.88,
    wearRate: 2.2,
    maintenanceCostPerWeek: 12_000,
    breakRiskThreshold: 45,
  },
  standard: {
    level: 'standard',
    label: 'Стандартное',
    throughputFactor: 1.0,
    qualityFactor: 1.0,
    wearRate: 1.6,
    maintenanceCostPerWeek: 20_000,
    breakRiskThreshold: 60,
  },
  professional: {
    level: 'professional',
    label: 'Профессиональное',
    throughputFactor: 1.15,
    qualityFactor: 1.1,
    wearRate: 1.1,
    maintenanceCostPerWeek: 32_000,
    breakRiskThreshold: 75,
  },
};

/** Стоимость закупки оборудования по зонам, ₽. */
export const EQUIPMENT_COSTS: Record<EquipmentLevel, { kitchen: number; coffee: number; hall: number }> = {
  basic: { kitchen: 1_500_000, coffee: 150_000, hall: 500_000 },
  standard: { kitchen: 3_000_000, coffee: 350_000, hall: 900_000 },
  professional: { kitchen: 5_200_000, coffee: 750_000, hall: 1_600_000 },
};

/** Амортизация: стоимость / 36 месяцев (ТЗ §18.5). */
export const DEPRECIATION_MONTHS = 36;

/** Летняя веранда (26-b, сезонная лицензия): разрешение покупается с АПРЕЛЯ,
 *  веранда работает со следующего после покупки месяца по СЕНТЯБРЬ,
 *  в октябре обязателен демонтаж (событие veranda_teardown).
 *
 *  ЭКОНОМИКА ФИКСИРОВАННОЙ ЦЕНЫ: setupCost одинаков в любой месяц покупки,
 *  а рабочий сезон укорачивается — купившие в апреле получают 5 месяцев
 *  работы (+20 мест ≈ +15–20% посадок в тёплые месяцы), опоздавшие в
 *  августе–сентябре не окупаются вовсе. */
export const VERANDA = {
  /** +мест к залу на сезон. */
  seats: 20,
  /** Разрешение + установка (фикс., «ранние получают сезон, опоздавшие — нет»). */
  setupCost: 800_000,
  /** Содержание в активные месяцы (списывается еженедельно ~1/4.33). */
  monthlyExtraCost: 60_000,
  /** Месяцы работы веранды (активация: куплено в boughtMonth → с boughtMonth+1). */
  months: [5, 6, 7, 8, 9],
  /** Разрешение можно купить начиная с апреля. */
  permitFromMonth: 4,
  /** Последний месяц сезона (с октября — демонтаж). */
  seasonLastMonth: 9,
  /** Демонтаж по погоде (событие/кнопка на «Лицензиях»). */
  removalCost: 120_000,
  /** Порча мебели и оборудования, если веранду не убрали (ветка «оставить»). */
  spoilageCost: 250_000,
  /** Единовременный юр. риск при порче (работа без разрешения). */
  lateLegalRisk: 20,
  /** Прирост юр. риска КАЖДУЮ неделю октября+, пока веранда не убрана. */
  lateLegalPerWeek: 6,
};

/** Лицензия на алкоголь (игровая упрощённая модель). */
export const ALCOHOL_LICENSE = {
  annualCost: 500_000,
  legalRiskReduction: 15,
};
