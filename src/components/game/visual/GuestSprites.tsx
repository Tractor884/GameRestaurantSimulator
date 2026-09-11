/**
 * ============================================================================
 * СПРАЙТЫ ГОСТЕЙ В СЦЕНЕ (PRESENTATION-LAYER.md §4)
 * ============================================================================
 * 2–3 мини-группы гостей-лидеров дня у столов. Есть картинка — спрайт;
 * нет — компактный бейдж сегмента (иконка + подпись + цвет настроения).
 * Настроение общее для сцены (§10) — вариант каждого спрайта = GuestMood.
 */

'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { useArtStore, resolveArt } from '@/lib/game/presentation/artState';
import type { GuestMood, GuestSpriteId } from '@/lib/game/presentation/types';
import { cn } from '@/lib/utils';
import { Briefcase, Baby, Heart, Camera, Smartphone, Gem, type LucideIcon } from 'lucide-react';

const GUEST_META: Record<GuestSpriteId, { ru: string; icon: LucideIcon }> = {
  business: { ru: 'бизнес', icon: Briefcase },
  family: { ru: 'семьи', icon: Baby },
  couple_evening: { ru: 'пары', icon: Heart },
  tourist: { ru: 'туристы', icon: Camera },
  youth: { ru: 'молодёжь', icon: Smartphone },
  premium: { ru: 'премиум', icon: Gem },
};

const GUEST_MOOD_UI: Record<GuestMood, { text: string; border: string; label: string }> = {
  happy: { text: 'text-emerald-300', border: 'border-emerald-400/60', label: 'довольны' },
  neutral: { text: 'text-stone-300', border: 'border-stone-400/40', label: 'нейтральны' },
  unhappy: { text: 'text-red-300', border: 'border-red-400/60', label: 'недовольны' },
};

/** Слоты спрайтов внутри зоны столов (по горизонтали, ряд от пола). */
const SLOTS = [
  { left: '6%', bottom: '4%', w: '26%' },
  { left: '38%', bottom: '4%', w: '26%' },
  { left: '70%', bottom: '4%', w: '26%' },
];

export function GuestSprites({
  segments,
  mood,
}: {
  segments: GuestSpriteId[];
  mood: GuestMood;
}) {
  const urls = useArtStore((s) => s.urls);
  const builtin = useGame((s) => s.state?.options?.builtinIllustrations ?? false);
  const ui = GUEST_MOOD_UI[mood];

  const resolved = useMemo(
    () =>
      segments.slice(0, 3).map((seg) => ({
        seg,
        src: resolveArt(`guests/${seg}/${mood}`, urls, builtin).src,
      })),
    [segments, mood, urls, builtin],
  );

  if (resolved.length === 0) return null;

  return (
    <>
      {resolved.map(({ seg, src }, i) => {
        const slot = SLOTS[i];
        const meta = GUEST_META[seg];
        return (
          <div
            key={seg}
            className="absolute pointer-events-none"
            style={{ left: slot.left, bottom: slot.bottom, width: slot.w, height: '72%' }}
            aria-hidden
          >
            {src ? (
               
              <img src={src} alt={`Гости: ${meta.ru}`} loading="lazy" decoding="async" className="h-full w-full object-contain drop-shadow-lg" />
            ) : (
              // Бейдж сегмента-лидера (нет спрайта — но лидерство видно).
              <div className={cn('flex h-full max-h-16 items-end justify-center', ui.text)}>
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-full border bg-stone-900/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm',
                    ui.border,
                  )}
                >
                  <meta.icon className="h-3 w-3" aria-hidden />
                  <span>{meta.ru}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
