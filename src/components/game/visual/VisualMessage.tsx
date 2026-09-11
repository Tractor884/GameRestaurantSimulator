/**
 * ============================================================================
 * РЕПЛИКА ПЕРСОНАЖА (PRESENTATION-LAYER.md §4)
 * ============================================================================
 * Короткая строка «персона реагирует на KPI»: выбор шаблона —
 * ДЕТЕРМИНИРОВАННЫЙ хэш от недели/дня (НЕ RNG — скриншот-стабильность).
 */

'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import type { CharacterId, Mood } from '@/lib/game/presentation/types';
import { CHARACTER_LINES, MOOD_UI, pickLine } from './characterMeta';
import { cn } from '@/lib/utils';

export function VisualMessage({ characterId, mood }: { characterId: CharacterId; mood: Mood }) {
  const week = useGame((s) => s.state?.week ?? 1);
  const day = useGame((s) => s.state?.day ?? 0);
  const line = useMemo(() => {
    const lines = CHARACTER_LINES[characterId][mood];
    const salt = characterId.length + mood.length;
    return pickLine(lines, week, day, salt);
  }, [characterId, mood, week, day]);
  const ui = MOOD_UI[mood];

  return (
    <p className={cn('text-xs leading-snug', ui.text)} aria-live="polite">
      «{line}»
    </p>
  );
}
