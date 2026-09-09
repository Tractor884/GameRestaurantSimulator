/**
 * Прогноз на 4 недели (ТЗ §24). Детерминированный, без Монте-Карло.
 * Три уровня: Base / RiskAdjusted / MinimumSafe.
 */
import type { ForecastReport, GameState } from '../types';
import { FORECAST } from '../config/bsc.config';
import { FINANCE, TAXES } from '../config/finance.config';
import { isLegacy, profitTaxRate, utilIndex, weeklyOverhead, wageIndex } from '../config/balance2.config';
import { hourlyRate } from './staff';
import { ROLE_IDS } from '../config/staffRoles.config';

export function computeForecast(state: GameState, horizon = FORECAST.horizonWeeks): ForecastReport[] {
  const r = state.restaurant;
  if (!r) return [];
  const stats = state.history.weekStats;
  const recent = stats.slice(-4);
  const avgRevenue = recent.length > 0 ? recent.reduce((s, w) => s + w.revenue, 0) / recent.length : 0;
  const avgGuests = recent.length > 0 ? recent.reduce((s, w) => s + w.guests, 0) / recent.length : 0;
  const avgCogs = recent.length > 0
    ? recent.reduce((s, w) => s + w.cogs + w.wasteCost, 0) / recent.length
    : avgRevenue * 0.33;

  const payrollWeekly = estimateWeeklyPayroll(r, state.week, state.difficultyId);
  const payrollWithSocial = payrollWeekly * (1 + TAXES.socialContributions);
  const out: ForecastReport[] = [];
  let cash = r.finance.cash;

  for (let i = 1; i <= horizon; i++) {
    const week = state.week + i;
    const bigPayments: { week: number; label: string; amount: number }[] = [];
    // Бюджет — только активные кампании: завершённые деньги не списывают.
    const activeCampaignBudget = r.marketing.campaigns
      .filter((c) => c.endedWeek == null)
      .reduce((s, c) => s + c.weeklyBudget, 0);
    // v2 §5.1/§10: накладные зависят от выручки/гостей/недели (а не константа).
    const overhead = weeklyOverhead(avgRevenue, avgGuests, week, state.difficultyId);
    let weeklyOut = avgCogs + payrollWithSocial + overhead + activeCampaignBudget + r.marketing.cleaningBudget;

    if (week % 4 === 0) {
      // v2 §6/§10: аренда проиндексирована квартально, коммунальные — инфляция.
      const utilInfl = isLegacy() ? 1 : utilIndex(week, state.difficultyId);
      const rentUtils = r.rentMonthly + Math.round(r.utilitiesMonthly * utilInfl);
      weeklyOut += rentUtils;
      bigPayments.push({ week, label: 'Аренда и коммунальные', amount: Math.round(rentUtils) });
    }
    for (const loan of r.finance.loans) {
      if (week >= loan.nextPaymentWeek && (week - loan.nextPaymentWeek) % 4 === 0) {
        weeklyOut += loan.payment;
        bigPayments.push({ week, label: 'Платёж по кредиту', amount: Math.round(loan.payment) });
      }
    }
    if (week % 4 === 0) {
      const taxReserve = Math.max(0, (avgRevenue - weeklyOut)) * profitTaxRate();
      weeklyOut += taxReserve;
      bigPayments.push({ week, label: 'Налоги (по прибыли)', amount: Math.round(taxReserve) });
    }

    const expectedCashEnd = cash + avgRevenue * (1 - FINANCE.acquiringRate) - weeklyOut;
    const riskAdjusted = cash + avgRevenue * FORECAST.revenueDownsideFactor * (1 - FINANCE.acquiringRate) - weeklyOut * 1.12;
    const minSafe = cash + avgRevenue * 0.7 * (1 - FINANCE.acquiringRate) - weeklyOut * 1.25 - FORECAST.eventExpectedCostPerEvent;

    out.push({
      week,
      expectedRevenue: Math.round(avgRevenue),
      expectedGuests: Math.round(avgGuests),
      expectedCashEnd: Math.round(expectedCashEnd),
      riskAdjustedCashEnd: Math.round(riskAdjusted),
      minSafeCashEnd: Math.round(minSafe),
      bigPayments,
    });
    cash = expectedCashEnd;
  }
  return out;
}

/** Оценка недельного фонда оплаты труда из штата (для прогноза до первой недели).
 * АУДИТ (§6.2): ставки берутся из staffRoles.config через hourlyRate()
 * (единый источник) — раньше здесь была собственная таблица ставок, которая
 * рассинхронизировалась бы при смене окладов.
 * v2 §10: умножается на квартальный индекс окладов (как в accruePayrollDay). */
function estimateWeeklyPayroll(
  r: NonNullable<GameState['restaurant']>,
  week: number,
  difficultyId: string | undefined,
): number {
  const wageMult = wageIndex(week, difficultyId);
  let sum = 0;
  for (const roleId of ROLE_IDS) {
    const pool = r.staff.pools[roleId];
    if (!pool) continue;
    sum += pool.count * 5 * 8 * hourlyRate(roleId) * 0.8 * wageMult; // ~80% выход на смены
  }
  return sum;
}
