/**
 * Экран «Отзывы» (ТЗ §21): рейтинг, окно последних отзывов, скандальные отзывы,
 * сегменты гостей + ФИЛЬТРЫ: по баллам (1–5), по группам ЦА, по источнику.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, EmptyState } from '../widgets';
import { InfoHint } from '../hints';
import { SEGMENTS, SEGMENT_IDS } from '@/lib/game/config/segments.config';
import { REVIEW_SOURCES, REVIEW_SOURCES_MAP } from '@/lib/game/config/reviews.config';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Star, MessageSquare, Flame, ThumbsUp, Filter, MapPin, Megaphone, Inbox, Send } from 'lucide-react';
import { REVIEWS_V2 } from '@/lib/game/config/reviews.config';
import type { Review, ReviewSourceId, SegmentId } from '@/lib/game/types';

const ALL = 'all';

export function ReviewsScreen() {
  const state = useGame((s) => s.state)!;
  const replyReviews = useGame((s) => s.replyReviews);
  const restaurant = state.restaurant!;

  const rep = restaurant.reputation;
  const reviews = rep.windowReviews;
  /** БАЛ-v2 §8: счётчик неотвеченных негативных отзывов. */
  const unanswered = rep.unansweredNeg ?? 0;

  // ===== ФИЛЬТРЫ =====
  const [scoreFilter, setScoreFilter] = useState<string[]>([]);
  const [segmentFilter, setSegmentFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (scoreFilter.length > 0 && !scoreFilter.includes(String(scoreBucket(r)))) return false;
      if (segmentFilter !== ALL && r.segmentId !== segmentFilter) return false;
      if (sourceFilter !== ALL && (r.sourceId ?? 'word_of_mouth') !== sourceFilter) return false;
      return true;
    });
  }, [reviews, scoreFilter, segmentFilter, sourceFilter]);

  const anyFilter = scoreFilter.length > 0 || segmentFilter !== ALL || sourceFilter !== ALL;
  const recent = useMemo(() => filtered.slice(-80).reverse(), [filtered]);

  const windowAvg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length : 0;
  const scandals = reviews.filter((r) => r.scandal || r.weight > 1).length;

  // Распределение по баллам (для гистограммы).
  const dist = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    for (const r of reviews) buckets[Math.min(4, Math.max(0, scoreBucket(r) - 1))]++;
    return buckets;
  }, [reviews]);
  const distMax = Math.max(1, ...dist);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Star}
          label="Рейтинг ресторана"
          value={rep.rating.toFixed(2)}
          sub="Байесовская оценка"
          tone={rep.rating >= 4.2 ? 'good' : rep.rating >= 3.8 ? 'warn' : 'bad'}
          hint="rating"
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
          hint="rating"
        />
        <KpiCard
          icon={Flame}
          label="Скандальных"
          value={String(scandals)}
          sub="вес ×3…×10 к рейтингу"
          tone={scandals > 0 ? 'bad' : 'good'}
          hint="riskReputation"
        />
      </div>

      {/* БАЛ-v2 §8 (механизм D): работа с отзывами — дешёвый рычаг конверсии. */}
      <SectionCard title="Работа с отзывами" icon={Inbox}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-stone-600">Неотвеченные негативные (≤3,5★):</span>
              <span
                className={cn(
                  'text-lg font-bold tabular-nums',
                  unanswered > 10 ? 'text-red-700' : unanswered > 0 ? 'text-amber-700' : 'text-emerald-700',
                )}
              >
                {Math.round(unanswered)}
              </span>
              {unanswered > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-800">
                  конверсия −{(Math.min(unanswered, REVIEWS_V2.convCapU) * REVIEWS_V2.convPerUnanswered * 100).toFixed(1)}%
                </Badge>
              )}
              {unanswered > 5 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  юр. риск +{(REVIEWS_V2.legalPerUnanswered * Math.min(unanswered, REVIEWS_V2.legalCapU)).toFixed(1)}/нед
                </Badge>
              )}
            </div>
            <p className="text-xs text-stone-500 max-w-xl">
              Каждый неотвеченный отзыв снижает конверсию новых гостей (кап −9%), возвратность и накачивает
              юридический риск. «Ответить» — рабочий день управляющего: счётчик обнуляется, приор рейтинга немного растёт.
            </p>
          </div>
          <Button
            onClick={replyReviews}
            disabled={state.phase === 'gameover' || unanswered <= 0}
            className="h-11 px-5 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            aria-label="Ответить на все неотвеченные отзывы"
          >
            <Send className="h-4 w-4 mr-2" aria-hidden />
            Ответить на все ({REVIEWS_V2.replyCost.toLocaleString('ru-RU')} ₽)
          </Button>
        </div>
      </SectionCard>

      {/* Распределение оценок + фильтры */}
      <SectionCard title="Оценки и фильтры" icon={Filter}>
        <div className="space-y-4">
          {/* Гистограмма распределения */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400 mb-2">
              Распределение оценок в окне
            </p>
            <div className="flex items-end gap-2 h-20">
              {dist.map((count, i) => {
                const score = i + 1;
                const active = scoreFilter.length === 0 || scoreFilter.includes(String(score));
                return (
                  <button
                    key={score}
                    onClick={() => toggleScore(score, scoreFilter, setScoreFilter)}
                    className="flex-1 flex flex-col items-center gap-1 group"
                    aria-label={`Фильтр: ${score} ${score === 1 ? 'балл' : score < 5 ? 'балла' : 'баллов'} (${count} отзывов)`}
                    aria-pressed={scoreFilter.includes(String(score))}
                  >
                    <span className={cn('text-xs tabular-nums font-semibold', active ? 'text-stone-700' : 'text-stone-300')}>
                      {count}
                    </span>
                    <div
                      className={cn(
                        'w-full rounded-t-md transition-all',
                        score >= 4 ? 'bg-emerald-400' : score === 3 ? 'bg-amber-400' : 'bg-red-400',
                        !active && 'opacity-30',
                        scoreFilter.includes(String(score)) && 'ring-2 ring-offset-1 ring-amber-500',
                      )}
                      style={{ height: `${Math.max(6, (count / distMax) * 56)}px` }}
                    />
                    <span className={cn('text-xs tabular-nums', active ? 'text-stone-600' : 'text-stone-300')}>
                      {score}★
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Фильтры по баллам */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-[200px]">
              <span className="text-sm text-stone-600">Баллы:</span>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={scoreFilter}
                onValueChange={(v) => setScoreFilter(v)}
                aria-label="Фильтр по баллам"
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <ToggleGroupItem
                    key={s}
                    value={String(s)}
                    aria-label={`${s} баллов`}
                    className="h-9 px-3 data-[state=on]:bg-amber-100 data-[state=on]:text-amber-900"
                  >
                    {s}★
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <span className="text-sm text-stone-600 whitespace-nowrap">Группа ЦА:</span>
              <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                <SelectTrigger className="w-full max-w-[220px] h-9" aria-label="Фильтр по сегменту">
                  <SelectValue placeholder="Все сегменты" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Все сегменты</SelectItem>
                  {SEGMENT_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {SEGMENTS[id].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-sm text-stone-600 whitespace-nowrap">Источник:</span>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full max-w-[190px] h-9" aria-label="Фильтр по источнику">
                  <SelectValue placeholder="Все источники" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Все источники</SelectItem>
                  {REVIEW_SOURCES.map((src) => (
                    <SelectItem key={src.id} value={src.id}>
                      {src.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {anyFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-stone-500"
                onClick={() => {
                  setScoreFilter([]);
                  setSegmentFilter(ALL);
                  setSourceFilter(ALL);
                }}
              >
                Сбросить
              </Button>
            )}
          </div>

          <p className="text-xs text-stone-500">
            {anyFilter ? (
              <>
                Найдено <b className="text-stone-800 tabular-nums">{filtered.length}</b> из{' '}
                {reviews.length} отзывов
              </>
            ) : (
              <>
                Подсказка: клик по столбцу гистограммы или фильтры выше — чтобы разобрать
                негатив по группам гостей и источникам.
              </>
            )}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Лента отзывов (новые сверху)" icon={MessageSquare}>
        {recent.length === 0 ? (
          <EmptyState
            text={anyFilter ? 'Под фильтры ничего не попало — ослабьте условия' : 'Отзывов ещё нет — запустите дни симуляции, гости оценят сервис'}
          />
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

/** Клик по столбцу гистограммы — переключение фильтра баллов. */
function toggleScore(score: number, current: string[], set: (v: string[]) => void) {
  const key = String(score);
  set(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
}

/** Ведро оценки: 4.7 → «5», 3.2 → «3». */
function scoreBucket(r: Review): number {
  return Math.max(1, Math.min(5, Math.round(r.score)));
}

/** Карточка одного отзыва. */
function ReviewRow({ review }: { review: Review }) {
  const isScandal = review.scandal || review.weight > 1;
  const segName = SEGMENTS[review.segmentId as SegmentId]?.name ?? review.segmentId;
  const sourceId = (review.sourceId ?? 'word_of_mouth') as ReviewSourceId;
  const sourceName = REVIEW_SOURCES_MAP[sourceId] ?? 'Сарафан';

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
        <Badge variant="secondary" className="bg-stone-100 text-stone-600 hover:bg-stone-100">
          {segName}
        </Badge>
        <Badge variant="secondary" className="bg-amber-50 text-amber-800 hover:bg-amber-50 border border-amber-200">
          {sourceId === 'maps' ? (
            <MapPin className="h-3 w-3 mr-1" aria-hidden />
          ) : (
            <Megaphone className="h-3 w-3 mr-1" aria-hidden />
          )}
          {sourceName}
          <InfoHint
            hint={{
              title: `Источник: ${sourceName}`,
              body: `${REVIEW_SOURCES.find((s) => s.id === sourceId)?.hint ?? ''} Источник виден в фильтрах — так вы понимаете, откуда приходит негатив и хвала.`,
            }}
            className="h-4 w-4"
          />
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
