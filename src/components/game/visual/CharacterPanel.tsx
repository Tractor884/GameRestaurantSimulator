/**
 * ============================================================================
 * ПАНЕЛЬ ПЕРСОНАЖА (PRESENTATION-LAYER.md §4–§5)
 * ============================================================================
 * Портрет + имя/роль + реплика + мини-KPI зоны (значения из state).
 * Вставляется сверху пилотных экранов: grid lg:grid-cols-[280px,1fr]
 * (на мобиле — сверху). Существующие таблицы/KPI НЕ удаляются.
 *
 * АНИМАЦИИ (рекомендация №1): рамка панели и бейдж настроения — плавный
 * transition-colors 300ms; точка-индикатор при critical — короткий
 * «тревожный» pulse (scale 1→1.02 + мягкое притухание, 1.2s, infinite).
 * prefers-reduced-motion — всё статично, только цветовые переходы.
 */

'use client';

import { useMemo, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useGame } from '@/lib/game/store/gameStore';
import {
  getCharacterMood,
  getFinanceVisualState,
  getWarehouseVisualState,
  getEquipmentVisualState,
  guestTrend,
  currentFoodCost,
  peakKitchenLoad,
  runwayWeeks,
} from '@/lib/game/presentation';
import type { CharacterId, Mood } from '@/lib/game/presentation/types';
import { CHARACTER_META, MOOD_UI } from './characterMeta';
import { CharacterPortrait } from './CharacterPortrait';
import { VisualMessage } from './VisualMessage';
import { cn } from '@/lib/utils';
import { moneyShort } from '../widgets';

interface KpiRow {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'warn' | 'neutral';
}

/** Мини-KPI зоны персонажа (§13 карты: персонаж ↔ своя зона). */
function zoneKpis(id: CharacterId): KpiRow[] {
  const state = useGame.getState().state;
  if (!state?.restaurant) return [];
  const r = state.restaurant;
  switch (id) {
    case 'hr': {
      let cnt = 0;
      let fatigue = 0;
      let morale = 0;
      for (const p of Object.values(r.staff.pools)) {
        fatigue += p.fatigue * p.count;
        morale += p.morale * p.count;
        cnt += p.count;
      }
      const f = cnt ? fatigue / cnt : 0;
      const m = cnt ? morale / cnt : 0;
      return [
        { label: 'Усталость', value: `${f.toFixed(0)}/100`, tone: f > 60 ? 'bad' : f > 30 ? 'warn' : 'good' },
        { label: 'Мораль', value: `${m.toFixed(0)}/100`, tone: m < 50 ? 'bad' : m < 75 ? 'warn' : 'good' },
      ];
    }
    case 'chef': {
      const fc = currentFoodCost(state);
      const peak = peakKitchenLoad(state);
      return [
        { label: 'Food Cost', value: `${(fc * 100).toFixed(1)}%`, tone: fc > 0.36 ? 'bad' : fc < 0.34 ? 'good' : 'warn' },
        { label: 'Пик кухни', value: peak.toFixed(2), tone: peak >= 1.2 ? 'bad' : peak >= 1 ? 'warn' : 'good' },
      ];
    }
    case 'accountant': {
      const fin = getFinanceVisualState(state);
      return [
        { label: 'Запас кассы', value: `${fin.runwayWeeks.toFixed(1)} нед`, tone: fin.runwayWeeks < 1 ? 'bad' : fin.runwayWeeks < 4 ? 'warn' : 'good' },
        { label: 'Прибыль/нед', value: moneyShort(fin.lastNetProfit), tone: fin.lastNetProfit < 0 ? 'bad' : 'good' },
      ];
    }
    case 'warehouse_manager': {
      const wh = getWarehouseVisualState(state);
      return [
        { label: 'Запас', value: `${wh.coverDays.toFixed(1)} дн`, tone: wh.coverDays < 0.5 ? 'bad' : wh.coverDays < 1.5 ? 'warn' : 'good' },
        { label: 'Порча', value: `${(wh.wasteShare * 100).toFixed(1)}%`, tone: wh.wasteShare > 0.05 ? 'bad' : 'neutral' },
      ];
    }
    case 'technician': {
      const eq = getEquipmentVisualState(state);
      const maxWear = Math.max(...eq.zones.map((z) => z.wear));
      return [
        { label: 'Макс. износ', value: `${maxWear.toFixed(0)}/100`, tone: maxWear >= 80 ? 'bad' : maxWear >= 60 ? 'warn' : 'good' },
        { label: 'Техриск', value: `${r.risks.technical.toFixed(0)}`, tone: r.risks.technical >= 70 ? 'bad' : r.risks.technical >= 50 ? 'warn' : 'good' },
      ];
    }
    case 'marketer': {
      const trend = guestTrend(state);
      const active = r.marketing.campaigns.filter((c) => c.endedWeek == null).length;
      return [
        { label: 'Тренд гостей', value: `${trend > 0 ? '+' : ''}${(trend * 100).toFixed(1)}%`, tone: trend < -0.05 ? 'bad' : trend > 0.08 ? 'good' : 'neutral' },
        { label: 'Кампании', value: `${active} активн.`, tone: 'neutral' },
      ];
    }
    case 'banker': {
      const debt = r.finance.loans.reduce((s, l) => s + l.remaining, 0);
      const overdue = r.finance.loans.reduce((s, l) => s + l.overduePayments, 0);
      return [
        { label: 'Долг', value: debt > 0 ? moneyShort(debt) : 'нет', tone: 'neutral' },
        { label: 'Просрочка', value: overdue > 0 ? `${overdue} плат.` : 'нет', tone: overdue > 0 ? 'bad' : 'good' },
      ];
    }
    case 'owner': {
      const bsc = state.weekResult?.bsc.total ?? 0;
      return [
        { label: 'BSC', value: `${bsc}`, tone: bsc >= 70 ? 'good' : bsc >= 55 ? 'warn' : 'bad' },
        { label: 'Запас кассы', value: `${runwayWeeks(state).toFixed(1)} нед`, tone: runwayWeeks(state) < 4 ? 'warn' : 'good' },
      ];
    }
  }
}

