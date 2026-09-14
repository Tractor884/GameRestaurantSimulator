/**
 * ДИВИДЕНДЫ И ДОВЕРИЕ ВЛАДЕЛЬЦА (БАЛ-v2 §13, порт из v1.0.0).
 *
 * Квартальное предложение создаётся weekclose (week % 12 === 0) как
 * крит-событие с динамическими резолюциями; решение игрока применяется
 * здесь из resolveEvent. Дивиденды — движение денег (тип 'dividend'),
 * НЕ P&L: маржа не меняется, касса и доверие — да.
 */
import type { GameDate, GameEvent, GameState } from '../types';
import { DIVIDENDS, dividendTrustDelta } from '../config/dividends.config';
import { addTransaction, clamp } from './core';

const fmt = (n: number) => n.toLocaleString('ru-RU');

/** Событие «Владелец ждёт дивиденды» (§13.1): динамические резолюции. */
export function createOwnerDividendEvent(
  quarter: number,
  week: number,
  fcf: number,
  netProfit: number,
  revenue: number,
  proposed: number,
  date: GameDate,
): GameEvent {
  return {
    id: `evt-owner_dividend-${week}`,
    date: { ...date, hour: 23 },
    templateId: 'owner_dividend',
    title: `Дивиденды за квартал ${quarter}`,
    description:
      `Владелец просит распределить прибыль. Свободный денежный поток квартала ${fmt(fcf)} ₽` +
      ` (движение кассы: продажи минус все платежи — закупки, ФОТ, аренда, налоги, тело кредита, ` +
      `оборудование), чистая прибыль ${fmt(netProfit)} ₽ при выручке ${fmt(revenue)} ₽. ` +
      `Регулярные выплаты держат доверие на уровне ${DIVIDENDS.trustBonusAt}+ — тогда владелец охотнее ` +
      `поддерживает проект дополнительно. Игнорирование просьб заканчивается разговором, ` +
      `который закончится не словами.`,
    criticality: 'critical',
    effect: {},
    resolved: false,
    resolutions: [
      {
        label: `Выплатить предложенное — ${fmt(proposed)} ₽`,
        cost: proposed,
        note: `${Math.round(DIVIDENDS.fcfShare * 100)}% FCF + ${Math.round(DIVIDENDS.profitShare * 100)}% прибыли сверх ${Math.round(DIVIDENDS.profitThresholdRevShare * 100)}% квартальной выручки. Доверие +${DIVIDENDS.trustPayGood}: владельцу видно, что ресторан не «кубышка», а источник дохода.`,
        dividend: { fraction: 1 },
        tone: 'neutral',
      },
      {
        label: `Выплатить половину — ${fmt(Math.round(proposed / 2))} ₽`,
        cost: Math.round(proposed / 2),
        note: 'Баланс развития и доверия: половину — в кассу как подушка, половину — владельцу. Доверие не растёт, но и не тает.',
        dividend: { fraction: 0.5 },
        tone: 'neutral',
      },
      {
        label: 'Перенести выплату',
        cost: 0,
        note: `«Все деньги — в развитие». При сильном FCF владелец запомнит отказ (−${DIVIDENDS.trustPayZero} доверия); при слабом простит (−${DIVIDENDS.trustPayLow}).`,
        dividend: { fraction: 0 },
        tone: 'negative',
      },
    ],
  };
}

/** Дилемма «Разговор с владельцем» (§13.2): доверие ниже порога. */
export function createOwnerTalkEvent(trust: number, date: GameDate): GameEvent {
  const share = Math.round(DIVIDENDS.dilemmaCashShare * 100);
  return {
    id: `evt-owner_talk-${date.week}`,
    date: { ...date, hour: 23 },
    templateId: 'owner_talk',
    title: 'Разговор с владельцем',
    description:
      `Доверие упало до ${Math.round(trust)}/100. Владелец приехал лично: «Я не вижу денег ` +
      `и не вижу плана. Или ресторан начинает возвращать вложенное — или мне нужен другой ` +
      `управляющий». Требование: разовая выплата ${share}% кассы в счёт распределения прибыли.`,
    criticality: 'critical',
    effect: {},
    resolved: false,
    resolutions: [
      {
        label: `Выплатить ${share}% кассы`,
        cost: 0, // фактическая сумма считается в момент решения (касса живая)
        note: `Принудительное распределение: владелец забирает ${share}% счёта и снимает претензии (доверие +${DIVIDENDS.dilemmaTrustRelief}).`,
        ownerForcePay: { cashShare: DIVIDENDS.dilemmaCashShare },
        tone: 'neutral',
      },
      {
        label: 'Отказать и защитить план развития',
        cost: 0,
        note: `«Деньги нужны ресторану». Доверие −${DIVIDENDS.dilemmaTrustRefuse}, финансовый риск +${DIVIDENDS.dilemmaRiskRefuse} (владелец усиливает контроль и давит на банк). Ещё пара таких разговоров — и вас сменят.`,
        ownerRefuse: { trust: DIVIDENDS.dilemmaTrustRefuse, risk: DIVIDENDS.dilemmaRiskRefuse },
        tone: 'negative',
      },
    ],
  };
}

