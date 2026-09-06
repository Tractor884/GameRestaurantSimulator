/**
 * Конфиг сложности (ТЗ §36). Три уровня: Новичок / Стандарт / Профессионал.
 *
 * ЧТО МЕНЯЕТ СЛОЖНОСТЬ (по ТЗ §36.2 — стартовый капитал, ставка кредита,
 * эластичность спроса; дополнено частотой событий и динамикой репутации):
 *  - ownerEquity / loanRate — финансовая подушка и цена денег;
 *  - demandElasticity × seg.priceSensitivity — гости чувствительнее к ценам;
 *  - eventFrequency — фон внешнего мира и риск-события (§6.12 паспорта);
 *  - fineSeverity — штраф за просрочку кредита (§18.10);
 *  - staffFatigueRate — скорость накопления усталости (§6.9);
 *  - reputationSpeed — байесовская инерция рейтинга (§6.8): >1 — рейтинг
 *    живее реагирует на отзывы, <1 — «прошлый опыт» перевешивает;
 *  - winConditions — планки победы на 52-й неделе (§37.3).
 *
 * КАЛИБРОВКА (сверка scripts/difficulty-test.ts, 16 нед, Тверская/70 мест):
 *  Standard — эталон паспорта §1.2: маржа ~13–14%, FC 30.2%, LC 32%.
 *  Novice — та же экономика, но +25% взнос, −20% эластичность, ×0.7 событий:
 *    кассовый минимум выше, рейтинг стабильнее; победа реально достижима
 *    «игрой по подсказкам туториала». Профит-планка 9 млн (а не 12).
 *  Professional — −17% взноса, +25% эластичность, ×1.4 событий, репутация
 *    в 1.6× живее: цена ошибок выше; победа — 15 млн и рейтинг 4.3.
 */
import type { GameStatus } from '../types';

/** Условия победы (структура = WIN_CONDITIONS, но настраивается по сложности). */
export interface WinConditions {
  minCash: number;
  minBscAvgQuarter: number;
  minRating: number;
  minCumulativeProfit: number;
  minPositiveOpWeeks: number;
}

export interface DifficultyConfig {
  id: string;
  name: string;
  /** Короткое описание для карточки визарда (1–2 строки). */
  description: string;
  /** Ключевые отличия для карточки визарда (короткие фразы). */
  highlights: string[];
  ownerEquity: number; // собственный взнос, ₽
  maxLoan: number; // максимальный кредит, ₽
  loanLimitMultiplier: number; // кредитный лимит = min(maxLoan, k × own equity)
  loanRate: number; // годовая ставка
  loanTermMonths: number;
  demandElasticity: number; // множитель эластичности цены
  eventFrequency: number; // множитель частоты событий
  fineSeverity: number;
  staffFatigueRate: number;
  reputationSpeed: number;
  cashBuffer: number; // рекомендуемый денежный запас, ₽
  winConditions: WinConditions;
}

