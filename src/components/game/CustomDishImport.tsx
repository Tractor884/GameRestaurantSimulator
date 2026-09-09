/**
 * ИМПОРТ НОВЫХ БЛЮД CSV (ТЗ §35.3–35.4, дорожная карта §12.9).
 *
 * Два файла: блюда (id;name;category;price;…;station;license;seasonality)
 * и рецептуры (dish_id;ingredient_id;quantity). Предпросмотр объединяет их:
 * показывает себестоимость и FoodCost будущего блюда ДО применения.
 * Валидные блюда попадают в menu.customDishes (состояние, сейвы) и сразу
 * включаются в меню. Дубликаты кастомных id — обновление.
 */
'use client';

import { useRef, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import {
  downloadCsv,
  readCsvFile,
  parseDishesImport,
  parseRecipesImport,
  buildCustomDishes,
  dishesImportTemplate,
  recipesImportTemplate,
  type DishImportResult,
  type RecipeImportResult,
} from '@/lib/game/csv';
import { recipeCost } from '@/lib/game/content/dishes';
import { INGREDIENTS_MAP } from '@/lib/game/content/ingredients';
import { STATIONS } from '@/lib/game/config/staffRoles.config';
import { MENU_CATEGORIES } from '@/lib/game/config/menu.config';
import { Button } from '@/components/ui/button';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { money, pct } from './widgets';
import { Upload, FilePlus2, FileDown, TriangleAlert, CheckCircle2, XCircle } from 'lucide-react';

interface PreviewDish {
  id: string;
  name: string;
  category: string;
  price: number;
  station: string;
  recipeCount: number;
  cost: number;
  status: 'ok' | 'error';
  note: string;
}

export function CustomDishImport() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const importDishes = useGame((s) => s.importDishes);
  const disabled = state.phase === 'gameover';

  const [open, setOpen] = useState(false);
  const [dishesParsed, setDishesParsed] = useState<DishImportResult | null>(null);
  const [recipesParsed, setRecipesParsed] = useState<RecipeImportResult | null>(null);
  const [dishesName, setDishesName] = useState('');
  const [recipesName, setRecipesName] = useState('');
  const dishesFileRef = useRef<HTMLInputElement>(null);
  const recipesFileRef = useRef<HTMLInputElement>(null);

  const handleDishesFile = async (file: File | undefined) => {
    if (!file) return;
    setDishesName(file.name);
    const text = await readCsvFile(file);
    setDishesParsed(parseDishesImport(text, restaurant.menu));
  };

  const handleRecipesFile = async (file: File | undefined) => {
    if (!file) return;
    setRecipesName(file.name);
    const text = await readCsvFile(file);
    setRecipesParsed(parseRecipesImport(text));
  };

  // Предпросмотр: объединяем два файла в готовые блюда (себестоимость/FoodCost).
  const preview = (() => {
    if (!dishesParsed) return null;
    const recipes = recipesParsed ?? { rows: [], recipes: {}, errors: 0 };
    const built = buildCustomDishes(dishesParsed, recipes, restaurant.menu);
    const byId = new Map(built.dishes.map((d) => [d.id, d]));
    const rows: PreviewDish[] = dishesParsed.rows
      .filter((r) => !r.error)
      .map((r) => {
        const dish = byId.get(r.id);
        if (!dish) {
          const skipped = built.skipped.find((s) => s.id === r.id);
          return {
            id: r.id,
            name: r.name,
            category: r.category,
            price: r.recommendedPrice ?? 0,
            station: r.station,
            recipeCount: 0,
            cost: 0,
            status: 'error',
            note: skipped?.reason ?? (r.warning ?? 'проверьте файлы'),
          };
        }
        const cost = recipeCost(dish);
        const fc = dish.recommendedPrice > 0 ? cost / dish.recommendedPrice : 1;
        return {
          id: r.id,
          name: dish.name,
          category: MENU_CATEGORIES[dish.category].label,
          price: dish.recommendedPrice,
          station: STATIONS[dish.station]?.name ?? dish.station,
          recipeCount: dish.recipe.length,
          cost,
          status: 'ok' as const,
          note:
            fc > 0.38
              ? `⚠ FC ${pct(fc, 0)} — дорого для цены`
              : fc < 0.18
                ? `⚠ FC ${pct(fc, 0)} — цена высокая для себестоимости`
                : `FC ${pct(fc, 0)} — в норме`,
        };
      });
    return { rows, built };
  })();

  const apply = () => {
    if (!preview) return;
    importDishes(preview.built.dishes);
    setOpen(false);
    setDishesParsed(null);
    setRecipesParsed(null);
    setDishesName('');
    setRecipesName('');
  };

  const validCount = preview?.built.dishes.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDishesParsed(null); setRecipesParsed(null); setDishesName(''); setRecipesName(''); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11" disabled={disabled} title="Импорт новых блюд и рецептур (ТЗ §35.3–35.4)">
          <FilePlus2 className="h-4 w-4 mr-1" aria-hidden />
          <span className="hidden sm:inline">Новые блюда</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт новых блюд (§35.3–35.4)</DialogTitle>
          <DialogDescription>
            Два файла: <code className="text-xs">блюда.csv</code> (id;название;категория;цена;потери_%;время_мин;станция;лицензия;сезон) и{' '}
            <code className="text-xs">рецепты.csv</code> (dish_id;ingredient_id;количество). Категории/станции — по-русски.
            Блюда попадают в меню сразу, живут в сейве.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-stone-500"
            onClick={() => downloadCsv('dishes-template.csv', dishesImportTemplate())}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" aria-hidden />
            Шаблон блюд
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-stone-500"
            onClick={() => downloadCsv('recipes-template.csv', recipesImportTemplate())}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" aria-hidden />
            Шаблон рецептов
          </Button>
        </div>

        <input
          ref={dishesFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Файл CSV блюд"
          onChange={(e) => handleDishesFile(e.target.files?.[0])}
        />
        <input
          ref={recipesFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Файл CSV рецептур"
          onChange={(e) => handleRecipesFile(e.target.files?.[0])}
        />

        <div className="grid sm:grid-cols-2 gap-2">
          <Button variant="outline" className="w-full h-11 border-dashed" onClick={() => dishesFileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" aria-hidden />
            <span className="truncate">{dishesName || '1 · файл БЛЮД'}</span>
          </Button>
          <Button variant="outline" className="w-full h-11 border-dashed" onClick={() => recipesFileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" aria-hidden />
            <span className="truncate">{recipesName || '2 · файл РЕЦЕПТОВ'}</span>
          </Button>
        </div>

        {preview && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                className={cn(
                  dishesParsed && dishesParsed.errors === 0
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-red-100 text-red-800 hover:bg-red-100',
                )}
              >
                блюд: {preview.rows.length}
                {dishesParsed && dishesParsed.errors > 0 ? ` (ошибок: ${dishesParsed.errors})` : ''}
              </Badge>
              {recipesParsed && (
                <Badge
                  className={cn(
                    recipesParsed.errors === 0
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-100',
                  )}
                >
                  строк рецептов: {recipesParsed.rows.length}
                  {recipesParsed.errors > 0 ? ` (ошибок: ${recipesParsed.errors})` : ''}
                </Badge>
              )}
              <Badge variant="secondary" className="hover:bg-secondary">
                к импорту: {validCount}
              </Badge>
              {!recipesParsed && (
                <span className="flex items-center gap-1 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                  без файла рецептур блюда не соберутся
                </span>
              )}
            </div>

            <div className="rounded-lg border border-stone-200">
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead className="text-xs h-9">Блюдо</TableHead>
                      <TableHead className="text-xs h-9">Категория</TableHead>
                      <TableHead className="text-xs text-right h-9">Цена</TableHead>
                      <TableHead className="text-xs text-right h-9">Себест.</TableHead>
                      <TableHead className="text-xs text-right h-9">Позиций</TableHead>
                      <TableHead className="text-xs h-9">Станция</TableHead>
                      <TableHead className="text-xs h-9">Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => (
                      <TableRow
                        key={r.id}
                        className={cn('text-xs', r.status === 'error' && 'bg-red-50/70')}
                      >
                        <TableCell className="max-w-[150px] truncate font-medium text-stone-800" title={r.id}>
                          {r.name}
                        </TableCell>
                        <TableCell className="text-stone-500">{r.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(r.price)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.status === 'ok' ? money(Math.round(r.cost)) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.recipeCount || '—'}</TableCell>
                        <TableCell className="text-stone-500">{r.station}</TableCell>
                        <TableCell>
                          {r.status === 'ok' ? (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {r.note}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-700">
                              <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="truncate max-w-[160px]" title={r.note}>{r.note}</span>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {preview.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-xs text-stone-400 py-6">
                          Нет валидных строк в файле блюд
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* Рецепт первого блюда для доверия к импорту */}
            {validCount > 0 && recipesParsed && (
              <p className="text-[11px] text-stone-400">
                Состав «{preview.built.dishes[0].name}»:{' '}
                {preview.built.dishes[0].recipe
                  .map((it) => `${INGREDIENTS_MAP[it.ingredientId]?.name ?? it.ingredientId} ×${it.quantity}`)
                  .join(', ')}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!preview || validCount === 0}
            onClick={apply}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden />
            Импортировать {validCount > 0 ? `(${validCount})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
