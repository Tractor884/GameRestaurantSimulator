/**
 * ОБЩАЯ ТАБЛИЦА РЕЙТИНГА ИГРОКОВ (Task 28 — «играть с друзьями»).
 *
 * Используется в двух местах:
 *  - GameOverDialog — после финала года (рядом с авто-отправкой результата);
 *  - SettingsScreen — диалог «Рейтинг игроков» (сравниться до конца года).
 *
 * Топ-50 финалов: место, ник, ресторан, уровень (ранг A+…D−), очки 0–1000.
 * Своя строка подсвечивается (совпадение nick + score — «это вы»).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Trophy, RotateCw, RefreshCw, Users } from 'lucide-react';

/** Запись рейтинга (ответ GET /api/leaderboard → results[]). */
export interface LeaderboardEntry {
  id: string;
  nick: string;
  restaurantName: string;
  level: string;
  score: number;
  difficulty: string;
  weeksLived: number;
  createdAt: string;
}

export interface LeaderboardTableProps {
  /** Подсветка своей строки — совпадение по нику И очкам. */
  me?: { nick: string; score: number } | null;
  /** Заголовок секции. */
  title?: string;
  /** Подзаголовок под заголовком. */
  subtitle?: string;
  /** Внешний триггер перезагрузки (напр., после отправки своего результата). */
  refreshKey?: number;
  className?: string;
}

/** Подписи сложностей (короткие, для таблицы). */
const DIFF_SHORT: Record<string, string> = {
  novice: 'Новичок',
  standard: 'Стандарт',
  professional: 'Профи',
};

/** Тон бейджа уровня: A-ранги — emerald, B — amber, C/D — stone. */
function levelBadgeCls(level: string): string {
  if (level.startsWith('A')) return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100';
  if (level.startsWith('B')) return 'bg-amber-100 text-amber-800 hover:bg-amber-100';
  return 'bg-stone-200 text-stone-700 hover:bg-stone-200';
}

/** Медали за призовые места. */
const MEDALS = ['🥇', '🥈', '🥉'];

/** Строка-«скелетон» на время загрузки. */
function SkeletonRow() {
  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.25rem_3.25rem] items-center gap-2 px-3 py-2.5">
      <Skeleton className="h-5 w-6" />
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-5 w-9 justify-self-center" />
      <Skeleton className="h-5 w-9 justify-self-end" />
    </div>
  );
}

