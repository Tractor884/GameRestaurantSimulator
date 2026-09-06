/**
 * Главный экран ресторана (ТЗ §31.1–31.3): виджеты KPI, отчёт последнего дня,
 * почасовая динамика, предупреждения, мини-BSC.
 */
'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGame } from '@/lib/game/store/gameStore';
import { KpiCard, SectionCard, WarningBanner, ScoreBar, RangeBadge, money, moneyShort, EmptyState } from '../widgets';
import { InfoHint } from '../hints';
import { DISHES_MAP } from '@/lib/game/content/dishes';
import { DAYS_RU } from '@/lib/game/engine';
import { HallScene } from '../HallScene';
import {
  Users,
  Banknote,
  Receipt,
  Star,
  ChefHat,
  Percent,
  Gauge,
  TrendingUp,
  Hourglass,
  DoorOpen,
  MapPin,
} from 'lucide-react';

export function RestaurantScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const lastDay = state.lastDayResult;
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];
  const prevWeek = state.history.weekStats[state.history.weekStats.length - 2];
  const weekResult = state.weekResult;

  const hourData = useMemo(
    () =>
      (lastDay?.hourLogs ?? []).map((h) => ({
        hour: `${h.hour}:00`,
        revenue: Math.round(h.revenue),
        seated: h.seated,
        demand: h.demand,
      })),
    [lastDay],
  );

  const revenueTrend =
    lastWeek && prevWeek && prevWeek.revenue > 0 ? lastWeek.revenue / prevWeek.revenue - 1 : undefined;

  const topDishes = lastDay?.kpi.dishesTop.slice(0, 5) ?? [];
  const dayWarnings = lastDay?.warnings ?? [];

  const dayLabel = lastDay ? `Неделя ${lastDay.date.week}, ${DAYS_RU[lastDay.date.day]}` : '';

  return (
    <div className="space-y-4">
      {/* Виджеты (ТЗ §31.3) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={Banknote} label="Деньги" value={moneyShort(restaurant.finance.cash)} sub="на счёте" hint="cash" tone={restaurant.finance.cash > 1_000_000 ? 'good' : 'bad'} />
        <KpiCard
          icon={Receipt}
          label="Выручка (нед)"
          value={lastWeek ? moneyShort(lastWeek.revenue) : '—'}
          sub={lastWeek ? `чек ${lastWeek.avgCheck.toLocaleString('ru-RU')} ₽` : 'нет данных'}
          trend={revenueTrend}
          hint="revenue"
        />
        <KpiCard
          icon={Users}
          label="Гости (нед)"
          value={lastWeek ? lastWeek.guests.toLocaleString('ru-RU') : '—'}
          sub={lastWeek ? `${Math.round(lastWeek.guests / 7)}/день` : ''}
          hint="guests"
        />
        <KpiCard
          icon={Percent}
          label="Food Cost"
          value={lastWeek ? `${(lastWeek.foodCost * 100).toFixed(1)}%` : '—'}
          sub="цель 30–34%"
          hint="foodCost"
          tone={lastWeek && lastWeek.foodCost > 0.36 ? 'bad' : lastWeek && lastWeek.foodCost < 0.34 ? 'good' : 'warn'}
        />
        <KpiCard
          icon={ChefHat}
          label="Labor Cost"
          value={lastWeek ? `${(lastWeek.laborCost * 100).toFixed(1)}%` : '—'}
          sub="цель 25–32%"
          hint="laborCost"
          tone={lastWeek && lastWeek.laborCost > 0.34 ? 'bad' : lastWeek && lastWeek.laborCost < 0.32 ? 'good' : 'warn'}
        />
        <KpiCard
          icon={Star}
          label="Рейтинг"
          value={restaurant.reputation.rating.toFixed(2)}
          sub={`${restaurant.reputation.windowReviews.length} отзывов`}
          hint="rating"
          tone={restaurant.reputation.rating >= 4.2 ? 'good' : restaurant.reputation.rating >= 3.8 ? 'warn' : 'bad'}
        />
      </div>

      {dayWarnings.length > 0 && <WarningBanner warnings={dayWarnings} />}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Отчёт последнего дня + SVG-сцена зала (ТЗ §31.1) — табы */}
        <div className="lg:col-span-2">
        <Tabs defaultValue="report">
          <TabsList className="mb-3">
            <TabsTrigger value="report" className="gap-1.5">
              <DoorOpen className="h-3.5 w-3.5" aria-hidden />
              {lastDay ? `День: ${dayLabel}` : 'Отчёт дня'}
            </TabsTrigger>
            <TabsTrigger value="hall" className="gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Зал ресторана
            </TabsTrigger>
          </TabsList>
          <TabsContent value="hall">
            <SectionCard title="Зал ресторана — план на день" icon={MapPin}>
              <HallScene />
            </SectionCard>
          </TabsContent>
          <TabsContent value="report">
          <SectionCard
            title={lastDay ? `День: ${dayLabel}` : 'Отчёт дня'}
            icon={DoorOpen}
          >
          {lastDay ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Гостей" value={lastDay.kpi.guests.toLocaleString('ru-RU')} />
                <Stat label="Выручка" value={money(lastDay.kpi.revenue)} />
                <Stat label="Средний чек" value={`${lastDay.kpi.avgCheck.toLocaleString('ru-RU')} ₽`} />
                <Stat
                  label="Удовлетв."
                  value={`${lastDay.kpi.satisfaction}/100`}
                  tone={lastDay.kpi.satisfaction >= 75 ? 'good' : lastDay.kpi.satisfaction >= 60 ? 'warn' : 'bad'}
                  hint="satisfaction"
                />
                <Stat label="Потеряно в очереди" value={lastDay.kpi.lostGuests.toString()} tone={lastDay.kpi.lostGuests > 10 ? 'bad' : 'neutral'} hint="lostGuests" />
                <Stat label="Позиций продано" value={lastDay.kpi.ordersCount.toLocaleString('ru-RU')} />
                <Stat label="COGS" value={money(lastDay.kpi.cogs)} hint="foodCost" />
                <Stat label="Порча" value={money(lastDay.kpi.wasteCost)} tone={lastDay.kpi.wasteCost > 20_000 ? 'bad' : 'neutral'} hint="waste" />
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#78716c' }} interval={1} />
                    <YAxis tick={{ fontSize: 10, fill: '#78716c' }} tickFormatter={(v: number) => `${Math.round(v / 1000)}к`} />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === 'revenue' ? [money(value), 'Выручка'] : [value, 'Посажено']
                      }
                      contentStyle={{ borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#d97706" strokeWidth={2} fill="url(#revGradient)" />
                    <ReferenceLine y={0} stroke="#e7e5e4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {topDishes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Топ-5 блюд дня</p>
                  <div className="space-y-1">
                    {topDishes.map((d) => (
                      <div key={d.dishId} className="flex items-center justify-between text-sm py-1 border-b border-stone-100 last:border-0">
                        <span className="text-stone-700 truncate">{DISHES_MAP[d.dishId]?.name ?? d.dishId}</span>
                        <span className="tabular-nums font-semibold text-stone-800">×{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState text="Нажмите «День» или «Неделя», чтобы запустить симуляцию" />
          )}
          </SectionCard>
          </TabsContent>
        </Tabs>
        </div>

        {/* Правая колонка: BSC + прогноз */}
        <div className="space-y-4">
          <SectionCard title="BSC" icon={Gauge}>
            {weekResult ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold tabular-nums text-stone-900">{weekResult.bsc.total}</span>
                  <span className="text-xs text-stone-500">из 100</span>
                </div>
                <ScoreBar label="Финансы (30%)" value={weekResult.bsc.finance} hint="ebitda" />
                <ScoreBar label="Клиенты (25%)" value={weekResult.bsc.client} hint="rating" />
                <ScoreBar label="Процессы (25%)" value={weekResult.bsc.process} hint="foodCost" />
                <ScoreBar label="Персонал (20%)" value={weekResult.bsc.staff} hint="fatigue" />
              </div>
            ) : (
              <EmptyState text="BSC появится после первой недели" />
            )}
          </SectionCard>

          <SectionCard title="Прогноз на 4 недели" icon={TrendingUp} right={<InfoHint hint="forecast" />}>
            {weekResult && weekResult.forecast.length > 0 ? (
              <div className="space-y-2">
                {weekResult.forecast.map((f) => (
                  <div key={f.week} className="flex items-center justify-between text-sm">
                    <span className="text-stone-600">Нед {f.week}</span>
                    <div className="flex items-center gap-2">
                      <RangeBadge value={Math.round(f.riskAdjustedCashEnd / 1000)} min={0} max={Math.round(f.riskAdjustedCashEnd / 1000)} />
                      <span
                        className={
                          f.riskAdjustedCashEnd < 0
                            ? 'text-red-700 font-semibold tabular-nums'
                            : 'text-stone-800 font-semibold tabular-nums'
                        }
                        title={`Базовый: ${money(f.expectedCashEnd)} · Минимум: ${money(f.minSafeCashEnd)}`}
                      >
                        {moneyShort(f.riskAdjustedCashEnd)}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-stone-400 mt-1">
                  С учётом рисков (выручка −15%, расходы +12%). Наведите для базового сценария.
                </p>
              </div>
            ) : (
              <EmptyState text="Прогноз после первой недели" />
            )}
          </SectionCard>

          <SectionCard title="Загрузка смены" icon={Hourglass}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-600">Стоп-лист</span>
                <span className="font-semibold tabular-nums text-stone-800">{restaurant.menu.stopList.length} блюд</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Чистота</span>
                <span className="font-semibold tabular-nums text-stone-800">{restaurant.cleanliness.toFixed(0)}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Климат/атмосфера</span>
                <span className="font-semibold tabular-nums text-stone-800">{restaurant.atmosphere.toFixed(0)}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Веранда</span>
                <span className="font-semibold text-stone-800">
                  {restaurant.verandaActive ? `+${restaurant.verandaSeats} мест` : 'нет'}
                </span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' | 'neutral'; hint?: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-2.5">
      <p className="text-xs text-stone-500 flex items-center gap-1">
        <span className="truncate">{label}</span>
        {hint && <InfoHint hint={hint} />}
      </p>
      <p
        className={
          tone === 'good'
            ? 'font-bold tabular-nums text-emerald-700'
            : tone === 'bad'
              ? 'font-bold tabular-nums text-red-700'
              : tone === 'warn'
                ? 'font-bold tabular-nums text-amber-700'
                : 'font-bold tabular-nums text-stone-800'
        }
      >
        {value}
      </p>
    </div>
  );
}
