/**
 * BSC — сбалансированная система показателей (ТЗ §22) и финальный счёт (ТЗ §23).
 * BSC = 0.30×Finance + 0.25×Client + 0.25×Process + 0.20×Staff.
 * Каждая метрика → 0..100 через кусочную интерполяцию (ScoreCurve).
 */
import type { BSCReport, FinalScore, GameState, PnlReport, WeekStat } from '../types';
import { BSC_CONFIG, FINAL_SCORE_WEIGHTS } from '../config/bsc.config';
import { STAFF_ROLES } from '../config/staffRoles.config';
import { averageFatigue, dayCoverage } from './staff';
import { clientPrestigeBonus } from './permanent';

function interpolate(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (x >= x1 && x <= x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }
  return points[points.length - 1][1];
}

function scoreMetric(curve: { direction: string; points: [number, number][] }, value: number): number {
  return Math.max(0, Math.min(100, interpolate(curve.points, value)));
}

export interface BscInputs {
  pnl: PnlReport;
  weeklyExpenses: number; // средние расходы недели, ₽
  avgSatisfaction: number; // средняя за 7 дней
  returnRate: number; // доля возвратных гостей
  guestFlow: number; // загрузка от потенциала 0..1
  avgReviewScore: number;
  avgWait: number; // мин
  errorRate: number;
  wasteShare: number;
  stopListSize: number;
  scheduleCoverage: number;
  turnoverQuarter: number;
  avgMorale: number;
  waiterLoad: number;
  dscr: number;
}

export function computeBSC(week: number, inputs: BscInputs): BSCReport {
  const values: Record<string, number> = {
    ebitda_margin: inputs.pnl.revenue > 0 ? inputs.pnl.operatingProfit / inputs.pnl.revenue : 0,
    cash_safety: inputs.weeklyExpenses > 0 ? (inputs.pnl.revenue > 0 ? 0 : 0) : 0, // заменяется деньгами
    prime_cost: inputs.pnl.revenue > 0
      ? (inputs.pnl.cogs + inputs.pnl.payroll + inputs.pnl.socialContributions + inputs.pnl.rentAccrued) / inputs.pnl.revenue
      : 1,
    debt_coverage: inputs.dscr,
    cashflow_trend: 0,
    revenue_stability: 0,
    rating: 0,
    avg_satisfaction: inputs.avgSatisfaction,
    return_rate: inputs.returnRate * 100,
    guest_flow: inputs.guestFlow * 100,
    review_sentiment: inputs.avgReviewScore,
    avg_wait: inputs.avgWait,
    error_rate: inputs.errorRate * 100,
    waste_share: inputs.wasteShare * 100,
    stop_list_size: inputs.stopListSize,
    hygiene_risk: 0,
    schedule_coverage: inputs.scheduleCoverage * 100,
    avg_fatigue: 0,
    turnover: inputs.turnoverQuarter * 100,
    avg_morale: inputs.avgMorale,
    waiter_load: inputs.waiterLoad,
  };
  // Заполняются вызывающим кодом (state-зависимые).
  const details: BSCReport['details'] = [];
  const perspectiveScores: Record<string, number> = {};
  for (const persp of BSC_CONFIG.perspectives) {
    let sum = 0;
    for (const m of persp.metrics) {
      const v = values[m.curve.metricId] ?? 0;
      const score = scoreMetric(m.curve, v);
      details.push({ metricId: m.curve.metricId, value: v, score: Math.round(score), label: m.curve.label });
      sum += score * m.weight;
    }
    perspectiveScores[persp.id] = sum;
  }
  const total =
    BSC_CONFIG.perspectives.reduce((s, p) => s + perspectiveScores[p.id] * p.weight, 0);
  return {
    week,
    total: Math.round(total * 10) / 10,
    finance: Math.round(perspectiveScores.finance * 10) / 10,
    client: Math.round(perspectiveScores.client * 10) / 10,
    process: Math.round(perspectiveScores.process * 10) / 10,
    staff: Math.round(perspectiveScores.staff * 10) / 10,
    details,
  };
}

/**
 * Полный расчёт BSC из состояния игры (неделя).
 * Собирает все входные метрики из истории и P&L.
 */