export function CharacterPanel({
  characterId,
  /** Компактный режим для узких мест (мини-иконки). */
  compact = false,
  /** Вертикальная компоновка для узкой колонки (portrait сверху). */
  vertical = false,
  right,
}: {
  characterId: CharacterId;
  compact?: boolean;
  vertical?: boolean;
  right?: ReactNode;
}) {
  const state = useGame((s) => s.state)!;
  const mood: Mood = useMemo(() => getCharacterMood(state, characterId), [state, characterId]);
  const meta = CHARACTER_META[characterId];
  const ui = MOOD_UI[mood];
  const kpis = useMemo(() => zoneKpis(characterId), [state, characterId]);
  const size = compact ? 88 : 120;
  const prefersReduced = useReducedMotion();
  const critical = mood === 'critical' && !prefersReduced;

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-3 shadow-sm transition-colors duration-300',
        ui.border,
        vertical ? 'flex flex-col items-center text-center' : 'flex gap-3',
      )}
    >
      <CharacterPortrait characterId={characterId} mood={mood} size={size} />
      <div className={cn('min-w-0 flex-1 flex flex-col', vertical && 'mt-3 w-full items-center')}>
        <div className={cn('flex w-full items-start justify-between gap-2', vertical && 'justify-center')}>
          <div className={cn('min-w-0', vertical && 'text-center')}>
            <p className="font-bold text-stone-900 leading-tight">{meta.name}</p>
            <p className="text-xs text-stone-500">{meta.role}</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 transition-colors duration-300',
              ui.bg,
              ui.text,
              vertical && 'ml-2',
            )}
            title={`Состояние зоны: ${ui.label}`}
          >
            <motion.span
              className={cn('h-1.5 w-1.5 rounded-full transition-colors duration-300', ui.dot)}
              aria-hidden
              animate={critical ? { scale: [1, 1.02, 1], opacity: [1, 0.65, 1] } : { scale: 1, opacity: 1 }}
              transition={critical ? { duration: 1.2, ease: 'easeInOut', repeat: Infinity } : { duration: 0.2, ease: 'easeOut' }}
            />
            {ui.label}
          </span>
        </div>
        <div className="mt-1.5">
          <VisualMessage characterId={characterId} mood={mood} />
        </div>
        {!compact && kpis.length > 0 && (
          <div className="mt-auto w-full pt-2 grid grid-cols-2 gap-1.5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg bg-stone-50 px-2 py-1.5 text-left">
                <p className="text-[10px] uppercase tracking-wide text-stone-400 truncate">{k.label}</p>
                <p
                  className={cn(
                    'text-sm font-bold tabular-nums',
                    k.tone === 'good' && 'text-emerald-700',
                    k.tone === 'bad' && 'text-red-700',
                    k.tone === 'warn' && 'text-amber-700',
                    (!k.tone || k.tone === 'neutral') && 'text-stone-800',
                  )}
                >
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        )}
        {right}
      </div>
    </div>
  );
}
