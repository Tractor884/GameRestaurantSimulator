/**
 * ЗАКРЫТИЕ НЕДЕЛИ (ТЗ §3.4, §18): финансовый контур, BSC, статусы, история.
 *
 * Выделяет «closeWeek» из старой simulateWeek: теперь закрытие вызывается
 * из day.ts при переходе дня 6 → следующая неделя. ЭТО ЧИНИТ ДВА БАГА:
 *  1) при игре «по дням» (кнопка «День» ×7) неделя раньше НЕ закрывалась —
 *     зарплата/аренда/налоги не платились, weekStats/BSC не формировались;
 *  2) критическое событие на дне 6 «зацикливало» день: время не шло вперёд,
 *     и повторная симуляция того же дня задваивала выручку.
 *
 * Все суммы считаются по dayLogs закрытой недели (последние 7 записей).
 * ТРИ КОНТУРА (ТЗ §18.1): P&L (начисление) ≠ Cash Flow (движение денег).
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
import { monthOfDay, dayOfYear } from '../config/demandProfiles.config';
import { LOANS } from '../config/loans.config';
import { LOSE_CONDITIONS, DIFFICULTIES, difficultyWin } from '../config/difficulty.config';
import { EQUIPMENT_LEVELS, DEPRECIATION_MONTHS, ALCOHOL_LICENSE } from '../config/premises.config';
import { QUARTERLY_WEEKS } from '../config/bsc.config';
import { RISKS_META } from '../config/risks.config';
import { deriveRng, hashSeed } from '../rng';
import { addTransaction, clamp } from './core';
import { computeBSCFromState, computeFinalScore } from './bsc';
import { computeForecast } from './forecast';
import { weeklyTurnover } from './staff';
import { INSURANCE_PAYROLL_SHARE } from './welfare';
import { REVIEWS_V2 } from '../config/reviews.config';
import { PROCUREMENT } from '../config/procurement.config';
import { SECRETARY_EFFECTS } from '../config/staffRoles.config';
import { DIVIDENDS, dividendProposal } from '../config/dividends.config';
import { checkLandlordSchedule, currentRentMonthly } from './landlord';
import { createOwnerDividendEvent, createOwnerTalkEvent, ownerReplaced } from './dividends';
import { checkDilemmas, checkBribeScandal, checkChefQuit } from './dilemmas';
import { franchiseRoyalty, deliveryRoyalty, leverageOf } from './permanent';

export function closeWeek(state: GameState, seed: number): WeekSimulationResult {
  const draft = state; // мутируем переданный клон
  const week = draft.week; // неделя, которая только что закончилась (день 6 прожит)
  const restaurant = draft.restaurant;
  if (!restaurant) throw new Error('closeWeek: ресторан не создан');

  // Дни закрытой недели: последние 7 журналов, принадлежащие этой неделе.
  const dayLogs = draft.history.dayLogs.filter((l) => l.date.week === week).slice(-7);
  const dayResults: DaySimulationResult[] = dayLogs.map((l) => ({
    ...l,
    invariantReport: { ok: true, violations: [] },
  }));

  // ===== ФИНАНСЫ НЕДЕЛИ =====
  const revenue = dayResults.reduce((s, r) => s + r.kpi.revenue, 0);
  const cogs = dayResults.reduce((s, r) => s + r.kpi.cogs, 0);
  const wasteCost = dayResults.reduce((s, r) => s + r.kpi.wasteCost, 0);
  const marketing = dayResults.reduce(
    (s, r) => s + (r.transactions.find((t) => t.type === 'marketing')?.amount ?? 0),
    0,
  );
  const payroll = restaurant.finance.accrued.payrollGross;
  const socialContributions = Math.round(payroll * TAXES.socialContributions);
  // МЕДСТРАХОВКА ПЕРСОНАЛА (благосостояние, v6): 4% фактического недельного
  //  ФОТ при включённой опции. По умолчанию выключена → ветка не меняет
  //  ни денег, ни P&L (эталоны движка идентичны).
  const insuranceCost =
    restaurant.staff.insurance && payroll > 0
      ? Math.round(payroll * INSURANCE_PAYROLL_SHARE)
      : 0;

  // Начисления периодических расходов (ТЗ §18.5).
  // БАЛ-v2 §6 (v8): аренда пересчитывается ДО начислений — квартальная
  // индексация + шаги договорённостей с арендодателем согласованы с P&L.
  if (restaurant.landlord) {
    restaurant.rentMonthly = currentRentMonthly(restaurant, week);
  }
  const rentAccrued = Math.round(restaurant.rentMonthly / 4);
  // СЕЗОННАЯ КОМПОНЕНТА КОММУНАЛЬНЫХ (дорожная карта §12.8): зимой отопление
  // +25%, летом кондиционирование/вентиляция +15% — коммуналка перестаёт быть
  // константой и сезонность P&L видна не только в выручке.
  // Месяц берём по СЕРЕДИНЕ недели (день 3) — переход месяца внутри недели размывается.
  const monthNow = monthOfDay(dayOfYear(week, 3));
  const seasonalUtilK =
    monthNow === 12 || monthNow <= 2 ? 1.25 : monthNow >= 6 && monthNow <= 8 ? 1.15 : 1.0;
  const utilitiesAccrued = Math.round((restaurant.utilitiesMonthly * seasonalUtilK) / 4);
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

  // P&L (ТЗ §18.4). АУДИТ (§5.1): эквайринг — РАСХОД P&L, раньше комиссия
  // существовала только в кэше (sale-транзакция = net) и завышала прибыль
  // на ~2% выручки. Теперь P&L: GrossRevenue → −эквайринг → себестоимость…
  // (касса при этом двигается на netRevenue — «прибыль ≠ деньги» сохраняется).
  const acquiringPnl = Math.round(revenue * FINANCE.acquiringRate);
  const grossProfit = revenue - cogs - wasteCost - acquiringPnl;
  const operatingProfit =
    grossProfit - payroll - socialContributions - rentAccrued - utilitiesAccrued -
    marketing - maintenance - depreciation - licenseAmortization - otherOperating - insuranceCost;
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
    loanInterest, taxableProfit, tax, netProfit, acquiringFees: acquiringPnl,
    insurance: insuranceCost,
  };

  // ===== ДВИЖЕНИЕ ДЕНЕГ (cash flow) =====
  const weekDate: GameDate = { week, day: 6, hour: 23 };
  // Зарплата: выплата в конце недели (ТЗ §14.10).
  if (payroll > 0) {
    addTransaction(restaurant, weekDate, 'payroll', payroll, 'out', 'Зарплата за неделю (gross)');
    addTransaction(restaurant, weekDate, 'social_contribution', socialContributions, 'out', 'Социальные взносы 30%');
  }
  // Медстраховка персонала: списание вместе с зарплатой.
  if (insuranceCost > 0) {
    addTransaction(restaurant, weekDate, 'insurance', insuranceCost, 'out', 'Медстраховка персонала (4% ФОТ)');
  }
  restaurant.finance.accrued.payrollGross = 0;

  // Аренда и коммунальные: каждые 4 недели.
  if (week > 0 && week % 4 === 0) {
    addTransaction(restaurant, weekDate, 'rent', restaurant.rentMonthly, 'out', 'Аренда за месяц');
    const utilSeasonNote = seasonalUtilK > 1 ? (seasonalUtilK >= 1.25 ? 'Коммунальные за месяц (зима, отопление +25%)' : 'Коммунальные за месяц (лето, вентиляция +15%)') : 'Коммунальные за месяц';
    addTransaction(restaurant, weekDate, 'utilities', Math.round(restaurant.utilitiesMonthly * seasonalUtilK), 'out', utilSeasonNote);
  }

  // Налоги: каждые 4 недели по накопленной базе (ТЗ §18.7).
  // УБЫТКИ ПЕРЕНОСЯТСЯ: отрицательная база не обнуляется, а компенсирует
  // будущую прибыль (раньше reset в 0 «прощал» убытки налоговой базе —
  // ресторан после провального квартала платил налог с нуля).
  restaurant.finance.accrued.taxProfit += taxableProfit;
  if (week > 0 && week % 4 === 0) {
    const base = restaurant.finance.accrued.taxProfit;
    const taxesPaid = Math.max(0, Math.round(base * TAXES.profitTax));
    if (taxesPaid > 0) {
      addTransaction(restaurant, weekDate, 'tax', taxesPaid, 'out', 'Налог на прибыль (игровая модель)');
    }
    restaurant.finance.accrued.taxProfit = Math.min(0, base); // убыток остаётся переноситься
  }

  // Кредиты: аннуитет каждые 4 недели (ТЗ §18.8).
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
      } else {
        // Просрочка: штраф × fineSeverity (сложность ТЗ §36), рост риска (ТЗ §18.10).
        const fine = Math.round(payment * LOANS.overdueFineRate * (DIFFICULTIES[draft.difficultyId]?.fineSeverity ?? 1));
        addTransaction(restaurant, weekDate, 'fine', fine, 'out', 'Штраф за просрочку кредита');
        loan.nextPaymentWeek += 4;
        loan.overduePayments += 1;
        restaurant.risks.financial = clamp(restaurant.risks.financial + LOANS.overdueRiskPerWeek, 0, 100);
      }
      if (loan.remaining <= 1) {
        loan.remaining = 0;
        break;
      }
    }
  }
  restaurant.finance.loans = restaurant.finance.loans.filter((l) => l.remaining > 1 || l.overduePayments > 0);

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
    // v9: разбор живёт в ИСТОРИИ — следующая неделя затирает weekResult,
    // но экран «Квартальный разбор» читает историю целиком.
    (draft.history.quarterlyReviews ??= []).push(quarterlyReview);

    // ===== БАЛ-v2 §13 (v8): ПРЕДЛОЖЕНИЕ ДИВИДЕНДОВ НА КОНЕЦ КВАРТАЛА =====
    // FCF_кв = Δ кассы за квартал (все платежи честно идут транзакциями:
    // тело кредита, оборудование, лицензии, налоги). DivQ = 40% × max(0, FCF)
    // + 12% × max(0, NP − 3% выручки). Решение — крит-событие; доверие
    // меняется в момент решения (setup.resolveEvent → applyDividendDecision).
    {
      const divState = (restaurant.finance.dividends ??= {
        history: [],
        lastProposal: null,
        quarterStartCash: restaurant.finance.cash,
      });
      const fcfQ = restaurant.finance.cash - divState.quarterStartCash;
      const proposed = dividendProposal(fcfQ, qProfit, qRevenue);
      divState.lastProposal = {
        quarter,
        week,
        fcf: Math.round(fcfQ),
        netProfit: Math.round(qProfit),
        revenue: Math.round(qRevenue),
        proposed,
      };
      if (proposed > 0) {
        draft.activeEvents.push(
          createOwnerDividendEvent(
            quarter,
            week,
            Math.round(fcfQ),
            Math.round(qProfit),
            Math.round(qRevenue),
            proposed,
            weekDate,
          ),
        );
      }
      // Точка отсчёта FCF следующего квартала — касса на закрытии (после
      // всех платежей недели, включая зарплату/налоги/кредиты выше).
      divState.quarterStartCash = restaurant.finance.cash;

      // §12.2/§13.2: плечо > 1,5 на закрытии квартала — доверие −4
      // (владелец видит баланс: ресторан живёт в долг).
      const leverage = leverageOf(restaurant);
      let trustAfter = restaurant.finance.ownerTrust ?? DIVIDENDS.trustStart;
      if (leverage > DIVIDENDS.trustPenaltyAt) {
        trustAfter = clamp(trustAfter - DIVIDENDS.trustPenalty, 0, 100);
        restaurant.finance.ownerTrust = trustAfter;
      }
      // §13.2: доверие ниже порога → дилемма «Разговор с владельцем»
      // (не чаще раза в квартал — создаётся только на закрытии).
      if (
        trustAfter < DIVIDENDS.trustDilemmaAt &&
        !draft.activeEvents.some((e) => e.templateId === 'owner_talk')
      ) {
        draft.activeEvents.push(createOwnerTalkEvent(trustAfter, weekDate));
      }
    }
  }

  // ===== ТЕКУЧКА (конец недели) =====
  const turnoverRng = deriveRng(hashSeed(seed, week), 'turnover');
  weeklyTurnover(restaurant, () => turnoverRng.next(), week);

  // ===== БАЛ-v2 §15: ЕЖЕНЕДЕЛЬНЫЕ БРОСКИ ДИЛЕММ-ПОСЛЕДЕЙСТВИЙ =====
  // Скандал из-за взятки (5%/год) и уход шефа после отказа — отдельные
  // rng-потоки ('scandal'/'chef-quit'), существующие броски не сдвинуты.
  {
    const scandal = checkBribeScandal(draft, week, weekDate);
    if (scandal) draft.activeEvents.push(scandal);
    const chefQuit = checkChefQuit(draft, week, weekDate);
    if (chefQuit) draft.activeEvents.push(chefQuit);
  }

  // ===== БАЛ-v2 §15: ТРИГГЕРЫ ДИЛЕММ (не чаще 1/квартал, от состояния) =====
  checkDilemmas(draft, week, weekDate);

  // ===== БАЛ-v2 §6: РАСПИСАНИЕ РАЗГОВОРОВ АРЕНДОДАТЕЛЯ =====
  checkLandlordSchedule(draft, week);

  // ===== БАЛ-v2 §15: РОЯЛТИ ФРАНШИЗЫ (если подписана) =====
  // Движение денег (не P&L): доля сети с выручки недели.
  {
    const royalty = franchiseRoyalty(revenue, restaurant);
    if (royalty > 0) {
      addTransaction(
        restaurant,
        weekDate,
        'other',
        royalty,
        'out',
        `Роялти франшизы (${Math.round((restaurant.permanentEffects?.franchiseOwnerShare ?? 0) * 100)}% выручки)`,
      );
    }
  }

  // ===== v9: КОМИССИЯ АГРЕГАТОРА ДОСТАВКИ (если подписан договор) =====
  {
    const deliveryFee = deliveryRoyalty(revenue, restaurant);
    if (deliveryFee > 0) {
      addTransaction(
        restaurant,
        weekDate,
        'other',
        deliveryFee,
        'out',
        `Комиссия агрегатора доставки (${Math.round((restaurant.permanentEffects?.deliveryShare ?? 0) * 100)}% выручки)`,
      );
    }
  }

  // ===== БАЛ-v2 §8 (механизм D): НЕОТВЕЧЕННЫЕ ОТЗЫВЫ → ЮР. РИСК =====
  // +0,3 × min(U, 30) в неделю; естественная релаксация −0,3/день уже в updateRisks.
  {
    const u = restaurant.reputation.unansweredNeg ?? 0;
    const legalDelta = REVIEWS_V2.legalPerUnanswered * Math.min(u, REVIEWS_V2.legalCapU);
    if (legalDelta > 0) {
      restaurant.risks.legal = clamp(restaurant.risks.legal + legalDelta, 0, 100);
    }
  }

  // ===== БАЛ-v2 §9: АКТИВАЦИЯ ПЕРЕКЛЮЧЕНИЯ РЕЖИМА ЗАКУПКИ (лаг 2 нед) =====
  // Переговоры оплачены в setProcurementPolicy; здесь контракт вступает в силу.
  {
    const proc = restaurant.inventory.procurement;
    if (proc?.pendingSwitch && week - proc.pendingSwitch.orderedAt >= PROCUREMENT.switchLagWeeks) {
      proc.policy = proc.pendingSwitch.to;
      proc.pendingSwitch = null;
    }
  }

  // ===== СЕКРЕТАРЬ: КОМПЛАЕНС-ПОДДЕРЖКА (админ-роль) =====
  // Бумаги сдаются вовремя: юр. риск каждую неделю снижается дополнительно
  // (−0,9 × min(2, штат), кап −1,8/нед); штрафы проверок дешевле на 20% (endday).
  // Эффект требует НАЗНАЧЕННЫХ смен (анти-абьюз: наём «в стол» не работает).
  {
    const pool = restaurant.staff.pools.secretary;
    const scheduledShifts = (restaurant.staff.schedule.secretary ?? []).reduce(
      (s, sh) => s + sh.morning + sh.evening,
      0,
    );
    const secretaryCount = pool?.count ?? 0;
    if (secretaryCount > 0 && scheduledShifts > 0) {
      const bonus = Math.min(2, secretaryCount) * SECRETARY_EFFECTS.legalRelaxPerWeek;
      restaurant.risks.legal = clamp(restaurant.risks.legal - bonus, 0, 100);
    }
  }

  // ===== БАЛ-v2 §9: СБРОС НЕДЕЛЬНОГО СЧЁТЧИКА СБОЕВ ПОСТАВКИ =====
  restaurant.inventory.supplyErrorsWeek = 0;

  // ===== ИСТОРИЯ =====
  const guests = dayResults.reduce((s, r) => s + r.kpi.guests, 0);
  const returningGuests = dayResults.reduce((s, r) => s + r.kpi.returningGuests, 0);
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
    returningShare: guests > 0 ? Math.round((returningGuests / guests) * 1000) / 1000 : 0,
  };
  draft.history.weekStats.push(weekStat);
  if (draft.history.weekStats.length > 52) draft.history.weekStats.shift();
  draft.history.cumulativeNetProfit += netProfit;
  draft.history.positiveOpWeeks = operatingProfit > 0 ? draft.history.positiveOpWeeks + 1 : 0;
  draft.history.lowRatingWeeks = restaurant.reputation.rating < LOSE_CONDITIONS.lowRatingThreshold
    ? draft.history.lowRatingWeeks + 1
    : 0;

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

  // БАЛ-v2 §13.2 (v8): финал «Управленца сменили» — доверие владельца < 15.
  // Проверяем при любой недоигранной неделе (не только 'open': статус мог
  // уже стать 'stable'/'survived_12' — смена управленца актуальна всегда).
  if (draft.phase !== 'gameover' && ownerReplaced(draft)) {
    gameStatus = 'owner_replaced';
    gameOver = true;
    draft.phase = 'gameover';
  } else
  if (
    restaurant.finance.cash < LOSE_CONDITIONS.bankruptCash ||
    restaurant.finance.loans.some((l) => l.overduePayments >= 8) ||
    draft.history.lowRatingWeeks >= LOSE_CONDITIONS.lowRatingWeeks
  ) {
    gameStatus = 'bankrupt';
    gameOver = true;
    draft.phase = 'gameover';
  } else if (week >= 52) {
    // Финал 52 недели. Условия победы зависят от сложности (ТЗ §36/§37.3):
    // Новичку достаточно 9 млн и рейтинга 4.0, Профессионалу нужно 15 млн и 4.3.
    const win = difficultyWin(draft.difficultyId);
    const lastQuarter = draft.history.weekStats.slice(-12);
    const bscAvg = lastQuarter.length > 0 ? lastQuarter.reduce((s, w) => s + w.bsc, 0) / lastQuarter.length : 0;
    const won =
      restaurant.finance.cash >= win.minCash &&
      bscAvg >= win.minBscAvgQuarter &&
      restaurant.reputation.rating >= win.minRating &&
      draft.history.cumulativeNetProfit >= win.minCumulativeProfit &&
      draft.history.positiveOpWeeks >= win.minPositiveOpWeeks;
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
  // Касса на начало недели = текущая касса минус чистое движение за неделю
  // (все платежи недели, включая закрытие, уже проведены выше).
  const netWeek = txs.reduce((s, t) => s + (t.direction === 'in' ? t.amount : -t.amount), 0);
  const cashFlow: CashFlowReport = {
    week,
    cashStart: restaurant.finance.cash - netWeek,
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
    dividendsPaid: sumType('dividend'),
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
  return result;
}
