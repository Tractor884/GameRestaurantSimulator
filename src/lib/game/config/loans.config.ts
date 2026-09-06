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
  // АУДИТ (§4.4): кредит должен давить. Штраф 4% и +10 фин.риска за неделю
  // просрочки — пропускать платежи стало заметно дороже.
  overdueFineRate: 0.04,
  overdueRiskPerWeek: 10,
  bankruptcyOverdueWeeks: 8,
};

/** Аннуитетный платёж, ₽. */
export function annuityPayment(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  const p = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return p;
}

/** Досрочное погашение доступно всегда без комиссий (MVP). */
