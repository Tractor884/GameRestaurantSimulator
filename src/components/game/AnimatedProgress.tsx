'use client';

/**
 * АНИМИРОВАННЫЙ ПРОГРЕСС-БАР (UI/UX-рекомендация №7): переиспользуемая
 * полоса прогресса на framer-motion. Заливка плавно перетекает при
 * изменении value (0.6с easeOut, delay 0.1); при prefers-reduced-motion
 * (useReducedMotion) ширина меняется мгновенно — без анимации.
 *
 * Семантика зон — та же, что у ScoreBar/KpiCard проекта (тёплая палитра,
 * без индиго/синего): emerald ≥70% · amber ≥45% · red ниже.
 * invert — зеркально (высокое значение = плохо: усталость, износ, FC).
 * done — цель достигнута: заливка emerald (галочку рисует вызывающий
 * рядом с баром — как в «Целях года»).
 *
 * Доступность: role="progressbar" + aria-valuenow/min/max (0..100, как
 * у существующих баров проекта), aria-label, aria-valuetext с единицами.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AnimatedProgressProps {
  /** Текущее значение (в единицах max; кап 0..100% при отрисовке). */
  value: number;
  /** Максимум шкалы (по умолчанию 100). */
  max?: number;
  /** Видимая подпись слева — включает строку «подпись — значение». */
  label?: string;
  /** Единица значения ('%', '/100', ' ₽'…) — в подписи и aria-valuetext. */
  unit?: string;
  /** Подсказка под баром (например, целевой диапазон). */
  hint?: string;
  /** Инверсия зон: высокое значение = красный (усталость/износ). */
  invert?: boolean;
  /** Цель достигнута: заливка emerald. */
  done?: boolean;
  /** Высота дорожки: 'sm' (h-1.5, строки целей) | 'md' (h-2, как ScoreBar). */
  size?: 'sm' | 'md';
  /** aria-label прогресс-бара, когда label не передан (строка выше уже есть). */
  ariaLabel?: string;
  /** Класс корневого элемента (отступы от вызывающего). */
  className?: string;
}

export function AnimatedProgress({
  value,
  max = 100,
  label,
  unit = '',
  hint,
  invert,
  done,
  size = 'md',
  ariaLabel,
  className,
}: AnimatedProgressProps) {
  const reduceMotion = useReducedMotion();
  const safeMax = max > 0 ? max : 1;
  // Кап 100%: перевыполнение не растягивает бар (как в «Целях года»).
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const rounded = Math.round(pct);

  // Зоны (как ScoreBar): ≥70 emerald, ≥45 amber, ниже red; invert — зеркально.
  const hi = pct >= 70;
  const mid = pct >= 45;
  const fillClass = done
    ? 'bg-emerald-500'
    : invert
      ? hi
        ? 'bg-red-500'
        : mid
          ? 'bg-amber-500'
          : 'bg-emerald-500'
      : hi
        ? 'bg-emerald-500'
        : mid
          ? 'bg-amber-500'
          : 'bg-red-500';

  const valueText = `${Math.round(value).toLocaleString('ru-RU')}${unit}`;

  return (
    <div className={className}>
      {label && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-stone-600">{label}</span>
          <span className="font-semibold tabular-nums text-stone-800">{valueText}</span>
        </div>
      )}
      <div
        className={cn('w-full rounded-full bg-stone-100 overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label}
        aria-valuetext={label ? valueText : undefined}
      >
        {/* initial={false}: без анимации на монтировании — только при изменении value */}
        <motion.div
          className={cn('h-full rounded-full', fillClass)}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        />
      </div>
      {hint && <p className="text-[10px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  );
}
