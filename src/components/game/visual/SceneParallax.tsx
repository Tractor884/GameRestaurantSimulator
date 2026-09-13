/**
 * ============================================================================
 * ПАРАЛЛАКС-ОБЁРТКА СЦЕНЫ (рекомендация №2 UI/UX)
 * ============================================================================
 * Деликатный pointer-параллакс: курсор над сценой → слои смещаются с разной
 * «глубиной» (амплитуда в px), плоскость сцены слегка наклоняется (≤2°,
 * perspective 800px на контейнере). Центр сцены = нейтральная позиция.
 *
 * ГРАНИЦЫ:
 *  - только transform (60fps, compositor), НОЛЬ re-render на mousemove —
 *    MotionValue → useSpring → transform на rAF, без setState;
 *  - ЯКОРЯ ANCHORS и %-позиционирование слоёв НЕ затрагиваются: параллакс —
 *    только transform-обёртка вокруг существующих стилей;
 *  - тач (pointer: coarse) и prefers-reduced-motion — параллакс полностью
 *    выключен (значения остаются 0, обработчики молчат);
 *  - гидратация: matchMedia читается в effect — рендер сервера/клиента
 *    совпадает (первый кадр всегда нейтрален).
 */

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type MotionStyle,
  type MotionValue,
} from 'framer-motion';

/** Нормированное положение курсора (−0.5…0.5 от центра), пружиненное. */
interface SceneParallaxValue {
  x: MotionValue<number>;
  y: MotionValue<number>;
}

const SceneParallaxContext = createContext<SceneParallaxValue | null>(null);

/** Пружина «дорогого» следования за курсором: stiffness 70 (задание 60–80),
 *  почти критичное демпфирование — без колебаний, мягкий догон. */
const SPRING = { stiffness: 70, damping: 17, mass: 1 };
/** Максимальный наклон плоскости сцены, градусы. */
const MAX_TILT_DEG = 2;

const clampHalf = (v: number) => (v < -0.5 ? -0.5 : v > 0.5 ? 0.5 : v);

export interface SceneParallaxProps extends HTMLAttributes<HTMLDivElement> {
  /** Перспектива 3D-наклона контейнера (px), по умолчанию 800. */
  perspective?: number;
}

/**
 * Контейнер сцены: слушает pointer-move (только desktop pointer: fine),
 * центр = нейтраль. Слои берут глубину через useSceneParallaxTransform /
 * <ParallaxLayer>, наклон — через <SceneTilt>. Дети без обёрток остаются
 * статичными (строка индикаторов) — числа всегда читаемы.
 */
export function SceneParallax({ children, perspective = 800, ...rest }: SceneParallaxProps) {
  const prefersReduced = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const update = () => setFinePointer(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const enabled = finePointer && !prefersReduced;

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, SPRING);
  const y = useSpring(rawY, SPRING);

  const areaRef = useRef<HTMLDivElement>(null);

  // Параллакс выключился (сменился режим/устройство) — мгновенно в нейтраль.
  useEffect(() => {
    if (!enabled) {
      rawX.set(0);
      rawY.set(0);
    }
  }, [enabled, rawX, rawY]);

  // Без setState: только MotionValue.set → пружина → transform на rAF.
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const el = areaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    rawX.set(clampHalf((e.clientX - r.left) / r.width - 0.5));
    rawY.set(clampHalf((e.clientY - r.top) / r.height - 0.5));
  };

  const reset = () => {
    rawX.set(0);
    rawY.set(0);
  };

  const value = useMemo<SceneParallaxValue>(() => ({ x, y }), [x, y]);

  return (
    <SceneParallaxContext.Provider value={value}>
      <div
        {...rest}
        ref={areaRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={reset}
        style={{ ...rest.style, perspective }}
      >
        {children}
      </div>
    </SceneParallaxContext.Provider>
  );
}

/**
 * Плоскость сцены: лёгкий rotateX/rotateY ≤2° за курсором (перспектива — на
 * контейнере SceneParallax). Внутренняя %-разметка детей не меняется.
 */
export function SceneTilt({ children, className }: { children?: ReactNode; className?: string }) {
  const ctx = useContext(SceneParallaxContext);
  const idleX = useMotionValue(0);
  const idleY = useMotionValue(0);
  const rotateY = useTransform(ctx ? ctx.x : idleX, [-0.5, 0.5], [-MAX_TILT_DEG, MAX_TILT_DEG]);
  const rotateX = useTransform(ctx ? ctx.y : idleY, [-0.5, 0.5], [-MAX_TILT_DEG, MAX_TILT_DEG]);
  return (
    <motion.div className={className} style={{ rotateX, rotateY }}>
      {children}
    </motion.div>
  );
}

/**
 * Глубина слоя: амплитуда смещения от центра сцены (px). Слои «плывут» против
 * курса (эффект панорамы камеры): передние ±8–10px, средние ±6–7px,
 * дальние ±3–4px, база ±2px. Вне SceneParallax или при выключенном
 * параллаксе значения всегда 0 (transform нейтрален).
 */
export function useSceneParallaxTransform(depth: number): { x: MotionValue<number>; y: MotionValue<number> } {
  const ctx = useContext(SceneParallaxContext);
  const idleX = useMotionValue(0);
  const idleY = useMotionValue(0);
  const x = useTransform(ctx ? ctx.x : idleX, [-0.5, 0.5], [depth, -depth]);
  const y = useTransform(ctx ? ctx.y : idleY, [-0.5, 0.5], [depth, -depth]);
  return { x, y };
}

export interface ParallaxLayerProps extends Omit<HTMLMotionProps<'div'>, 'style'> {
  /** Амплитуда параллакса слоя от центра сцены (px). */
  depth: number;
  /** Координаты как раньше (left/top/width/height/…) + motion-поля (scale…). */
  style?: MotionStyle;
  children?: ReactNode;
}

/** absolute-слой сцены с параллаксом: прежние координаты + лёгкий transform. */
export function ParallaxLayer({ depth, style, children, ...rest }: ParallaxLayerProps) {
  const { x, y } = useSceneParallaxTransform(depth);
  return (
    <motion.div {...rest} style={{ ...style, x, y }}>
      {children}
    </motion.div>
  );
}
