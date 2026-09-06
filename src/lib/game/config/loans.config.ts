/**
 * Конфиг кредитов (ТЗ §9.4, §18.8).
 * Аннуитет: MonthlyRate = AnnualRate/12;
 *   Payment = Principal × r / (1 - (1+r)^(-TermMonths))
 * Движок платит каждые 4 недели, первый платёж через 4 недели.
 */
export const LOANS = {
  maxTotalDebt: 20_000_000,
  additionalLoanMinWeek: 12,
  additionalLoanMinDscr: 1.2,
  overdueFineRate: 0.02, // штраф 2% от платежа за просрочку (раз в неделю)
  overdueRiskPerWeek: 8, // рост financialRisk за неделю просрочки
  bankruptcyOverdueWeeks: 8, // просрочка дольше N недель = банкротство
};

/** Аннуитетный платёж, ₽. */
export function annuityPayment(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  const p = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return p;
}

/** Досрочное погашение доступно всегда без комиссий (MVP). */
