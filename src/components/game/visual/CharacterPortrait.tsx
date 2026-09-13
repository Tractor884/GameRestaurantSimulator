/**
 * ============================================================================
 * ПОРТРЕТ ПЕРСОНАЖА (PRESENTATION-LAYER.md §4)
 * ============================================================================
 * img с ореолом настроения ИЛИ нейтральный плейсхолдер (инициал + иконка
 * роли) — экран обязан работать без арта (ART_STYLE §10).
 * Приоритет источника: пользовательская загрузка → встроенная → плейсхолдер.
 */

'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { useArtStore, resolveArt } from '@/lib/game/presentation/artState';
import type { CharacterId, Mood } from '@/lib/game/presentation/types';
import { CHARACTER_META, MOOD_UI } from './characterMeta';
import { cn } from '@/lib/utils';

export interface CharacterPortraitProps {
  characterId: CharacterId;
  mood: Mood;
  /** px базового размера (плейсхолдер и кольцо масштабируются). */
  size?: number;
  className?: string;
}

export function CharacterPortrait({ characterId, mood, size = 128, className }: CharacterPortraitProps) {
  const meta = CHARACTER_META[characterId];
  const urls = useArtStore((s) => s.urls);
  const builtin = useGame((s) => s.state?.options?.builtinIllustrations ?? false);
  const key = `${meta.artPrefix}/${mood}`;
  const { src, source } = useMemo(() => resolveArt(key, urls, builtin), [key, urls, builtin]);
  const [failed, setFailed] = useState(false);
  const ui = MOOD_UI[mood];
  const showImage = !!src && !failed;

  return (
    <div
      className={cn('relative shrink-0 select-none', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${meta.name}, ${meta.role}: ${ui.label}`}
    >
      {/* Ореол настроения (ART_STYLE §2.2): кольцо цвета состояния */}
      <div className={cn('absolute inset-0 rounded-2xl ring-4 transition-colors', ui.ring)} aria-hidden />
      {showImage && (
         
        <img
          src={src!}
          alt={`${meta.name}, ${meta.role}`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-2xl object-cover bg-stone-900"
          onError={() => setFailed(true)}
        />
      )}
      {/* Плейсхолдер: иконка роли + инициал (fallback-стандарт ART_STYLE §10). */}
      <div
        className={cn(
          'absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 border-2 transition-opacity',
          ui.border,
          showImage ? 'opacity-0' : 'opacity-100',
        )}
        aria-hidden={showImage}
      >
        <meta.icon className="h-[34%] w-[34%] text-stone-400" strokeWidth={1.5} />
        <span className={cn('mt-1 font-bold leading-none', meta.colorClass)} style={{ fontSize: size * 0.26 }}>
          {meta.name[0]}
        </span>
      </div>
      {/* Метка «своя» — пользовательская картинка перекрыла встроенную. */}
      {source === 'custom' && (
        <span
          className="absolute -bottom-1 -right-1 rounded-full bg-emerald-600 text-white text-[9px] font-semibold px-1.5 py-0.5 shadow"
          title="Пользовательская картинка (приоритет над встроенной)"
        >
          своя
        </span>
      )}
    </div>
  );
}
