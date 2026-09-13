/**
 * Экран «Финансы» (ТЗ §25/§18): P&L (начисление), Cash Flow (движение денег),
 * журнал транзакций. Обучающий принцип: прибыль ≠ деньги на счёте.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, MetricRow, EmptyState, WarningBanner, money, moneyShort, pct } from '../widgets';
import { InfoHint } from '../hints';
import { CsvReportTools } from '../CsvReportTools';
import { CharacterPanel } from '../visual/CharacterPanel';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Banknote,
  Receipt,
  Gauge,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  LineChart,
  Waves,
  ListOrdered,
  Handshake,
  Building2,
} from 'lucide-react';
import type { FinancialTransaction, TransactionType } from '@/lib/game/types';
import { rentIndexationInfo } from '@/lib/game/engine';

const TX_LABELS: Record<TransactionType, string> = {
  sale: 'Продажи',
  purchase: 'Закупка',
  emergency: 'Экстренные меры',
  payroll: 'Зарплата',
  social_contribution: 'Взносы',
  rent: 'Аренда',
  utilities: 'Коммунальные',
  marketing: 'Маркетинг',
  repair: 'Ремонт',
  maintenance: 'Обслуживание',
  loan_disbursement: 'Кредит получен',
  loan_payment: 'Платёж по кредиту',
  loan_interest: 'Проценты',
  tax: 'Налог',
  fine: 'Штраф',
  license: 'Лицензия',
  equipment: 'Оборудование',
  deposit: 'Депозит',
  renovation: 'Ремонт помещения',
  bonus: 'Премии штату',
  training: 'Тренинги персонала',
  insurance: 'Медстраховка',
  dividend: 'Дивиденды владельцу',
  overtime: 'Сверхурочные',
  other: 'Прочее',
};

export function FinanceScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const [tab, setTab] = useState('pnl');

  const pnl = state.weekResult?.pnl ?? null;
  const cash = state.weekResult?.cashFlow ?? null;
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];

  const transactions = useMemo(
    () => restaurant.finance.transactions.slice(-60).reverse(),
    [restaurant.finance.transactions],
  );

  const ebitdaMargin = pnl && pnl.revenue > 0 ? pnl.operatingProfit / pnl.revenue : null;

  // v10 §10: инфляционная сводка — видна, когда индексы уже выросли.
  const inf = restaurant.finance.inflation;
  const infWarning =
    inf && inf.steps > 0
      ? `Инфляция с открытия: закупки +${Math.round((inf.foodIdx - 1) * 100)}%, оклады +${Math.round((inf.wageIdx - 1) * 100)}%, коммуналка +${Math.round((inf.utilIdx - 1) * 100)}%. Цены меню автоматически не растут — без переоценки маржа эрозируется.`
      : null;

  return (
    <div className="space-y-4">
      {/* Персонаж зоны (PRESENTATION-LAYER §5): Ирина — колонка шире, портрет-герой */}
      <div className="grid gap-4 items-start lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        <CharacterPanel characterId="accountant" vertical />
        <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Banknote}
          label="Деньги на счёте"
          value={moneyShort(restaurant.finance.cash)}
          sub="cash, не прибыль"
          tone={restaurant.finance.cash > 1_000_000 ? 'good' : 'bad'}
        />
        <KpiCard
          icon={Receipt}
          label="Выручка недели"
          value={pnl ? moneyShort(pnl.revenue) : lastWeek ? moneyShort(lastWeek.revenue) : '—'}
          sub={lastWeek ? `чек ${lastWeek.avgCheck.toLocaleString('ru-RU')} ₽` : 'нет данных'}
        />
        <KpiCard
          icon={Gauge}
          label="EBITDA-маржа"
          value={ebitdaMargin !== null ? pct(ebitdaMargin) : '—'}
          sub="цель 10–20%"
          tone={
            ebitdaMargin === null
              ? 'default'
              : ebitdaMargin >= 0.1
                ? 'good'
                : ebitdaMargin >= 0.05
                  ? 'warn'
                  : 'bad'
          }
        />
        <KpiCard
          icon={TrendingUp}
          label="Прибыль (накопл.)"
          value={moneyShort(state.history.cumulativeNetProfit)}
          sub="чистая, за всё время"
          tone={state.history.cumulativeNetProfit >= 0 ? 'good' : 'bad'}
        />
      </div>

      <WarningBanner
        warnings={[
          'Прибыль ≠ деньги на счёте. P&L считает по начислению (аренда, амортизация, налоги), а деньги приходят и уходят в другом ритме — смотрите Cash Flow.',
          ...(infWarning ? [infWarning] : []),
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pnl" className="gap-1.5">
            <LineChart className="h-4 w-4" aria-hidden />
            P&L
          </TabsTrigger>
          <TabsTrigger value="cash" className="gap-1.5">
            <Waves className="h-4 w-4" aria-hidden />
            Cash Flow
          </TabsTrigger>
          <TabsTrigger value="tx" className="gap-1.5">
            <ListOrdered className="h-4 w-4" aria-hidden />
            Транзакции
          </TabsTrigger>
        </TabsList>

        {/* ============ P&L ============ */}
        <TabsContent value="pnl" className="mt-3">
          <SectionCard
            title={pnl ? `Отчёт о прибылях и убытках — неделя ${pnl.week}` : 'Отчёт о прибылях и убытках'}
            icon={LineChart}
            right={<CsvReportTools />}
          >
            {pnl ? (
              <div className="grid md:grid-cols-2 gap-x-8">
                <div>
                  <MetricRow label="Выручка (валовая)" value={money(pnl.revenue)} tone="good" />
                  <MetricRow
                    label="Эквайринг (2%)"
                    value={money(-pnl.acquiringFees)}
                    hint="Комиссия банка за безналичные оплаты: валовая выручка минус эквайринг = чистая выручка, которая приходит в кассу"
                  />
                  <MetricRow label="Себестоимость (COGS, FIFO)" value={money(-pnl.cogs)} />
                  <MetricRow
                    label="Порча и потери"
                    value={money(-pnl.wasteCost)}
                    tone={pnl.wasteCost > 60_000 ? 'bad' : 'neutral'}
                    hint="waste"
                  />
                  <MetricRow label="Валовая прибыль" value={money(pnl.grossProfit)} />
                  <EmphasizedRow
                    label="EBITDA (операционная прибыль)"
                    value={`${money(pnl.operatingProfit)} · ${ebitdaMargin !== null ? pct(ebitdaMargin) : ''}`}
                    hint="ebitda"
                  />
                </div>
                <div>
                  <MetricRow label="Зарплата (gross)" value={money(-pnl.payroll)} hint="laborCost" />
                  <MetricRow label="Соц. взносы (30%)" value={money(-pnl.socialContributions)} hint="laborCost" />
                  {!!pnl.overtime && (
                    <MetricRow
                      label="Сверхурочные (×1,5)"
                      value={money(-pnl.overtime)}
                      hint="Перегруз кухонных станций: часы после 8-й — по ×1,5 (ТК РФ). Наймите людей или ослабьте график — переработки уйдут."
                    />
                  )}
                  {!!pnl.insurance && <MetricRow label="Медстраховка персонала" value={money(-pnl.insurance)} hint="Медстраховка (экран «Персонал»): 4% недельного ФОТ, снижает риск увольнений" />}
                  <MetricRow label="Аренда (начислено)" value={money(-pnl.rentAccrued)} />
                  <MetricRow
                    label="Коммунальные (начислено)"
                    value={money(-pnl.utilitiesAccrued)}
                    hint={
                      (restaurant.finance.inflation?.steps ?? 0) > 0
                        ? `Сезон × инфляция коммуналки +${Math.round(((restaurant.finance.inflation?.utilIdx ?? 1) - 1) * 100)}%`
                        : 'Зимой отопление +25%, летом вентиляция +15%'
                    }
                  />
                  <MetricRow label="Маркетинг" value={money(-pnl.marketing)} />
                  <MetricRow label="Обслуживание" value={money(-pnl.maintenance)} />
                  <MetricRow label="Ремонты" value={money(-pnl.repairs)} />
                  <MetricRow label="Амортизация" value={money(-pnl.depreciation)} />
                  <MetricRow label="Амортизация лицензии" value={money(-pnl.licenseAmortization)} />
                  <MetricRow label="Прочее" value={money(-pnl.otherOperating)} />
                  <MetricRow label="Проценты по кредитам" value={money(-pnl.loanInterest)} />
                  <MetricRow label="Налог на прибыль" value={money(-pnl.tax)} />
                  <MetricRow
                    label="Чистая прибыль"
                    value={money(pnl.netProfit)}
                    tone={pnl.netProfit >= 0 ? 'good' : 'bad'}
                    hint="netProfit"
                  />
                </div>
              </div>
            ) : (
              <EmptyState text="P&L появится после первой закрытой недели" />
            )}
          </SectionCard>
        </TabsContent>

        {/* ============ Cash Flow ============ */}
        <TabsContent value="cash" className="mt-3">
          <SectionCard
            title={cash ? `Денежный поток — неделя ${cash.week}` : 'Денежный поток'}
            icon={Waves}
          >
            {cash ? (
              <div className="max-w-xl">
                <MetricRow label="Деньги на начало недели" value={money(cash.cashStart)} />
                <FlowRow label="Продажи (поступления)" value={cash.netCashFromSales} direction="in" />
                <FlowRow label="Закупка продуктов" value={-cash.purchases} direction="out" />
                <FlowRow label="Зарплата выплачена" value={-cash.payrollPaid} direction="out" />
                <FlowRow label="Взносы выплачены" value={-cash.socialPaid} direction="out" />
                <FlowRow label="Аренда оплачена" value={-cash.rentPaid} direction="out" big={cash.rentPaid >= 500_000} />
                <FlowRow label="Коммунальные оплачены" value={-cash.utilitiesPaid} direction="out" />
                <FlowRow label="Маркетинг оплачен" value={-cash.marketingPaid} direction="out" />
                <FlowRow label="Обслуживание оплачено" value={-cash.maintenancePaid} direction="out" />
                <FlowRow label="Ремонты оплачены" value={-cash.repairsPaid} direction="out" />
                <FlowRow label="Налоги оплачены" value={-cash.taxesPaid} direction="out" />
                <FlowRow label="Платежи по кредитам" value={-cash.loanPayments} direction="out" big={cash.loanPayments >= 500_000} />
                <FlowRow label="Штрафы" value={-cash.finesPaid} direction="out" />
                <FlowRow label="Лицензии" value={-cash.licensePaid} direction="out" big={cash.licensePaid >= 500_000} />
                <FlowRow label="Оборудование" value={-cash.equipmentPaid} direction="out" big={cash.equipmentPaid >= 500_000} />
                <FlowRow label="Кредиты получены" value={cash.loanDisbursements} direction="in" big={cash.loanDisbursements >= 500_000} />
                <FlowRow label="Взносы владельца" value={cash.ownerContributions} direction="in" />
                {cash.dividendsPaid > 0 && (
                  <FlowRow label="Дивиденды владельцу" value={-cash.dividendsPaid} direction="out" big={cash.dividendsPaid >= 500_000} />
                )}
                <FlowRow label="Доходы от событий" value={cash.eventIncome} direction="in" />
                <EmphasizedRow
                  label="Деньги на конец недели"
                  value={money(cash.cashEnd)}
                  tone={cash.cashEnd >= 1_000_000 ? 'amber' : 'red'}
                />
                <p className="text-xs text-stone-400 mt-3">
                  Крупные платежи (от 500 тыс ₽) выделены — планируйте запас денег под них заранее.
                </p>
              </div>
            ) : (
              <EmptyState text="Cash Flow появится после первой закрытой недели" />
            )}
          </SectionCard>
        </TabsContent>

        {/* ============ Транзакции ============ */}
        <TabsContent value="tx" className="mt-3">
          <SectionCard title="Журнал транзакций (последние 60)" icon={ListOrdered}>
            {transactions.length === 0 ? (
              <EmptyState text="Транзакций ещё нет — запустите день симуляции" />
            ) : (
              <ScrollArea className="max-h-[420px] pr-3">
                <div className="space-y-0.5">
                  {transactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* ===== ВЛАДЕЛЕЦ И АРЕНДА (БАЛ-v2 §6/§13, v8) ===== */}
      <OwnerLandlordSection />

      <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-600">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" aria-hidden />
        <p>
          Три контура учёта: <b className="text-stone-800">P&L</b> показывает рентабельность,{' '}
          <b className="text-stone-800">Cash Flow</b> — реальные деньги,{' '}
          <b className="text-stone-800">Транзакции</b> — каждая операция по кассе. Ресторан может быть
          прибыльным и одновременно терять деньги на счёте.
        </p>
      </div>
        </div>
      </div>
    </div>
  );
}

/** Секция «Владелец и аренда» (БАЛ-v2 §6/§13, v8): доверие владельца,
 *  история дивидендов, отношения с арендодателем и прогноз индексации. */
function OwnerLandlordSection() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const trust = restaurant.finance.ownerTrust ?? 60;
  const dividends = restaurant.finance.dividends;
  const landlord = restaurant.landlord;
  const rentInfo = rentIndexationInfo(restaurant, state.week);
  const proposal = dividends?.lastProposal;
  const lastDividend = dividends?.history[dividends.history.length - 1];

  const trustTone =
    trust >= 70 ? 'text-emerald-700' : trust >= 35 ? 'text-amber-700' : 'text-red-700';
  const trustBar = trust >= 70 ? 'bg-emerald-500' : trust >= 35 ? 'bg-amber-500' : 'bg-red-500';
  const relationTone =
    (landlord?.relation ?? 60) >= 70
      ? 'text-emerald-700'
      : (landlord?.relation ?? 60) >= 40
        ? 'text-amber-700'
        : 'text-red-700';

  return (
    <SectionCard title="Владелец и аренда" icon={Handshake}>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Доверие владельца + дивиденды */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-medium text-stone-700">Доверие владельца</span>
            <span className={cn('text-sm font-bold tabular-nums', trustTone)}>{Math.round(trust)}/100</span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-stone-100 overflow-hidden"
            role="progressbar"
            aria-label="Доверие владельца"
            aria-valuenow={Math.round(trust)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={cn('h-full rounded-full transition-all', trustBar)} style={{ width: `${Math.min(100, trust)}%` }} />
          </div>
          <p className="text-[10px] text-stone-400 mt-1">
            ≥70 — владелец поддерживает проект · &lt;35 — «разговор» · &lt;15 — финал «Управленца сменили»
          </p>

          <div className="mt-3 space-y-2">
            {proposal && proposal.proposed > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <p className="font-semibold">Активное предложение дивидендов (кв. {proposal.quarter})</p>
                <p className="mt-0.5 tabular-nums">
                  FCF квартала {proposal.fcf.toLocaleString('ru-RU')} ₽ · предложено{' '}
                  {proposal.proposed.toLocaleString('ru-RU')} ₽ — решение ждёт в событиях.
                </p>
              </div>
            ) : lastDividend ? (
              <div className="rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600">
                <p className="font-semibold text-stone-700">Последняя выплата (кв. {lastDividend.quarter})</p>
                <p className="mt-0.5 tabular-nums">
                  {lastDividend.paid.toLocaleString('ru-RU')} ₽ из {lastDividend.proposed.toLocaleString('ru-RU')} ₽ · доверие{' '}
                  {lastDividend.trustDelta >= 0 ? '+' : ''}
                  {lastDividend.trustDelta}
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600">
                <p className="font-semibold text-stone-700">Дивиденды: предложений ещё не было</p>
                <p className="mt-0.5">Первое предложение — на закрытии 1-го квартала (нед 12).</p>
              </div>
            )}
            {dividends && dividends.history.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {dividends.history.map((h, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className={cn(
                      'text-[10px] tabular-nums',
                      h.trustDelta >= 0
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-red-100 text-red-800 hover:bg-red-100',
                    )}
                  >
                    кв{h.quarter}: {h.trustDelta >= 0 ? '+' : ''}
                    {h.trustDelta}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Арендодатель */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-medium text-stone-700">Отношения с арендодателем</span>
            <span className={cn('text-sm font-bold tabular-nums', relationTone)}>
              {Math.round(landlord?.relation ?? 60)}/100
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-stone-100 overflow-hidden"
            role="progressbar"
            aria-label="Отношения с арендодателем"
            aria-valuenow={Math.round(landlord?.relation ?? 60)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all',
                (landlord?.relation ?? 60) >= 70 ? 'bg-emerald-500' : (landlord?.relation ?? 60) >= 40 ? 'bg-amber-500' : 'bg-red-500',
              )}
              style={{ width: `${Math.min(100, landlord?.relation ?? 60)}%` }}
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-1">
            ≥80 снижает квартальную индексацию аренды (−0,5 п.п.)
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-stone-50 p-2.5">
              <p className="text-stone-500">База договора</p>
              <p className="font-bold tabular-nums text-stone-800">{moneyShort(rentInfo.base)}</p>
            </div>
            <div className="rounded-lg bg-stone-50 p-2.5">
              <p className="text-stone-500">Сейчас (инд. {rentInfo.quarters} кв.)</p>
              <p className="font-bold tabular-nums text-stone-800">{moneyShort(rentInfo.current)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
            <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-stone-400" aria-hidden />
            <p>
              {landlord && landlord.nextTalkWeek > 0
                ? landlord.nextTalkWeek > state.week
                  ? `Следующий разговор о ставке — не раньше недели ${landlord.nextTalkWeek}.`
                  : 'Разговор о пересмотре ставки ожидается на закрытии этой недели.'
                : landlord?.nextTalkWeek === 0
                  ? 'Диалог с арендодателем открыт — решите событие.'
                  : landlord
                    ? `Отказов подряд: ${landlord.refusals}${landlord.refusals >= 2 ? ' — ждите ультиматум' : ' — при втором последует ультиматум'}`
                    : 'Договор без пересмотра.'}
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/** Строка транзакции. */
function TransactionRow({ tx }: { tx: FinancialTransaction }) {
  const isIn = tx.direction === 'in';
  return (
    <div className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
      <div
        className={cn(
          'rounded-lg p-2 shrink-0',
          isIn ? 'bg-emerald-50' : 'bg-red-50',
        )}
        aria-hidden
      >
        {isIn ? (
          <ArrowDownLeft className="h-4 w-4 text-emerald-700" />
        ) : (
          <ArrowUpRight className="h-4 w-4 text-red-700" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-800 truncate">{tx.description}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="secondary" className="bg-stone-100 text-stone-600 text-[10px]">
            Нед {tx.date.week} · День {tx.date.day + 1}
          </Badge>
          <span className="text-[10px] text-stone-400">{TX_LABELS[tx.type]}</span>
        </div>
      </div>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums shrink-0',
          isIn ? 'text-emerald-700' : 'text-red-700',
        )}
      >
        {isIn ? '+' : '−'}
        {money(tx.amount)}
      </span>
    </div>
  );
}

/** Строка денежного потока: приход/расход с выделением крупных. */
function FlowRow({
  label,
  value,
  direction,
  big,
}: {
  label: string;
  value: number;
  direction: 'in' | 'out';
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-stone-100 last:border-0">
      <span className={cn('text-sm text-stone-600', big && 'font-semibold text-stone-800')}>
        {label}
      </span>
      <span
        className={cn(
          'text-sm tabular-nums',
          direction === 'in' ? 'text-emerald-700' : 'text-red-700',
          big && 'font-bold',
        )}
      >
        {value >= 0 ? '+' : ''}
        {money(value)}
      </span>
    </div>
  );
}

/** Акцентная строка (EBITDA / итог). */
function EmphasizedRow({
  label,
  value,
  tone = 'amber',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'amber' | 'red';
  hint?: string;
}) {
  return (
    <div
      className={cn(
        'my-1.5 flex items-baseline justify-between rounded-lg border px-2.5 py-2',
        tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50',
      )}
    >
      <span className="text-sm font-bold text-stone-800 flex items-center gap-1">
        {label}
        {hint && <InfoHint hint={hint} />}
      </span>
      <span
        className={cn(
          'text-sm font-bold tabular-nums',
          tone === 'amber' ? 'text-amber-800' : 'text-red-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}
