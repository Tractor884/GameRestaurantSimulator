/**
 * Экран «Меню» (ТЗ §17): категории, цены, FoodCost блюд, стоп-лист,
 * добавление блюд из библиотеки контента.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, WarningBanner, EmptyState, money, pct } from '../widgets';
import { DISHES, recipeFoodCost } from '@/lib/game/content/dishes';
import { dishOf, allDishes } from '@/lib/game/content/resolve';
import { MENU_CATEGORIES, MENU_SIZE } from '@/lib/game/config/menu.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CsvMenuTools } from '../CsvMenuTools';
import { CustomDishImport } from '../CustomDishImport';
import {
  BookOpen,
  Plus,
  Trash2,
  Ban,
  Sparkles,
  Percent,
  ListOrdered,
} from 'lucide-react';
import type { Dish, DishCategory } from '@/lib/game/types';

const CATEGORY_KEYS = Object.keys(MENU_CATEGORIES) as DishCategory[];

export function MenuScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const toggleDish = useGame((s) => s.toggleDish);
  const setPrice = useGame((s) => s.setPrice);
  const stopListToggle = useGame((s) => s.stopListToggle);
  const disabled = state.phase === 'gameover';

  const [tab, setTab] = useState<'all' | DishCategory>('all');
  const [addOpen, setAddOpen] = useState(false);

  const menuDishes = useMemo(
    () =>
      restaurant.menu.dishes
        .map((id) => dishOf(restaurant.menu, id))
        .filter((d): d is Dish => !!d),
    [restaurant.menu],
  );

  const customCount = restaurant.menu.customDishes?.length ?? 0;
  const libraryAll = useMemo(() => allDishes(restaurant.menu), [restaurant.menu]);

  const menuIds = useMemo(() => new Set(restaurant.menu.dishes), [restaurant.menu.dishes]);
  const stopIds = useMemo(() => new Set(restaurant.menu.stopList), [restaurant.menu.stopList]);
  const customIds = useMemo(
    () => new Set((restaurant.menu.customDishes ?? []).map((d) => d.id)),
    [restaurant.menu.customDishes],
  );

  const byCategory = useMemo(() => {
    const map = new Map<DishCategory, Dish[]>();
    for (const d of menuDishes) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return map;
  }, [menuDishes]);

  const priceOf = (d: Dish) => restaurant.menu.prices[d.id] ?? d.recommendedPrice;

  const avgFoodCost =
    menuDishes.length > 0
      ? menuDishes.reduce((s, d) => s + recipeFoodCost(d, priceOf(d)), 0) / menuDishes.length
      : 0;

  const warnings: string[] = [];
  if (menuDishes.length > 0 && menuDishes.length < MENU_SIZE.recommendedMin) {
    warnings.push(
      `В меню ${menuDishes.length} блюд — меньше рекомендуемых ${MENU_SIZE.recommendedMin}–${MENU_SIZE.recommendedMax}. Разнообразие ниже нормы: удовлетворённость гостей падает.`,
    );
  }
  if (menuDishes.length > 0 && avgFoodCost > 0.35) {
    warnings.push(
      `Средний FoodCost меню ${pct(avgFoodCost)} — выше нормы. Пересмотрите цены или порции: себестоимость съедает маржу (целевой диапазон 30–34%).`,
    );
  }
  if (stopIds.size > 0 && menuDishes.length > 0 && stopIds.size / menuDishes.length > 0.15) {
    warnings.push(
      `В стоп-листе ${stopIds.size} блюд — гости не могут заказать пятую часть меню. Проверьте склад.`,
    );
  }

  const categoriesPresent = CATEGORY_KEYS.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      {/* Заголовок: статистика меню */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={BookOpen}
          label="Блюд в меню"
          value={String(menuDishes.length)}
          sub={`рекомендуется ${MENU_SIZE.recommendedMin}–${MENU_SIZE.recommendedMax}`}
          tone={menuDishes.length >= MENU_SIZE.recommendedMin ? 'good' : 'warn'}
        />
        <KpiCard
          icon={Percent}
          label="Средний FoodCost"
          value={menuDishes.length > 0 ? pct(avgFoodCost) : '—'}
          sub="цель 30–34%"
          tone={avgFoodCost > 0.35 ? 'bad' : avgFoodCost < 0.34 ? 'good' : 'warn'}
        />
        <KpiCard
          icon={Ban}
          label="В стоп-листе"
          value={String(stopIds.size)}
          sub="недоступны гостям"
          tone={stopIds.size > 0 ? 'bad' : 'good'}
        />
        <KpiCard
          icon={ListOrdered}
          label="Библиотека блюд"
          value={String(libraryAll.length)}
          sub={`можно добавить: ${libraryAll.length - menuDishes.length}${customCount > 0 ? ` · кастомных: ${customCount}` : ''}`}
        />
      </div>

      {warnings.length > 0 && <WarningBanner warnings={warnings} />}

      {/* Категории + список */}
      <SectionCard
        title="Меню ресторана"
        icon={BookOpen}
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <CsvMenuTools />
            <CustomDishImport />
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white h-11" disabled={disabled}>
                  <Plus className="h-4 w-4 mr-1" aria-hidden />
                  Добавить блюдо
                </Button>
              </DialogTrigger>
              <AddDishDialog
                menuIds={menuIds}
                dishes={libraryAll}
                onAdd={(id) => toggleDish(id)}
                onClose={() => setAddOpen(false)}
              />
            </Dialog>
          </div>
        }
      >
        {menuDishes.length === 0 ? (
          <EmptyState text="Меню пусто — добавьте блюда из библиотеки" />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | DishCategory)}>
            <TabsList className="flex-wrap h-auto gap-0.5">
              <TabsTrigger value="all" className="text-xs sm:text-sm">
                Все ({menuDishes.length})
              </TabsTrigger>
              {categoriesPresent.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="text-xs sm:text-sm">
                  {MENU_CATEGORIES[cat].label} ({byCategory.get(cat)!.length})
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all" className="mt-3">
              {menuDishes.map((d) => (
                <DishRow
                  key={d.id}
                  dish={d}
                  price={priceOf(d)}
                  stopListed={stopIds.has(d.id)}
                  licenseBlocked={!!d.requiresAlcoholLicense && !restaurant.licenses.alcohol?.active}
                  custom={customIds.has(d.id)}
                  disabled={disabled}
                  onPrice={(p) => setPrice(d.id, p)}
                  onStop={() => stopListToggle(d.id)}
                  onRemove={() => toggleDish(d.id)}
                />
              ))}
            </TabsContent>
            {categoriesPresent.map((cat) => (
              <TabsContent key={cat} value={cat} className="mt-3">
                {byCategory.get(cat)!.map((d) => (
                  <DishRow
                    key={d.id}
                    dish={d}
                    price={priceOf(d)}
                    stopListed={stopIds.has(d.id)}
                    licenseBlocked={!!d.requiresAlcoholLicense && !restaurant.licenses.alcohol?.active}
                    custom={customIds.has(d.id)}
                    disabled={disabled}
                    onPrice={(p) => setPrice(d.id, p)}
                    onStop={() => stopListToggle(d.id)}
                    onRemove={() => toggleDish(d.id)}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </SectionCard>
    </div>
  );
}

/** Строка блюда: цена, FoodCost, стоп-лист, удаление. */
function DishRow({
  dish,
  price,
  stopListed,
  licenseBlocked,
  custom,
  disabled,
  onPrice,
  onStop,
  onRemove,
}: {
  dish: Dish;
  price: number;
  stopListed: boolean;
  licenseBlocked: boolean;
  custom: boolean;
  disabled: boolean;
  onPrice: (price: number) => void;
  onStop: () => void;
  onRemove: () => void;
}) {
  const fc = recipeFoodCost(dish, price);
  const cat = MENU_CATEGORIES[dish.category];
  const dishScore = Math.round((dish.baseQuality + dish.basePopularity) / 2);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b border-stone-100 last:border-0">
      <div className="min-w-[200px] flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn('text-sm font-medium', stopListed ? 'text-red-700 line-through' : 'text-stone-800')}
          >
            {dish.name}
          </span>
          <FcBadge fc={fc} />
          {custom && (
            <Badge
              variant="secondary"
              className="bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-50"
              title="Импортировано через CSV (ТЗ §35.3)"
            >
              импорт
            </Badge>
          )}
          {stopListed && (
            <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-100">
              Стоп-лист
            </Badge>
          )}
          {licenseBlocked && (
            <Badge
              variant="secondary"
              className="bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-50"
              title="Продажи заблокированы: нет лицензии на алкоголь"
            >
              Нужна лицензия
            </Badge>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 flex-wrap">
          <span>{cat.stationNote}</span>
          <span aria-hidden>·</span>
          <span>{dish.prepMinutes} мин</span>
          <span aria-hidden>·</span>
          <span
            className="inline-flex items-center gap-0.5 cursor-help underline decoration-dotted decoration-stone-300"
            title={`DishScore складывается из качества (${dish.baseQuality}/100) и популярности (${dish.basePopularity}/100)`}
          >
            <Sparkles className="h-3 w-3 text-amber-600" aria-hidden />
            DishScore {dishScore}
          </span>
        </p>
      </div>

      {/* Цена: key пересоздаёт инпут при изменении цены в сторе (импорт сейва и т.п.) */}
      <PriceInput key={price} price={price} disabled={disabled} onCommit={onPrice} />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 border-stone-300"
          onClick={onStop}
          disabled={disabled}
          title={stopListed ? 'Убрать из стоп-листа' : 'В стоп-лист (временно недоступно гостям)'}
          aria-label={stopListed ? 'Убрать из стоп-листа' : 'Добавить в стоп-лист'}
        >
          <Ban className={cn('h-4 w-4', stopListed ? 'text-red-600' : 'text-stone-500')} aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={onRemove}
          disabled={disabled}
          title="Убрать из меню"
          aria-label="Убрать из меню"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Бейдж FoodCost: зелёный < 34%, янтарный < 38%, красный иначе. */
function FcBadge({ fc }: { fc: number }) {
  const cls =
    fc < 0.34
      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
      : fc < 0.38
        ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
        : 'bg-red-100 text-red-800 hover:bg-red-100';
  return (
    <Badge variant="secondary" className={cn('tabular-nums font-semibold', cls)}>
      FC {pct(fc, 0)}
    </Badge>
  );
}

/** Инпут цены с коммитом по blur / Enter. */
function PriceInput({
  price,
  disabled,
  onCommit,
}: {
  price: number;
  disabled: boolean;
  onCommit: (price: number) => void;
}) {
  const [val, setVal] = useState(String(price));

  const commit = () => {
    const n = Number.parseInt(val, 10);
    if (Number.isFinite(n) && n >= 50 && n <= 100_000) onCommit(n);
    else setVal(String(price));
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        inputMode="numeric"
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-24 h-11 tabular-nums text-right"
        aria-label="Цена продажи, ₽"
        title={`Рекомендуемая цена: ${money(price)}`}
      />
      <span className="text-xs text-stone-400" aria-hidden>
        ₽
      </span>
    </div>
  );
}

/** Диалог добавления блюд из библиотеки (включая импортированные CSV). */
function AddDishDialog({
  menuIds,
  dishes,
  onAdd,
  onClose,
}: {
  menuIds: Set<string>;
  dishes: Dish[];
  onAdd: (dishId: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'all' | DishCategory>('all');

  const candidates = useMemo(
    () =>
      dishes.filter((d) => !menuIds.has(d.id) && (filter === 'all' || d.category === filter)),
    [menuIds, filter, dishes],
  );

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Добавить блюдо в меню</DialogTitle>
        <DialogDescription>
          Библиотека рецептов кухни: себестоимость уже откалибрована под целевой FoodCost.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2 py-1">
        <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | DishCategory)}>
          <SelectTrigger className="w-48 h-11" aria-label="Фильтр по категории">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {CATEGORY_KEYS.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {MENU_CATEGORIES[cat].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-stone-400">{candidates.length} доступно</span>
      </div>

      <ScrollArea className="max-h-[420px] -mx-1 px-1">
        <div className="space-y-1">
          {candidates.length === 0 && <EmptyState text="Все блюда этой категории уже в меню" />}
          {candidates.map((d) => {
            const fc = recipeFoodCost(d);
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-800 truncate">{d.name}</span>
                    <Badge variant="secondary" className="bg-stone-100 text-stone-600 shrink-0">
                      {MENU_CATEGORIES[d.category].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {money(d.recommendedPrice)} · FC {pct(fc, 0)} · {MENU_CATEGORIES[d.category].stationNote}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-11 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  onClick={() => onAdd(d.id)}
                >
                  <Plus className="h-4 w-4 mr-0.5" aria-hidden />
                  В меню
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <DialogFooter>
        <Button variant="outline" className="h-11" onClick={onClose}>
          Готово
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
