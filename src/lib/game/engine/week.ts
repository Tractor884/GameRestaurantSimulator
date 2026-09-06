/**
 * СИМУЛЯЦИЯ НЕДЕЛИ (ТЗ §3.4): 7 дней + финансовый контур.
 *
 * ТРИ КОНТУРА (ТЗ §18.1): P&L (начисление) ≠ Cash Flow (движение денег).
 * Еженедельно: зарплата + взносы. Каждые 4 недели: аренда, коммунальные, налоги.
 * Кредит: аннуитет каждые 4 недели со недели получения + 4.
 * Также: BSC, прогноз, квартальный разбор (12 нед), финальный счёт (52 нед).
 */
import type {
  CashFlowReport,
  DaySimulationResult,
  GameDate,
  GameStatus,
  GameState,
  PnlReport,
  QuarterlyReview,
  RiskType,
  WeekSimulationResult,
  WeekStat,
  RiskHistoryEntry,
  GameEvent,
} from '../types';
import { FINANCE, TAXES } from '../config/finance.config';
import { LOANS, annuityPayment } from '../config/loans.config';
import { WIN_CONDITIONS, LOSE_CONDITIONS, DIFFICULTIES } from '../config/difficulty.config';
import { EQUIPMENT_LEVELS, DEPRECIATION_MONTHS, ALCOHOL_LICENSE } from '../config/premises.config';
import { QUARTERLY_WEEKS } from '../config/bsc.config';
import { RISKS_META } from '../config/risks.config';
import { deriveRng, hashSeed } from '../rng';
import { cloneState, addTransaction, dayIndex, clamp } from './core';
import { simulateDay } from './day';
import { computeBSCFromState, computeFinalScore } from './bsc';
import { computeForecast } from './forecast';
import { weeklyTurnover } from './staff';

