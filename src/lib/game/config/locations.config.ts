/**
 * Конфиг локаций Москвы (ТЗ §10).
 *
 * МАТЕМАТИКА КАЛИБРОВКИ АРЕНДЫ (ТЗ §30: аренда 8–15% выручки):
 *   Центр (Тверская): 200 м² × 8500 ₽/м² = 1.7 млн ₽/мес.
 *   Здоровая выручка там ≈ 12–15 млн ₽/мес → аренда 11–14% ✓
 *   Спальный (Митино): 200 м² × 2500 ₽/м² = 500 тыс ₽/мес.
 *   Выручка ≈ 5–7 млн ₽/мес → аренда 7–10% ✓
 *
 * АУДИТ ПРОЕКТА (калибровка 2.0): аренда и коммунальные подняты на ~13–15%
 * против первой версии — чистая маржа эталонного прогона была 21.7% против
 * целевых 8–15%. Аренда центра — главный «фоновый» давилец прибыли.
 *
 * BaseTraffic — потенциальные гости/день в нейтральных условиях.
 * Реальная посадка ограничена очередью, мощностями и штатом.
 */
import type { LocationType, SegmentId } from '../types';

export interface LocationConfig {
  id: string;
  name: string;
  type: LocationType;
  typeLabel: string;
  description: string;
  baseTraffic: number; // потенциальных гостей/день (нейтральные условия)
  rentPerM2: number; // ₽/м²/мес
  depositMonths: number;
  utilitiesPerM2: number; // ₽/м²/мес (с учётом нагрузки кухни)
  competitionFactor: number; // понижающий множитель спроса (0.8-1.0)
  /** Базовые доли сегментов (нормализуются движком по часам). */
  segmentShares: Partial<Record<SegmentId, number>>;
  renovationCostPerM2: {
    cosmetic: number;
    standard: number;
    improved: number;
    premium: number;
  };
  verandaAttractiveness: number; // множитель привлекательности летом
  seasonProfile: number[]; // 12 месяцев, множители
}

const BASE_RENOVATION = {
  cosmetic: 15_000,
  standard: 30_000,
  improved: 50_000,
  premium: 85_000,
};

/** Сезонность Москвы: спад января, майские, сентябрьский пик, декабрь. */
const MOSCOW_SEASON = [0.82, 0.85, 0.95, 1.0, 1.08, 1.1, 1.02, 0.9, 1.12, 1.0, 0.95, 1.18];
const TOURIST_SEASON = [0.9, 0.85, 0.9, 1.0, 1.05, 1.15, 1.25, 1.2, 1.1, 1.0, 0.95, 1.15];

