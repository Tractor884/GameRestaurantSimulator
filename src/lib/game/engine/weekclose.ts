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
import {
  isLegacy,
  profitTaxRate,
  utilIndex,
  weeklyOverhead,
  weeklyOvertime,
  leverageOf,
  leverageRiskDrift,
  dividendProposal,
  alcoholLicenseAnnual,
  verandaParams,
  alcoholIncidentChance,
  BALANCE_V2_2,
  BALANCE_V2_3,
  BALANCE_V2_4,
  BALANCE_V2_5,
} from '../config/balance2.config';
import { monthOfDay, dayOfYear } from '../config/demandProfiles.config';
import { LOANS } from '../config/loans.config';
import { LOSE_CONDITIONS, DIFFICULTIES, difficultyWin } from '../config/difficulty.config';
import { EQUIPMENT_LEVELS, DEPRECIATION_MONTHS, ALCOHOL_LICENSE, VERANDA } from '../config/premises.config';
import { QUARTERLY_WEEKS } from '../config/bsc.config';
import { RISKS_META, EVENT_TEMPLATES_MAP } from '../config/risks.config';
import { STAFF_ROLES, ROLE_IDS } from '../config/staffRoles.config';
import { dishOf } from '../content/resolve';
import { deriveRng, hashSeed } from '../rng';
import { addTransaction, clamp } from './core';
import { computeBSCFromState, computeFinalScore } from './bsc';
import { computeForecast } from './forecast';
import { weeklyTurnover } from './staff';
import { checkLandlordSchedule, currentRentMonthly } from './landlord';
import { createOwnerDividendEvent, createOwnerTalkEvent, ownerReplaced } from './dividends';
import {
  checkDilemmas,
  checkBribeScandal,
  checkChefQuit,
  createAlcoholCurbEvent,
} from './dilemmas';
import { franchiseRoyalty, hireCostMult } from './permanent';
import { instantiateEvent, applyEventEffects, addReviews } from './endday';

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
  const guestsWeek = dayResults.reduce((s, r) => s + r.kpi.guests, 0);
  const marketing = dayResults.reduce(
    (s, r) => s + (r.transactions.find((t) => t.type === 'marketing')?.amount ?? 0),
    0,
  );
  const payroll = restaurant.finance.accrued.payrollGross;
  // v2 §5.2: ПЕРЕРАБОТКИ — по худшей станции закрытой недели.
  // Пик загрузки станций берём по всем часам недели (включая пересечения
  // смен): устойчивый перегруз кухни → сверхурочные ТК РФ ×1,5.
  const stationUtilMax = dayResults.reduce(
    (mx, r) =>
      Math.max(
        mx,
        ...r.hourLogs.flatMap((h) => Object.values(h.stationLoads).map((v) => v ?? 0)),
        0,
      ),
    0,
  );
  const { cost: overtimeCost, overload: overtimeOverload } = weeklyOvertime(payroll, stationUtilMax);
  const socialContributions = Math.round((payroll + overtimeCost) * TAXES.socialContributions);

  // v2 §6: АРЕНДА — квартальная индексация + шаги событий арендодателя.
  // rentMonthly пересчитывается ДО начислений, чтобы P&L и оплата месяца были согласованы.
  if (!isLegacy()) {
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
  // v2 §10: ИНФЛЯЦИЯ КОММУНАЛЬНЫХ — UtilIdx(W) поверх сезонного множителя.
  const utilInfl = isLegacy() ? 1 : utilIndex(week, draft.difficultyId);
  const utilitiesAccrued = Math.round((restaurant.utilitiesMonthly * seasonalUtilK * utilInfl) / 4);
  const equipmentValue =
    restaurant.equipment.kitchen.value + restaurant.equipment.coffee.value + restaurant.equipment.hall.value;
  const depreciation = Math.round(equipmentValue / DEPRECIATION_MONTHS / 4);
  const licenseAmortization = restaurant.licenses.alcohol?.active
    ? Math.round(alcoholLicenseAnnual() / 12 / 4)
    : 0;
  const maintenance =
    EQUIPMENT_LEVELS[restaurant.equipment.kitchen.level].maintenanceCostPerWeek +
    EQUIPMENT_LEVELS[restaurant.equipment.coffee.level].maintenanceCostPerWeek * 0.4 +
    EQUIPMENT_LEVELS[restaurant.equipment.hall.level].maintenanceCostPerWeek * 0.3;
  // v2 §5.1: ПРОГРЕССИВНЫЕ НАКЛАДНЫЕ — база × инфляция + ₽/гость + скобки
  // по выручке (кап доли выручки). legacy → прежняя константа 60 000 ₽.
  const overheadWeekly = weeklyOverhead(revenue, guestsWeek, week, draft.difficultyId);
  // v2 этап 5: ПОСТОЯННЫЕ ОПЕРАЦИОННЫЕ НАДБАВКИ (§16.1/§16.2/§15) — начисление
  // в P&L еженедельно (аккруал, как аренда/коммуналка), оплата — по календарю
  // ниже: комплаенс и веранда ежемесячно, роялти франшизы — еженедельно.
  const licenseActive = restaurant.licenses.alcohol?.active === true;
  const complianceWeekly = licenseActive ? BALANCE_V2_5.alcohol.complianceMonthly / 4 : 0;
  const verandaSeasonOn =
    restaurant.verandaActive && VERANDA.months.includes(monthNow) && !isLegacy();
  const verandaWeekly = verandaSeasonOn ? verandaParams().monthlyCost / 4 : 0;
  const royaltyWeekly = franchiseRoyalty(revenue, restaurant);
  const stage5Operating = Math.round(complianceWeekly + verandaWeekly + royaltyWeekly);
  const otherOperating = overheadWeekly + restaurant.marketing.cleaningBudget + stage5Operating;

  // P&L (ТЗ §18.4). АУДИТ (§5.1): эквайринг — РАСХОД P&L, раньше комиссия
  // существовала только в кэше (sale-транзакция = net) и завышала прибыль
  // на ~2% выручки. Теперь P&L: GrossRevenue → −эквайринг → себестоимость…
  // (касса при этом двигается на netRevenue — «прибыль ≠ деньги» сохраняется).
  const acquiringPnl = Math.round(revenue * FINANCE.acquiringRate);
  const grossProfit = revenue - cogs - wasteCost - acquiringPnl;
  // v2 §5.2: сверхурочные — отдельная строка ФОТ (в ТК РФ ×1,5 + взносы 30%).
  const operatingProfit =
    grossProfit - payroll - overtimeCost - socialContributions - rentAccrued - utilitiesAccrued -
    marketing - maintenance - depreciation - licenseAmortization - otherOperating;
  // АУДИТ v2 §12 (хвост этапа 4): начисление в НЕДЕЛЬНОМ P&L было annualRate/12
  // за неделю — то есть ~4,3× годовой суммы (при 6М@24% завышение ~4,8 млн/год).
  // Честная ставка: платежи идут каждые 4 недели по ставке/12 («13 месяцев в году»),
  // значит недельное начисление = rate/48 — P&L совпадает с кэшем аннуитета.
  const loanInterest = Math.round(
    restaurant.finance.loans.reduce((s, l) => s + (l.remaining * l.annualRate) / 48, 0),
  );
  const taxableProfit = operatingProfit - loanInterest;
  // v2 §11.1: налог на прибыль 25% (РФ-2025); legacy-пресет — 15%.
  const taxRate = profitTaxRate();
  const tax = Math.max(0, Math.round(taxableProfit * taxRate));
  const netProfit = taxableProfit - tax;

  const pnl: PnlReport = {
    week,
    revenue, cogs, wasteCost, grossProfit, payroll, overtime: overtimeCost, socialContributions,
    rentAccrued, utilitiesAccrued, marketing, maintenance, repairs: 0,
    depreciation, licenseAmortization, otherOperating, operatingProfit,
    loanInterest, taxableProfit, tax, netProfit, acquiringFees: acquiringPnl,
  };

  // ===== ДВИЖЕНИЕ ДЕНЕГ (cash flow) =====
  const weekDate: GameDate = { week, day: 6, hour: 23 };
  // Зарплата: выплата в конце недели (ТЗ §14.10). v2 §5.2: сверхурочные —
  // отдельной транзакцией с пояснением (гейт: «переработки видны транзакцией»).
  if (payroll > 0) {
    addTransaction(restaurant, weekDate, 'payroll', payroll, 'out', 'Зарплата за неделю (gross)');
    addTransaction(restaurant, weekDate, 'social_contribution', socialContributions, 'out', 'Социальные взносы 30%');
  }
  if (overtimeCost > 0) {
    addTransaction(
      restaurant,
      weekDate,
      'overtime',
      overtimeCost,
      'out',
      `Сверхурочные (ТК РФ, ×1,5): загрузка станций ${Math.round(stationUtilMax * 100)}%`,
    );
  }
  restaurant.finance.accrued.payrollGross = 0;

  // Аренда и коммунальные: каждые 4 недели. v2: аренда уже проиндексирована
  // выше; коммунальные — с сезонным множителем и инфляцией UtilIdx.
  if (week > 0 && week % 4 === 0) {
    const rentNote = isLegacy() || restaurant.rentMonthly === restaurant.landlord?.rentBase
      ? 'Аренда за месяц'
      : `Аренда за месяц (индексация ${((restaurant.rentMonthly / (restaurant.landlord?.rentBase ?? restaurant.rentMonthly)) * 100 - 100).toFixed(1)}% с открытия)`;
    addTransaction(restaurant, weekDate, 'rent', restaurant.rentMonthly, 'out', rentNote);
    const utilSeasonNote = seasonalUtilK > 1 ? (seasonalUtilK >= 1.25 ? 'Коммунальные за месяц (зима, отопление +25%)' : 'Коммунальные за месяц (лето, вентиляция +15%)') : 'Коммунальные за месяц';
    const utilNote = isLegacy() ? utilSeasonNote : `${utilSeasonNote} (+${((utilInfl - 1) * 100).toFixed(1)}% инфляция)`;
    addTransaction(restaurant, weekDate, 'utilities', Math.round(restaurant.utilitiesMonthly * seasonalUtilK * utilInfl), 'out', utilNote);
    // v2 §16.1 (этап 5): КОМПЛАЕНС АЛКОГОЛЯ — ежемесячно у лицензиата
    // (журнал учёта, охрана, декларации). Аккруал уже в P&L (otherOperating).
    if (licenseActive && BALANCE_V2_5.alcohol.complianceMonthly > 0) {
      addTransaction(
        restaurant,
        weekDate,
        'other',
        BALANCE_V2_5.alcohol.complianceMonthly,
        'out',
        'Алкоголь: комплаенс месяца (журнал, охрана, декларации)',
      );
    }
    // v2 §16.2: СОДЕРЖАНИЕ ВЕРАНДЫ — ежемесячно в сезон (май–сент).
    if (verandaSeasonOn) {
      addTransaction(
        restaurant,
        weekDate,
        'other',
        verandaParams().monthlyCost,
        'out',
        'Веранда: содержание месяца (сезон)',
      );
    }
    // v2 §16.2: ДЕМОНТАЖ ВЕРАНДЫ — разово в конце сезона (октябрь).
    if (restaurant.verandaActive && !isLegacy() && monthNow === 10 && (restaurant.verandaDismantledWeek ?? 0) === 0) {
      const dismantle = verandaParams().dismantlingCost;
      if (dismantle > 0) {
        addTransaction(restaurant, weekDate, 'other', dismantle, 'out', 'Веранда: демонтаж и хранение после сезона');
      }
      restaurant.verandaDismantledWeek = week;
    }
  }

  // v2 §15: РОЯЛТИ ФРАНШИЗЫ — еженедельно с выручки (5%, навсегда).
  if (royaltyWeekly > 0) {
    addTransaction(
      restaurant,
      weekDate,
      'other',
      royaltyWeekly,
      'out',
      `Доля сети (франшиза): ${Math.round((restaurant.permanentEffects?.franchiseOwnerShare ?? 0) * 100)}% выручки недели`,
    );
  }

  // Налоги: каждые 4 недели по накопленной базе (ТЗ §18.7).
  // УБЫТКИ ПЕРЕНОСЯТСЯ: отрицательная база не обнуляется, а компенсирует
  // будущую прибыль (раньше reset в 0 «прощал» убытки налоговой базе —
  // ресторан после провального квартала платил налог с нуля).
  restaurant.finance.accrued.taxProfit += taxableProfit;
  if (week > 0 && week % 4 === 0) {
    const base = restaurant.finance.accrued.taxProfit;
    const taxesPaid = Math.max(0, Math.round(base * taxRate));
    if (taxesPaid > 0) {
      addTransaction(restaurant, weekDate, 'tax', taxesPaid, 'out', `Налог на прибыль (${Math.round(taxRate * 100)}%)`);
    }
    restaurant.finance.accrued.taxProfit = Math.min(0, base); // убыток остаётся переноситься
  }

  // Кредиты: аннуитет каждые 4 недели (ТЗ §18.8).
  // v2 §13.1: погашенное тело копится для расчёта FCF квартала.
  let principalRepaidWeek = 0;
  for (const loan of restaurant.finance.loans) {
    while (week >= loan.nextPaymentWeek) {
      const interest = Math.round((loan.remaining * loan.annualRate) / 12);
      const principal = Math.max(0, Math.round(loan.payment - interest));
      const payment = Math.min(loan.remaining + interest, loan.payment);
      if (restaurant.finance.cash >= payment) {
        addTransaction(restaurant, weekDate, 'loan_payment', Math.round(payment), 'out',
          `Платёж по кредиту (проценты ${interest.toLocaleString('ru-RU')} ₽)`);
        loan.remaining = Math.max(0, loan.remaining - principal);
        principalRepaidWeek += principal;
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

  // ===== CASH FLOW ОТЧЁТ (после всех платежей недели) =====
  // Поднят из конца функции: квартальный расчёт дивидендов (§13.1) требует
  // компонентов FCF закрытой недели (закупки/оборудование/лицензии/тело кредита).
  const txs = restaurant.finance.transactions.filter((t) => t.date.week === week);
  const sumType = (type: string, dir: 'in' | 'out' = 'out') =>
    txs.filter((t) => t.type === type && t.direction === dir).reduce((s, t) => s + t.amount, 0);
  // Касса на начало недели = текущая касса минус чистое движение за неделю.
  const netWeek = txs.reduce((s, t) => s + (t.direction === 'in' ? t.amount : -t.amount), 0);
  const cashFlow: CashFlowReport = {
    week,
    cashStart: restaurant.finance.cash - netWeek,
    netCashFromSales: sumType('sale', 'in'),
    purchases: sumType('purchase'),
    payrollPaid: sumType('payroll'),
    overtimePaid: sumType('overtime'),
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

  // v2 §12.1: балансовые величины недели. Плечо = NetDebt/Equity.
  // EquipmentResidual — балансовая стоимость за вычетом износа (не амортизации:
  // износ влияет на мощность/риски, остаточная стоимость — на «сколько стоит
  // ресторан» для банка).
  const inventoryValue = restaurant.inventory.batches.reduce((s, b) => s + b.quantity * b.unitCost, 0);
  const equipmentResidual =
    restaurant.equipment.kitchen.value * (1 - restaurant.equipment.kitchen.wear / 100) +
    restaurant.equipment.coffee.value * (1 - restaurant.equipment.coffee.wear / 100) +
    restaurant.equipment.hall.value * (1 - restaurant.equipment.hall.wear / 100);
  const debtTotal = restaurant.finance.loans.reduce((s, l) => s + l.remaining, 0);
  const { equity, netDebt, leverage } = leverageOf(
    restaurant.finance.cash,
    inventoryValue,
    equipmentResidual,
    debtTotal,
  );
  restaurant.finance.leverage = Math.round(leverage * 1000) / 1000;
  restaurant.finance.equityValue = Math.round(equity);
  restaurant.finance.netDebt = Math.round(netDebt);
  // v2 §12.2: скользящий штраф — FinRisk += l × max(0, Leverage − 0,5), кап/нед.
  if (!isLegacy()) {
    const drift = leverageRiskDrift(leverage);
    if (drift > 0) {
      restaurant.risks.financial = clamp(restaurant.risks.financial + drift, 0, 100);
    }
    // КАССОВЫЙ РАЗРЫВ: при финриске ≥ 45 (плечо/просрочки) контрагенты
    // начинают требовать предоплат. Детерминированный триггер в закрытии
    // недели (отдельный rng-поток §21, кулдаун 4 нед) ГАРАНТИРУЕТ цену
    // бездумного долга (риск-драйвенная ветка checkEvents даёт лишь ~0,5
    // события за окно высокого риска — замер S3B: финриск 93, разрывов 0).
    if (
      restaurant.risks.financial >= 45 &&
      week - (restaurant.lastCashGapWeek ?? 0) >= 4
    ) {
      const gapRng = deriveRng(hashSeed(seed, week), 'cash-gap');
      if (gapRng.chance(0.35)) {
        restaurant.lastCashGapWeek = week;
        const tpl = EVENT_TEMPLATES_MAP['cash_gap'];
        if (tpl) draft.activeEvents.push(instantiateEvent(tpl, weekDate));
      }
    }
  }

  // v2 §13.1: накопители квартального FCF.
  // OCF = деньги от операционки (продажи − закупки − ФОТ − аренда − коммуналка −
  // налоги − штрафы); инвестпрограмма и тело кредита вычитаются ниже.
  // НЕДЕЛЯ 1 (ОТКРЫТИЕ) НЕ УЧИТЫВАЕТСЯ: стартовое оборудование/лицензии/взнос —
  // это выбор при открытии, а не инвестиции квартала (баг-фикс: иначе FCF_Q1
  // занижен на ~4–5 млн и предложение дивидендов обнуляется — замер sokolniki:
  // −5,1 млн вместо ≈ +0,5 млн).
  if (week > 1) {
    const ocfWeek =
      cashFlow.netCashFromSales -
      cashFlow.purchases -
      cashFlow.payrollPaid -
      (cashFlow.overtimePaid ?? 0) -
      cashFlow.socialPaid -
      cashFlow.rentPaid -
      cashFlow.utilitiesPaid -
      cashFlow.marketingPaid -
      cashFlow.maintenancePaid -
      cashFlow.repairsPaid -
      cashFlow.taxesPaid -
      cashFlow.finesPaid;
    restaurant.finance.accrued.ocfQuarter = (restaurant.finance.accrued.ocfQuarter ?? 0) + ocfWeek;
    restaurant.finance.accrued.principalQuarter = (restaurant.finance.accrued.principalQuarter ?? 0) + principalRepaidWeek;
    restaurant.finance.accrued.equipQuarter = (restaurant.finance.accrued.equipQuarter ?? 0) + cashFlow.equipmentPaid;
    restaurant.finance.accrued.licenseQuarter = (restaurant.finance.accrued.licenseQuarter ?? 0) + cashFlow.licensePaid;
  }

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

    // v2 §13.1: ПРЕДЛОЖЕНИЕ ДИВИДЕНДОВ на конец квартала.
    // FCF_Q = OCF_Q − тело кредита − оборудование − лицензии (§13.1);
    // DivQ = 0,30×max(0,FCF) + 0,10×max(0, NP − 3% выручки). Решение —
    // крит-событие с вариантами (выплатить/половина/перенести); доверие
    // меняется в момент решения (setup.resolveEvent → applyDividendDecision).
    if (!isLegacy()) {
      const fcfQ =
        (restaurant.finance.accrued.ocfQuarter ?? 0) -
        (restaurant.finance.accrued.principalQuarter ?? 0) -
        (restaurant.finance.accrued.equipQuarter ?? 0) -
        (restaurant.finance.accrued.licenseQuarter ?? 0);
      const proposed = dividendProposal(fcfQ, qProfit, qRevenue);
      restaurant.finance.dividends ??= { history: [], lastProposal: null };
      restaurant.finance.dividends.lastProposal = {
        quarter,
        week,
        fcf: Math.round(fcfQ),
        netProfit: Math.round(qProfit),
        revenue: Math.round(qRevenue),
        proposed,
      };
      if (proposed > 0) {
        draft.activeEvents.push(createOwnerDividendEvent(quarter, week, Math.round(fcfQ), Math.round(qProfit), Math.round(qRevenue), proposed, weekDate));
      }
      // Накопители FCF работают на следующий квартал.
      restaurant.finance.accrued.ocfQuarter = 0;
      restaurant.finance.accrued.principalQuarter = 0;
      restaurant.finance.accrued.equipQuarter = 0;
      restaurant.finance.accrued.licenseQuarter = 0;

      // v2 §12.2/§13.2: плечо > 1,5 на закрытии квартала — доверие −4
      // (владелец видит баланс: ресторан живёт в долг).
      const trust = restaurant.finance.ownerTrust ?? 60;
      let trustAfter = trust;
      if (leverage > BALANCE_V2_4.leverage.trustPenaltyAt) {
        trustAfter = clamp(trust - BALANCE_V2_4.leverage.trustPenalty, 0, 100);
        restaurant.finance.ownerTrust = trustAfter;
      }
      // v2 §13.2: доверие ниже порога → дилемма «Разговор с владельцем»
      // (не чаще раза в квартал — создаётся только на закрытии).
      if (trustAfter < BALANCE_V2_4.dividends.trustDilemmaAt && !draft.activeEvents.some((e) => e.templateId === 'owner_talk')) {
        draft.activeEvents.push(createOwnerTalkEvent(trustAfter, weekDate));
      }
    }
  }

  // ===== ТЕКУЧКА (конец недели) =====
  // v2 §7.1: формула усталость/мораль (фикс бага «текучесть = 0%»). КАЖДОЕ
  // увольнение недели становится событием staff_resignation с выбором
  // «найти замену за деньги / оставить вакансию» (кап 2 диалога в неделю —
  // каскад не превращается в спам; сверх капа — кадровый риск).
  const turnoverRng = deriveRng(hashSeed(seed, week), 'turnover');
  const quits = weeklyTurnover(restaurant, () => turnoverRng.next(), week);
  if (!isLegacy() && quits.length > 0) {
    const cfg = BALANCE_V2_2.quit;
    const log = (draft.history.resignationLog ??= []);
    const dialogQuits = quits.slice(0, 2);
    const silentQuits = quits.slice(2);
    for (const q of quits) {
      log.push({ week, roleId: q.roleId });
    }
    // Лог rolling-52 (кап списка — чтобы сейвы не распухали).
    if (log.length > 120) {
      draft.history.resignationLog = log.slice(-120);
    }
    // Сверх капа диалогов: «молчаливые» увольнения поднимают кадровый риск.
    if (silentQuits.length > 0) {
      restaurant.risks.staff = clamp(
        restaurant.risks.staff + silentQuits.length * cfg.staffRiskPer,
        0,
        100,
      );
    }
    // Диалоги с игроком (динамические резолюции).
    for (let qi = 0; qi < dialogQuits.length; qi++) {
      const q = dialogQuits[qi];
      const pool = restaurant.staff.pools[q.roleId];
      const roleName = STAFF_ROLES[q.roleId].name;
      // v2 §15 «Кадровый кризис» (отказ): подбор персонала дороже ×1,5 на 26 нед.
      const hireCost = Math.round(cfg.hiringCost * hireCostMult(restaurant, week));
      draft.activeEvents.push({
        id: `evt-staff_resignation-${week}-${qi}`,
        date: { ...weekDate },
        templateId: 'staff_resignation',
        title: `${roleName} уволился`,
        description:
          `Усталость пула ${Math.round(pool.fatigue)}/100, мораль ${Math.round(pool.morale)}/100. ` +
          (q.reason === 'усталость'
            ? '«График невыносимый — я сгорел». Недоукомплектованная роль снижает мощность станций и разгоняет переработки остальных.'
            : '«Нашёл место получше». Роль недоукомплектована — мощность станций просядет, пока вакансия открыта.'),
        criticality: 'critical',
        effect: {},
        resolved: false,
        resolutions: [
          {
            label: `Найти замену — подбор ${hireCost.toLocaleString('ru-RU')} ₽`,
            cost: hireCost,
            note: 'Объявление, собеседования, агентство. Новичок на сменах со следующего дня: 7 дней адаптации (КПД 0.70→0.85).',
            hire: { roleId: q.roleId },
          },
          {
            label: 'Оставить вакансию открытой',
            cost: 0,
            note: 'Экономия на подборе сейчас: станция работает в недоукомплектовании, переработки и усталость остальных растут.',
          },
        ],
      } as GameEvent);
    }
  }

  // v2 §8 (механизм D): неотвеченные отзывы 1–2★ → юридический риск
  // (+0.3 × min(U, 30) в неделю; естественная релаксация −0.3/день уже в updateRisks).
  if (!isLegacy()) {
    const u = restaurant.reputation.unansweredNeg ?? 0;
    const rcfg = BALANCE_V2_2.reviews;
    const legalDelta = rcfg.legalPerUnanswered * Math.min(u, rcfg.legalCapU);
    if (legalDelta > 0) {
      restaurant.risks.legal = clamp(restaurant.risks.legal + legalDelta, 0, 100);
    }
  }

  // v2 §6: ЦЕПОЧКА АРЕНДОДАТЕЛЯ — проверка расписания разговоров
  // (детерминированный поток, отдельный от событий endday).
  if (!isLegacy()) {
    const landlordRng = deriveRng(hashSeed(seed, week), 'landlord');
    checkLandlordSchedule(draft, week, landlordRng);
  }

  // v2 §16.1 (этап 5): АЛКОГОЛЬ — «пьяные инциденты» по доле категории в
  // выручке недели (P = 0,02 + 0,03×(доля−15%)/20%), проверки полиции
  // (1–2/год у лицензиата), юр. риск от продаж без лицензии. Все броски —
  // ОТДЕЛЬНЫЕ потоки §21 ('incident'/'police'), не сдвигают день-симуляцию.
  if (!isLegacy() && licenseActive) {
    const alc = BALANCE_V2_5.alcohol;
    const alcoholRevenue = dayResults.reduce((s, dr) => s + (dr.kpi.categoryRevenue.alcohol ?? 0), 0);
    const alcoholShare = revenue > 0 ? alcoholRevenue / revenue : 0;
    const incidentRng = deriveRng(hashSeed(seed, week), 'incident');
    if (alcoholShare > 0 && incidentRng.chance(alcoholIncidentChance(alcoholShare))) {
      const comp = Math.round(
        alc.incidentCompensation[0] +
          incidentRng.next() * (alc.incidentCompensation[1] - alc.incidentCompensation[0]),
      );
      const incident: GameEvent = {
        id: `evt-drunk_incident-${week}`,
        date: { ...weekDate },
        templateId: 'drunk_incident',
        title: 'Пьяный инцидент',
        description:
          'Гость перебрал и устроил сцену у стойки: полиция, объяснения, компенсация ' +
          'пострадавшим посетителям. «Бар приносит выручку — и такие вечера приносит тоже».',
        criticality: 'normal',
        effect: {
          cash: -comp,
          riskDelta: { reputation: alc.incidentReputation, legal: 3 },
        },
        resolved: false,
      };
      applyEventEffects(draft, restaurant, incident);
      // Жалоба — реальный отзыв в окно (байесовский рейтинг реагирует).
      restaurant.reputation.reviewCounter = (restaurant.reputation.reviewCounter ?? 0) + 1;
      addReviews(
        restaurant,
        [
          {
            id: `rev-${restaurant.reputation.reviewCounter}-${week}-bar`,
            date: { ...weekDate },
            segmentId: 'evening',
            score: 2,
            weight: 3,
            text: '«Сосед по столу перебрал, скандал у бара, персонал разводил руками». — Карты.',
            scandal: true,
            sourceId: 'maps',
          },
        ],
        weekDate,
        DIFFICULTIES[draft.difficultyId]?.reputationSpeed ?? 1,
      );
      // Счётчик квартала (для дилеммы «ограничить вечер» при повторе).
      (restaurant.alcoholIncidents ??= []).push(week);
      if (
        (restaurant.alcoholIncidents?.length ?? 0) >= alc.incidentDilemmaAt &&
        !draft.activeEvents.some((e) => e.templateId === 'dilemma_alcohol_curb' && !e.resolved)
      ) {
        const curb = createAlcoholCurbEvent(week, weekDate);
        if (curb) {
          restaurant.lastDilemmaWeek = week; // мини-дилемма тоже занимает слот квартала
          draft.activeEvents.push(curb);
        }
      }
    }
    const policeRng = deriveRng(hashSeed(seed, week), 'police');
    if (policeRng.chance(alc.policePerYear / 52)) {
      const fine = Math.round(
        alc.policeFine[0] + policeRng.next() * (alc.policeFine[1] - alc.policeFine[0]),
      );
      const police: GameEvent = {
        id: `evt-police_check-${week}`,
        date: { ...weekDate },
        templateId: 'police_check',
        title: 'Проверка по линии алкоголя',
        description:
          'Участковый с журналом учёта: сверка деклараций, время продаж, сопроводительные ' +
          'документы. Мелкие нарушения — протокол и штраф.',
        criticality: 'normal',
        effect: { cash: -fine, riskDelta: { legal: 4 } },
        resolved: false,
      };
      applyEventEffects(draft, restaurant, police);
    }
  }
  // v2 §16.1: без лицензии алкогольные позиции в меню → юр. риск растёт
  // (RISKS_META.legal «продажа алкоголя без лицензии» — реальный драйвер).
  if (!isLegacy() && !licenseActive) {
    const alcoholDishes = restaurant.menu.dishes.filter(
      (id) => dishOf(restaurant.menu, id)?.requiresAlcoholLicense,
    ).length;
    if (alcoholDishes > 0) {
      restaurant.risks.legal = clamp(restaurant.risks.legal + 1.5, 0, 100);
    }
  }

  // v2 §15 (этап 5): ДИЛЕММЫ — state-триггеры (не чаще 1/квартал, приоритет
  // по давлению, замещение одного обычного события недели — внутри модуля).
  if (!isLegacy()) {
    checkDilemmas(draft, week, weekDate);
    // §15 «Инспектор»: скандал взятки (5%/год, поток 'scandal').
    const scandal = checkBribeScandal(draft, week, weekDate);
    if (scandal) applyEventEffects(draft, restaurant, scandal);
    // §15 «Шеф» (отказ): окно ×1,5 истекло — бросок ухода (поток 'chef-quit').
    const chefQuit = checkChefQuit(draft, week, weekDate);
    if (chefQuit) draft.activeEvents.push(chefQuit);
    // Сброс счётчика инцидентов на границе квартала.
    if (week > 0 && week % QUARTERLY_WEEKS === 0) {
      restaurant.alcoholIncidents = [];
    }
  }

  // v2 §14.1: неделя без изменений в категории — свежесть тает (+1 нед).
  // Категории без записи создаются «возрастом 1» (стартовое меню ново,
  // но не вечно: через grace нед приедается и оно).
  if (!isLegacy()) {
    const fresh = (restaurant.menu.categoryFreshness ??= {});
    const cats = new Set<string>();
    for (const id of restaurant.menu.dishes) {
      const d = dishOf(restaurant.menu, id);
      if (d) cats.add(d.category);
    }
    for (const cat of cats) fresh[cat] = (fresh[cat] ?? 0) + 1;
  }

  // v2 §9: активация переключения режима закупки (лаг = переговоры/контракт).
  if (!isLegacy()) {
    const proc = restaurant.inventory.procurement;
    if (proc?.pendingSwitch && week - proc.pendingSwitch.orderedAt >= BALANCE_V2_3.procurement.switchLagWeeks) {
      proc.policy = proc.pendingSwitch.to;
      proc.pendingSwitch = null;
    }
  }

  // ===== ИСТОРИЯ =====
  const guests = guestsWeek;
  const returningGuests = dayResults.reduce((s, r) => s + r.kpi.returningGuests, 0);
  const weekStat: WeekStat = {
    week,
    revenue,
    guests,
    avgCheck: guests > 0 ? Math.round(revenue / guests) : 0,
    cogs,
    wasteCost,
    // ФОТ недели: оклады + сверхурочные + взносы (v2 §5.2).
    payroll: payroll + socialContributions + overtimeCost,
    netProfit,
    cashEnd: restaurant.finance.cash,
    rating: restaurant.reputation.rating,
    satisfaction: dayResults.length > 0
      ? Math.round(dayResults.reduce((s, r) => s + r.kpi.satisfaction, 0) / dayResults.length)
      : 0,
    foodCost: revenue > 0 ? (cogs + wasteCost) / revenue : 0,
    laborCost: revenue > 0 ? (payroll + overtimeCost + socialContributions) / revenue : 0,
    bsc: bsc.total,
    returningShare: guests > 0 ? Math.round((returningGuests / guests) * 1000) / 1000 : 0,
    // v2 §7.2: численность на конец недели (база метрики текучести).
    headcount: ROLE_IDS.reduce((s, id) => s + (restaurant.staff.pools[id]?.count ?? 0), 0),
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

  const bankrupt =
    restaurant.finance.cash < LOSE_CONDITIONS.bankruptCash ||
    restaurant.finance.loans.some((l) => l.overduePayments >= 8) ||
    draft.history.lowRatingWeeks >= LOSE_CONDITIONS.lowRatingWeeks;
  if (bankrupt) {
    gameStatus = 'bankrupt';
    gameOver = true;
    draft.phase = 'gameover';
  } else if (ownerReplaced(draft)) {
    // v2 §13.2: финал «Управленца сменили» — доверие владельца ниже 15.
    gameStatus = 'owner_replaced';
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
