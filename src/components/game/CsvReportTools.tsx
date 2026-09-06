/**
 * CSV-экспорт отчётов с выбором периода (ТЗ §35.5: «для отчётов нужен выбор
 * периода», «отдельный файл для каждого отчёта»).
 *
 * Доступные отчёты: недельная аналитика, P&L (детально + сводка), транзакции
 * (cash flow), склад (партии FIFO), ингредиенты (справочник).
 */
'use client';

import { useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import {
  downloadCsv,
  ingredientsCsv,
  inventoryCsv,
  pnlCsv,
  transactionsCsv,
  weeksCsv,
} from '@/lib/game/csv';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { FileSpreadsheet } from 'lucide-react';

export function CsvReportTools() {
  const state = useGame((s) => s.state)!;
  const maxWeek = Math.max(1, state.week);
  const [from, setFrom] = useState(Math.max(1, maxWeek - 11));
  const [to, setTo] = useState(maxWeek);

  const fromW = Math.min(Math.max(1, from), maxWeek);
  const toW = Math.min(Math.max(fromW, to), maxWeek);
  const name = state.restaurant?.name.replace(/\s+/g, '_') ?? 'rest';

  const commitFrom = (v: string) => {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) setFrom(Math.min(Math.max(1, n), maxWeek));
  };
  const commitTo = (v: string) => {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) setTo(Math.max(1, n));
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="hidden md:flex items-center gap-1 text-xs text-stone-500" aria-label="Период отчётов">
        <span>недели</span>
        <Input
          key={`from-${fromW}`}
          defaultValue={String(fromW)}
          className="w-14 h-9 text-center tabular-nums"
          inputMode="numeric"
          aria-label="Неделя с"
          onBlur={(e) => commitFrom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span>по</span>
        <Input
          key={`to-${toW}`}
          defaultValue={String(toW)}
          className="w-14 h-9 text-center tabular-nums"
          inputMode="numeric"
          aria-label="Неделя по"
          onBlur={(e) => commitTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-11" title="Экспорт отчётов в CSV">
            <FileSpreadsheet className="h-4 w-4 mr-1" aria-hidden />
            CSV
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs text-stone-500">
            Отчёты · недели {fromW}–{toW} · разделитель «;»
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => downloadCsv(`${name}-weeks-${fromW}-${toW}.csv`, weeksCsv(state, fromW, toW))}>
            Аналитика по неделям
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadCsv(`${name}-pnl-${fromW}-${toW}.csv`, pnlCsv(state, fromW, toW))}>
            P&L (детально + сводка)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => downloadCsv(`${name}-transactions-${fromW}-${toW}.csv`, transactionsCsv(state, fromW, toW))}
          >
            Транзакции (cash flow)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-stone-500">Текущее состояние</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => state.restaurant && downloadCsv(`${name}-inventory-н${state.week}.csv`, inventoryCsv(state.restaurant))}
            disabled={!state.restaurant}
          >
            Склад (партии FIFO)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadCsv('ingredients.csv', ingredientsCsv())}>
            Ингредиенты (справочник)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
