/**
 * ============================================================================
 * СЛОЙ СЦЕНЫ (PRESENTATION-LAYER.md §4)
 * ============================================================================
 * Абсолютный img по ANCHOR-GRID (ART_STYLE §4.2): позиционирование в % от
 * кадра — устойчивость к неточностям генерации/загрузки. pointer-events-none,
 * fade-in 200 мс, ленивая загрузка. Нет src — слой не рендерится
 * (сцена остаётся чистой, это валидно по смыслу — ART_STYLE §10).
 */

'use client';

import { useState } from 'react';

/** Якорь зоны в % от ширины/высоты контейнера сцены (ANCHOR-GRID §4.2). */
export interface SceneAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ANCHORS = {
  'kitchen-pass': { x: 4, y: 6, w: 55, h: 26 },
  'coffee-station': { x: 62, y: 8, w: 20, h: 22 },
  'tables-center': { x: 8, y: 36, w: 58, h: 40 },
  'window-strip': { x: 0, y: 30, w: 8, h: 50 },
  entrance: { x: 82, y: 78, w: 14, h: 18 },
  'floor-front': { x: 0, y: 76, w: 100, h: 24 },
} as const satisfies Record<string, SceneAnchor>;

export function SceneLayer({
  src,
  anchor,
  opacity = 1,
  className,
  alt,
}: {
  src: string | null;
  anchor: SceneAnchor;
  opacity?: number;
  className?: string;
  alt: string;
}) {
  const [shown, setShown] = useState(false);
  if (!src) return null;
  return (
    <div
      className={`absolute pointer-events-none transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'} ${className ?? ''}`}
      style={{
        left: `${anchor.x}%`,
        top: `${anchor.y}%`,
        width: `${anchor.w}%`,
        height: `${anchor.h}%`,
        opacity: shown ? opacity : 0,
      }}
      aria-hidden
    >
      { }
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setShown(true)}
        className="h-full w-full object-contain drop-shadow-md"
      />
    </div>
  );
}