export function computeBSCFromState(state: GameState, pnl: PnlReport): BSCReport {
  const r = state.restaurant!;
  const stats = state.history.weekStats;
  const dayLogs = state.history.dayLogs;
  const guests = dayLogs.reduce((s, l) => s + l.kpi.guests, 0);
  const avgSat = dayLogs.length > 0 ? dayLogs.reduce((s, l) => s + l.kpi.satisfaction, 0) / dayLogs.length : 0;
  const revenue = dayLogs.reduce((s, l) => s + l.kpi.revenue, 0);
  const waste = dayLogs.reduce((s, l) => s + l.kpi.wasteCost, 0);
  const cogs = dayLogs.reduce((s, l) => s + l.kpi.cogs, 0);

  // Возвратность: возвратный трафик к обслуженным (по когортам, оценка).
  const potential = stats.length > 0 ? stats[stats.length - 1].guests * 7 : guests;
  const returning = r.customerMemory.cohorts
    .filter((c) => c.ageDays <= 21)
    .reduce((s, c) => s + c.remainingReturnPotential, 0);
  const returnRate = potential > 0 ? Math.min(1, returning / potential) : 0;

  // Загрузка от потенциала зала: места / длительность сидения × часы × 0.55.
  const potentialWeek = 7 * 15 * (r.seats / 1.5) * 0.55;
  const guestFlow = Math.min(1.2, guests / Math.max(1, potentialWeek));

  const avgReviewScore =
    r.reputation.windowReviews.length > 0
      ? r.reputation.windowReviews.reduce((s, rev) => s + rev.score, 0) / r.reputation.windowReviews.length
      : 3.9;

  const avgWait = dayLogs.length > 0
    ? dayLogs.reduce((s, l) => s + l.hourLogs.reduce((s2, h) => s2 + h.queueAvg, 0) / Math.max(1, l.hourLogs.length), 0) / dayLogs.length
    : 8;

  const errorRate = dayLogs.length > 0
    ? dayLogs.reduce((s, l) => s + l.kpi.stopListHits, 0) / Math.max(1, dayLogs.reduce((s, l) => s + l.kpi.ordersCount, 0))
    : 0;

  const wasteShare = revenue > 0 ? waste / revenue : 0;
  const stopListSize = r.menu.stopList.length + Math.round(dayLogs.reduce((s, l) => s + l.kpi.stopListHits, 0) / 10);

  let coverage = 0;
  for (let d = 0; d < 7; d++) coverage += dayCoverage(r.staff, d);
  coverage /= 7;

  const totalStaff = Object.values(r.staff.pools).reduce((s, p) => s + p.count, 0);
  // Текучка: оценочная, из кадрового риска (увольнения + адаптационные потери).
  const turnover = Math.min(0.5, Math.max(0.05, r.risks.staff / 160));

  const avgMorale = Object.values(r.staff.pools).reduce((s, p) => s + p.morale * p.count, 0) / Math.max(1, totalStaff);
  const avgWaiterLoad = dayLogs.length > 0
    ? dayLogs.reduce((s, l) => s + l.hourLogs.reduce((s2, h) => s2 + h.waiterLoad, 0) / Math.max(1, l.hourLogs.length), 0) / dayLogs.length
    : 1;

  const weeklyExpenses =
    pnl.cogs + pnl.payroll + pnl.socialContributions + pnl.rentAccrued + pnl.utilitiesAccrued + pnl.marketing;
  const loanPayments = r.finance.loans.reduce((s, l) => s + l.payment, 0);
  const dscr = loanPayments > 0 ? Math.max(0, pnl.operatingProfit) / loanPayments : 3;

  // Кассовая безопасность: недели расходов при текущих деньгах.
  const cashWeeks = weeklyExpenses > 0 ? r.finance.cash / weeklyExpenses : 8;
  // Тренд денежного потока: наклон по последним 3 неделям.
  const cashTrend = computeCashTrend(stats);
  // Стабильность выручки: CV по 4 неделям.
  const revCV = computeRevenueCV(stats);
  const ratingNow = r.reputation.rating;
  const hygiene = (r.risks.sanitary + r.risks.technical) / 2;
  const fatigue = averageFatigue(r.staff);

  const inputs: BscInputs = {
    pnl,
    weeklyExpenses,
    avgSatisfaction: avgSat,
    returnRate,
    guestFlow,
    avgReviewScore,
    avgWait,
    errorRate: Math.min(0.2, errorRate),
    wasteShare: Math.min(0.2, wasteShare),
    stopListSize,
    scheduleCoverage: coverage,
    turnoverQuarter: Math.min(0.6, Math.max(0.05, turnover)),
    avgMorale,
    waiterLoad: avgWaiterLoad,
    dscr,
  };
  const report = computeBSC(pnl.week, inputs);
  // Подставляем state-зависимые значения вручную (чистая функция выше не знает state).
  for (const d of report.details) {
    if (d.metricId === 'cash_safety') { d.value = cashWeeks; d.score = Math.round(scoreByCurve('cash_safety', cashWeeks)); }
    if (d.metricId === 'rating') { d.value = ratingNow; d.score = Math.round(scoreByCurve('rating', ratingNow)); }
    if (d.metricId === 'cashflow_trend') { d.value = cashTrend; d.score = Math.round(scoreByCurve('cashflow_trend', cashTrend)); }
    if (d.metricId === 'revenue_stability') { d.value = revCV; d.score = Math.round(scoreByCurve('revenue_stability', revCV)); }
    if (d.metricId === 'hygiene_risk') { d.value = hygiene; d.score = Math.round(scoreByCurve('hygiene_risk', hygiene)); }
    if (d.metricId === 'avg_fatigue') { d.value = fatigue; d.score = Math.round(scoreByCurve('avg_fatigue', fatigue)); }
  }
  // Пересчёт перспектив с обновлёнными оценками.
  recomputePerspectives(report);
  // ДИЛЕММА «Франшиза» (отказ, §15): престиж шефа +N к перспективе «Клиенты»
  // («независимость дороже») — надбавка поверх пересчёта, кап 100.
  const prestige = clientPrestigeBonus(r);
  if (prestige > 0 && report.client < 100) {
    report.client = Math.min(100, Math.round((report.client + prestige) * 10) / 10);
    report.total =
      Math.round((report.finance * 0.3 + report.client * 0.25 + report.process * 0.25 + report.staff * 0.2) * 10) / 10;
  }
  return report;
}

