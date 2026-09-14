/**
 * Экран «События» (ТЗ §26): активные события, история за неделю,
 * панель рисков с драйверами.
 *
 * ЕДИНАЯ СИСТЕМА «СОБЫТИЯ = ДИЛЕММЫ» (запрос пользователя): каждое событие —
 * развилка. В «Активных» живут ТОЛЬКО нерешённые события: у каждого — кнопки
 * вариантов прямо в карточке и счётчик дедлайна (2 недели). Не решили за
 * дедлайн — вариант выберется случайно, 3:1 в пользу негативного исхода.
 */
'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, EmptyState, money } from '../widgets';
import { InfoHint } from '../hints';
import { RISKS_META, EVENT_CONFIG, EVENT_TEMPLATES_MAP } from '@/lib/game/config/risks.config';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Zap,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  History,
  Clock,
  Hourglass,
} from 'lucide-react';
import type { EventResolution, GameEvent, RiskType } from '@/lib/game/types';

const RISK_TYPES: RiskType[] = ['sanitary', 'technical', 'staff', 'legal', 'reputation', 'financial'];

export function EventsScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;

  // Активные = ТОЛЬКО нерешённые события (разрешённые удаляются из
  // activeEvents; синтетические носители demand-эффекта — resolved).
  const activeEvents = useMemo(
    () => state.activeEvents.filter((e) => !e.resolved),
    [state.activeEvents],
  );

  // История: журнал решённых (переживает обрезку dayLogs) + weekResult
  // + дневные логи. Копии одного события дедуплицируются — предпочитаем
  // разрешённый снимок (в нём есть resolutionNote об исходе).
  const historyEvents = useMemo(() => {
    const activeIds = new Set(state.activeEvents.map((e) => e.id));
    const byId = new Map<string, GameEvent>();
    const offer = (e: GameEvent) => {
      if (activeIds.has(e.id)) return; // ещё в «Активных» — не история
      const prev = byId.get(e.id);
      if (!prev || (!prev.resolved && e.resolved)) byId.set(e.id, e);
    };
    for (const e of state.history.resolvedEvents ?? []) offer(e);
    for (const e of state.weekResult?.events ?? []) offer(e);
    for (const d of state.history.dayLogs) for (const e of d.events) offer(e);
    return [...byId.values()]
      .sort((a, b) => b.date.week * 7 + b.date.day - (a.date.week * 7 + a.date.day))
      .slice(0, 12);
  }, [state.activeEvents, state.weekResult, state.history.dayLogs, state.history.resolvedEvents]);

  const hasAny = activeEvents.length > 0 || historyEvents.length > 0;

  return (
    <div className="space-y-4">
      {/* Активные события */}
      <SectionCard title="Активные события" icon={Zap}>
        <p className="text-xs text-stone-400 -mt-1 mb-3 flex items-start gap-1.5">
          <Hourglass className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden />
          Каждое событие — дилемма: у вас есть 2 недели на решение. Не решите —
          вариант выберется случайно, 3:1 в пользу плохого исхода.
        </p>
        {activeEvents.length === 0 ? (
          <EmptyState
            text={
              hasAny
                ? 'Все события решены — новых пока нет'
                : `События появляются не раньше ${EVENT_CONFIG.minWeek}-й недели — держите риски под контролем`
            }
          />
        ) : (
          <div className="space-y-3">
            {activeEvents.map((e) => (
              <EventCard key={e.id} event={e} week={state.week} gameover={state.phase === 'gameover'} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* История */}
      <SectionCard title="История событий (последняя неделя)" icon={History}>
        {historyEvents.length === 0 ? (
          <EmptyState text="Пока тихо — ни одного события за последнюю неделю" />
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {historyEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start gap-2.5 rounded-lg border border-stone-200 p-3"
                >
                  <CriticalityBadge criticality={e.criticality} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-stone-800">{e.title}</p>
                      <span className="text-xs text-stone-400 tabular-nums shrink-0">
                        Нед {e.date.week} · День {e.date.day + 1}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{e.description}</p>
                    {e.resolutionNote && (
                      <p
                        className={cn(
                          'text-xs mt-1 flex items-start gap-1.5',
                          (e.resolutionNote ?? '').includes('Срок истёк') ? 'text-red-700' : 'text-emerald-700',
                        )}
                      >
                        {(e.resolutionNote ?? '').includes('Срок истёк') ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                        )}
                        {e.resolutionNote}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SectionCard>

      {/* Риски */}
      <SectionCard title="Панель рисков" icon={ShieldAlert}>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
          {RISK_TYPES.map((rt) => {
            const value = restaurant.risks[rt];
            const meta = RISKS_META[rt];
            return (
              <div key={rt}>
                <RiskBar label={meta.name} value={value} hint={`risk${rt.charAt(0).toUpperCase()}${rt.slice(1)}`} />
                <div className="mt-1 flex flex-col gap-0.5">
                  <p className="text-[10px] text-stone-400 leading-snug">
                    <span className="text-red-500">Растёт:</span> {meta.driversUp.join(', ')}
                  </p>
                  <p className="text-[10px] text-stone-400 leading-snug">
                    <span className="text-emerald-600">Снижает:</span> {meta.driversDown.join(', ')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-stone-400 mt-4">
          Риски 0–100. Вероятность события = базовый шанс × (риск/100)^1.2 — при риске выше 60
          ожидайте неприятностей.
        </p>
      </SectionCard>
    </div>
  );
}

/** Карточка активного (нерешённого) события: описание + кнопки вариантов. */
function EventCard({ event, week, gameover }: { event: GameEvent; week: number; gameover: boolean }) {
  const resolveCritical = useGame((s) => s.resolveCritical);
  // Динамические резолюции системных событий приоритетнее шаблона пула.
  const options = event.resolutions ?? EVENT_TEMPLATES_MAP[event.templateId]?.resolutions;
  const deadline = event.deadlineWeek ?? event.date.week + 2;
  const weeksLeft = deadline - week;

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        event.criticality === 'critical'
          ? 'border-red-300 bg-red-50/40'
          : event.criticality === 'positive'
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-amber-200 bg-amber-50/40',
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <CriticalityBadge criticality={event.criticality} />
        <p className="text-sm font-semibold text-stone-800">{event.title}</p>
        <span className="ml-auto text-xs text-stone-400 tabular-nums">
          Нед {event.date.week} · День {event.date.day + 1}
        </span>
      </div>
      <p className="text-sm text-stone-600 mt-1.5">{event.description}</p>

      {/* Дедлайн решения: критические блокируют время, дедлайн им не нужен. */}
      {event.criticality !== 'critical' && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className={cn(
              'tabular-nums',
              weeksLeft <= 0
                ? 'bg-red-100 text-red-800 hover:bg-red-100'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-100',
            )}
          >
            <Clock className="h-3 w-3 mr-1" aria-hidden />
            {weeksLeft > 0
              ? `Решение до конца недели ${deadline} (осталось ${weeksLeft} нед.)`
              : `Срок истекает на закрытии недели ${deadline}`}
          </Badge>
        </div>
      )}

      {event.criticality === 'critical' && (
        <p className="text-xs text-red-700 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          Критическое событие: неделя не продолжится, пока не принято решение (диалог вверху).
        </p>
      )}

      {/* Варианты решения — прямо в карточке */}
      {options && options.length > 0 && (
        <div className="mt-3 space-y-2" role="group" aria-label={`Варианты решения: ${event.title}`}>
          {options.map((res, i) => (
            <ResolutionButton
              key={i}
              resolution={res}
              disabled={gameover}
              onClick={() => resolveCritical(event.id, i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Кнопка ветки решения: label, стоимость, note и tone-подсказка
 *  (иконка «исход скорее негативный/позитивный» — без слова «негативный»). */
function ResolutionButton({
  resolution,
  disabled,
  onClick,
}: {
  resolution: EventResolution;
  disabled: boolean;
  onClick: () => void;
}) {
  const toneIcon =
    resolution.tone === 'negative' ? (
      <span title="Исход скорее негативный" className="shrink-0 inline-flex">
        <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden />
        <span className="sr-only">Исход скорее негативный</span>
      </span>
    ) : resolution.tone === 'positive' ? (
      <span title="Исход скорее позитивный" className="shrink-0 inline-flex">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        <span className="sr-only">Исход скорее позитивный</span>
      </span>
    ) : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${resolution.label}${resolution.cost > 0 ? ` — стоимость ${money(resolution.cost)}` : ''}`}
      className={cn(
        'w-full min-h-11 rounded-lg border border-stone-300 bg-white p-3 text-left transition-colors',
        'hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        'disabled:opacity-50 disabled:pointer-events-none',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-stone-800 flex items-center gap-1.5 min-w-0">
          {toneIcon}
          <span className="truncate">{resolution.label}</span>
        </span>
        {resolution.cost > 0 && (
          <Badge variant="secondary" className="bg-stone-100 text-stone-700 tabular-nums shrink-0">
            {money(resolution.cost)}
          </Badge>
        )}
      </span>
      <span className="block text-xs text-stone-500 mt-1">{resolution.note}</span>
    </button>
  );
}

/** Бейдж критичности. */
function CriticalityBadge({ criticality }: { criticality: GameEvent['criticality'] }) {
  if (criticality === 'critical') {
    return (
      <Badge className="bg-red-600 text-white hover:bg-red-600 shrink-0">
        <AlertTriangle className="h-3 w-3 mr-1" aria-hidden />
        Критическое
      </Badge>
    );
  }
  if (criticality === 'positive') {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 shrink-0">
        <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden />
        Позитивное
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500 text-white hover:bg-amber-500 shrink-0">
      <Zap className="h-3 w-3 mr-1" aria-hidden />
      Обычное
    </Badge>
  );
}

/** Полоса риска: высокое значение — плохо (инверсия цветов ScoreBar). */
function RiskBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const color = value >= 60 ? 'bg-red-500' : value >= 35 ? 'bg-amber-500' : 'bg-emerald-500';
  const hintKey =
    hint === 'riskSanitary' || hint === 'riskTechnical' || hint === 'riskStaff' ||
    hint === 'riskReputation' || hint === 'riskLegal' || hint === 'riskFinancial'
      ? hint
      : undefined;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={cn('font-medium flex items-center gap-1', value >= 60 ? 'text-red-700' : 'text-stone-600')}>
          {label}
          {hintKey && <InfoHint hint={hintKey} />}
        </span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            value >= 60 ? 'text-red-700' : value >= 35 ? 'text-amber-700' : 'text-emerald-700',
          )}
        >
          {value.toFixed(0)}/100
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
