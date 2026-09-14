/**
 * ============================================================================
 * ПОРТРЕТ ПЕРСОНАЖА (PRESENTATION-LAYER.md §4)
 * ============================================================================
 * img с ореолом настроения ИЛИ нейтральный плейсхолдер (инициал + иконка
 * роли) — экран обязан работать без арта (ART_STYLE §10).
 * Приоритет источника: пользовательская загрузка → встроенная → плейсхолдер.
 *
 * АНИМАЦИИ (рекомендация №1; только transform/opacity — 60fps, без layout-shift):
 *  - смена настроения/картинки: AnimatePresence crossfade 0.25s easeOut
 *    (opacity + scale 0.96→1; exit scale 0.98);
 *  - кольцо настроения: плавная смена цвета ring через transition box-shadow
 *    300ms (ring в Tailwind — это box-shadow, transition-colors его не берёт);
 *  - idle-«живость»: деликатный bob ±2.5px, 3.4s, ease-in-out, infinite —
 *    только в спокойных состояниях (normal/great); warning/critical — статика;
 *  - prefers-reduced-motion: все переходы мгновенные (duration 0, без bob).
 */

'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
  /** Жидкий режим: квадрат на всю ширину родителя (size игнорируется) — «геройный» портрет в колонке экрана. */
  fluid?: boolean;
  className?: string;
}

export function CharacterPortrait({ characterId, mood, size = 128, fluid = false, className }: CharacterPortraitProps) {
  const meta = CHARACTER_META[characterId];
  const urls = useArtStore((s) => s.urls);
  const builtin = useGame((s) => s.state?.options?.builtinIllustrations ?? false);
  const key = `${meta.artPrefix}/${mood}`;
  const { src, source } = useMemo(() => resolveArt(key, urls, builtin), [key, urls, builtin]);
  const [failed, setFailed] = useState(false);
  const ui = MOOD_UI[mood];
  const showImage = !!src && !failed;
  const prefersReduced = useReducedMotion();

  // Idle-покачивание — только для спокойных состояний и без reduced-motion.
  const calm = (mood === 'normal' || mood === 'great') && !prefersReduced;

  return (
    <div
      className={cn('relative shrink-0 select-none', fluid && 'aspect-square w-full', className)}
      style={fluid ? undefined : { width: size, height: size }}
      role="img"
      aria-label={`${meta.name}, ${meta.role}: ${ui.label}`}
    >
      {/* Обёртка idle-«живости»: bob ±2.5px, 3.4s (только transform). */}
      <motion.div
        className="absolute inset-0"
        animate={calm ? { y: [0, -2.5, 0] } : { y: 0 }}
        transition={calm ? { duration: 3.4, ease: 'easeInOut', repeat: Infinity } : { duration: 0.25, ease: 'easeOut' }}
      >
        {/* Ореол настроения (ART_STYLE §2.2): кольцо цвета состояния — плавная смена. */}
        <div className={cn('absolute inset-0 rounded-2xl ring-4 transition-[box-shadow] duration-300', ui.ring)} aria-hidden />
        {/* Картинка: crossfade при смене mood (key = src), обе абсолюты — без layout-shift. */}
        <AnimatePresence initial={false}>
          {showImage && (
            <motion.div
              key={src}
              className="absolute inset-0"
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: prefersReduced ? 1 : 0.98 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }}
            >
              <img
                src={src!}
                alt={`${meta.name}, ${meta.role}`}
                width={fluid ? undefined : size}
                height={fluid ? undefined : size}
                loading="lazy"
                decoding="async"
                className="h-full w-full rounded-2xl object-cover bg-stone-900"
                onError={() => setFailed(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Плейсхолдер: иконка роли + инициал (fallback-стандарт ART_STYLE §10). */}
        <div
          className={cn(
            'absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 border-2 transition-[opacity,border-color] duration-300',
            ui.border,
            showImage ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden={showImage}
        >
          <meta.icon className="h-[34%] w-[34%] text-stone-400" strokeWidth={1.5} />
          <span
            className={cn('mt-1 font-bold leading-none', meta.colorClass, fluid && 'text-5xl')}
            style={fluid ? undefined : { fontSize: size * 0.26 }}
          >
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
      </motion.div>
    </div>
  );
}
