/**
 * ============================================================================
 * РЕПЛИКА ПЕРСОНАЖА (PRESENTATION-LAYER.md §4)
 * ============================================================================
 * Короткая строка «персона реагирует на KPI»: выбор шаблона —
 * ДЕТЕРМИНИРОВАННЫЙ хэш от недели/дня (НЕ RNG — скриншот-стабильность).
 *
 * АНИМАЦИИ (рекомендация №1): смена настроения — лёгкий crossfade реплики
 * (opacity + y 3px, 0.18s easeOut, только transform/opacity). Контейнер
 * aria-live="polite" остаётся постоянным DOM-узлом — скринридер объявляет
 * смену реплики корректно; текст цвета плавно перетекает (transition-colors).
 * prefers-reduced-motion — мгновенная подмена.
 */

'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGame } from '@/lib/game/store/gameStore';
import type { CharacterId, Mood } from '@/lib/game/presentation/types';
import { CHARACTER_LINES, MOOD_UI, pickLine } from './characterMeta';
import { cn } from '@/lib/utils';

export function VisualMessage({ characterId, mood }: { characterId: CharacterId; mood: Mood }) {
  const week = useGame((s) => s.state?.week ?? 1);
  const day = useGame((s) => s.state?.day ?? 0);
  const prefersReduced = useReducedMotion();
  const line = useMemo(() => {
    const lines = CHARACTER_LINES[characterId][mood];
    const salt = characterId.length + mood.length;
    return pickLine(lines, week, day, salt);
  }, [characterId, mood, week, day]);
  const ui = MOOD_UI[mood];

  return (
    <p className={cn('text-xs leading-snug transition-colors duration-300', ui.text)} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mood}
          className="inline-block"
          initial={prefersReduced ? false : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReduced ? 0 : -3 }}
          transition={{ duration: prefersReduced ? 0 : 0.18, ease: 'easeOut' }}
        >
          «{line}»
        </motion.span>
      </AnimatePresence>
    </p>
  );
}
