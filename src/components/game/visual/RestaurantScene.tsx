/**
 * ============================================================================
 * ЖИВАЯ СЦЕНА ЗАЛА — ГЛАВНЫЙ ЭКРАН (VISUAL_STATE_MAP §11)
 * ============================================================================
 * Композит: база (фото/схема) + слои состояния (очередь, грязь, посуда,
 * кофе, пар/дым, предписание) + спрайты гостей и смены + строка
 * индикаторов с числами. Все вычисления — pure от GameState (useMemo).
 *
 * Без арта сцена остаётся информативной: схематичные зоны ANCHOR-GRID +
 * чипы состояния. Загруженные/встроенные картинки укладываются в те же
 * якоря (ПРИОРИТЕТ: своя загрузка → встроенная → схемка).
 */

'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { useArtStore, resolveArt } from '@/lib/game/presentation/artState';
import { getRestaurantVisualState } from '@/lib/game/presentation';
import type { Mood, QueueLevel } from '@/lib/game/presentation/types';
import type { RoleId } from '@/lib/game/types';
import { SceneLayer, ANCHORS } from './SceneLayer';
import { GuestSprites } from './GuestSprites';
import { cn } from '@/lib/utils';
import {
  Users,
  Coffee,
  Flame,
  Sparkles,
  UtensilsCrossed,
  DoorOpen,
  ConciergeBell,
  FileWarning,
  type LucideIcon,
} from 'lucide-react';

/* ── Спрайт сотрудника смены в сцене ── */

const STAFF_META: Record<string, { ru: string; icon: LucideIcon }> = {
  waiter: { ru: 'официант', icon: ConciergeBell },
  hostess: { ru: 'хостес', icon: DoorOpen },
};

function StaffSprite({ roleId, mood, style }: { roleId: RoleId; mood: Mood; style: React.CSSProperties }) {
  const urls = useArtStore((s) => s.urls);
  const builtin = useGame((s) => s.state?.options?.builtinIllustrations ?? false);
  const src = useMemo(() => resolveArt(`staff/${roleId}/${mood}`, urls, builtin).src, [roleId, mood, urls, builtin]);
  const meta = STAFF_META[roleId] ?? { ru: roleId, icon: Users };
  const ring =
    mood === 'great' ? 'ring-emerald-400' : mood === 'warning' ? 'ring-amber-400' : mood === 'critical' ? 'ring-red-400' : 'ring-stone-300';
  const tone =
    mood === 'great' ? 'text-emerald-300' : mood === 'warning' ? 'text-amber-300' : mood === 'critical' ? 'text-red-300' : 'text-stone-300';

  return (
    <div className="absolute pointer-events-none" style={style} aria-hidden>
      {src ? (
         
        <img src={src} alt={meta.ru} loading="lazy" decoding="async" className="h-full w-full object-contain drop-shadow-lg" />
      ) : (
        <div className="flex h-full flex-col items-center justify-end gap-0.5">
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/75 ring-2 backdrop-blur-sm', ring, tone)} title={`${meta.ru}: ${mood}`}>
            <meta.icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="rounded-full bg-stone-900/70 px-1.5 text-[9px] text-stone-300 backdrop-blur-sm">{meta.ru}</span>
        </div>
      )}
    </div>
  );
}

/* ── Чип состояния ── */

function SceneChip({
  icon: Icon,
  text,
  tone,
  title,
}: {
  icon: LucideIcon;
  text: string;
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm',
        tone === 'ok' && 'bg-emerald-900/70 text-emerald-200',
        tone === 'neutral' && 'bg-stone-900/70 text-stone-200',
        tone === 'warn' && 'bg-amber-900/75 text-amber-200',
        tone === 'bad' && 'bg-red-900/80 text-red-200',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {text}
    </span>
  );
}

const QUEUE_RU: Record<QueueLevel, string> = {
  none: 'нет очереди',
  small: 'очередь 3–5',
  medium: 'очередь 6–10',
  large: 'очередь 10+',
};

/* ── Схематичная база (нет картинки) ── */

