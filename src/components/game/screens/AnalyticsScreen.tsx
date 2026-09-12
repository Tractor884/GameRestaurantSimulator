/**
 * Экран «Аналитика» (ТЗ §30): динамика выручки/прибыли по неделям,
 * FoodCost/LaborCost, BSC, таблица недель, ключевые KPI.
 */
'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, EmptyState, money, moneyShort, pct } from '../widgets';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CsvReportTools } from '../CsvReportTools';
import { Receipt, Users, TrendingUp, BarChart3, Gauge, Percent } from 'lucide-react';

const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 } as const;

export function AnalyticsScreen() {
  const state = useGame((s) => s.state)!;
  const weekStats = state.history.weekStats;

  // Агрегации по weekStats (reduce) — useMemo (рекомендация №7): weekStats
  // иммутабелен по ссылке после закрытия недели, пересчёт только при смене.
  const { avgCheck, avgRating, avgReturning } = useMemo(() => {
    const retRecent = weekStats.slice(-4);
    return {
      avgCheck: weekStats.length > 0 ? weekStats.reduce((s, w) => s + w.avgCheck, 0) / weekStats.length : 0,
      avgRating: weekStats.length > 0 ? weekStats.reduce((s, w) => s + w.rating, 0) / weekStats.length : 0,
      // АУДИТ №13: явная метрика доли возвратных гостей (зрелый ресторан 15–30%).
      avgReturning: retRecent.length > 0 ? retRecent.reduce((s, w) => s + w.returningShare, 0) / retRecent.length : 0,
    };
  }, [weekStats]);

  const lineData = useMemo(
    () =>
      weekStats.map((w) => ({
        week: w.week,
        revenue: Math.round(w.revenue),
        netProfit: Math.round(w.netProfit),
      })),
    [weekStats],
  );

  const barData = useMemo(
    () =>
      weekStats.map((w) => ({
        week: w.week,
        foodCost: Math.round(w.foodCost * 1000) / 10,
        laborCost: Math.round(w.laborCost * 1000) / 10,
      })),
    [weekStats],
  );

  const bscData = useMemo(() => weekStats.map((w) => ({ week: w.week, bsc: w.bsc })), [weekStats]);

  // ВСЕ недели — в прокрутке; высота зоны рассчитана на ~10 строк.
  const allWeeks = useMemo(() => [...weekStats].reverse(), [weekStats]);

  if (weekStats.length < 2) {
    return (
      <div className="space-y-4">
        <SectionCard title="Аналитика по неделям" icon={BarChart3}>
          <EmptyState text="Нужно минимум 2 закрытые недели — нажмите «Неделя» в верхней панели" />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Receipt}
          label="Средний чек"
          value={`${Math.round(avgCheck).toLocaleString('ru-RU')} ₽`}
          sub="цель 3500–4000 ₽"
          hint="avgCheck"
          tone={avgCheck >= 3500 ? 'good' : 'warn'}
        />
        <KpiCard
          icon={Users}
          label="Возвратные гости"
          value={pct(avgReturning, 0)}
          sub="доля трафика, 4 нед · норма 15–30%"
          hint="returningShare"
          tone={avgReturning >= 0.15 && avgReturning <= 0.35 ? 'good' : avgReturning < 0.15 ? 'warn' : 'warn'}
        />
        <KpiCard
          icon={Users}
          label="Средний рейтинг"
          value={avgRating.toFixed(2)}
          sub="по закрытым неделям"
          hint="rating"
          tone={avgRating >= 4.2 ? 'good' : avgRating >= 4.0 ? 'warn' : 'bad'}
        />
        <KpiCard
          icon={TrendingUp}
          label="Итоговая прибыль"
          value={moneyShort(state.history.cumulativeNetProfit)}
          sub={`недель закрыто: ${weekStats.length}`}
          hint="netProfit"
          tone={state.history.cumulativeNetProfit >= 0 ? 'good' : 'bad'}
        />
      </div>

      {/* Выручка и прибыль */}
      <SectionCard title="Выручка и чистая прибыль" icon={TrendingUp}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#78716c' }} tickFormatter={(v: number) => `${v}`} />
              <YAxis
                yAxisId="rev"
                tick={{ fontSize: 10, fill: '#78716c' }}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}к`}
              />
              <YAxis
                yAxisId="profit"
                orientation="right"
                tick={{ fontSize: 10, fill: '#78716c' }}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}к`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number, name: string) =>
                  name === 'revenue' ? [money(value), 'Выручка'] : [money(value), 'Чистая прибыль']
                }
                labelFormatter={(label: number) => `Неделя ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="rev"
                type="monotone"
                dataKey="revenue"
                name="revenue"
                stroke="#d97706"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="profit"
                type="monotone"
                dataKey="netProfit"
                name="netProfit"
                stroke="#059669"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* FoodCost / LaborCost */}
      <SectionCard title="Структура затрат: Food Cost и Labor Cost" icon={Percent}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#78716c' }} />
              <YAxis domain={[0, 60]} tick={{ fontSize: 10, fill: '#78716c' }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)}%`,
                  name === 'foodCost' ? 'Food Cost' : 'Labor Cost',
                ]}
                labelFormatter={(label: number) => `Неделя ${label}`}
              />
              <Legend
                formatter={(value: string) => (value === 'foodCost' ? 'Food Cost' : 'Labor Cost')}
                wrapperStyle={{ fontSize: 12 }}
              />
              <ReferenceLine y={34} stroke="#d97706" strokeDasharray="4 4" label={{ value: 'FC 34%', fontSize: 10, fill: '#d97706', position: 'insideTopRight' }} />
              <ReferenceLine y={32} stroke="#78716c" strokeDasharray="4 4" label={{ value: 'LC 32%', fontSize: 10, fill: '#78716c', position: 'insideBottomRight' }} />
              <Bar dataKey="foodCost" fill="#d97706" radius={[3, 3, 0, 0]} />
              <Bar dataKey="laborCost" fill="#a8a29e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Пунктир — целевые границы: Food Cost до 34%, Labor Cost до 32% (с соц. взносами).
        </p>
      </SectionCard>

      {/* BSC */}
      <SectionCard title="Сбалансированная система показателей (BSC)" icon={Gauge}>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={bscData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#78716c' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [`${value.toFixed(0)} / 100`, 'BSC']}
                labelFormatter={(label: number) => `Неделя ${label}`}
              />
              <ReferenceLine y={70} stroke="#059669" strokeDasharray="4 4" label={{ value: 'хороший уровень 70', fontSize: 10, fill: '#059669', position: 'insideTopLeft' }} />
              <Line type="monotone" dataKey="bsc" stroke="#d97706" strokeWidth={2.5} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Таблица недель: ~10 последних видны, остальные — прокруткой */}
      <SectionCard
        title="Таблица недель"
        icon={BarChart3}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 whitespace-nowrap">
              всего {weekStats.length}{allWeeks.length > 10 ? ' · видно 10, остальные ниже' : ''}
            </span>
            <CsvReportTools />
          </div>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-stone-100">
          <ScrollArea className="h-[436px]">
            <Table className="min-w-[720px]">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead className="text-xs h-9">Нед</TableHead>
                  <TableHead className="text-xs text-right h-9">Гости</TableHead>
                  <TableHead className="text-xs text-right h-9">Чек, ₽</TableHead>
                  <TableHead className="text-xs text-right h-9">Выручка</TableHead>
                  <TableHead className="text-xs text-right h-9">FC%</TableHead>
                  <TableHead className="text-xs text-right h-9">LC%</TableHead>
                  <TableHead className="text-xs text-right h-9">Прибыль</TableHead>
                  <TableHead className="text-xs text-right h-9">Рейтинг</TableHead>
                  <TableHead className="text-xs text-right h-9">Возвр.</TableHead>
                  <TableHead className="text-xs text-right h-9">BSC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allWeeks.map((w) => (
                  <TableRow key={w.week} className="text-xs whitespace-nowrap">
                    <TableCell className="font-medium tabular-nums">{w.week}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.guests.toLocaleString('ru-RU')}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(w.avgCheck).toLocaleString('ru-RU')}</TableCell>
                    <TableCell className="text-right tabular-nums">{moneyShort(w.revenue)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'tabular-nums font-semibold',
                          w.foodCost <= 0.34 ? 'text-emerald-700' : w.foodCost <= 0.38 ? 'text-amber-700' : 'text-red-700',
                        )}
                      >
                        {pct(w.foodCost, 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'tabular-nums font-semibold',
                          w.laborCost <= 0.32 ? 'text-emerald-700' : w.laborCost <= 0.36 ? 'text-amber-700' : 'text-red-700',
                        )}
                      >
                        {pct(w.laborCost, 0)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-semibold',
                        w.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700',
                      )}
                    >
                      {moneyShort(w.netProfit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{w.rating.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(w.returningShare, 0)}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'tabular-nums',
                          w.bsc >= 70
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                            : w.bsc >= 45
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                              : 'bg-red-100 text-red-800 hover:bg-red-100',
                        )}
                      >
                        {w.bsc.toFixed(0)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Новые недели сверху; в блоке видно ~10 строк — остальные доступны прокруткой.
        </p>
      </SectionCard>
    </div>
  );
}
