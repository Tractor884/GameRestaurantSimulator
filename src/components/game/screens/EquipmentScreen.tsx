/**
 * Экран «Оборудование» (ТЗ §12): три зоны (кухня, кофе, зал), износ,
 * ремонт и модернизация.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, money, moneyShort, pct } from '../widgets';
import {
  EQUIPMENT_LEVELS,
  EQUIPMENT_COSTS,
} from '@/lib/game/config/premises.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Wrench, ChefHat, Coffee, Utensils, TriangleAlert } from 'lucide-react';
import type { EquipmentLevel } from '@/lib/game/types';

type ZoneId = 'kitchen' | 'coffee' | 'hall';

const ZONES: { id: ZoneId; label: string; icon: typeof Wrench; description: string }[] = [
  {
    id: 'kitchen',
    label: 'Кухня',
    icon: ChefHat,
    description: 'Горячий и холодный цеха, заготовка. Влияет на скорость всех блюд кухни.',
  },
  {
    id: 'coffee',
    label: 'Кофейная станция',
    icon: Coffee,
    description: 'Кофемашина и grinder. Отдельная зона: кофе и напитки бара.',
  },
  {
    id: 'hall',
    label: 'Зал',
    icon: Utensils,
    description: 'Мебель, посуда, кассы. Влияет на сервис и скорость посадки.',
  },
];

const LEVELS: EquipmentLevel[] = ['basic', 'standard', 'professional'];

export function EquipmentScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;

  const totalValue = ZONES.reduce((s, z) => s + restaurant.equipment[z.id].value, 0);
  const totalMaintenance = ZONES.reduce(
    (s, z) => s + EQUIPMENT_LEVELS[restaurant.equipment[z.id].level].maintenanceCostPerWeek,
    0,
  );
  const zonesAtRisk = ZONES.filter(
    (z) =>
      restaurant.equipment[z.id].wear >= EQUIPMENT_LEVELS[restaurant.equipment[z.id].level].breakRiskThreshold,
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Wrench}
          label="Балансовая стоимость"
          value={moneyShort(totalValue)}
          sub="три зоны оборудования"
        />
        <KpiCard
          icon={Wrench}
          label="Обслуживание"
          value={`${moneyShort(totalMaintenance)}/нед`}
          sub="плановое, по уровням"
        />
        <KpiCard
          icon={TriangleAlert}
          label="Зон в зоне риска"
          value={String(zonesAtRisk)}
          sub="износ выше порога поломок"
          tone={zonesAtRisk > 0 ? 'bad' : 'good'}
        />
        <KpiCard
          icon={Wrench}
          label="Кухня: износ"
          value={`${restaurant.equipment.kitchen.wear.toFixed(0)}%`}
          sub={`порог ${EQUIPMENT_LEVELS[restaurant.equipment.kitchen.level].breakRiskThreshold}%`}
          tone={
            restaurant.equipment.kitchen.wear >
            EQUIPMENT_LEVELS[restaurant.equipment.kitchen.level].breakRiskThreshold
              ? 'bad'
              : 'default'
          }
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {ZONES.map((zone) => (
          <ZoneCard key={zone.id} zone={zone} />
        ))}
      </div>
    </div>
  );
}

/** Карточка зоны оборудования. */
function ZoneCard({ zone }: { zone: (typeof ZONES)[number] }) {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const equipment = useGame((s) => s.equipment);
  const equipmentRepair = useGame((s) => s.equipmentRepair);
  const disabled = state.phase === 'gameover';

  const z = restaurant.equipment[zone.id];
  const cfg = EQUIPMENT_LEVELS[z.level];
  const repairCost = Math.round(z.value * (z.wear / 100) * 0.4);
  const atRisk = z.wear >= cfg.breakRiskThreshold;

  return (
    <SectionCard title={zone.label} icon={zone.icon}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-semibold"
          >
            {cfg.label}
          </Badge>
          <span className="text-sm font-semibold tabular-nums text-stone-800">
            ×{cfg.throughputFactor.toFixed(2)}
            <span className="text-xs font-normal text-stone-400"> мощность</span>
          </span>
        </div>

        <WearBar wear={z.wear} threshold={cfg.breakRiskThreshold} />

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-stone-50 p-2.5">
            <p className="text-xs text-stone-500">Балансовая стоимость</p>
            <p className="font-bold tabular-nums text-stone-800">{moneyShort(z.value)}</p>
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5">
            <p className="text-xs text-stone-500">Обслуживание</p>
            <p className="font-bold tabular-nums text-stone-800">
              {moneyShort(cfg.maintenanceCostPerWeek)}/нед
            </p>
          </div>
        </div>

        {atRisk && (
          <div
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden />
            <p>
              Износ {z.wear.toFixed(0)}% выше порога поломок ({cfg.breakRiskThreshold}%): растёт
              риск внезапного отказа и событий «Поломка холодильника» / «Умерла кофемашина».
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Button
            variant="outline"
            className="h-11 w-full border-amber-300 text-amber-800 hover:bg-amber-50"
            onClick={() => equipmentRepair(zone.id)}
            disabled={disabled || z.wear < 15}
            title={
              z.wear < 15
                ? 'Износ ниже 15% — ремонт не нужен'
                : `Стоимость ≈ ${money(repairCost)} (стоимость × износ × 0.4)`
            }
          >
            <Wrench className="h-4 w-4 mr-1.5" aria-hidden />
            Ремонт
            {z.wear >= 15 ? ` — ${moneyShort(repairCost)}` : ''}
          </Button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">
              Модернизация
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {LEVELS.filter((lvl) => lvl !== z.level).map((lvl) => (
                <Button
                  key={lvl}
                  variant="outline"
                  className="h-11 flex-col py-1 leading-tight"
                  onClick={() => equipment(zone.id, lvl)}
                  disabled={disabled}
                  title={`Мощность ×${EQUIPMENT_LEVELS[lvl].throughputFactor.toFixed(2)}, износ +${EQUIPMENT_LEVELS[lvl].wearRate}/нед`}
                >
                  <span className="text-xs font-medium">{EQUIPMENT_LEVELS[lvl].label}</span>
                  <span className="text-[10px] text-stone-500 tabular-nums">
                    {moneyShort(EQUIPMENT_COSTS[lvl][zone.id])}
                  </span>
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 mt-1.5">
              Текущий уровень изнашивается на {pct(cfg.wearRate / 100, 1)} в неделю; новое
              оборудование сбрасывает износ.
            </p>
          </div>
        </div>

        <p className="text-xs text-stone-500">{zone.description}</p>
      </div>
    </SectionCard>
  );
}

/** Полоса износа: красная при износе выше порога поломок. */
function WearBar({ wear, threshold }: { wear: number; threshold: number }) {
  const color =
    wear >= threshold ? 'bg-red-500' : wear >= threshold * 0.7 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-600">Износ</span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            wear >= threshold ? 'text-red-700' : wear >= threshold * 0.7 ? 'text-amber-700' : 'text-emerald-700',
          )}
        >
          {wear.toFixed(0)}%
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-label="Износ оборудования"
        aria-valuenow={Math.round(wear)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, wear)}%` }} />
      </div>
      <p className="text-[10px] text-stone-400 mt-1">порог поломок: {threshold}%</p>
    </div>
  );
}