function SchematicBase() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-stone-900 to-emerald-950" aria-hidden>
      {/* Кухонный пасс */}
      <div
        className="absolute rounded-lg border border-emerald-800/80 bg-emerald-900/60"
        style={{ left: '4%', top: '6%', width: '55%', height: '26%' }}
      >
        <div className="flex h-full items-center justify-around px-4">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-8 w-8 rounded-full border-2 border-amber-500/40 bg-amber-400/10" />
          ))}
        </div>
        <span className="absolute left-2 top-1 text-[9px] uppercase tracking-widest text-stone-400">кухня · пасс</span>
      </div>
      {/* Кофе-станция */}
      <div
        className="absolute rounded-lg border border-emerald-800/80 bg-emerald-900/60"
        style={{ left: '62%', top: '8%', width: '20%', height: '22%' }}
      >
        <Coffee className="mx-auto h-5 w-5 text-amber-300/70" aria-hidden />
        <span className="absolute left-2 top-1 text-[9px] uppercase tracking-widest text-stone-400">кофе</span>
      </div>
      {/* Окна слева */}
      <div className="absolute flex flex-col justify-around" style={{ left: '1%', top: '32%', width: '6%', height: '48%' }} aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-[26%] rounded-sm border border-amber-200/20 bg-amber-100/10" />
        ))}
      </div>
      {/* Столы */}
      <div
        className="absolute grid grid-cols-3 grid-rows-2 gap-2 p-2"
        style={{ left: '8%', top: '36%', width: '58%', height: '40%' }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="rounded-md border border-stone-600/60 bg-stone-800/80 shadow-inner" />
        ))}
      </div>
      {/* Вход */}
      <div
        className="absolute rounded-lg border border-amber-700/50 bg-amber-900/25"
        style={{ left: '82%', top: '78%', width: '14%', height: '18%' }}
      >
        <DoorOpen className="mx-auto h-4 w-4 text-amber-300/80" aria-hidden />
        <span className="absolute left-2 top-0.5 text-[9px] uppercase tracking-widest text-stone-400">вход</span>
      </div>
    </div>
  );
}

/* ── Основной компонент ── */

