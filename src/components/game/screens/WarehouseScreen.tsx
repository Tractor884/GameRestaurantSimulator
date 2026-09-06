/**
 * Экран «Склад» (ТЗ §18): остатки по категориям, сроки годности,
 * закупка (обычная/срочная), автозаказ, ожидаемые поставки.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, EmptyState, money, moneyShort } from '../widgets';
import { INGREDIENTS_MAP, INGREDIENT_CATEGORIES } from '@/lib/game/content/ingredients';
import { dayIndex } from '@/lib/game/engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Boxes,
  Wallet,
  Clock,
  Trash2,
  Truck,
  ShoppingCart,
  Zap,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface StockRow {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  value: number;
  daysLeft: number;
  price: number;
}

export function WarehouseScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const purchase = useGame((s) => s.purchase);
  const autoOrder = useGame((s) => s.autoOrder);
  const autoPurchaseSet = useGame((s) => s.autoPurchaseSet);
  const disabled = state.phase === 'gameover';

  const nowIdx = (state.week - 1) * 7 + state.day;
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];

  const rows = useMemo<StockRow[]>(() => {
    const acc = new Map<string, { qty: number; value: number; expiryIdx: number }>();
    for (const b of restaurant.inventory.batches) {
      const cur = acc.get(b.ingredientId);
      const bv = b.quantity * b.unitCost;
      if (cur) {
        cur.qty += b.quantity;
        cur.value += bv;
        cur.expiryIdx = Math.min(cur.expiryIdx, dayIndex(b.expiresAt));
      } else {
        acc.set(b.ingredientId, { qty: b.quantity, value: bv, expiryIdx: dayIndex(b.expiresAt) });
      }
    }
    return [...acc.entries()].map(([id, v]) => {
      const ing = INGREDIENTS_MAP[id];
      return {
        id,
        name: ing?.name ?? id,
        unit: ing?.unit ?? 'pc',
        qty: v.qty,
        unitCost: v.qty > 0 ? v.value / v.qty : 0,
        value: v.value,
        daysLeft: v.expiryIdx - nowIdx,
        price: ing?.baseCost ?? 0,
      };
    });
    // Сортировка: скоропорт сначала.
  }, [restaurant.inventory.batches, nowIdx]);

  const grouped = useMemo(() => {
    const matched = new Set<string>();
    const groups = INGREDIENT_CATEGORIES.map((cat) => {
      const items = rows.filter((r) => {
        const m = cat.match(r.id);
        if (m) matched.add(r.id);
        return m;
      });
      return { id: cat.id, label: cat.label, rows: items };
    }).filter((g) => g.rows.length > 0);
    const rest = rows.filter((r) => !matched.has(r.id));
    if (rest.length > 0) groups.push({ id: 'other', label: 'Прочее', rows: rest });
    return groups;
  }, [rows]);

  const stockValue = rows.reduce((s, r) => s + r.value, 0);
  const pending = restaurant.inventory.pendingOrders;
  const pendingCost = pending.reduce((s, o) => s + o.paid, 0);
  const expiring = rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 2).length;
  const expired = rows.filter((r) => r.daysLeft < 0).length;

  return (
    <div className="space-y-4">
      {/* KPI склада */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Boxes}
          label="Стоимость склада"
          value={moneyShort(stockValue)}
          sub={`${rows.length} позиций (FIFO)`}
        />
        <KpiCard
          icon={Truck}
          label="Ожидают доставки"
          value={String(pending.length)}
          sub={pending.length > 0 ? `оплачено ${moneyShort(pendingCost)}` : 'нет заказов'}
          tone={pending.length > 0 ? 'warn' : 'default'}
        />
        <KpiCard
          icon={Clock}
          label="Истекает ≤ 2 дней"
          value={String(expiring)}
          sub={expired > 0 ? `и просрочено: ${expired}` : 'просрочки нет'}
          tone={expiring + expired > 0 ? 'bad' : 'good'}
        />
        <KpiCard
          icon={Trash2}
          label="Порча за неделю"
          value={lastWeek ? moneyShort(lastWeek.wasteCost) : '—'}
          sub="потери хранения + брак"
          tone={lastWeek && lastWeek.wasteCost > 60_000 ? 'bad' : 'default'}
        />
      </div>

      {/* Автозаказ */}
      <SectionCard title="Автозаказ" icon={Sparkles}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-stone-600 flex-1 min-w-[220px]">
            Считает потребность по блюдам в меню и средним продажам, докупает ровно на указанный
            горизонт. Заказ придёт завтра по обычным ценам.
          </p>
          <Button
            variant="outline"
            className="h-11 border-stone-300"
            onClick={() => autoOrder(3)}
            disabled={disabled}
          >
            <ShoppingCart className="h-4 w-4 mr-1.5" aria-hidden />
            Автозаказ на 3 дня
          </Button>
          <Button className="h-11 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => autoOrder(7)} disabled={disabled}>
            <ShoppingCart className="h-4 w-4 mr-1.5" aria-hidden />
            Автозаказ на 7 дней
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 mt-3">
          <div className="flex items-center gap-3">
            <Switch
              id="auto-purchase"
              checked={restaurant.marketing.autoPurchase?.enabled ?? false}
              onCheckedChange={(v) => autoPurchaseSet(v, restaurant.marketing.autoPurchase?.coverDays ?? 2)}
              aria-label="Автозаказ каждое утро"
            />
            <Label htmlFor="auto-purchase" className="text-sm font-medium text-stone-800 cursor-pointer">
              Дозакупка каждое утро (модель завхоза)
            </Label>
          </div>
          <p className="text-xs text-stone-500 max-w-[380px]">
            Пополнение склада на старте каждого дня: покрытие {restaurant.marketing.autoPurchase?.coverDays ?? 2} дн.,
            скоропорт — по сроку годности, оплата при заказе, доставка на следующее утро.
          </p>
        </div>
      </SectionCard>

      {/* Остатки по категориям */}
      <SectionCard title="Остатки и закупка" icon={Boxes}>
        {rows.length === 0 ? (
          <EmptyState text="Склад пуст — сделайте автозаказ или купите продукты вручную" />
        ) : (
          <div className="space-y-2">
            {grouped.map((group) => (
              <Collapsible key={group.id} defaultOpen={false}>
                <CollapsibleTrigger className="w-full group">
                  <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2.5 hover:bg-stone-100 transition-colors min-h-11">
                    <ChevronDown className="h-4 w-4 text-stone-400 group-data-[state=open]:rotate-180 transition-transform" aria-hidden />
                    <span className="text-sm font-semibold text-stone-800">{group.label}</span>
                    <Badge variant="secondary" className="bg-stone-200 text-stone-700">
                      {group.rows.length} поз.
                    </Badge>
                    <span className="ml-auto text-xs text-stone-500 tabular-nums">
                      {moneyShort(group.rows.reduce((s, r) => s + r.value, 0))}
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-1 pt-1">
                    {group.rows.map((r) => (
                      <StockRowView
                        key={r.id}
                        row={r}
                        disabled={disabled}
                        onBuy={(qty, urgent) => purchase([{ ingredientId: r.id, quantity: qty }], urgent)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Ожидают доставки */}
      <SectionCard title="Ожидают доставки" icon={Truck}>
        {pending.length === 0 ? (
          <EmptyState text="Нет оплаченных заказов в пути" />
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-0.5">
              {pending.map((o, i) => {
              const ing = INGREDIENTS_MAP[o.ingredientId];
              const diff = dayIndex(o.arrivesAt) - nowIdx;
              const arriveLabel =
                diff <= 0 ? 'сегодня' : diff === 1 ? 'завтра' : `нед ${o.arrivesAt.week}`;
              return (
                <div
                  key={`${o.ingredientId}-${i}`}
                  className="flex items-center justify-between gap-2 text-sm py-2 border-b border-stone-100 last:border-0"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-stone-700 truncate">{ing?.name ?? o.ingredientId}</span>
                    {o.urgent && (
                      <Badge variant="secondary" className="bg-red-100 text-red-800 shrink-0">
                        срочно
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-stone-500">
                      {o.quantity} {ing?.unit ?? ''}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        arriveLabel === 'сегодня'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {arriveLabel}
                    </Badge>
                    <span className="tabular-nums font-semibold text-stone-800">{money(o.paid)}</span>
                  </div>
                </div>
              );
              })}
            </div>
          </ScrollArea>
        )}
      </SectionCard>
    </div>
  );
}

/** Строка остатка: количество, срок, цена и покупка. */
function StockRowView({
  row,
  disabled,
  onBuy,
}: {
  row: StockRow;
  disabled: boolean;
  onBuy: (qty: number, urgent: boolean) => void;
}) {
  const [qty, setQty] = useState('');
  const n = Number.parseInt(qty, 10);
  const valid = Number.isFinite(n) && n > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 border-b border-stone-100 last:border-0">
      <div className="min-w-[170px] flex-1">
        <p className="text-sm font-medium text-stone-800">{row.name}</p>
        <p className="text-xs text-stone-500 tabular-nums">
          остаток: {formatQty(row.qty)} {row.unit} · по {money(row.unitCost)}
        </p>
      </div>

      <div className="w-24 text-sm text-stone-700 tabular-nums" title="Количество на складе">
        {formatQty(row.qty)} <span className="text-stone-400">{row.unit}</span>
      </div>

      <ExpiryBadge daysLeft={row.daysLeft} />

      <div className="w-24 text-sm text-stone-600 tabular-nums" title="Цена закупки за единицу">
        {money(row.price)}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={qty}
          disabled={disabled}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          className="w-20 h-11 tabular-nums text-right"
          aria-label={`Количество для закупки: ${row.name}`}
        />
        <Button
          size="sm"
          className="h-11 bg-amber-600 hover:bg-amber-700 text-white"
          disabled={!valid || disabled}
          onClick={() => {
            onBuy(n, false);
            setQty('');
          }}
          title={`Доставка завтра · ${money(n > 0 ? n * row.price : 0)}`}
        >
          <Wallet className="h-4 w-4 mr-1" aria-hidden />
          Купить
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-11 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
          disabled={!valid || disabled}
          onClick={() => {
            onBuy(n, true);
            setQty('');
          }}
          title={`Доставка сегодня, +35% к цене · ${money(n > 0 ? n * row.price * 1.35 : 0)}`}
        >
          <Zap className="h-4 w-4 mr-1" aria-hidden />
          Срочно
        </Button>
      </div>
    </div>
  );
}

/** Бейдж срока годности. */
function ExpiryBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) {
    return (
      <Badge variant="secondary" className="bg-red-600 text-white hover:bg-red-600 w-24 justify-center">
        Просрочено
      </Badge>
    );
  }
  if (daysLeft <= 2) {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-100 w-24 justify-center">
        {daysLeft} дн — скоро
      </Badge>
    );
  }
  if (daysLeft <= 5) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 w-24 justify-center">
        {daysLeft} дн
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-stone-100 text-stone-600 hover:bg-stone-100 w-24 justify-center">
      {daysLeft} дн
    </Badge>
  );
}

function formatQty(qty: number): string {
  return qty >= 10 ? String(Math.round(qty)) : qty.toFixed(1);
}
