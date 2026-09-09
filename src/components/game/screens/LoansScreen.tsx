/**
 * Экран «Кредиты» (ТЗ §9.4): займы, аннуитетные платежи, просрочки,
 * досрочное погашение, DSCR.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, EmptyState, MetricRow, money, moneyShort, pct } from '../widgets';
import { LOANS } from '@/lib/game/config/loans.config';
import { loanRateSurcharge, bankRefusesNewLoan } from '@/lib/game/config/balance2.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Landmark, AlertTriangle, HandCoins, ShieldAlert, Scale } from 'lucide-react';
import type { LoanState } from '@/lib/game/types';

export function LoansScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const loans = restaurant.finance.loans;

  const totalRemaining = loans.reduce((s, l) => s + l.remaining, 0);
  const totalPayments = loans.reduce((s, l) => s + (l.remaining > 0 ? l.payment : 0), 0);
  const overdueCount = loans.reduce((s, l) => s + l.overduePayments, 0);

  const operatingProfit = state.weekResult?.pnl.operatingProfit ?? null;
  const dscr = operatingProfit !== null && totalPayments > 0 ? operatingProfit / totalPayments : null;
  // Для банковского правила (§12.2) — честный DSCR: операционка за 4 недели
  // к платежу за 4 недели (не недельная прибыль к месячному платежу).
  const dscr4 = operatingProfit !== null && totalPayments > 0 ? (operatingProfit * 4) / totalPayments : null;
  const leverage = restaurant.finance.leverage ?? 0;
  const zone = leverageZone(leverage);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Landmark}
          label="Кредитов"
          value={String(loans.length)}
          sub={loans.length > 0 ? 'обслуживаются' : 'займов нет'}
        />
        <KpiCard
          icon={Landmark}
          label="Остаток долга"
          value={moneyShort(totalRemaining)}
          sub={`выдано всего: ${moneyShort(loans.reduce((s, l) => s + l.principal, 0))}`}
        />
        <KpiCard
          icon={HandCoins}
          label="Платежи / 4 нед"
          value={moneyShort(totalPayments)}
          sub="аннуитет, раз в 4 недели"
        />
        <KpiCard
          icon={ShieldAlert}
          label="DSCR"
          value={dscr !== null ? dscr.toFixed(2) : '—'}
          sub="прибыль / платежи, норма ≥ 1.2"
          tone={dscr === null ? 'default' : dscr >= 1.2 ? 'good' : dscr >= 1 ? 'warn' : 'bad'}
        />
      </div>

      {loans.length === 0 ? (
        <SectionCard title="Кредиты" icon={Landmark}>
          <EmptyState text="Кредитов нет. Новый займ берётся на этапе открытия ресторана" />
        </SectionCard>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {loans.map((loan, i) => (
            <LoanCard key={i} index={i} loan={loan} week={state.week} />
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* v2 §12.1/§12.2: кредитное плечо и зоны давления. */}
        <SectionCard
          title="Кредитное плечо (NetDebt / Equity)"
          icon={Scale}
          right={<LeverageBadge leverage={leverage} />}
        >
          <MetricRow label="Плечо (последнее закрытие недели)" value={leverage.toFixed(2)} tone={zone.tone} />
          <MetricRow label="Чистый долг (долг − касса)" value={money(restaurant.finance.netDebt ?? 0)} />
          <MetricRow label="Собственный капитал" value={money(restaurant.finance.equityValue ?? 0)} />
          <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 space-y-1.5">
            <p className="font-semibold text-stone-700">Зоны давления (§12.2)</p>
            <p>{'≤ 0,5 — комфорт: финриск не растёт, банки лояльны.'}</p>
            <p>{'> 0,5 — релаксация финриска отключена: «банки не забывают долг».'}</p>
            <p>
              {'> 1,0 — новый кредит под ставку +2 п.п.; > 1,5 — доверие владельца −4/квартал.'}
              {loanRateSurcharge(leverage) > 0 ? ' · сейчас: надбавка активна' : ''}
            </p>
            <p>
              {'> 2,0 или DSCR < 1,5 — банк отказывает в новом кредите' +
                (dscr4 !== null && bankRefusesNewLoan(leverage, dscr4) ? ' · сейчас: ОТКАЗ' : '')}
            </p>
          </div>
          <p className="text-xs text-stone-400 mt-2">
            Equity = касса + склад + оборудование (за вычетом износа) − долг. Считается каждую неделю.
          </p>
        </SectionCard>

        <SectionCard title="Покрытие долга (DSCR)" icon={ShieldAlert}>
          {dscr !== null ? (
            <>
              <MetricRow label="Операционная прибыль (нед)" value={money(operatingProfit ?? 0)} />
              <MetricRow label="Платежи по кредитам / 4 нед" value={money(totalPayments)} />
              <MetricRow
                label="DSCR"
                value={dscr.toFixed(2)}
                tone={dscr >= 1.2 ? 'good' : dscr >= 1 ? 'neutral' : 'bad'}
                hint="DSCR = операционная прибыль / платежи. Здоровое значение ≥ 1.2"
              />
              <p className="text-xs text-stone-400 mt-2">
                DSCR ниже 1.0 — платежи съедают всю прибыль: ресторан живёт в долг.
              </p>
            </>
          ) : (
            <EmptyState text="DSCR появится, когда будет закрыта неделя с активными кредитами" />
          )}
        </SectionCard>

        <SectionCard title="Правила игры с долгом" icon={AlertTriangle}>
          <div className="space-y-2.5 text-sm text-stone-600">
            <p>
              Платёж списывается каждые 4 недели. При нехватке денег на счёте образуется{' '}
              <b className="text-red-700">просрочка</b>: штраф 2% от платежа в неделю и рост
              финансового риска.
            </p>
            <p>
              Просрочка дольше <b className="text-red-700">{LOANS.bankruptcyOverdueWeeks} недель</b>{' '}
              — банкротство и конец игры.
            </p>
            <p>
              Досрочное погашение доступно всегда и без комиссий: уменьшает тело долга и аннуитет
              пересчитывается движком.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/** v2 §12.2: зона плеча для тона и бейджа. */