export function simulateWeek(
  state: GameState,
  seed: number,
): { result: WeekSimulationResult; state: GameState } {
  const draft = cloneState(state);

  const week = draft.week;
  const cashStart = draft.restaurant?.finance.cash ?? 0;
  const dayResults: DaySimulationResult[] = [];

  // ===== 7 ДНЕЙ =====
  let current = draft;
  for (let d = 0; d < 7; d++) {
    if (current.activeEvents.some((e) => !e.resolved)) break; // критическое событие ставит паузу
    const { result, state: nextState } = simulateDay(current, { plannedActions: [] }, seed);
    dayResults.push(result);
    current = nextState;
  }
  Object.assign(draft, current); // итоговое состояние недели
  // ВАЖНО: restaurant берём ПОСЛЕ цикла дней (дни мутируют клон).
  const restaurant = draft.restaurant;
  if (!restaurant) throw new Error('simulateWeek: ресторан не создан');

  // ===== ФИНАНСЫ НЕДЕЛИ =====
  const revenue = dayResults.reduce((s, r) => s + r.kpi.revenue, 0);
  const cogs = dayResults.reduce((s, r) => s + r.kpi.cogs, 0);
  const wasteCost = dayResults.reduce((s, r) => s + r.kpi.wasteCost, 0);
  const acquiringFees = Math.round(revenue * FINANCE.acquiringRate);
  const marketing = dayResults.reduce((s, r) => s + (r.transactions.find((t) => t.type === 'marketing')?.amount ?? 0), 0);
  const payroll = restaurant.finance.accrued.payrollGross;
  const socialContributions = Math.round(payroll * TAXES.socialContributions);

  // Начисления периодических расходов (ТЗ §18.5).
  const rentAccrued = Math.round(restaurant.rentMonthly / 4);
  const utilitiesAccrued = Math.round(restaurant.utilitiesMonthly / 4);
  const equipmentValue =
    restaurant.equipment.kitchen.value + restaurant.equipment.coffee.value + restaurant.equipment.hall.value;
  const depreciation = Math.round(equipmentValue / DEPRECIATION_MONTHS / 4);
  const licenseAmortization = restaurant.licenses.alcohol?.active
    ? Math.round(ALCOHOL_LICENSE.annualCost / 12 / 4)
    : 0;
  const maintenance =
    EQUIPMENT_LEVELS[restaurant.equipment.kitchen.level].maintenanceCostPerWeek +
    EQUIPMENT_LEVELS[restaurant.equipment.coffee.level].maintenanceCostPerWeek * 0.4 +
    EQUIPMENT_LEVELS[restaurant.equipment.hall.level].maintenanceCostPerWeek * 0.3;
  const otherOperating = FINANCE.otherWeeklyCost + restaurant.marketing.cleaningBudget;

  // P&L (ТЗ §18.4).
  const grossProfit = revenue - cogs - wasteCost;
  const operatingProfit =
    grossProfit - payroll - socialContributions - rentAccrued - utilitiesAccrued -
    marketing - maintenance - depreciation - licenseAmortization - otherOperating;
  const loanInterest = Math.round(
    restaurant.finance.loans.reduce((s, l) => s + (l.remaining * l.annualRate) / 12, 0),
  );
  const taxableProfit = operatingProfit - loanInterest;
  const tax = Math.max(0, Math.round(taxableProfit * TAXES.profitTax));
  const netProfit = taxableProfit - tax;

  const pnl: PnlReport = {
    week,
    revenue, cogs, wasteCost, grossProfit, payroll, socialContributions,
    rentAccrued, utilitiesAccrued, marketing, maintenance, repairs: 0,
    depreciation, licenseAmortization, otherOperating, operatingProfit,
    loanInterest, taxableProfit, tax, netProfit, acquiringFees,
  };

  // ===== ДВИЖЕНИЕ ДЕНЕГ (cash flow) =====
  const weekDate: GameDate = { week, day: 6, hour: 23 };
  // Зарплата: выплата в конце недели (ТЗ §14.10).
  if (payroll > 0) {
    addTransaction(restaurant, weekDate, 'payroll', payroll, 'out', 'Зарплата за неделю (gross)');
    addTransaction(restaurant, weekDate, 'social_contribution', socialContributions, 'out', 'Социальные взносы 30%');
  }
  restaurant.finance.accrued.payrollGross = 0;

  // Аренда и коммунальные: каждые 4 недели.
  let rentPaid = 0;
  let utilitiesPaid = 0;
  if (week > 0 && week % 4 === 0) {
    rentPaid = restaurant.rentMonthly;
    utilitiesPaid = restaurant.utilitiesMonthly;
    addTransaction(restaurant, weekDate, 'rent', rentPaid, 'out', 'Аренда за месяц');
    addTransaction(restaurant, weekDate, 'utilities', utilitiesPaid, 'out', 'Коммунальные за месяц');
  }

  // Налоги: каждые 4 недели по накопленной базе (ТЗ §18.7).
  restaurant.finance.accrued.taxProfit += taxableProfit;
  let taxesPaid = 0;
  if (week > 0 && week % 4 === 0) {
    const base = Math.max(0, restaurant.finance.accrued.taxProfit);
    taxesPaid = Math.round(base * TAXES.profitTax);
    if (taxesPaid > 0) {
      addTransaction(restaurant, weekDate, 'tax', taxesPaid, 'out', 'Налог на прибыль (игровая модель)');
    }
    restaurant.finance.accrued.taxProfit = 0;
  }

  // Кредиты: аннуитет каждые 4 недели (ТЗ §18.8).
  let loanPayments = 0;
  for (const loan of restaurant.finance.loans) {
    while (week >= loan.nextPaymentWeek) {
      const interest = Math.round((loan.remaining * loan.annualRate) / 12);
      const principal = Math.max(0, Math.round(loan.payment - interest));
      const payment = Math.min(loan.remaining + interest, loan.payment);
      if (restaurant.finance.cash >= payment) {
        addTransaction(restaurant, weekDate, 'loan_payment', Math.round(payment), 'out',
          `Платёж по кредиту (проценты ${interest.toLocaleString('ru-RU')} ₽)`);
        loan.remaining = Math.max(0, loan.remaining - principal);
        loan.nextPaymentWeek += 4;
        loan.overduePayments = 0;
        loanPayments += Math.round(payment);
      } else {
        // Просрочка: штраф, рост риска (ТЗ §18.10).
        const fine = Math.round(payment * LOANS.overdueFineRate);
        addTransaction(restaurant, weekDate, 'fine', fine, 'out', 'Штраф за просрочку кредита');
        loan.nextPaymentWeek += 4;
        loan.overduePayments += 1;
        restaurant.risks.financial = clamp(restaurant.risks.financial + LOANS.overdueRiskPerWeek, 0, 100);
        loanPayments += fine;
      }
      if (loan.remaining <= 1) {
        loan.remaining = 0;
        break;
      }
    }
  }
  restaurant.finance.loans = restaurant.finance.loans.filter((l) => l.remaining > 1 || l.overduePayments > 0);

  // Лицензия на алкоголь: годовая оплата при активации — амортизация уже в P&L.
  // (оплата разовая при покупке, обрабатывается действием игрока)

  // ===== BSC + ПРОГНОЗ =====
  const bsc = computeBSCFromState(draft, pnl);
  const forecast = computeForecast(draft);

  // ===== КВАРТАЛЬНЫЙ РАЗБОР (ТЗ §28) =====
  let quarterlyReview: QuarterlyReview | undefined;
  if (week > 0 && week % QUARTERLY_WEEKS === 0) {
    const quarter = week / QUARTERLY_WEEKS;
    const quarterStats = draft.history.weekStats.slice(-QUARTERLY_WEEKS);
    const qRevenue = quarterStats.reduce((s, w) => s + w.revenue, 0);
    const qProfit = quarterStats.reduce((s, w) => s + w.netProfit, 0);
    const bscAvg = quarterStats.length > 0 ? quarterStats.reduce((s, w) => s + w.bsc, 0) / quarterStats.length : bsc.total;
    const recommendations: string[] = [];
    if (pnl.revenue > 0 && (cogs + wasteCost) / pnl.revenue > 0.36) {
      recommendations.push('Food Cost выше 36%: пересмотрите техкарты и цены.');
    }
    if (pnl.revenue > 0 && (payroll + socialContributions) / pnl.revenue > 0.32) {
      recommendations.push('Labor Cost выше 32%: оптимизируйте графики смен.');
    }
    if (restaurant.reputation.rating < 4.0) {
      recommendations.push('Рейтинг ниже 4.0: сфокусируйтесь на скорости и качестве сервиса.');
    }
    if (restaurant.risks.financial > 50) {
      recommendations.push('Финансовый риск высок: держите денежный запас 3+ млн ₽.');
    }
    if (recommendations.length === 0) recommendations.push('Показатели в норме — думайте о росте выручки.');
    quarterlyReview = {
      quarter,
      bscAvg: Math.round(bscAvg),
      revenue: qRevenue,
      netProfit: qProfit,
      rating: restaurant.reputation.rating,
      verdict:
        bscAvg >= 75 ? 'Отличный квартал' : bscAvg >= 55 ? 'Стабильный квартал' : 'Квартал ниже целевого',
      recommendations,
    };
  }

  // ===== ТЕКУЧКА (конец недели) =====
  const turnoverRng = deriveRng(hashSeed(seed, week), 'turnover');
  weeklyTurnover(restaurant, () => turnoverRng.next());

  // ===== ИСТОРИЯ =====
  const guests = dayResults.reduce((s, r) => s + r.kpi.guests, 0);
  const weekStat: WeekStat = {
    week,
    revenue,
    guests,
    avgCheck: guests > 0 ? Math.round(revenue / guests) : 0,
    cogs,
    wasteCost,
    payroll: payroll + socialContributions,
    netProfit,
    cashEnd: restaurant.finance.cash,
    rating: restaurant.reputation.rating,
    satisfaction: dayResults.length > 0
      ? Math.round(dayResults.reduce((s, r) => s + r.kpi.satisfaction, 0) / dayResults.length)
      : 0,
    foodCost: revenue > 0 ? (cogs + wasteCost) / revenue : 0,
    laborCost: revenue > 0 ? (payroll + socialContributions) / revenue : 0,
    bsc: bsc.total,
  };
  draft.history.weekStats.push(weekStat);
  if (draft.history.weekStats.length > 52) draft.history.weekStats.shift();
  draft.history.cumulativeNetProfit += netProfit;
  draft.history.positiveOpWeeks = operatingProfit > 0 ? draft.history.positiveOpWeeks + 1 : 0;
  draft.history.lowRatingWeeks = restaurant.reputation.rating < LOSE_CONDITIONS.lowRatingThreshold
    ? draft.history.lowRatingWeeks + 1
    : 0;

  // Логи дней: последние 7.
  for (const r of dayResults) {
    draft.history.dayLogs.push({
      date: r.date,
      hourLogs: r.hourLogs,
      kpi: r.kpi,
      transactions: r.transactions,
      reviews: r.reviews,
      events: r.events,
      riskChanges: r.riskChanges,
      warnings: r.warnings,
    });
  }
  while (draft.history.dayLogs.length > 7) draft.history.dayLogs.shift();

  // История рисков.
  const riskHistory: RiskHistoryEntry = {
    week,
    values: { ...restaurant.risks },
    mainDrivers: Object.entries(restaurant.risks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => RISKS_META[k as RiskType]?.name ?? k),
  };
  draft.history.riskHistory.push(riskHistory);
  if (draft.history.riskHistory.length > 52) draft.history.riskHistory.shift();

  // ===== СТАТУСЫ: ПОБЕДА / ПОРАЖЕНИЕ (ТЗ §37) =====
  let gameStatus: GameStatus = draft.status;
  let gameOver = false;

  // Банкротство.
  const bankrupt =
    restaurant.finance.cash < LOSE_CONDITIONS.bankruptCash ||
    restaurant.finance.loans.some((l) => l.overduePayments >= 8) ||
    draft.history.lowRatingWeeks >= LOSE_CONDITIONS.lowRatingWeeks;
  if (bankrupt) {
    gameStatus = 'bankrupt';
    gameOver = true;
    draft.phase = 'gameover';
  } else if (week >= 52) {
    // Финал 52 недели.
    const lastQuarter = draft.history.weekStats.slice(-12);
    const bscAvg = lastQuarter.length > 0 ? lastQuarter.reduce((s, w) => s + w.bsc, 0) / lastQuarter.length : 0;
    const won =
      restaurant.finance.cash >= WIN_CONDITIONS.minCash &&
      bscAvg >= WIN_CONDITIONS.minBscAvgQuarter &&
      restaurant.reputation.rating >= WIN_CONDITIONS.minRating &&
      draft.history.cumulativeNetProfit >= WIN_CONDITIONS.minCumulativeProfit &&
      draft.history.positiveOpWeeks >= WIN_CONDITIONS.minPositiveOpWeeks;
    gameStatus = won ? (bscAvg >= 85 && restaurant.reputation.rating >= 4.5 ? 'excellent' : 'sustainable') : 'stable';
    draft.phase = 'gameover';
    gameOver = true;
  } else {
    if (week >= 12 && draft.status === 'open') gameStatus = 'survived_12';
    if (week >= 24 && draft.history.weekStats.slice(-4).every((w) => w.netProfit > 0)) gameStatus = 'stable';
  }
  draft.status = gameStatus;

  // ===== ФИНАЛЬНЫЙ СЧЁТ =====
  let finalScore: WeekSimulationResult['finalScore'];
  if (week >= 52 || gameOver) {
    finalScore = computeFinalScore(draft, bsc);
  }

  // ===== CASH FLOW ОТЧЁТ =====
  const txs = restaurant.finance.transactions.filter((t) => t.date.week === week);
  const sumType = (type: string, dir: 'in' | 'out' = 'out') =>
    txs.filter((t) => t.type === type && t.direction === dir).reduce((s, t) => s + t.amount, 0);
  const cashFlow: CashFlowReport = {
    week,
    cashStart,
    netCashFromSales: sumType('sale', 'in'),
    purchases: sumType('purchase'),
    payrollPaid: sumType('payroll'),
    socialPaid: sumType('social_contribution'),
    rentPaid: sumType('rent'),
    utilitiesPaid: sumType('utilities'),
    marketingPaid: sumType('marketing'),
    maintenancePaid: sumType('maintenance'),
    repairsPaid: sumType('repair'),
    taxesPaid: sumType('tax'),
    loanPayments: sumType('loan_payment'),
    finesPaid: sumType('fine'),
    licensePaid: sumType('license'),
    equipmentPaid: sumType('equipment'),
    loanDisbursements: sumType('loan_disbursement', 'in'),
    ownerContributions: sumType('other', 'in'),
    eventIncome: 0,
    cashEnd: restaurant.finance.cash,
  };

  const result: WeekSimulationResult = {
    week,
    dayResults,
    pnl,
    cashFlow,
    bsc,
    forecast,
    events: draft.activeEvents.filter((e) => e.date.week === week) as GameEvent[],
    riskHistory,
    quarterlyReview,
    finalScore,
    gameStatus,
    gameOver,
  };
  draft.weekResult = result;

  return { result, state: draft };
}