/** Решение по дивидендам (резолюция события owner_dividend). */
export function applyDividendDecision(
  state: GameState,
  event: GameEvent,
  fraction: number,
): { ok: boolean; message: string } {
  const r = state.restaurant;
  if (!r) return { ok: false, message: 'Ресторан не создан' };
  const prop = r.finance.dividends?.lastProposal;
  if (!prop || prop.proposed <= 0) return { ok: false, message: 'Нет активного предложения' };
  // Дата операции — момент решения: платёж попадает в отчёт текущей недели.
  const payDate = { week: state.week, day: state.day, hour: 12 };

  const want = Math.round(prop.proposed * fraction);
  const paid = Math.max(0, Math.min(want, r.finance.cash));
  if (paid > 0) {
    addTransaction(
      r,
      payDate,
      'dividend',
      paid,
      'out',
      `Дивиденды владельцу за квартал ${prop.quarter} (предложение ${fmt(prop.proposed)} ₽)`,
    );
  }
  const trustDelta = dividendTrustDelta(paid, prop.proposed, prop.fcf);
  r.finance.ownerTrust = clamp((r.finance.ownerTrust ?? DIVIDENDS.trustStart) + trustDelta, 0, 100);
  const divState = (r.finance.dividends ??= { history: [], lastProposal: null, quarterStartCash: 0 });
  divState.history.push({
    quarter: prop.quarter,
    week: prop.week,
    proposed: prop.proposed,
    paid,
    trustDelta,
  });
  if (divState.history.length > 12) divState.history = divState.history.slice(-12);
  divState.lastProposal = null;
  const note =
    paid > 0
      ? `Выплачено ${fmt(paid)} ₽. Доверие ${trustDelta >= 0 ? '+' : ''}${trustDelta} → ${Math.round(r.finance.ownerTrust)}.`
      : `Выплата перенесена. Доверие ${trustDelta} → ${Math.round(r.finance.ownerTrust)}.`;
  event.resolutionNote = note;
  return { ok: true, message: note };
}

/** Дилемма: принудительная выплата доли кассы (считается в момент решения). */
export function applyOwnerForcePay(
  state: GameState,
  event: GameEvent,
  cashShare: number,
): { ok: boolean; message: string } {
  const r = state.restaurant;
  if (!r) return { ok: false, message: 'Ресторан не создан' };
  const payDate = { week: state.week, day: state.day, hour: 12 };
  const amount = Math.round(r.finance.cash * cashShare);
  if (amount > 0) {
    addTransaction(r, payDate, 'dividend', amount, 'out', 'Принудительная выплата по требованию владельца');
  }
  r.finance.ownerTrust = clamp(
    (r.finance.ownerTrust ?? DIVIDENDS.trustStart) + DIVIDENDS.dilemmaTrustRelief,
    0,
    100,
  );
  const quarter = Math.max(1, Math.floor(event.date.week / 12));
  const divState = (r.finance.dividends ??= { history: [], lastProposal: null, quarterStartCash: 0 });
  divState.history.push({
    quarter,
    week: event.date.week,
    proposed: 0,
    paid: amount,
    trustDelta: DIVIDENDS.dilemmaTrustRelief,
  });
  const note = `Владелец забрал ${fmt(amount)} ₽. Доверие +${DIVIDENDS.dilemmaTrustRelief} → ${Math.round(r.finance.ownerTrust)}.`;
  event.resolutionNote = note;
  return { ok: true, message: note };
}

/** Дилемма: отказ владельцу. */
export function applyOwnerRefuse(
  state: GameState,
  event: GameEvent,
  trust: number,
  risk: number,
): { ok: boolean; message: string } {
  const r = state.restaurant;
  if (!r) return { ok: false, message: 'Ресторан не создан' };
  r.finance.ownerTrust = clamp((r.finance.ownerTrust ?? DIVIDENDS.trustStart) - trust, 0, 100);
  r.risks.financial = clamp(r.risks.financial + risk, 0, 100);
  const note = `Доверие −${trust} → ${Math.round(r.finance.ownerTrust)}. Финансовый риск +${risk}.`;
  event.resolutionNote = note;
  return { ok: true, message: note };
}

/** Порог финала «Управленца сменили» (§13.2). */
export function ownerReplaced(state: GameState): boolean {
  const r = state.restaurant;
  if (!r) return false;
  return (r.finance.ownerTrust ?? DIVIDENDS.trustStart) < DIVIDENDS.trustReplaced;
}