function scoreByCurve(metricId: string, value: number): number {
  for (const persp of BSC_CONFIG.perspectives) {
    for (const m of persp.metrics) {
      if (m.curve.metricId === metricId) return scoreMetric(m.curve, value);
    }
  }
  return 0;
}

function recomputePerspectives(report: BSCReport): void {
  const byId = Object.fromEntries(report.details.map((d) => [d.metricId, d]));
  for (const persp of BSC_CONFIG.perspectives) {
    let sum = 0;
    for (const m of persp.metrics) sum += (byId[m.curve.metricId]?.score ?? 0) * m.weight;
    if (persp.id === 'finance') report.finance = Math.round(sum * 10) / 10;
    if (persp.id === 'client') report.client = Math.round(sum * 10) / 10;
    if (persp.id === 'process') report.process = Math.round(sum * 10) / 10;
    if (persp.id === 'staff') report.staff = Math.round(sum * 10) / 10;
  }
  report.total =
    Math.round((report.finance * 0.3 + report.client * 0.25 + report.process * 0.25 + report.staff * 0.2) * 10) / 10;
}

function computeCashTrend(stats: WeekStat[]): number {
  if (stats.length < 2) return 0;
  const last = stats.slice(-3);
  if (last.length < 2) return 0;
  const first = last[0].cashEnd;
  const lastCash = last[last.length - 1].cashEnd;
  return (lastCash - first) / (last.length - 1) / 1_000_000; // млн/нед
}

function computeRevenueCV(stats: WeekStat[]): number {
  const last = stats.slice(-4).map((s) => s.revenue);
  if (last.length < 2) return 0.1;
  const mean = last.reduce((s, v) => s + v, 0) / last.length;
  if (mean <= 0) return 0.25;
  const variance = last.reduce((s, v) => s + (v - mean) ** 2, 0) / last.length;
  return Math.sqrt(variance) / mean;
}

/* ============================= ФИНАЛЬНЫЙ СЧЁТ ============================= */

export function computeFinalScore(state: GameState, lastBsc: BSCReport): FinalScore {
  const w = FINAL_SCORE_WEIGHTS;
  const stats = state.history.weekStats;
  const firstHalf = stats.slice(0, Math.floor(stats.length / 2)).reduce((s, x) => s + x.revenue, 0);
  const secondHalf = stats.slice(Math.floor(stats.length / 2)).reduce((s, x) => s + x.revenue, 0);
  const growth = firstHalf > 0 ? Math.min(1, Math.max(0, (secondHalf / Math.max(1, firstHalf) - 0.8) / 0.8)) : 0;
  const risks = state.restaurant!;
  const avgRisk =
    (risks.risks.sanitary + risks.risks.technical + risks.risks.staff + risks.risks.legal + risks.risks.reputation + risks.risks.financial) / 6;
  const riskScore = Math.max(0, Math.min(100, 100 - avgRisk));
  const fs: FinalScore = {
    financialHealth: Math.round((w.financialHealth * lastBsc.finance) / 100),
    customerHealth: Math.round((w.customerHealth * lastBsc.client) / 100),
    operationalHealth: Math.round((w.operationalHealth * lastBsc.process) / 100),
    staffHealth: Math.round((w.staffHealth * lastBsc.staff) / 100),
    growth: Math.round(w.growth * growth),
    riskManagement: Math.round(w.riskManagement * riskScore / 100),
    total: 0,
  };
  fs.total =
    fs.financialHealth + fs.customerHealth + fs.operationalHealth + fs.staffHealth + fs.growth + fs.riskManagement;
  return fs;
}

export { STAFF_ROLES };
