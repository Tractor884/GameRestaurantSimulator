/**
 * Финансовый конфиг (ТЗ §18) и налоги (ТЗ §18.7).
 * ТРИ КОНТУРА: P&L (начисление), Cash Flow (движение денег), скрытый баланс.
 * Прибыль ≠ деньги на счёте — ключевой обучающий принцип.
 */
import type { StorageType } from '../types';

export const FINANCE = {
  /** Эквайринг: 1.5–2.5% (ТЗ §18.3). */
  acquiringRate: 0.02,
  /** Оплата налога на прибыль: каждые 4 недели. */
  taxIntervalWeeks: 4,
  /** Оплата аренды: каждые 4 недели (1-я неделя месяца). */
  rentIntervalWeeks: 4,
  /** Коммунальные: каждые 4 недели. */
  utilitiesIntervalWeeks: 4,
  /** Лимит транзакций в памяти. */
  maxTransactions: 400,
  /** Прочие операционные расходы (хозтовары, упаковка, RKO, подписки, банк), ₽/нед.
   * АУДИТ: 25→60 тыс (раньше эта статья была почти невидимой; калибровка
   * чистой маржи к 8–15%). */
  otherWeeklyCost: 60_000,
  /** Техобслуживание: базово из equipment.config × этот множитель при износе. */
  maintenanceWearMultiplier: 0.4,
};

export const TAXES = {
  /** Игровая модель (ТЗ §18.7): налог на прибыль 15%. */
  profitTax: 0.15,
  /** Зарплатные взносы 30%. */
  socialContributions: 0.3,
};

/** Потери при хранении: доля в день от остатка (ТЗ §12.4). */
export const STORAGE_LOSS_PER_DAY: Record<StorageType, number> = {
  dry: 0.002,
  refrigerated: 0.004,
  frozen: 0.001,
};

/** Срочная закупка: +25–50% к цене (ТЗ §12.5). */
export const URGENT_PURCHASE_MARKUP = 0.35;

/** Минимальный запас для закупки: партия = дневная потребность × daysCover. */
export const PURCHASE_COVER_DAYS = {
  min: 1,
  recommended: 3,
  max: 7,
};

/** Коэффициент воровства (включен при staffRisk > 70). */
export const THEFT = {
  riskThreshold: 70,
  lossFraction: 0.002, // 0.2% стоимости склада в день
};

export const TIP_DISTRIBUTION = {
  /** Чаевые не выручка ресторана (ТЗ §14.11) — идут персоналу, повышая мораль. */
  moraleEffectPerTipShare: 0.15,
};