export const LOCATIONS: LocationConfig[] = [
  {
    id: 'patriki',
    name: 'Патриаршие пруды',
    type: 'premium',
    typeLabel: 'Премиальный район',
    description:
      'Тусовочное сердце Москвы. Высокие чеки и требования к сервису, золотая аудитория, но самая дорогая аренда в городе.',
    baseTraffic: 180,
    rentPerM2: 12_500,
    depositMonths: 2,
    utilitiesPerM2: 710,
    competitionFactor: 0.88,
    segmentShares: {
      premium: 0.26, evening: 0.2, tourist: 0.13, office_evening: 0.13,
      youth: 0.1, family: 0.06, breakfast: 0.05, business_lunch: 0.07,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.25,
    seasonProfile: MOSCOW_SEASON,
  },
  {
    id: 'tverskaya',
    name: 'Тверская',
    type: 'center',
    typeLabel: 'Центр',
    description:
      'Главная артерия города. Огромный смешанный трафик: туристы, офисы, вечерние гости. Аренда высокая, конкуренция агрессивная.',
    baseTraffic: 220,
    rentPerM2: 8500,
    depositMonths: 2,
    utilitiesPerM2: 650,
    competitionFactor: 0.85,
    segmentShares: {
      tourist: 0.21, evening: 0.17, office_evening: 0.14, youth: 0.14,
      business_lunch: 0.12, premium: 0.08, breakfast: 0.07, family: 0.07,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.15,
    seasonProfile: TOURIST_SEASON,
  },
  {
    id: 'zamoskvorechye',
    name: 'Замоскворечье',
    type: 'center',
    typeLabel: 'Центр (трендовый)',
    description:
      'Пятницкая и окрестности: гастрономический тренд-район с лояльной публикой. Баланс цены и потенциала.',
    baseTraffic: 168,
    rentPerM2: 5700,
    depositMonths: 2,
    utilitiesPerM2: 550,
    competitionFactor: 0.9,
    segmentShares: {
      youth: 0.18, evening: 0.17, office_evening: 0.14, family: 0.12,
      tourist: 0.12, business_lunch: 0.1, premium: 0.09, breakfast: 0.08,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.2,
    seasonProfile: MOSCOW_SEASON,
  },
  {
    id: 'city',
    name: 'Москва-Сити',
    type: 'business',
    typeLabel: 'Деловой район',
    description:
      'Башни Сити: обеденный трафик в будни огромен, вечера и выходные пустые. Идеален для бизнес-ланчей.',
    baseTraffic: 205,
    rentPerM2: 9000,
    depositMonths: 2,
    utilitiesPerM2: 690,
    competitionFactor: 0.86,
    segmentShares: {
      business_lunch: 0.34, office_evening: 0.24, breakfast: 0.15,
      premium: 0.1, evening: 0.08, youth: 0.04, family: 0.03, tourist: 0.02,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.0,
    seasonProfile: MOSCOW_SEASON,
  },
  {
    id: 'hamovniki',
    name: 'Хамовники',
    type: 'sleeping',
    typeLabel: 'Спальный премиум',
    description:
      'Уютный зелёный район с платёжеспособными жителями. Стабильный семейный трафик, умеренная аренда.',
    baseTraffic: 135,
    rentPerM2: 4000,
    depositMonths: 2,
    utilitiesPerM2: 480,
    competitionFactor: 0.92,
    segmentShares: {
      family: 0.22, office_evening: 0.16, business_lunch: 0.14, evening: 0.14,
      youth: 0.12, breakfast: 0.12, premium: 0.06, tourist: 0.04,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.2,
    seasonProfile: MOSCOW_SEASON,
  },
  {
    id: 'sokolniki_park',
    name: 'У парка Сокольники',
    type: 'park',
    typeLabel: 'Район у парка',
    description:
      'Парковая зона: выходные и завтраки, веранда работает отлично, но вечерний трафик скромный.',
    baseTraffic: 125,
    rentPerM2: 3600,
    depositMonths: 2,
    utilitiesPerM2: 460,
    competitionFactor: 0.93,
    segmentShares: {
      family: 0.27, youth: 0.18, breakfast: 0.16, evening: 0.12,
      business_lunch: 0.1, office_evening: 0.08, tourist: 0.06, premium: 0.03,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.35,
    seasonProfile: [0.8, 0.85, 0.95, 1.1, 1.2, 1.25, 1.15, 1.0, 1.1, 0.95, 0.9, 1.05],
  },
  {
    id: 'krasnye_vorota',
    name: 'У метро Красные Ворота',
    type: 'metro',
    typeLabel: 'Транспортный узел',
    description:
      'Поток людей утром и вечером гарантирован, но никто не задерживается: спрос чувствителен к скорости.',
    baseTraffic: 160,
    rentPerM2: 4500,
    depositMonths: 2,
    utilitiesPerM2: 500,
    competitionFactor: 0.9,
    segmentShares: {
      office_evening: 0.2, business_lunch: 0.2, breakfast: 0.16, youth: 0.16,
      evening: 0.12, family: 0.1, tourist: 0.04, premium: 0.02,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.05,
    seasonProfile: MOSCOW_SEASON,
  },
  {
    id: 'mitino',
    name: 'Митино',
    type: 'sleeping',
    typeLabel: 'Спальный район',
    description:
      'Дальняя окраина: дешёвая аренда и лояльные семьи, но чеки ниже и премиум-сегмента почти нет.',
    baseTraffic: 95,
    rentPerM2: 2500,
    depositMonths: 2,
    utilitiesPerM2: 410,
    competitionFactor: 0.95,
    segmentShares: {
      family: 0.33, youth: 0.18, business_lunch: 0.15, breakfast: 0.12,
      evening: 0.12, office_evening: 0.08, premium: 0.02,
    },
    renovationCostPerM2: BASE_RENOVATION,
    verandaAttractiveness: 1.1,
    seasonProfile: MOSCOW_SEASON,
  },
];

export const LOCATIONS_MAP: Record<string, LocationConfig> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
);