export function RestaurantScene() {
  const state = useGame((s) => s.state)!;
  const urls = useArtStore((s) => s.urls);
  const builtin = useGame((s) => s.state?.options?.builtinIllustrations ?? false);

  const visual = useMemo(() => getRestaurantVisualState(state), [state]);
  const baseSrc = useMemo(() => resolveArt('scenes/restaurant/restaurant_base', urls, builtin).src, [urls, builtin]);

  const layer = (key: string): string | null => resolveArt(key, urls, builtin).src;

  const queueLayerKey =
    visual.queue === 'small' ? 'objects/queue_small' : visual.queue === 'medium' ? 'objects/queue_medium' : visual.queue === 'large' ? 'objects/queue_large' : null;

  const maxQueue = useMemo(() => {
    let q = 0;
    for (const h of state.lastDayResult?.hourLogs ?? []) q = Math.max(q, h.queueAvg);
    return q;
  }, [state]);
  const cleanliness = state.restaurant?.cleanliness ?? 100;
  const satisfaction = state.lastDayResult?.kpi.satisfaction;

  const floorOpacity = cleanliness >= 50 ? 0.4 : 1;

  return (
    <div className="space-y-2">
      <div
        className="relative aspect-[7/4] w-full overflow-hidden rounded-xl border border-stone-300 shadow-inner"
        role="img"
        aria-label={`Сцена зала: ${QUEUE_RU[visual.queue]}, чистота ${cleanliness.toFixed(0)}/100, гости ${visual.guestMood === 'happy' ? 'довольны' : visual.guestMood === 'unhappy' ? 'недовольны' : 'нейтральны'}`}
      >
        {baseSrc ? (
           
          <img src={baseSrc} alt="Зал ресторана" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <SchematicBase />
        )}

        {/* Слои состояния (есть картинка — показываем; нет — чип ниже). */}
        {queueLayerKey && <SceneLayer src={layer(queueLayerKey)} anchor={ANCHORS.entrance} alt="Очередь" />}
        {visual.notice !== 'none' && (
          <SceneLayer src={layer('objects/penalty_notice')} anchor={{ x: 84, y: 62, w: 10, h: 14 }} alt="Предписание" />
        )}
        {visual.floor !== 'off' && (
          <SceneLayer src={layer('objects/floor_dirty')} anchor={ANCHORS['floor-front']} opacity={floorOpacity} alt="Грязный пол" />
        )}
        {visual.dishes === 'on' && <SceneLayer src={layer('objects/dirty_dishes')} anchor={{ x: 4, y: 28, w: 14, h: 12 }} alt="Гора посуды" />}
        {visual.coffee !== 'ok' && (
          <SceneLayer src={layer(visual.coffee === 'broken' ? 'objects/coffee_broken' : 'objects/coffee_warning')} anchor={ANCHORS['coffee-station']} alt="Кофемашина" />
        )}
        {visual.kitchen !== 'off' && (
          <SceneLayer src={layer(visual.kitchen === 'heavy' ? 'objects/kitchen_smoke' : 'objects/kitchen_steam')} anchor={{ x: 10, y: 2, w: 42, h: 16 }} opacity={visual.kitchen === 'heavy' ? 1 : 0.8} alt="Пар над кухней" />
        )}

        {/* Гости у столов (топ-сегменты дня). */}
        <div className="absolute" style={{ left: '10%', top: '42%', width: '54%', height: '30%' }} aria-hidden>
          <GuestSprites segments={visual.guestSegments} mood={visual.guestMood} />
        </div>

        {/* Смена в зале: официант у столов, хостес у входа. */}
        {visual.staff.map((s) => (
          <StaffSprite
            key={s.roleId}
            roleId={s.roleId}
            mood={s.mood}
            style={
              s.roleId === 'waiter'
                ? { left: '68%', top: '52%', width: '10%', height: '22%' }
                : { left: '76%', top: '74%', width: '9%', height: '20%' }
            }
          />
        ))}

        {/* Строка индикаторов (числа всегда видны). */}
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1.5">
          <SceneChip
            icon={Users}
            text={QUEUE_RU[visual.queue]}
            tone={visual.queue === 'none' || visual.queue === 'small' ? 'ok' : visual.queue === 'medium' ? 'warn' : 'bad'}
            title={`Пик очереди за день: ${maxQueue.toFixed(1)} чел.`}
          />
          <SceneChip
            icon={Sparkles}
            text={`чистота ${cleanliness.toFixed(0)}`}
            tone={cleanliness >= 75 ? 'ok' : cleanliness >= 50 ? 'warn' : 'bad'}
          />
          {visual.dishes === 'on' && <SceneChip icon={UtensilsCrossed} text="посуда копится" tone="warn" />}
          {visual.coffee !== 'ok' && (
            <SceneChip icon={Coffee} text={visual.coffee === 'broken' ? 'кофемашина сломана' : 'кофемашина течёт'} tone={visual.coffee === 'broken' ? 'bad' : 'warn'} />
          )}
          {visual.kitchen !== 'off' && (
            <SceneChip icon={Flame} text={visual.kitchen === 'heavy' ? 'кухня в дыму' : 'кухня на пике'} tone={visual.kitchen === 'heavy' ? 'bad' : 'warn'} />
          )}
          {visual.notice !== 'none' && <SceneChip icon={FileWarning} text="предписание на входе" tone="bad" />}
          {typeof satisfaction === 'number' && (
            <SceneChip
              icon={Users}
              text={`гости: ${visual.guestMood === 'happy' ? 'довольны' : visual.guestMood === 'unhappy' ? 'недовольны' : 'нейтрально'} · удовл. ${satisfaction}`}
              tone={visual.guestMood === 'happy' ? 'ok' : visual.guestMood === 'unhappy' ? 'bad' : 'neutral'}
            />
          )}
        </div>
      </div>
      <p className="text-[11px] text-stone-400">
        Сцена показывает состояние, а не время. Иллюстрации — в разделе «Иллюстрации»: загрузите свои картинки для каждой зоны.
      </p>
    </div>
  );
}
