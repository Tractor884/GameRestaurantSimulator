/**
 * Режимы закупки — БАЛ-v2 §9 «механизм G» (порт из ветки v1.0.0,
 * калибровка гейтов этапа 3: S4-премиум FC 33,0% ≤ 33; «эконом без
 * дисциплины» FC 35,3% > 31,9% стандарта).
 *
 * Режим — НЕ «всегда эконом»: эконом бьёт по качеству входа (рейтинг/
 * удовлетворённость) и добавляет порчу при запасах впрок; премиум —
 * надёжность (меньше сбоев поставки и списаний), но вход дороже.
 *
 * СТАНДАРТ = текущая калибровка движка (цены ×1,00, качество 0,
 * цель автозаказа 2 дня — дефолт autoPurchase.coverDays): пассивная
 * симуляция без переключения режима НЕ меняет закупочную экономику.
 */
import type { DishCategory, ProcurementPolicyId, Restaurant } from '../types';
import { MENU_CATEGORIES } from './menu.config';

export interface ProcurementConfig {
  /** Множитель закупочных цен по режиму. */
  priceMult: Record<ProcurementPolicyId, number>;
  /** Дельта качества входа → качество поданного блюда. */
  inputQuality: Record<ProcurementPolicyId, number>;
  /** Множитель срока годности партий (в ДНЯХ). */
  shelfLifeMult: Record<ProcurementPolicyId, number>;
  /** База шанса недовоза/брака одной поставки. */
  supplyErrorBase: number;
  /** Множитель шанса сбоя по режиму. */
  supplyErrorMult: Record<ProcurementPolicyId, number>;
  /** Порча: добавка/день (эконом) и множитель естественных потерь (премиум). */
  spoilAddPerDay: Record<ProcurementPolicyId, number>;
  spoilMult: Record<ProcurementPolicyId, number>;
  /** Цель автозаказа в днях покрытия (стандарт = дефолт движка). */
  autoCoverDays: Record<ProcurementPolicyId, number>;
  /** Разовая стоимость переключения (переговоры/контракт). */
  switchCost: number;
  /** Лаг активации переключения, недель. */
  switchLagWeeks: number;
  /** Премиальные категории (эластичность ≤0,9) реагируют на качество сильнее. */
  premiumCatQualityMult: number;
}

export const PROCUREMENT: ProcurementConfig = {
  // Цена премиума ×1,03 (не ×1,10): при ×1,10 FC премиума структурно > 34% —
  // гейт «FC ≤ 33%» недостижим (калибровка v1.0.0 этап 3).
  priceMult: { economy: 0.93, standard: 1.0, premium: 1.03 },
  inputQuality: { economy: -7, standard: 0, premium: 5 },
  shelfLifeMult: { economy: 0.8, standard: 1.0, premium: 1.2 },
  supplyErrorBase: 0.015,
  supplyErrorMult: { economy: 1.5, standard: 1.0, premium: 0.7 },
  spoilAddPerDay: { economy: 0.0015, standard: 0, premium: 0 },
  spoilMult: { economy: 1.0, standard: 1.0, premium: 0.6 },
  // Стандарт 2,0 = дефолт autoPurchase.coverDays движка (setup.ts).
  autoCoverDays: { economy: 1.5, standard: 2.0, premium: 3.5 },
  switchCost: 50_000,
  switchLagWeeks: 2,
  premiumCatQualityMult: 1.5,
};

/* ============================= ПОДПИСКИ UI ============================= */

export const PROC_LABELS: Record<ProcurementPolicyId, { title: string; hint: string }> = {
  economy: {
    title: 'Эконом',
    hint: 'Цены −7%, но качество входа −7, срок годности ×0,8, сбои поставки +50%, порча +0,15%/день. Съедает скидку при запасах впрок.',
  },
  standard: {
    title: 'Стандарт',
    hint: 'Текущая калибровка: базовые цены/качество/сроки, цель автозаказа 2 дня. Надёжный минимум.',
  },
  premium: {
    title: 'Премиум',
    hint: 'Вход +3%, зато качество +5, срок годности ×1,2, сбои −30%, порча ×0,6. Надёжность и рейтинг, не экономия FC.',
  },
};

/* ============================= ХЕЛПЕРЫ ============================= */

/** Активный режим закупки (дефолт standard; миграция v7 гарантирует поле). */
export function activeProcurement(restaurant: Restaurant): ProcurementPolicyId {
  return restaurant.inventory.procurement?.policy ?? 'standard';
}

/** v2 §9: множитель закупочных цен. */
export function procPriceMult(policy: ProcurementPolicyId): number {
  return PROCUREMENT.priceMult[policy];
}

/** v2 §9: дельта качества входа для категории (эластичность ≤0,9 —
 *  премиальные категории реагируют сильнее). */
export function procInputQuality(policy: ProcurementPolicyId, category: DishCategory): number {
  if (policy === 'standard') return 0;
  const delta = PROCUREMENT.inputQuality[policy];
  const el = MENU_CATEGORIES[category]?.elasticity ?? 1;
  return el <= 0.9 ? delta * PROCUREMENT.premiumCatQualityMult : delta;
}

/** v2 §9: множитель срока годности партий. */
export function procShelfLifeMult(policy: ProcurementPolicyId): number {
  return PROCUREMENT.shelfLifeMult[policy];
}

/** v2 §9: шанс недовоза/брака одной поставки (недовоз ×0,75). */
export function procSupplyErrorChance(policy: ProcurementPolicyId): number {
  return Math.min(0.25, PROCUREMENT.supplyErrorBase * PROCUREMENT.supplyErrorMult[policy]);
}

/** v2 §9: порча — добавка/день (эконом) и множитель (премиум). */
export function procSpoilRates(policy: ProcurementPolicyId): { add: number; mult: number } {
  return { add: PROCUREMENT.spoilAddPerDay[policy], mult: PROCUREMENT.spoilMult[policy] };
}

/** v2 §9: цель автозаказа в днях покрытия из режима. */
export function procAutoCoverDays(policy: ProcurementPolicyId): number {
  return PROCUREMENT.autoCoverDays[policy];
}
