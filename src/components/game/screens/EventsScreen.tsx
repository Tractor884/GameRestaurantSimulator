/**
 * Экран «События» (ТЗ §26): активные события, история за неделю,
 * панель рисков с драйверами.
 */
'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, EmptyState } from '../widgets';
import { RISKS_META, EVENT_CONFIG } from '@/lib/game/config/risks.config';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Zap, AlertTriangle, CheckCircle2, TrendingUp, ShieldAlert, History } from 'lucide-react';
import type { GameEvent, RiskType } from '@/lib/game/types';

const RISK_TYPES: RiskType[] = ['sanitary', 'technical', 'staff', 'legal', 'reputation', 'financial'];

export function EventsScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;

  const activeEvents = state.activeEvents;

  // История: события последней недели (weekResult + дневные логи), без дублей с активными.
  const historyEvents = useMemo(() => {
    const seen = new Set(activeEvents.map((e) => e.id));
    const fromWeek = state.weekResult?.events ?? [];
    const fromDays = state.history.dayLogs.flatMap((d) => d.events);
    return [...fromWeek, ...fromDays]
      .filter((e) => !seen.has(e.id))
      .sort((a, b) => b.date.week * 7 + b.date.day - (a.date.week * 7 + a.date.day))
      .slice(0, 12);
  }, [activeEvents, state.weekResult, state.history.dayLogs]);

  const hasAny = activeEvents.length > 0 || historyEvents.length > 0;

  return (
    <div className="space-y-4">
      {/* Активные события */}
      <SectionCard title="Активные события" icon={Zap}>
        {activeEvents.length === 0 ? (
          <EmptyState
            text={
              hasAny
                ? 'Сейчас событий нет'
                : `События появляются не раньше ${EVENT_CONFIG.minWeek}-й недели — держите риски под контролем`
            }
          />
        ) : (
          <div className="space-y-3">
            {activeEvents.map((e) => (
              <EventCard key={e.id} event={e} />
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
                <RiskBar label={meta.name} value={value} />
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

/** Карточка активного события. */
function EventCard({ event }: { event: GameEvent }) {
  const demandNote =
    event.effect.demandBoost !== undefined
      ? `Спрос ×${event.effect.demandBoost}${
          event.effect.demandBoostWeeks ? ` на ${event.effect.demandBoostWeeks} нед` : ''
        }`
      : null;

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

      <div className="flex items-center gap-2 flex-wrap mt-2">
        {demandNote && (
          <Badge variant="secondary" className="bg-stone-100 text-stone-700 tabular-nums">
            <TrendingUp className="h-3 w-3 mr-1" aria-hidden />
            {demandNote}
          </Badge>
        )}
        {event.effect.cash !== undefined && event.effect.cash !== 0 && (
          <Badge
            variant="secondary"
            className={cn(
              'tabular-nums',
              event.effect.cash > 0
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                : 'bg-red-100 text-red-800 hover:bg-red-100',
            )}
          >
            {event.effect.cash > 0 ? '+' : '−'}
            {Math.abs(event.effect.cash).toLocaleString('ru-RU')} ₽
          </Badge>
        )}
        {event.effect.staffQuit && (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            Уволился сотрудник
          </Badge>
        )}
        {event.effect.equipmentBreak && (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            Поломка оборудования
          </Badge>
        )}
        {event.resolved && (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden />
            Решено
          </Badge>
        )}
      </div>

      {event.resolved && event.resolutionNote && (
        <p className="text-xs text-emerald-700 mt-2 flex items-start gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          {event.resolutionNote}
        </p>
      )}
      {!event.resolved && event.criticality === 'critical' && (
        <p className="text-xs text-red-700 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          Критическое событие: неделя не продолжится, пока не принято решение (диалог вверху).
        </p>
      )}
    </div>
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
function RiskBar({ label, value }: { label: string; value: number }) {
  const color = value >= 60 ? 'bg-red-500' : value >= 35 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={cn('font-medium', value >= 60 ? 'text-red-700' : 'text-stone-600')}>{label}</span>
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
