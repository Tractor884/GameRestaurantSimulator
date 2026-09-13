/**
 * SPOTLIGHT-подсветка шагов туториала (UI/UX-рекомендация №9).
 *
 * СВОЯ реализация без новых зависимостей:
 *  − «дырка» в тёмной маске (bg-stone-900/50) — приём box-shadow:
 *    0 0 0 9999px (тень растёт наружу от прозрачного прямоугольника и
 *    покрывает весь экран, кроме области цели);
 *  − поверх — янтарное кольцо (border-2 border-amber-400) с лёгким пульсом;
 *  − оверлей fixed z-50 и pointer-events-none: игра остаётся кликабельной,
 *    интерактивна только карточка шага (рендерится рядом в TutorialCoach);
 *  − rect цели — getBoundingClientRect + подписки на resize и scroll
 *    (capture: ловим скролл любого внутреннего контейнера — main, сайдбар);
 *  − prefers-reduced-motion — без fade и пульса;
 *  − цель не найдена или скрыта (0×0, напр. свёрнутое боковое меню на
 *    мобиле) → null: туториал деградирует в обычную карточку — существующее
 *    поведение не ломается.
 */
'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Прямоугольник цели в координатах вьюпорта (как getBoundingClientRect). */
export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Цвет маски — bg-stone-900/50 (тёплая палитра, без синего). */
const MASK_COLOR = 'rgba(28, 25, 23, 0.5)';
/** Отступ янтарного кольца от границ цели. */
const RING_PAD = 5;

/** Найти цель шага по data-tutorial-якорю и следить за её положением.
 *  Возвращает rect в координатах вьюпорта либо null (цель не найдена/скрыта).
 *
 *  React-паттерн «подписка»: состояние хранится с ключом target (устаревшее
 *  значение автоматически даёт null), все измерения — асинхронно через rAF,
 *  синхронного setState в теле эффекта нет (правило set-state-in-effect). */
export function useTutorialTargetRect(target: string | undefined): SpotlightRect | null {
  const [state, setState] = useState<{ target: string; rect: SpotlightRect | null } | null>(null);

  useEffect(() => {
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-tutorial="${target}"]`);
    if (!el) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      // display:none (мобильное свёрнутое меню) даёт 0×0 — считаем «не найдено».
      const rect: SpotlightRect | null =
        r.width > 0 && r.height > 0
          ? { top: r.top, left: r.left, width: r.width, height: r.height }
          : null;
      setState((prev) =>
        prev && prev.target === target && prev.rect?.top === rect?.top && prev.rect?.left === rect?.left && prev.rect?.width === rect?.width && prev.rect?.height === rect?.height
          ? prev
          : { target, rect },
      );
    };
    const schedule = () => {
      if (raf === 0) raf = window.requestAnimationFrame(measure);
    };

    // Если цель вне вьюпорта — мягко подтянуть её («nearest» скроллит минимум,
    // полностью видимые цели не трогает).
    const initial = el.getBoundingClientRect();
    if (
      initial.width > 0 &&
      (initial.bottom < 0 ||
        initial.top > window.innerHeight ||
        initial.right < 0 ||
        initial.left > window.innerWidth)
    ) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    schedule();
    window.addEventListener('resize', schedule, { passive: true });
    // capture: скролл внутренних контейнеров (main, сайдбар) всплывает до window.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    return () => {
      if (raf !== 0) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [target]);

  // rect валиден только для ТЕКУЩЕГО target (устаревшее — null → фолбэк).
  return state && state.target === target ? state.rect : null;
}

/** Маска с «дыркой» вокруг цели + янтарное пульсирующее кольцо.
 *  Декор (aria-hidden): смысловая нагрузка — в карточке шага (TutorialCoach).
 *  Монтируется внутри AnimatePresence — exit-fade 0.2s. */
export function TutorialSpotlight({ rect }: { rect: SpotlightRect }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      {/* «Дырка»: прозрачный прямоугольник, чей огромный box-shadow и есть маска */}
      <div
        className="absolute rounded-xl"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: `0 0 0 9999px ${MASK_COLOR}`,
        }}
      />
      {/* Янтарное кольцо с лёгким пульсом (reduced-motion — статичное) */}
      <motion.div
        className="absolute rounded-xl border-2 border-amber-400"
        style={{
          top: rect.top - RING_PAD,
          left: rect.left - RING_PAD,
          width: rect.width + RING_PAD * 2,
          height: rect.height + RING_PAD * 2,
        }}
        animate={reduced ? undefined : { opacity: [1, 0.55, 1] }}
        transition={
          reduced ? undefined : { duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
        }
      />
    </motion.div>
  );
}