function leverageZone(leverage: number): { label: string; tone: 'good' | 'neutral' | 'bad'; cls: string } {
  if (leverage <= 0.5) return { label: 'Комфорт', tone: 'good', cls: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' };
  if (leverage <= 1.0) return { label: 'Внимание', tone: 'neutral', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100' };
  if (leverage <= 2.0) return { label: 'Высокое', tone: 'neutral', cls: 'bg-orange-100 text-orange-800 hover:bg-orange-100' };
  return { label: 'Критично', tone: 'bad', cls: 'bg-red-100 text-red-800 hover:bg-red-100' };
}

function LeverageBadge({ leverage }: { leverage: number }) {
  const z = leverageZone(leverage);
  return <Badge className={cn(z.cls)}>{z.label}</Badge>;
}

/** Карточка одного кредита. */
function LoanCard({ index, loan, week }: { index: number; loan: LoanState; week: number }) {
  const state = useGame((s) => s.state)!;
  const loanRepay = useGame((s) => s.loanRepay);
  const disabled = state.phase === 'gameover';
  const [amount, setAmount] = useState('');

  const n = Number.parseInt(amount, 10);
  const valid = Number.isFinite(n) && n > 0 && n <= loan.remaining;
  const paidShare = loan.principal > 0 ? 1 - loan.remaining / loan.principal : 1;
  const weeksToPayment = loan.nextPaymentWeek - week;

  return (
    <SectionCard
      title={`Кредит №${index + 1}`}
      icon={Landmark}
      right={
        loan.overduePayments > 0 ? (
          <Badge className="bg-red-600 text-white hover:bg-red-600">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden />
            Просрочек: {loan.overduePayments}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            Обслуживается
          </Badge>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-stone-500">
              Погашено {pct(paidShare, 0)} · {money(loan.principal - loan.remaining)} из{' '}
              {money(loan.principal)}
            </span>
            <span className="font-semibold tabular-nums text-stone-800">
              остаток {moneyShort(loan.remaining)}
            </span>
          </div>
          <Progress value={Math.round(paidShare * 100)} className="h-2.5" aria-label="Доля погашенного долга" />
        </div>

        <div>
          <MetricRow label="Ставка" value={`${pct(loan.annualRate, 0)} годовых`} />
          <MetricRow label="Срок" value={`${loan.termMonths} мес`} />
          <MetricRow label="Аннуитетный платёж" value={`${money(loan.payment)} / 4 нед`} />
          <MetricRow
            label="Следующий платёж"
            value={
              weeksToPayment > 0
                ? `нед ${loan.nextPaymentWeek} (через ${weeksToPayment})`
                : `нед ${loan.nextPaymentWeek}`
            }
            tone={weeksToPayment <= 1 ? 'bad' : 'neutral'}
          />
          {loan.overduePayments > 0 && (
            <MetricRow
              label="Штраф за просрочку"
              value={`${money(Math.round(loan.payment * LOANS.overdueFineRate))} / нед`}
              tone="bad"
            />
          )}
        </div>

        {loan.remaining > 0 && (
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-stone-600">Досрочное погашение</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={amount}
                disabled={disabled}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-32 h-11 tabular-nums text-right"
                aria-label="Сумма досрочного погашения"
                title={`Остаток долга: ${money(loan.remaining)}`}
              />
              <Button
                className="h-11 bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!valid || disabled}
                onClick={() => {
                  loanRepay(index, n);
                  setAmount('');
                }}
              >
                <HandCoins className="h-4 w-4 mr-1.5" aria-hidden />
                Погасить
              </Button>
              <Button
                variant="outline"
                className="h-11 border-stone-300"
                disabled={disabled}
                onClick={() => setAmount(String(Math.min(loan.remaining, Math.round(loan.payment * 4))))}
                title="Внести сумму четырёх платежей"
              >
                4 платежа
              </Button>
              <Button
                variant="outline"
                className={cn('h-11 border-stone-300')}
                disabled={disabled}
                onClick={() => setAmount(String(loan.remaining))}
                title={`Весь остаток: ${money(loan.remaining)}`}
              >
                Всё
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
