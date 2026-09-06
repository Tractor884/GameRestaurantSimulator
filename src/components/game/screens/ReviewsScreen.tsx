/**
 * Экран «Отзывы» (ТЗ §21): рейтинг, окно последних отзывов,
 * скандальные отзывы, сегменты гостей.
 */
'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, EmptyState } from '../widgets';
import { SEGMENTS } from '@/lib/game/config/segments.config';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Star, MessageSquare, Flame, ThumbsUp } from 'lucide-react';
import type { Review } from '@/lib/game/types';

export function ReviewsScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;

  const rep = restaurant.reputation;
  const reviews = rep.windowReviews;

  const recent = useMemo(() => reviews.slice(-40).reverse(), [reviews]);

  const windowAvg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length : 0;
  const scandals = reviews.filter((r) => r.scandal || r.weight > 1).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Star}
          label="Рейтинг ресторана"
          value={rep.rating.toFixed(2)}
          sub="Байесовская оценка"
          tone={rep.rating >= 4.2 ? 'good' : rep.rating >= 3.8 ? 'warn' : 'bad'}
        />
        <KpiCard
          icon={MessageSquare}
          label="Отзывов в окне"
          value={String(reviews.length)}
          sub="окно: последние 100"
        />
        <KpiCard
          icon={ThumbsUp}
          label="Средняя оценка окна"
          value={reviews.length > 0 ? windowAvg.toFixed(1) : '—'}
          sub="по 5-балльной шкале"
          tone={windowAvg >= 4 ? 'good' : windowAvg >= 3 ? 'warn' : 'bad'}
        />
        <KpiCard
          icon={Flame}
          label="Скандальных"
          value={String(scandals)}
          sub="вес ×3…×10 к рейтингу"
          tone={scandals > 0 ? 'bad' : 'good'}
        />
      </div>

      <SectionCard title="Лента отзывов (новые сверху)" icon={MessageSquare}>
        {recent.length === 0 ? (
          <EmptyState text="Отзывов ещё нет — запустите дни симуляции, гости оценят сервис" />
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {recent.map((r) => (
                <ReviewRow key={r.id} review={r} />
              ))}
            </div>
          </ScrollArea>
        )}
      </SectionCard>
    </div>
  );
}

/** Карточка одного отзыва. */
function ReviewRow({ review }: { review: Review }) {
  const isScandal = review.scandal || review.weight > 1;
  const segName = SEGMENTS[review.segmentId]?.name ?? review.segmentId;

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isScandal ? 'border-red-200 bg-red-50/40' : 'border-stone-200 bg-white',
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <ScoreBadge score={review.score} />
        {isScandal && (
          <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-100">
            <Flame className="h-3 w-3 mr-1" aria-hidden />
            Скандальный (вес ×{review.weight.toFixed(0)})
          </Badge>
        )}
        <Badge variant="secondary" className="bg-stone-100 text-stone-600">
          {segName}
        </Badge>
        <span className="ml-auto text-xs text-stone-400 tabular-nums">
          Нед {review.date.week} · День {review.date.day + 1}
        </span>
      </div>
      <p className="text-sm text-stone-700 mt-1.5">{review.text}</p>
    </div>
  );
}

/** Бейдж оценки 1–5. */
function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 4
      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
      : score === 3
        ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
        : 'bg-red-100 text-red-800 hover:bg-red-100';
  return (
    <Badge variant="secondary" className={cn('tabular-nums font-semibold', cls)}>
      <Star className="h-3 w-3 mr-0.5" aria-hidden />
      {score.toFixed(0)}/5
    </Badge>
  );
}
