/**
 * CSV-инструменты экрана «Меню» (ТЗ §35): экспорт текущего меню, шаблон
 * для импорта, импорт с предпросмотром и подсветкой ошибок (§35.1).
 *
 * Формат импорта: `id;price;in_menu` (yes/no). Дубликаты перезаписываются
 * с предупреждением, строки с ошибками подсвечиваются и не применяются.
 */
'use client';

import { useRef, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import {
  downloadCsv,
  menuCsv,
  menuImportTemplate,
  parseMenuImport,
  readCsvFile,
  type MenuImportResult,
} from '@/lib/game/csv';
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
import { FileSpreadsheet, Upload, FileDown, TriangleAlert, CheckCircle2, XCircle } from 'lucide-react';

export function CsvMenuTools() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const setPrice = useGame((s) => s.setPrice);
  const toggleDish = useGame((s) => s.toggleDish);
  const disabled = state.phase === 'gameover';

  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<MenuImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const text = await readCsvFile(file);
    setParsed(parseMenuImport(text));
  };

  const applyImport = () => {
    if (!parsed) return;
    // Дубликаты: последняя валидная строка выигрывает (ТЗ §35.1).
    const byId = new Map<string, { price: number; inMenu: boolean }>();
    for (const r of parsed.rows) {
      if (r.error || r.price == null || !r.dishId) continue;
      byId.set(r.dishId, { price: r.price, inMenu: r.inMenu });
    }
    let priceChanges = 0;
    let menuChanges = 0;
    for (const [dishId, v] of byId) {
      setPrice(dishId, Math.round(v.price));
      priceChanges++;
      const currently = restaurant.menu.dishes.includes(dishId);
      if (v.inMenu !== currently) {
        toggleDish(dishId);
        menuChanges++;
      }
    }
    setParsed(null);
    setFileName('');
    setOpen(false);
    void priceChanges;
    void menuChanges;
  };

  const validCount = parsed ? new Set(parsed.rows.filter((r) => !r.error).map((r) => r.dishId)).size : 0;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        className="h-11"
        disabled={disabled}
        onClick={() =>
          downloadCsv(`menu-${restaurant.name.replace(/\s+/g, '_')}-н${state.week}.csv`, menuCsv(restaurant))
        }
        title="Экспорт меню в CSV (разделитель «;», UTF-8)"
      >
        <FileSpreadsheet className="h-4 w-4 mr-1" aria-hidden />
        <span className="hidden sm:inline">Экспорт</span>
      </Button>
      <Button
        variant="outline"
        className="h-11"
        disabled={disabled}
        onClick={() => downloadCsv('menu-import-template.csv', menuImportTemplate(restaurant))}
        title="Шаблон CSV для импорта: id;price;in_menu"
      >
        <FileDown className="h-4 w-4 mr-1" aria-hidden />
        <span className="hidden sm:inline">Шаблон</span>
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setParsed(null); setFileName(''); } }}>
        <DialogTrigger asChild>
          <Button className="h-11 bg-stone-700 hover:bg-stone-800 text-white" disabled={disabled}>
            <Upload className="h-4 w-4 mr-1" aria-hidden />
            Импорт CSV
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Импорт меню из CSV</DialogTitle>
            <DialogDescription>
              Формат: <code className="text-xs">id;цена;в_меню</code> (yes/no). Разделитель «;», кодировка UTF-8.
              Дубликаты id перезаписываются, строки с ошибками пропускаются.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Файл CSV меню"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button variant="outline" className="w-full h-11 border-dashed" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" aria-hidden />
            {fileName || 'Выбрать CSV-файл'}
          </Button>

          {parsed && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge
                  className={cn(
                    parsed.errors === 0
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-red-100 text-red-800 hover:bg-red-100',
                  )}
                >
                  ошибок: {parsed.errors}
                </Badge>
                <Badge variant="secondary" className="hover:bg-secondary">
                  позиций к применению: {validCount}
                </Badge>
                {parsed.duplicateIds.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                    дубликатов: {parsed.duplicateIds.length}
                  </Badge>
                )}
                {parsed.rows.length > 0 && parsed.rows.every((r) => r.error) && (
                  <span className="flex items-center gap-1 text-xs text-red-700">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> ни одна строка не подошла
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-stone-200">
                <ScrollArea className="h-[280px]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead className="text-xs h-9">№</TableHead>
                        <TableHead className="text-xs h-9">id</TableHead>
                        <TableHead className="text-xs h-9">Блюдо</TableHead>
                        <TableHead className="text-xs text-right h-9">Цена</TableHead>
                        <TableHead className="text-xs text-center h-9">В меню</TableHead>
                        <TableHead className="text-xs h-9">Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.map((r) => (
                        <TableRow
                          key={`${r.line}-${r.dishId}`}
                          className={cn(
                            'text-xs',
                            r.error && 'bg-red-50/70',
                            !r.error && r.warning && 'bg-amber-50/70',
                          )}
                        >
                          <TableCell className="tabular-nums text-stone-400">{r.line}</TableCell>
                          <TableCell className="font-mono">{r.dishId || '—'}</TableCell>
                          <TableCell className="max-w-[140px] truncate">{r.dishName ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.price ?? '—'}</TableCell>
                          <TableCell className="text-center">{r.inMenu ? 'да' : 'нет'}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              {r.error ? (
                                <>
                                  <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" aria-hidden />
                                  <span className="text-red-700">{r.error}</span>
                                </>
                              ) : r.warning ? (
                                <>
                                  <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden />
                                  <span className="text-amber-700">{r.warning}</span>
                                </>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> ок
                                </span>
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!parsed || validCount === 0}
              onClick={applyImport}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden />
              Применить {validCount > 0 ? `(${validCount})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