export function LeaderboardTable({
  me,
  title = 'Рейтинг игроков',
  subtitle,
  refreshKey = 0,
  className,
}: LeaderboardTableProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0); // «Обновить» → перезапрос

  // «Обновить»: спиннер включаем в обработчике клика (не в эффекте),
  // чтобы тело эффекта не делало синхронных setState (react-compiler lint).
  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Все setState — в асинхронных колбэках промиса (внешняя система = API).
    fetch('/api/leaderboard')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (!cancelled) {
          setEntries(
            Array.isArray((data as { results?: LeaderboardEntry[] }).results)
              ? (data as { results: LeaderboardEntry[] }).results
              : [],
          );
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntries(null);
          setError('Не удалось загрузить рейтинг — проверьте соединение');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nonce, refreshKey]);

  return (
    <section className={cn('rounded-xl border border-stone-200 bg-white', className)} aria-label={title}>
      {/* Шапка секции */}
      <div className="flex items-start justify-between gap-3 px-3.5 py-3 border-b border-stone-100">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" aria-hidden />
            {title}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            {subtitle ?? 'Топ-50 финалов года: очки 0–1000, уровень A+…D−. Каждый финал — отдельная попытка.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 border-stone-300 shrink-0"
          onClick={reload}
          disabled={loading}
          aria-label="Обновить рейтинг"
        >
          {loading ? (
            <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          Обновить
        </Button>
      </div>

      {/* Заголовок таблицы */}
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.25rem_3.25rem] gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 border-b border-stone-100" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Игрок</span>
        <span role="columnheader" className="text-center">Уровень</span>
        <span role="columnheader" className="text-right">Очки</span>
      </div>

      {/* Загрузка */}
      {loading && entries === null && (
        <div aria-label="Рейтинг загружается">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* Ошибка */}
      {!loading && error && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-4" role="alert">
          <p className="text-xs text-red-700">{error}</p>
          <Button variant="outline" size="sm" className="h-8 border-red-200 text-red-700 hover:bg-red-50" onClick={reload}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
            Повторить
          </Button>
        </div>
      )}

      {/* Пусто */}
      {!loading && !error && entries !== null && entries.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-3.5 py-8 text-center">
          <Trophy className="h-8 w-8 text-stone-300" aria-hidden />
          <p className="text-sm text-stone-500">Рейтинг пуст — вы будете первыми</p>
          <p className="text-xs text-stone-400">Дойдите до финала года (или банкротства), и результат появится здесь</p>
        </div>
      )}

      {/* Таблица: место · игрок · уровень · очки */}
      {!error && entries !== null && entries.length > 0 && (
        <ScrollArea
          type="always"
          className="max-h-64 rounded-b-xl [&>[data-slot=scroll-area-viewport]]:max-h-64 [&_[data-slot=scroll-area-thumb]]:bg-stone-400"
        >
          <div role="rowgroup">
            {entries.map((e, i) => {
              const isMe =
                !!me &&
                me.nick.trim().length > 0 &&
                e.nick === me.nick.trim() &&
                e.score === me.score;
              return (
                <div
                  key={e.id}
                  role="row"
                  aria-label={`Место ${i + 1}: ${e.nick}, ресторан «${e.restaurantName}», уровень ${e.level}, ${e.score} очков`}
                  className={cn(
                    'grid grid-cols-[2.75rem_minmax(0,1fr)_4.25rem_3.25rem] items-center gap-2 px-3 py-2 border-b border-stone-50 last:border-b-0',
                    isMe ? 'bg-amber-50' : 'hover:bg-stone-50/80',
                  )}
                >
                  {/* Место / медаль */}
                  <span role="cell" className="text-sm font-bold tabular-nums text-stone-500 text-center" aria-label={`Место ${i + 1}`}>
                    {i < 3 ? (
                      <span className="text-base leading-none" aria-hidden>
                        {MEDALS[i]}
                      </span>
                    ) : (
                      i + 1
                    )}
                  </span>

                  {/* Ник + ресторан + сложность/недели */}
                  <div role="cell" className="min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate flex items-center gap-1.5">
                      <span className="truncate">{e.nick}</span>
                      {isMe && (
                        <Badge variant="secondary" className="bg-amber-200 text-amber-900 hover:bg-amber-200 shrink-0 text-[10px] px-1.5">
                          это вы
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-stone-500 truncate" title={`«${e.restaurantName}» · ${DIFF_SHORT[e.difficulty] ?? e.difficulty} · ${e.weeksLived} нед.`}>
                      «{e.restaurantName}» · {DIFF_SHORT[e.difficulty] ?? e.difficulty} · {e.weeksLived} нед.
                    </p>
                  </div>

                  {/* Уровень (ранг) */}
                  <span role="cell" className="justify-self-center">
                    <Badge variant="secondary" className={cn('font-bold tabular-nums', levelBadgeCls(e.level))}>
                      {e.level}
                    </Badge>
                  </span>

                  {/* Очки 0–1000 */}
                  <span role="cell" className="text-sm font-bold tabular-nums text-stone-900 text-right">
                    {e.score}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Подпись (только когда есть данные) */}
      {!error && entries !== null && entries.length > 0 && (
        <p className="flex items-center gap-1.5 px-3.5 py-2 text-[11px] text-stone-400 border-t border-stone-100">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          {entries.length === 50
            ? 'Показан топ-50 — более старые попытки уходят за пределы таблицы'
            : `Записей в рейтинге: ${entries.length}`}
        </p>
      )}
    </section>
  );
}
