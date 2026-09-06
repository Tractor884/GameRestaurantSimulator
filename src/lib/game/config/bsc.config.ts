/**
 * Конфиг BSC (ТЗ §22) и финального счёта (ТЗ §23).
 * BSC = 0.30×Finance + 0.25×Client + 0.25×Process + 0.20×Staff
 * Каждая метрика переводится в 0–100 интерполяцией (ScoreCurve).
 */
export type ScoreDirection = 'higher_is_better' | 'lower_is_better';

export interface ScoreCurve {
  metricId: string;
  label: string;
  direction: ScoreDirection;
  points: [number, number][];
  unit: string;
}

export interface BscPerspectiveConfig {
  id: 'finance' | 'client' | 'process' | 'staff';
  label: string;
  weight: number; // 0..1
  metrics: { curve: ScoreCurve; weight: number }[];
}

const c = (
  metricId: string,
  label: string,
  direction: ScoreDirection,
  unit: string,
  points: [number, number][],
): ScoreCurve => ({ metricId, label, direction, unit, points });

export const BSC_CONFIG: {
  perspectives: BscPerspectiveConfig[];
} = {
  perspectives: [
    {
      id: 'finance',
      label: 'Финансы',
      weight: 0.3,
      metrics: [
        { curve: c('ebitda_margin', 'Рентабельность EBITDA', 'higher_is_better', '%', [[0, 0], [5, 40], [10, 65], [15, 85], [20, 100]]), weight: 0.25 },
        { curve: c('cash_safety', 'Запас денег, недель расходов', 'higher_is_better', 'нед', [[0, 0], [1, 20], [2, 50], [4, 75], [8, 100]]), weight: 0.2 },
        { curve: c('prime_cost', 'Prime Cost (еда+персонал+аренда)', 'lower_is_better', '%', [[55, 100], [65, 80], [75, 55], [85, 25], [95, 0]]), weight: 0.2 },
        { curve: c('debt_coverage', 'Покрытие долга DSCR', 'higher_is_better', 'x', [[0, 0], [1, 30], [1.5, 70], [2, 90], [3, 100]]), weight: 0.15 },
        { curve: c('cashflow_trend', 'Тренд денежного потока', 'higher_is_better', 'млн/нед', [[-0.3, 0], [0, 50], [0.3, 80], [0.6, 100]]), weight: 0.1 },
        { curve: c('revenue_stability', 'Стабильность выручки (CV 4 нед)', 'lower_is_better', '', [[0.25, 0], [0.15, 50], [0.07, 85], [0.04, 100]]), weight: 0.1 },
      ],
    },
    {
      id: 'client',
      label: 'Клиенты',
      weight: 0.25,
      metrics: [
        { curve: c('rating', 'Рейтинг', 'higher_is_better', '★', [[2, 0], [3, 20], [3.5, 45], [4, 65], [4.4, 85], [4.8, 100]]), weight: 0.25 },
        { curve: c('avg_satisfaction', 'Средняя удовлетворённость', 'higher_is_better', '', [[30, 0], [50, 25], [65, 55], [75, 80], [85, 95], [95, 100]]), weight: 0.25 },
        { curve: c('return_rate', 'Доля возвратных гостей', 'higher_is_better', '%', [[0, 0], [8, 40], [15, 70], [25, 100]]), weight: 0.2 },
        { curve: c('guest_flow', 'Загрузка относительно потенциала', 'higher_is_better', '%', [[30, 20], [50, 50], [70, 75], [90, 100]]), weight: 0.15 },
        { curve: c('review_sentiment', 'Средняя оценка отзывов', 'higher_is_better', '★', [[2, 0], [3.5, 40], [4, 65], [4.5, 90], [5, 100]]), weight: 0.15 },
      ],
    },
    {
      id: 'process',
      label: 'Процессы',
      weight: 0.25,
      metrics: [
        { curve: c('avg_wait', 'Среднее ожидание посадки', 'lower_is_better', 'мин', [[4, 100], [8, 85], [12, 65], [18, 40], [30, 0]]), weight: 0.25 },
        { curve: c('error_rate', 'Ошибки кухни и сервиса', 'lower_is_better', '%', [[0.5, 100], [2, 85], [4, 60], [8, 30], [12, 0]]), weight: 0.2 },
        { curve: c('waste_share', 'Потери и порча', 'lower_is_better', '%', [[1, 100], [3, 75], [5, 50], [10, 20], [15, 0]]), weight: 0.2 },
        { curve: c('stop_list_size', 'Средний стоп-лист', 'lower_is_better', 'блюд', [[0, 100], [3, 70], [6, 40], [12, 0]]), weight: 0.2 },
        { curve: c('hygiene_risk', 'Санитарный+техриск', 'lower_is_better', '', [[10, 100], [30, 70], [50, 40], [75, 10]]), weight: 0.15 },
      ],
    },
    {
      id: 'staff',
      label: 'Персонал',
      weight: 0.2,
      metrics: [
        { curve: c('schedule_coverage', 'Покрытие графика', 'higher_is_better', '%', [[60, 0], [80, 45], [95, 80], [100, 100]]), weight: 0.25 },
        { curve: c('avg_fatigue', 'Средняя усталость', 'lower_is_better', '', [[10, 100], [30, 70], [50, 40], [75, 10]]), weight: 0.2 },
        { curve: c('turnover', 'Текучка за квартал', 'lower_is_better', '%', [[0, 100], [10, 80], [25, 50], [50, 20]]), weight: 0.2 },
        { curve: c('avg_morale', 'Мораль команды', 'higher_is_better', '', [[30, 0], [50, 40], [70, 75], [90, 100]]), weight: 0.15 },
        { curve: c('waiter_load', 'Нагрузка официантов', 'lower_is_better', 'x', [[0.8, 100], [1.0, 75], [1.2, 40], [1.5, 0]]), weight: 0.2 },
      ],
    },
  ],
};

/** Финальный счёт 0–1000 (ТЗ §23). */
export const FINAL_SCORE_WEIGHTS = {
  financialHealth: 250,
  customerHealth: 200,
  operationalHealth: 200,
  staffHealth: 150,
  growth: 100,
  riskManagement: 100,
};

/** Квартальный разбор каждые 12 недель (ТЗ §28). */
export const QUARTERLY_WEEKS = 12;

export const FORECAST = {
  horizonWeeks: 4,
  revenueDownsideFactor: 0.85,
  wasteUpsideFactor: 1.25,
  eventExpectedCostPerEvent: 90_000,
};
