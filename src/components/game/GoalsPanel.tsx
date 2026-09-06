/**
 * ПАНЕЛЬ «ЦЕЛИ ГОДА» (ТЗ §37.3 + §36): прогресс по 5 условиям победы
 * ТЕКУЩЕЙ сложности. Помещается в правую колонку главного экрана.
 *
 * Зачем: до панели игрок узнавал планки победы только на экране
 * «Квартальный разбор» мелким текстом. Теперь прогресс виден каждый
 * день: рейтинг, накопленная прибыль, касса, BSC квартала и серия
 * положительных недель — с подсветкой выполненного.
 *
 * Расчёт прогресса: value/target, кап 100% (перевыполнение не растягивает
 * бар). BSC квартала — среднее последних 12 закрытых недель (как в
 * weekclose.ts при финале). «Позитивные недели» — подряд с конца
 * (историческая серия), цель сложности — 6/8/10.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { difficultyWin, difficultyOf } from '@/lib/game/config/difficulty.config';
import { SectionCard } from './widgets';
import { InfoHint } from './hints';
import { cn } from '@/lib/utils';
import { Trophy, CheckCircle2, Circle } from 'lucide-react';

interface GoalRow {
  key: string;
  label: string;
  value: string;
  target: string;
  progress: number; // 0..1, кап на 1
  done: boolean;
}

/** Серия положительных операционных недель ПОДРЯД с конца (как считает финал). */
function positiveStreak(state: ReturnType<typeof useGame.getState>['state']): number {
  if (!state) return 0;
  const weeks = state.history.weekStats;
  let streak = 0;
  // Финал в weekclose считает positiveOpWeeks (когда-то накопительно);
  // здесь показываем живую серию с конца — она честнее для «подряд».
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].netProfit > 0) streak++;
    else break;
  }
  return streak;
}

export function GoalsPanel() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;

  // Дешёвый пересчёт при рендере (пара reduce) — useMemo не нужен.
    const win = difficultyWin(state.difficultyId);
    const lastQuarter = state.history.weekStats.slice(-12);
    const bscAvg = lastQuarter.length
      ? lastQuarter.reduce((s, w) => s + w.bsc, 0) / lastQuarter.length
      : 0;
    const short = (v: number) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10} млн` : `${Math.round(v / 1000)} тыс`);
    const rows: GoalRow[] = [
      {
        key: 'rating',
        label: 'Рейтинг',
        value: restaurant.reputation.rating.toFixed(2),
        target: `≥ ${win.minRating}`,
        progress: restaurant.reputation.rating / win.minRating,
        done: restaurant.reputation.rating >= win.minRating,
      },
      {
        key: 'profit',
        label: 'Накопленная прибыль',
        value: short(state.history.cumulativeNetProfit),
        target: `≥ ${short(win.minCumulativeProfit)} ₽`,
        progress: state.history.cumulativeNetProfit / win.minCumulativeProfit,
        done: state.history.cumulativeNetProfit >= win.minCumulativeProfit,
      },
      {
        key: 'cash',
        label: 'Касса',
        value: short(restaurant.finance.cash),
        target: `≥ ${short(win.minCash)} ₽`,
        progress: restaurant.finance.cash / win.minCash,
        done: restaurant.finance.cash >= win.minCash,
      },
      {
        key: 'bsc',
        label: 'BSC квартала',
        value: lastQuarter.length ? bscAvg.toFixed(0) : '—',
        target: `≥ ${win.minBscAvgQuarter}`,
        progress: bscAvg / win.minBscAvgQuarter,
        done: bscAvg >= win.minBscAvgQuarter,
      },
      {
        key: 'streak',
        label: 'Положит. недель подряд',
        value: `${positiveStreak(state)}`,
        target: `≥ ${win.minPositiveOpWeeks}`,
        progress: positiveStreak(state) / win.minPositiveOpWeeks,
        done: positiveStreak(state) >= win.minPositiveOpWeeks,
      },
    ];

  const diff = difficultyOf(state.difficultyId);
  const doneCount = rows.filter((r) => r.done).length;

  return (
    <SectionCard
      title="Цели года"
      icon={Trophy}
      right={
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              state.difficultyId === 'novice' && 'bg-emerald-100 text-emerald-800',
              state.difficultyId === 'professional' && 'bg-red-100 text-red-800',
              state.difficultyId !== 'novice' && state.difficultyId !== 'professional' && 'bg-stone-100 text-stone-600',
            )}
          >
            {diff.name}
          </span>
          <InfoHint
            hint={{
              title: 'Цели года',
              body: 'Пять условий победы на 52-й неделе для текущей сложности. Все пять должны быть выполнены одновременно к финалу года — недостаток одной обернётся статусом «Стабильный» вместо победы.',
              advice: 'Начинайте с самой отстающей цели: рейтинг лечится сервисом, прибыль — маржой, касса — экономией на графике и маркетинге.',
            }}
          />
        </span>
      }
    >
      <div className="space-y-2.5">
        {rows.map((r) => {
          const pct = Math.round(Math.max(0, Math.min(1, r.progress)) * 100);
          return (
            <div key={r.key} className="flex items-center gap-2">
              {r.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="выполнено" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-stone-300" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-stone-600">{r.label}</span>
                  <span className="tabular-nums shrink-0">
                    <span className={cn('font-semibold', r.done ? 'text-emerald-700' : 'text-stone-800')}>{r.value}</span>
                    <span className="text-stone-400"> / {r.target}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      r.done ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-stone-400',
                    )}
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${r.label}: ${r.value} из ${r.target}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-stone-400 pt-0.5">
          {doneCount === 5
            ? 'Все цели выполнены — держите темп до 52-й недели!'
            : `Выполнено ${doneCount} из 5 к неделе ${state.week} из 52. Итог подводится в конце года.`}
        </p>
      </div>
    </SectionCard>
  );
}