export const DIFFICULTIES: Record<string, DifficultyConfig> = {
  novice: {
    id: 'novice',
    name: 'Новичок',
    description:
      'Спокойное знакомство с экономикой ресторана: кассовая подушка толще, гости снисходительнее к ценам, события реже, рейтинг прощает ошибки.',
    highlights: [
      'взнос 15 млн ₽ и ставка кредита 20%',
      'спрос почти не реагирует на цены',
      'события ×0.7 · рейтинг инертный',
    ],
    ownerEquity: 15_000_000,
    maxLoan: 20_000_000,
    loanLimitMultiplier: 1.5,
    loanRate: 0.2,
    loanTermMonths: 36,
    // 0.8 × priceSensitivity: подъём цен на 10% отнимает ~на четверть меньше гостей,
    // чем в Стандарте — «прощает» неоптимальное ценообразование первых недель.
    demandElasticity: 0.8,
    eventFrequency: 0.7,
    fineSeverity: 0.6,
    staffFatigueRate: 0.75,
    // Байесовский приор 45/0.6 = 75 «виртуальных отзывов» — день провала сдвигает
    // рейтинг в ~1.7 раза слабее, чем в Стандарте (см. §6.8 паспорта).
    reputationSpeed: 0.6,
    cashBuffer: 3_000_000,
    winConditions: {
      minCash: 3_000_000,
      minBscAvgQuarter: 65,
      minRating: 4.0,
      minCumulativeProfit: 9_000_000,
      minPositiveOpWeeks: 6,
    },
  },
  standard: {
    id: 'standard',
    name: 'Стандарт',
    description:
      'Сбалансированная сложность, на которой откалиброваны все эталоны паспорта: маржа 13–14%, Food Cost 30–34%, победа — работа на весь год.',
    highlights: [
      'взнос 12 млн ₽ и ставка кредита 24%',
      'экономика эталона §1.2 паспорта',
      'победа: 12 млн прибыли · рейтинг 4.2',
    ],
    ownerEquity: 12_000_000,
    maxLoan: 20_000_000,
    loanLimitMultiplier: 1.5,
    loanRate: 0.24,
    loanTermMonths: 36,
    demandElasticity: 1.0,
    eventFrequency: 1.0,
    fineSeverity: 1.0,
    staffFatigueRate: 1.0,
    reputationSpeed: 1.0,
    cashBuffer: 3_000_000,
    winConditions: {
      minCash: 4_000_000,
      minBscAvgQuarter: 70,
      minRating: 4.2,
      minCumulativeProfit: 12_000_000,
      minPositiveOpWeeks: 8,
    },
  },
  professional: {
    id: 'professional',
    name: 'Профессионал',
    description:
      'Хардкор для ветеранных управляющих: тонкая подушка, чувствительные гости, нервный рейтинг, злой внешний мир. Победа требует безошибочного года.',
    highlights: [
      'взнос 10 млн ₽ и ставка кредита 26%',
      'гости чувствительнее к ценам на 25%',
      'события ×1.4 · рейтинг живой · победа 15 млн',
    ],
    ownerEquity: 10_000_000,
    maxLoan: 20_000_000,
    loanLimitMultiplier: 1.5,
    loanRate: 0.26,
    loanTermMonths: 36,
    // 1.25 × priceSensitivity: ошибочная наценка бьёт по трафику сильнее —
    // ценообразование требует работы с DishScore и сегментами (§6.4).
    demandElasticity: 1.25,
    eventFrequency: 1.4,
    fineSeverity: 1.5,
    staffFatigueRate: 1.3,
    // Приор 45/1.6 ≈ 28: отзывы перевешивают «прошлый опыт» быстрее —
    // одна сканальная неделя заметно тянет рейтинг вниз.
    reputationSpeed: 1.6,
    cashBuffer: 4_000_000,
    winConditions: {
      minCash: 5_000_000,
      minBscAvgQuarter: 72,
      minRating: 4.3,
      minCumulativeProfit: 15_000_000,
      minPositiveOpWeeks: 10,
    },
  },
};

/** Целевые ориентиры здорового ресторана (ТЗ §30) — для подсказок UI. */
export const HEALTHY_TARGETS = {
  foodCost: [0.3, 0.34] as const,
  laborCost: [0.25, 0.32] as const, // с соц. взносами
  rentShare: [0.08, 0.15] as const,
  marketingShare: [0.02, 0.05] as const,
  ebitdaMargin: [0.1, 0.2] as const,
  netMargin: [0.05, 0.15] as const,
  rating: 4.0,
  avgCheckNoAlcohol: [3500, 4000] as const,
};

/**
 * Базовые условия победы на 52-й неделе (ТЗ §37.3) = сложность «Стандарт».
 * АУДИТ ПРОЕКТА: 5 млн накопленной прибыли достигались за ~7 недель —
 * победа не отражала годовое управление. Новая планка: 12 млн (≈ 30–40
 * недель устойчивой работы при целевой марже 10–13%) + касса 4 млн.
 *
 * Для действующей игры условия берутся из DIFFICULTIES[difficultyId].winConditions —
 * см. difficultyWin() ниже.
 */
export const WIN_CONDITIONS: WinConditions = DIFFICULTIES.standard.winConditions;

/** Условия победы для конкретной игры (по её сложности; fallback — Стандарт). */
export function difficultyWin(difficultyId: string | undefined): WinConditions {
  return DIFFICULTIES[difficultyId ?? 'standard']?.winConditions ?? WIN_CONDITIONS;
}

/** Конфиг сложности игры (fallback — Стандарт, старые сейвы без id). */
export function difficultyOf(difficultyId: string | undefined): DifficultyConfig {
  return DIFFICULTIES[difficultyId ?? 'standard'] ?? DIFFICULTIES.standard;
}

/** Порог поражения: рейтинг ниже 2.0 в течение 4 недель. */
export const LOSE_CONDITIONS = {
  lowRatingThreshold: 2.0,
  lowRatingWeeks: 4,
  bankruptCash: -1_000_000, // допуск овердрафта до 1 млн ₽
};

export const STATUS_LABELS: Record<GameStatus, string> = {
  open: 'Работает',
  bankrupt: 'Банкротство',
  survived_12: 'Выжил (12 недель)',
  stable: 'Стабильный ресторан',
  sustainable: 'Устойчивый ресторан',
  excellent: 'Отличный ресторан',
};
