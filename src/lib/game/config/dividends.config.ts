/**
 * ДИВИДЕНДЫ И ДОВЕРИЕ ВЛАДЕЛЬЦА (БАЛ-v2 §13, порт из v1.0.0 moderate).
 *
 * В конце каждого квартала (нед 12/24/36/48) weekclose считает FCF квартала
 * (у нас честно: Δ кассы за квартал — все платежи идут транзакциями) и
 * предложение DivQ = fcfShare × max(0, FCF) + profitShare × max(0, NP − 3% Rev).
 * Решение (выплатить/половину/перенести) меняет OwnerTrust:
 * ≥ 70 — бонусы владельца вероятнее, < 35 — дилемма «Разговор с владельцем»,
 * < 15 — финал «Управленца сменили».
 *
 * Дивиденды — движение денег (не P&L): маржа не меняется, касса и доверие — да.
 */
export const DIVIDENDS = {
  /** Доля FCF квартала в предложении. */
  fcfShare: 0.4,
  /** Доля прибыли «сверх» 3% квартальной выручки. */
  profitShare: 0.12,
  profitThresholdRevShare: 0.03,
  /** Стартовое доверие владельца. */
  trustStart: 60,
  /** Выплата ≥ 0,7 × предложения. */
  trustPayGood: 8,
  /** Выплата < 0,3 × предложения при сильном FCF. */
  trustPayLow: 6,
  /** Нулевая выплата при положительном предложении. */
  trustPayZero: 10,
  /** FCF ниже этой доли предложения → штраф мягче. */
  weakFcfShare: 0.6,
  /** Доверие для ×1,5 к событию «бонус владельца». */
  trustBonusAt: 70,
  /** Доверие для дилеммы «Разговор с владельцем». */
  trustDilemmaAt: 35,
  /** Финал «Управленца сменили». */
  trustReplaced: 15,
  /** Дилемма: принудительная доля кассы. */
  dilemmaCashShare: 0.1,
  /** Дилемма: выплата успокаивает владельца. */
  dilemmaTrustRelief: 6,
  /** Дилемма: отказ. */
  dilemmaTrustRefuse: 10,
  dilemmaRiskRefuse: 10,
  /** Плечо > 1,5 на закрытии квартала — доверие −4. */
  trustPenaltyAt: 1.5,
  trustPenalty: 4,
} as const;

/** Предложение дивидендов квартала (§13.1), ₽. */
export function dividendProposal(fcfQuarter: number, netProfitQuarter: number, revenueQuarter: number): number {
  const profitAbove = Math.max(0, netProfitQuarter - DIVIDENDS.profitThresholdRevShare * revenueQuarter);
  return Math.round(DIVIDENDS.fcfShare * Math.max(0, fcfQuarter) + DIVIDENDS.profitShare * profitAbove);
}

/** Изменение доверия по факту выплаты (§13.2). */
export function dividendTrustDelta(paid: number, proposed: number, fcfQuarter: number): number {
  if (proposed <= 0) return 0;
  if (paid >= 0.7 * proposed) return DIVIDENDS.trustPayGood;
  const strongFcf = fcfQuarter > DIVIDENDS.weakFcfShare * proposed;
  if (paid <= 0.01) return strongFcf ? -DIVIDENDS.trustPayZero : -DIVIDENDS.trustPayLow;
  if (paid < 0.3 * proposed) return strongFcf ? -DIVIDENDS.trustPayLow : 0;
  return 0;
}
