/**
 * Экран «Финансы» (ТЗ §25/§18): P&L (начисление), Cash Flow (движение денег),
 * журнал транзакций. Обучающий принцип: прибыль ≠ деньги на счёте.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { foodIndex, utilIndex, isLegacy } from '@/lib/game/config/balance2.config';
import { rentIndexationInfo } from '@/lib/game/engine/landlord';
import { SectionCard, KpiCard, MetricRow, EmptyState, WarningBanner, money, moneyShort, pct } from '../widgets';
import { InfoHint } from '../hints';
import { CsvReportTools } from '../CsvReportTools';
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
} from 'lucide-react';
import type { FinancialTransaction, TransactionType } from '@/lib/game/types';

const TX_LABELS: Record<TransactionType, string> = {
  sale: 'Продажи',
  purchase: 'Закупка',
  emergency: 'Экстренные меры',
  payroll: 'Зарплата',
  overtime: 'Сверхурочные',
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
  dividend: 'Дивиденды',
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

  // v2 §10: инфляционная эрозия — «закупки дорожают, чек стоит» (подсказка дисциплины).
  const foodInflPct = isLegacy() ? 0 : Math.round((foodIndex(state.week, state.difficultyId) - 1) * 1000) / 10;
  const utilInflPct = isLegacy() ? 0 : Math.round((utilIndex(state.week, state.difficultyId) - 1) * 1000) / 10;
  const rentInfo = rentIndexationInfo(restaurant, state.week);
  const rentGrowthPct = rentInfo.base > 0 ? Math.round(((rentInfo.current / rentInfo.base) - 1) * 1000) / 10 : 0;
  const rentBaseK = Math.round(rentInfo.base / 1000);
  const rentCurK = Math.round(rentInfo.current / 1000);
  const rentQuarters = rentInfo.quarters;
  // Сколько недель средний чек не растёт (±1% от текущего = «на месте»).
  const weeksFlatCheck = useMemo(() => {
    const ws = state.history.weekStats;
    if (ws.length < 2) return 0;
    const last = ws[ws.length - 1];
    if (last.avgCheck <= 0) return 0;
    let n = 0;
    for (let i = ws.length - 2; i >= 0; i--) {
      if (Math.abs(ws[i].avgCheck - last.avgCheck) <= last.avgCheck * 0.01) n++;
      else break;
    }
    return n + 1;
  }, [state.history.weekStats]);
  const inflationWarnings = useMemo(() => {
    const out: string[] = [];
    if (foodInflPct >= 2 && weeksFlatCheck >= 8) {
      out.push(`Закупки подорожали на +${foodInflPct}% с открытия, а средний чек не растёт уже ${weeksFlatCheck} нед — маржа тает. Переоцените меню (экран «Меню»); никто не сделает это за вас.`);
    } else if (foodInflPct >= 2) {
      out.push(`Инфляция закупок с открытия: +${foodInflPct}%. Цены в меню не индексируются автоматически — следите за Food Cost.`);
    }
    if (rentGrowthPct >= 5) {
      out.push(`Аренда выросла на +${rentGrowthPct}% с открытия (${rentBaseK} → ${rentCurK} тыс ₽/мес). Индексация — часть договора; договоритесь с арендодателем или сокращайте другие расходы.`);
    }
    return out;
  }, [foodInflPct, rentGrowthPct, rentBaseK, rentCurK, weeksFlatCheck]);

  return (
    <div className="space-y-4">
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
          ...inflationWarnings,
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
                  {(pnl.overtime ?? 0) > 0 && (
                    <MetricRow
                      label="Сверхурочные (×1,5)"
                      value={money(-pnl.overtime!)}
                      tone="bad"
                      hint="overtime"
                    />
                  )}
                  <MetricRow label="Соц. взносы (30%)" value={money(-pnl.socialContributions)} hint="laborCost" />
                  <MetricRow
                    label="Аренда (начислено)"
                    value={money(-pnl.rentAccrued)}
                    hint={`Договор индексируется: база ${rentBaseK} тыс ₽/мес → сейчас ${rentCurK} тыс (+${rentGrowthPct}% за ${rentQuarters} кв.). Шаги даёт арендодатель — событие «пересмотр договора»; хорошие отношения (80+) смягчают индексацию.`}
                  />
                  <MetricRow
                    label="Коммунальные (начислено)"
                    value={money(-pnl.utilitiesAccrued)}
                    hint={`Сезонный множитель (зима ×1,25 / лето ×1,15) + инфляция +${utilInflPct}% с открытия.`}
                  />
                  <MetricRow label="Маркетинг" value={money(-pnl.marketing)} />
                  <MetricRow label="Обслуживание" value={money(-pnl.maintenance)} />
                  <MetricRow label="Ремонты" value={money(-pnl.repairs)} />
                  <MetricRow label="Амортизация" value={money(-pnl.depreciation)} />
                  <MetricRow label="Амортизация лицензии" value={money(-pnl.licenseAmortization)} />
                  <MetricRow label="Прочее" value={money(-pnl.otherOperating)} />
                  <MetricRow
                    label="Проценты по кредитам"
                    value={money(-pnl.loanInterest)}
                    hint="Начисление rate/48 за неделю: платежи идут каждые 4 недели по ставке/12 (13 «месяцев» в году) — P&L и касса совпадают."
                  />
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
                {(cash.overtimePaid ?? 0) > 0 && (
                  <FlowRow label="Сверхурочные" value={-(cash.overtimePaid ?? 0)} direction="out" />
                )}
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
                {(cash.dividendsPaid ?? 0) > 0 && (
                  <FlowRow label="Дивиденды владельцу" value={-(cash.dividendsPaid ?? 0)} direction="out" big={true} />
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
