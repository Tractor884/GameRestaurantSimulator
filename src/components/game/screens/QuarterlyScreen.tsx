/**
 * Экран «Квартальный разбор» (ТЗ §28): итоги кварталов по BSC и финальный
 * счёт при завершении игры.
 *
 * v9: разборы живут в ИСТОРИИ (history.quarterlyReviews) — раньше разбор
 * лежал только в weekResult закрывающей недели и ЗАТИРАЛСЯ следующей,
 * из-за чего во вкладке почти всегда было пусто. Теперь: последний разбор
 * — крупной карточкой, история кварталов — компактной лентой.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, ScoreBar, MetricRow, EmptyState, money, moneyShort } from '../widgets';
import { FINAL_SCORE_WEIGHTS, QUARTERLY_WEEKS } from '@/lib/game/config/bsc.config';
import { difficultyWin, difficultyOf } from '@/lib/game/config/difficulty.config';
import {
  RANK_PRESENTATION,
  scoreLevel,
  scoreBandRange,
} from '@/lib/game/engine';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ClipboardList, Trophy, Lightbulb, Target, CalendarClock, History } from 'lucide-react';
import type { FinalScore, QuarterlyReview } from '@/lib/game/types';

export function QuarterlyScreen() {
  const state = useGame((s) => s.state)!;
  const win = difficultyWin(state.difficultyId);
  const diff = difficultyOf(state.difficultyId);

  // v9: разборы из истории (переживают затирание weekResult); свежий
  // разбор текущей недели может ещё не быть в истории — берём оба.
  const history = state.history.quarterlyReviews ?? [];
  const fromWeekResult = state.weekResult?.quarterlyReview ?? null;
  const all = history.length > 0 ? history : fromWeekResult ? [fromWeekResult] : [];
  const latest = all.length > 0 ? all[all.length - 1] : null;

  const finalScore = state.phase === 'gameover' ? (state.weekResult?.finalScore ?? null) : null;

  // Граница следующего квартала (кратна 12).
  const nextQuarterWeek = (Math.floor((state.week - 1) / QUARTERLY_WEEKS) + 1) * QUARTERLY_WEEKS;

  return (
    <div className="space-y-4">
      {/* Квартальный разбор: последний */}
      {latest ? (
        <SectionCard
          title={`Квартальный разбор — квартал ${latest.quarter}`}
          icon={ClipboardList}
          right={
            <Badge
              className={cn(
                'text-white hover:text-white',
                latest.bscAvg >= 70
                  ? 'bg-emerald-600 hover:bg-emerald-600'
                  : latest.bscAvg >= 50
                    ? 'bg-amber-600 hover:bg-amber-600'
                    : 'bg-red-600 hover:bg-red-600',
              )}
            >
              BSC {latest.bscAvg.toFixed(0)}
            </Badge>
          }
        >
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Вердикт</p>
                <p className="text-sm font-medium text-stone-800 mt-1">{latest.verdict}</p>
              </div>
              <ScoreBar label="Средний BSC квартала" value={latest.bscAvg} />
              <div className="mt-3">
                <MetricRow label="Выручка за квартал" value={moneyShort(latest.revenue)} />
                <MetricRow
                  label="Чистая прибыль"
                  value={money(latest.netProfit)}
                  tone={latest.netProfit >= 0 ? 'good' : 'bad'}
                />
                <MetricRow
                  label="Рейтинг"
                  value={latest.rating.toFixed(2)}
                  tone={latest.rating >= 4.0 ? 'good' : 'bad'}
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                Рекомендации
              </p>
              <ol className="space-y-2">
                {latest.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-stone-200 p-2.5 text-sm text-stone-700"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                      {i + 1}
                    </span>
                    {rec}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-stone-400 mt-3">
                Следующий разбор — в конце недели {nextQuarterWeek} (каждые {QUARTERLY_WEEKS} недель).
              </p>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Квартальный разбор" icon={CalendarClock}>
          <EmptyState
            text={`Квартальный разбор сформируется на неделе ${nextQuarterWeek} (каждые ${QUARTERLY_WEEKS} недель).`}
          />
          <p className="text-sm text-stone-500 -mt-4">
            Разбор подводит итог BSC, прибыли и рейтинга за квартал и даёт рекомендации владельца.
          </p>
        </SectionCard>
      )}

      {/* История кварталов (v9): лента всех разборов года */}
      {all.length > 1 && (
        <SectionCard title="История кварталов" icon={History}>
          <div className="max-h-64 overflow-y-auto pr-1 space-y-1.5">
            {[...all].reverse().map((q) => (
              <QuarterHistoryRow key={q.quarter} q={q} current={q === latest} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Финальный счёт */}
      {finalScore ? (
        <FinalScoreCard score={finalScore} />
      ) : (
        <SectionCard title="Финальный счёт" icon={Trophy}>
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" aria-hidden />
            <div className="text-sm text-stone-600 space-y-1.5">
              <p className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-stone-100 text-stone-600 hover:bg-stone-100 shrink-0">{diff.name}</Badge>
                планки победы этой сложности:
              </p>
              <p>
                Игра идёт 52 недели. Победа на 52-й неделе: BSC квартала ≥{' '}
                {win.minBscAvgQuarter}, рейтинг ≥ {win.minRating}, накопленная прибыль ≥{' '}
                {moneyShort(win.minCumulativeProfit)}, денег на счёте ≥ {moneyShort(win.minCash)} и{' '}
                {win.minPositiveOpWeeks} недель положительной операционной прибыли подряд.
              </p>
              <p className="text-xs text-stone-500">
                Итог года — единый счёт 0–1000 и уровень D−…A+ (10 уровней, полосы по 100 очков).
              </p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/** Строка истории квартала. */
function QuarterHistoryRow({ q, current }: { q: QuarterlyReview; current: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm',
        current ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white',
      )}
    >
      <span className="font-semibold text-stone-700 shrink-0">Кв. {q.quarter}</span>
      <Badge
        variant="secondary"
        className={cn(
          'shrink-0',
          q.bscAvg >= 70
            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
            : q.bscAvg >= 50
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
              : 'bg-red-100 text-red-800 hover:bg-red-100',
        )}
      >
        BSC {q.bscAvg}
      </Badge>
      <span className="text-xs text-stone-500 tabular-nums">
        выручка {moneyShort(q.revenue)} · прибыль {moneyShort(q.netProfit)} · рейтинг {q.rating.toFixed(2)}
      </span>
      <span className="ml-auto text-xs text-stone-600 truncate">{q.verdict}</span>
    </div>
  );
}

/** Карточка финального счёта: единая шкала 0–1000 + уровень (v9). */
function FinalScoreCard({ score }: { score: FinalScore }) {
  const level = scoreLevel(score.total);
  const pres = RANK_PRESENTATION[level];
  const band = scoreBandRange(level);
  const components: { key: keyof FinalScore; label: string }[] = [
    { key: 'financialHealth', label: 'Финансовое здоровье' },
    { key: 'customerHealth', label: 'Здоровье клиентской базы' },
    { key: 'operationalHealth', label: 'Операционное здоровье' },
    { key: 'staffHealth', label: 'Здоровье команды' },
    { key: 'growth', label: 'Рост' },
    { key: 'riskManagement', label: 'Управление рисками' },
  ];

  return (
    <SectionCard title="Финальный счёт" icon={Trophy}>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-3">
          {components.map((c) => {
            const value = score[c.key];
            const max = FINAL_SCORE_WEIGHTS[c.key];
            return (
              <div key={c.key}>
                <ScoreBar
                  label={`${c.label} · ${value.toFixed(0)} / ${max}`}
                  value={value}
                  max={max}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Итоговый счёт
          </p>
          <p className="text-5xl font-bold tabular-nums text-stone-900 mt-2">
            {score.total}
            <span className="text-2xl text-stone-400"> / 1000</span>
          </p>
          <Badge
            className={cn(
              'mt-4 text-sm px-3 py-1.5 text-white hover:text-white',
              score.total >= 700
                ? 'bg-emerald-600 hover:bg-emerald-600'
                : score.total >= 400
                  ? 'bg-amber-600 hover:bg-amber-600'
                  : 'bg-red-600 hover:bg-red-600',
            )}
          >
            {pres.label} · {pres.title} ({band.min}–{band.max})
          </Badge>
        </div>
      </div>
    </SectionCard>
  );
}
