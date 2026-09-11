/**
 * ============================================================================
 * МИНИ-СЦЕНА СКЛАДА (VISUAL_STATE_MAP §5, PRESENTATION-LAYER §5)
 * ============================================================================
 * База склада + слой состояния полок (full/low/empty/spoiled/near_expiry)
 * + чип кладовщика. Без арта — схемка стеллажей + чипы (ART_STYLE §10).
 */

'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { useArtStore, resolveArt } from '@/lib/game/presentation/artState';
import { getWarehouseVisualState } from '@/lib/game/presentation';
import { CharacterPanel } from './CharacterPanel';
import { cn } from '@/lib/utils';
import { Boxes, PackageOpen, AlertTriangle, Clock, Layers, ThermometerSnowflake } from 'lucide-react';

const STOCK_LAYER: Record<string, string | null> = {
  overstock: 'objects/shelves_full',
  balanced: 'objects/shelves_full',
  low_stock: 'objects/shelves_low',
  near_expiry: 'objects/near_expiry',
  spoiled: 'objects/spoiled_food',
  empty: 'objects/shelves_empty',
};

const STOCK_RU: Record<string, { text: string; tone: 'ok' | 'warn' | 'bad' | 'neutral'; icon: typeof Boxes }> = {
  overstock: { text: 'избыток запасов', tone: 'warn', icon: Layers },
  balanced: { text: 'запас в норме', tone: 'ok', icon: Boxes },
  low_stock: { text: 'запас на исходе', tone: 'warn', icon: PackageOpen },
  near_expiry: { text: 'партии на исходе срока', tone: 'warn', icon: Clock },
  spoiled: { text: 'испорченные продукты!', tone: 'bad', icon: AlertTriangle },
  empty: { text: 'склад пуст!', tone: 'bad', icon: PackageOpen },
};

function SchematicWarehouse() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-stone-900 via-emerald-950 to-stone-900" aria-hidden>
      {/* Стеллажи по задней стене */}
      <div className="absolute inset-x-[6%] top-[8%] h-[38%] rounded-lg border border-emerald-800/80 bg-emerald-900/60">
        <div className="flex h-full flex-col justify-around px-3 py-1">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-around">
              {[0, 1, 2, 3, 4, 5].map((cell) => (
                <span key={cell} className="h-4 w-8 rounded-sm border border-stone-600/60 bg-stone-800/70" />
              ))}
            </div>
          ))}
        </div>
        <span className="absolute left-2 top-1 text-[9px] uppercase tracking-widest text-stone-400">стеллажи</span>
      </div>
      {/* Морозилка слева */}
      <div className="absolute left-[4%] top-[54%] h-[28%] w-[24%] rounded-lg border border-stone-500/50 bg-stone-200/10">
        <ThermometerSnowflake className="mx-auto h-5 w-5 text-stone-300/70" aria-hidden />
        <span className="absolute left-2 top-0.5 text-[9px] uppercase tracking-widest text-stone-400">морозилка</span>
      </div>
      {/* Стол приёмки справа */}
      <div className="absolute right-[8%] top-[58%] h-[18%] w-[30%] rounded-lg border border-amber-700/40 bg-amber-900/20">
        <span className="absolute left-2 top-0.5 text-[9px] uppercase tracking-widest text-stone-400">приёмка</span>
      </div>
    </div>
  );
}

export function WarehouseScene() {
  const state = useGame((s) => s.state)!;
  const urls = useArtStore((s) => s.urls);
  const builtin = useGame((s) => s.state?.options?.builtinIllustrations ?? false);

  const visual = useMemo(() => getWarehouseVisualState(state), [state]);
  const baseSrc = useMemo(() => resolveArt('scenes/warehouse/warehouse_base', urls, builtin).src, [urls, builtin]);
  const stockKey = STOCK_LAYER[visual.stock] ?? null;
  const stockSrc = stockKey ? resolveArt(stockKey, urls, builtin).src : null;
  const stockRu = STOCK_RU[visual.stock] ?? STOCK_RU.balanced;

  return (
    <div className="space-y-2">
      <div
        className="relative aspect-[7/4] w-full overflow-hidden rounded-xl border border-stone-300 shadow-inner"
        role="img"
        aria-label={`Сцена склада: ${stockRu.text}`}
      >
        {baseSrc ? (
           
          <img src={baseSrc} alt="Склад ресторана" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <SchematicWarehouse />
        )}
        {stockSrc && (
          <div className="absolute left-[10%] top-[10%] h-[36%] w-[46%]" aria-hidden>
            { }
            <img src={stockSrc} alt="Состояние полок" loading="lazy" decoding="async" className="h-full w-full object-contain drop-shadow-md" />
          </div>
        )}
        {/* Чипы состояния */}
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm',
              stockRu.tone === 'ok' && 'bg-emerald-900/70 text-emerald-200',
              stockRu.tone === 'neutral' && 'bg-stone-900/70 text-stone-200',
              stockRu.tone === 'warn' && 'bg-amber-900/75 text-amber-200',
              stockRu.tone === 'bad' && 'bg-red-900/80 text-red-200',
            )}
          >
            <stockRu.icon className="h-3 w-3" aria-hidden />
            {stockRu.text}
          </span>
          <span className="rounded-full bg-stone-900/70 px-2 py-0.5 text-[10px] text-stone-200 backdrop-blur-sm">
            запас {visual.coverDays.toFixed(1)} дн · истекает ≤2 дн: {(visual.nearExpiryShare * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/** Блок «кладовщик + сцена» для верха экрана Склад. */
export function WarehouseVisualBlock() {
  return (
    <div className="grid gap-3 lg:grid-cols-[280px,1fr]">
      <CharacterPanel characterId="warehouse_manager" />
      <WarehouseScene />
    </div>
  );
}
