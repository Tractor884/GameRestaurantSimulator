/**
 * CSV-импорт и экспорт (ТЗ §35).
 *
 * ФОРМАТ (ТЗ §35.6): разделитель «;», кодировка UTF-8 (BOM для Excel),
 * десятичная точка в числах, даты ISO.
 *
 * ЭКСПОРТ (§35.5) — отдельный файл на каждый отчёт:
 *   - меню (текущее состояние: цены, FC, стоп-лист)      → menuCsv()
 *   - ингредиенты (справочник с ценой)                   → ingredientsCsv()
 *   - склад (партии FIFO: сроки, стоимость)              → inventoryCsv()
 *   - недельная аналитика за период                       → weeksCsv()
 *   - P&L за период                                       → pnlCsv()
 *   - транзакции за период (cash flow детально)           → transactionsCsv()
 *
 * ИМПОРТ (§35.1–35.3): прагматичный формат МЕНЮ
 *   `dishId;price;in_menu` — управление ценами и составом меню существующих
 *   блюд из таблицы. Предпросмотр с подсветкой ошибок (parseMenuImport):
 *   id не найден / цена вне диапазона / мусор в поле. Дубликаты строк
 *   перезаписываются с предупреждением (последняя строка выигрывает).
 *   Полный импорт НОВЫХ блюд и рецептов (§35.3–35.4) — РЕАЛИЗОВАН:
 *   parseDishesImport + parseRecipesImport + importCustomDishes (setup.ts).
 *   Кастомные блюда живут в restaurant.menu.customDishes (миграция v4) и
 *   видны всем системам движка через content/resolve.ts.
 */
import type { Dish, DishCategory, GameState, Restaurant, StationType, WeekStat } from './types';
import { DISHES_MAP, recipeCost } from './content/dishes';
import { INGREDIENTS, INGREDIENTS_MAP } from './content/ingredients';
import { STATIONS } from './config/staffRoles.config';
import { dishMapOf, dishOf } from './content/resolve';

const SEP = ';';
const CATEGORY_LABELS: Record<DishCategory, string> = {
  breakfast: 'завтраки', lunch: 'бизнес-ланчи', salad: 'салаты', soup: 'супы',
  appetizer: 'закуски', hot: 'горячее', garnish: 'гарниры', dessert: 'десерты',
  non_alc_drink: 'напитки', coffee: 'кофе', alcohol: 'алкоголь',
};

/** CSV с BOM: Excel сразу понимает кириллицу (UTF-8). */
export function withBom(rows: (string | number)[][]): string {
  return '\uFEFF' + rows.map((r) => r.join(SEP)).join('\r\n');
}

/** Экранирование значения: кавычки при разделителе/переносе внутри. */
function cell(v: string | number): string {
  const s = String(v).replace(/"/g, '""');
  return /[\n;]/.test(s) ? `"${s}"` : s;
}

function esc(rows: (string | number)[][]): string {
  return withBom(rows.map((r) => r.map(cell)));
}

/** Дата недели игры в ISO-подобном виде (год-условный 2026, ТЗ §35.6). */
export function weekToDate(week: number, day = 0): string {
  const start = new Date(Date.UTC(2026, 0, 5)); // неделя 1, день 0 = пн 5 янв 2026
  const d = new Date(start.getTime() + ((week - 1) * 7 + day) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/* ============================= ЭКСПОРТ ============================= */

/** Меню: текущее состояние (ТЗ §35.5) — цены, себестоимость, FC, стоп-лист.
 *  Включает КАСТОМНЫЕ блюда (§35.3) — полный справочник игрока. */
export function menuCsv(restaurant: Restaurant): string {
  const rows: (string | number)[][] = [
    ['id', 'name', 'category', 'price', 'recipe_cost', 'food_cost_percent',
      'popularity', 'quality', 'station', 'in_menu', 'stop_list', 'alcohol', 'source'],
  ];
  for (const dish of Object.values(dishMapOf(restaurant.menu))) {
    const inMenu = restaurant.menu.dishes.includes(dish.id);
    const price = restaurant.menu.prices[dish.id] ?? dish.recommendedPrice;
    const cost = recipeCost(dish);
    rows.push([
      dish.id, dish.name, CATEGORY_LABELS[dish.category],
      Math.round(price), Math.round(cost), (cost / Math.max(1, price) * 100).toFixed(1),
      dish.basePopularity.toFixed(2), dish.baseQuality,
      STATIONS[dish.station]?.name ?? dish.station,
      inMenu ? 'yes' : 'no',
      restaurant.menu.stopList.includes(dish.id) ? 'yes' : 'no',
      dish.requiresAlcoholLicense ? 'yes' : 'no',
      restaurant.menu.customDishes.some((d) => d.id === dish.id) ? 'custom' : 'library',
    ]);
  }
  return esc(rows);
}

/** Ингредиенты: справочник с ценой (после наценки поставщика). */
export function ingredientsCsv(): string {
  const rows: (string | number)[][] = [
    ['id', 'name', 'unit', 'storage', 'shelf_life_days', 'base_price', 'prep_loss_percent'],
  ];
  for (const ing of INGREDIENTS) {
    rows.push([
      ing.id, ing.name, ing.unit, ing.storage, ing.shelfLifeDays,
      ing.baseCost, (ing.wastePercent * 100).toFixed(1),
    ]);
  }
  return esc(rows);
}

/** Склад: партии FIFO (ТЗ §12) с датами ISO (§35.6). */
export function inventoryCsv(restaurant: Restaurant): string {
  const rows: (string | number)[][] = [
    ['ingredient_id', 'name', 'quantity', 'unit', 'unit_cost', 'batch_value',
      'arrived_date', 'expires_date', 'expires_in_days', 'urgent_markup_base'],
  ];
  const today = restaurant.inventory.batches.length
    ? Math.max(...restaurant.inventory.batches.map((b) => weekIdx(b.arrivedAt)))
    : 0;
  for (const b of restaurant.inventory.batches) {
    const ing = INGREDIENTS.find((i) => i.id === b.ingredientId);
    const expiresIdx = weekIdx(b.expiresAt);
    rows.push([
      b.ingredientId, ing?.name ?? b.ingredientId, b.quantity.toFixed(2), ing?.unit ?? '',
      b.unitCost, Math.round(b.quantity * b.unitCost),
      weekToDate(b.arrivedAt.week, b.arrivedAt.day),
      weekToDate(b.expiresAt.week, b.expiresAt.day),
      expiresIdx - today, ing?.baseCost ?? '',
    ]);
  }
  return esc(rows);
}

function weekIdx(d: { week: number; day: number }): number {
  return d.week * 7 + d.day;
}

/** Недельная аналитика за период (ТЗ §35.5: отчёты — с выбором периода). */
export function weeksCsv(state: GameState, fromWeek: number, toWeek: number): string {
  const rows: (string | number)[][] = [
    ['week', 'date_start', 'revenue', 'guests', 'avg_check', 'food_cost_percent',
      'labor_cost_percent', 'net_profit', 'net_margin_percent', 'cash_end',
      'rating', 'satisfaction', 'returning_share_percent', 'bsc'],
  ];
  for (const w of state.history.weekStats) {
    if (w.week < fromWeek || w.week > toWeek) continue;
    rows.push([
      w.week, weekToDate(w.week),
      Math.round(w.revenue), w.guests, Math.round(w.avgCheck),
      (w.foodCost * 100).toFixed(1), (w.laborCost * 100).toFixed(1),
      Math.round(w.netProfit), (w.netProfit / Math.max(1, w.revenue) * 100).toFixed(1),
      Math.round(w.cashEnd), w.rating.toFixed(2), w.satisfaction,
      (w.returningShare * 100).toFixed(1), w.bsc,
    ]);
  }
  return esc(rows);
}

/** P&L: детальная последняя закрытая неделя + сводка за период из weekStats (ТЗ §18).
 * Исторические полные P&L не храним (только агрегаты WeekStat) — поэтому отчёт
 * состоит из двух секций: ДЕТАЛЬНО (weekResult.pnl) и СВОДКА ЗА ПЕРИОД. */
export function pnlCsv(state: GameState, fromWeek: number, toWeek: number): string {
  const rows: (string | number)[][] = [
    ['section', 'week', 'revenue', 'acquiring', 'cogs', 'waste', 'gross_profit', 'payroll',
      'social', 'rent', 'utilities', 'marketing', 'maintenance', 'depreciation',
      'license_amort', 'other_operating', 'ebitda', 'loan_interest', 'tax', 'net_profit'],
  ];
  const wr = state.weekResult;
  if (wr?.pnl) {
    const p = wr.pnl;
    rows.push([
      'ДЕТАЛЬНО', p.week, Math.round(p.revenue), Math.round(p.acquiringFees), Math.round(p.cogs),
      Math.round(p.wasteCost), Math.round(p.grossProfit), Math.round(p.payroll), Math.round(p.socialContributions),
      Math.round(p.rentAccrued), Math.round(p.utilitiesAccrued), Math.round(p.marketing),
      Math.round(p.maintenance), Math.round(p.depreciation), Math.round(p.licenseAmortization),
      Math.round(p.otherOperating), Math.round(p.operatingProfit), Math.round(p.loanInterest),
      Math.round(p.tax), Math.round(p.netProfit),
    ]);
  }
  const period = state.history.weekStats.filter((w) => w.week >= fromWeek && w.week <= toWeek);
  if (period.length > 0) {
    const sum = (fn: (w: WeekStat) => number) => Math.round(period.reduce((s, w) => s + fn(w), 0));
    const rev = sum((w) => w.revenue);
    rows.push([
      'СВОДКА', `недели ${fromWeek}-${toWeek}`,
      rev, Math.round(rev * 0.02), sum((w) => w.cogs), sum((w) => w.wasteCost),
      Math.round(rev - sum((w) => w.cogs) - sum((w) => w.wasteCost) - rev * 0.02),
      sum((w) => w.payroll), '', '', '', '', '', '', '', '',
      sum((w) => w.netProfit), '', sum((w) => w.netProfit),
      sum((w) => w.netProfit),
    ]);
  }
  return esc(rows);
}

/** Транзакции за период — детальный cash flow (ТЗ §18.2). */
export function transactionsCsv(state: GameState, fromWeek: number, toWeek: number): string {
  const rows: (string | number)[][] = [
    ['id', 'date', 'week', 'type', 'direction', 'amount', 'description'],
  ];
  for (const t of state.restaurant?.finance.transactions ?? []) {
    if (t.date.week < fromWeek || t.date.week > toWeek) continue;
    rows.push([
      t.id, weekToDate(t.date.week, t.date.day), t.date.week, t.type, t.direction,
      t.amount, t.description,
    ]);
  }
  return esc(rows);
}

/* ============================= ИМПОРТ МЕНЮ ============================= */

export interface MenuImportRow {
  line: number;
  dishId: string;
  dishName: string | null; // null = блюдо не найдено (ошибка)
  price: number | null; // null = не распарсилось (ошибка)
  inMenu: boolean;
  error: string | null;
  warning: string | null;
}

export interface MenuImportResult {
  rows: MenuImportRow[];
  validChanges: number;
  errors: number;
  /** Дубликаты: одна и та же позиция встречается несколько раз (последняя выигрывает). */
  duplicateIds: string[];
}

/**
 * Парсинг CSV импорта меню: `dishId;price;in_menu` (yes/no).
 * Возвращает построчный разбор для предпросмотра (ТЗ §35.1: подсветка ошибок).
 */
export function parseMenuImport(text: string): MenuImportResult {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const rows: MenuImportRow[] = [];
  const seen = new Map<string, number>();
  const duplicateIds = new Set<string>();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerSkipped =
    lines.length > 0 && /^id|dish_?id/i.test(lines[0].split(SEP)[0]?.trim() ?? '');
  const dataLines = headerSkipped ? lines.slice(1) : lines;

  dataLines.forEach((line, i) => {
    const parts = splitCsvLine(line);
    const dishId = (parts[0] ?? '').trim();
    const priceRaw = (parts[1] ?? '').trim();
    const menuRaw = (parts[2] ?? '').trim().toLowerCase();
    const row: MenuImportRow = {
      line: i + 1 + (headerSkipped ? 1 : 0),
      dishId,
      dishName: null,
      price: null,
      inMenu: true,
      error: null,
      warning: null,
    };
    if (!dishId) {
      row.error = 'пустой id';
      rows.push(row);
      return;
    }
    const dish = DISHES_MAP[dishId];
    if (!dish) {
      row.error = 'блюдо не найдено в библиотеке';
      rows.push(row);
      return;
    }
    row.dishName = dish.name;
    const price = Number(priceRaw.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      row.error = `цена «${priceRaw}» не распознана`;
      rows.push(row);
      return;
    }
    if (price > 100_000) {
      row.error = `цена ${price} ₽ вне разумного диапазона`;
      rows.push(row);
      return;
    }
    row.price = price;
    if (menuRaw === 'no' || menuRaw === '0' || menuRaw === 'нет' || menuRaw === 'false') {
      row.inMenu = false;
    } else if (menuRaw !== '' && menuRaw !== 'yes' && menuRaw !== '1' && menuRaw !== 'да' && menuRaw !== 'true') {
      row.warning = `флаг «${parts[2]}» не распознан — считаю «в меню»`;
    }
    if (seen.has(dishId)) {
      duplicateIds.add(dishId);
      row.warning = (row.warning ? row.warning + '; ' : '') + 'дубликат id — перезапишет строку выше';
    } else {
      seen.set(dishId, rows.length);
    }
    rows.push(row);
  });

  const errors = rows.filter((r) => r.error).length;
  const validChanges = rows.filter((r) => !r.error).length;
  return { rows, validChanges, errors, duplicateIds: [...duplicateIds] };
}

/** Разбить строку CSV с учётом кавычек. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === SEP && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Шаблон CSV для меню (кнопка «Скачать шаблон»). */
export function menuImportTemplate(restaurant: Restaurant): string {
  const rows: (string | number)[][] = [['id', 'price', 'in_menu']];
  for (const id of restaurant.menu.dishes.slice(0, 40)) {
    const dish = dishOf(restaurant.menu, id);
    if (!dish) continue;
    rows.push([id, restaurant.menu.prices[id] ?? dish.recommendedPrice, 'yes']);
  }
  return withBom(rows);
}

/** Скачивание строки как файла (браузер, Blob). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Читает файл как текст (UTF-8). */
export function readCsvFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'utf-8');
  });
}

/* ==================== ИМПОРТ НОВЫХ БЛЮД И РЕЦЕПТУР (ТЗ §35.3–35.4) ==================== */

/** Максимум кастомных блюд в состоянии (защита сейва от распухания). */
export const CUSTOM_DISHES_LIMIT = 40;

/** Дефолты для импортируемых блюд: популярность/качество — середина библиотеки. */
const CUSTOM_DEFAULT_POPULARITY = 62; // 0..100 — середина библиотеки (см. Dish.basePopularity)
const CUSTOM_DEFAULT_QUALITY = 72;

/** Разбирает строку CSV с авто-определением разделителя («;» или «,»). */
function splitAuto(line: string): string[] {
  const sep = line.includes(';') ? ';' : line.includes(',') ? ',' : ';';
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseBool(raw: string): boolean | null {
  const v = raw.toLowerCase();
  if (['true', 'yes', '1', 'да', 'y'].includes(v)) return true;
  if (['false', 'no', '0', 'нет', 'n'].includes(v)) return false;
  return null;
}

/** Категория: русская метка ИЛИ английский id (ТЗ §35.3: «завтраки»). */
function parseCategory(raw: string): DishCategory | null {
  const v = raw.toLowerCase().trim();
  const byLabel = Object.entries(CATEGORY_LABELS).find(([, label]) => label === v);
  if (byLabel) return byLabel[0] as DishCategory;
  if (v in CATEGORY_LABELS) return v as DishCategory;
  return null;
}

/** Станция: русское имя ИЛИ английский id («холодный цех» → cold_kitchen). */
function parseStation(raw: string): StationType | null {
  const v = raw.toLowerCase().trim();
  for (const [id, cfg] of Object.entries(STATIONS)) {
    if (v === id || cfg.name.toLowerCase() === v) return id as StationType;
  }
  return null;
}

/** Сезонность: «all_year» / «весь год» / пусто = всегда; иначе месяцы «5,6,7,8». */
function parseSeasonality(raw: string): number[] | null {
  const v = raw.toLowerCase().trim();
  if (!v || v === 'all_year' || v === 'all' || v === 'весь год' || v === 'круглый год') return [];
  const months = v.split(/[,;]/).map((m) => Number(m.trim()));
  if (months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) return null;
  return [...new Set(months)].sort((a, b) => a - b);
}

export interface DishImportRow {
  line: number;
  id: string;
  name: string;
  category: string;
  recommendedPrice: number | null;
  wastePercent: number;
  prepMinutes: number;
  station: string;
  requiresAlcoholLicense: boolean;
  seasonMonths: number[];
  error: string | null;
  warning: string | null;
}

export interface DishImportResult {
  rows: DishImportRow[];
  /** Валидные блюда (по id, дубликаты схлопнуты — последняя строка выигрывает). */
  validIds: string[];
  errors: number;
}

/** Парсинг файла блюд (§35.3): id;name;category;recommended_price;waste_percent;prep_time_min;station;requires_license;seasonality */
export function parseDishesImport(text: string, existingMenu: { customDishes: Dish[] }): DishImportResult {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerSkipped = lines.length > 0 && /^(id|dish_?id)/i.test(splitAuto(lines[0])[0] ?? '');
  const dataLines = headerSkipped ? lines.slice(1) : lines;

  const rows: DishImportRow[] = [];
  const byId = new Map<string, DishImportRow>();
  dataLines.forEach((line, i) => {
    const p = splitAuto(line);
    const row: DishImportRow = {
      line: i + 1 + (headerSkipped ? 1 : 0),
      id: p[0] ?? '',
      name: p[1] ?? '',
      category: p[2] ?? '',
      recommendedPrice: null,
      wastePercent: 0.05,
      prepMinutes: 10,
      station: p[6] ?? '',
      requiresAlcoholLicense: false,
      seasonMonths: [],
      error: null,
      warning: null,
    };
    const fail = (msg: string) => {
      row.error = msg;
      rows.push(row);
    };
    if (!row.id) return fail('пустой id');
    if (DISHES_MAP[row.id]) return fail(`id «${row.id}» занят блюдом библиотеки`);
    if (!row.name) return fail('пустое название');

    const category = parseCategory(row.category);
    if (!category) return fail(`категория «${row.category}» не распознана (завтраки/салаты/супы/горячее/…)`);

    const price = Number((p[3] ?? '').replace(',', '.'));
    if (!Number.isFinite(price) || price < 50 || price > 100_000) {
      return fail(`цена «${p[3]}» вне диапазона 50–100 000 ₽`);
    }
    row.recommendedPrice = Math.round(price);

    const waste = Number((p[4] ?? '5').replace(',', '.'));
    row.wastePercent = Number.isFinite(waste) ? Math.min(0.3, Math.max(0, waste / 100)) : 0.05;

    const prep = Number((p[5] ?? '10').replace(',', '.'));
    row.prepMinutes = Number.isFinite(prep) ? Math.min(90, Math.max(1, Math.round(prep))) : 10;

    const station = parseStation(row.station);
    if (!station) return fail(`станция «${row.station}» не распознана (горячий цех/холодный цех/кофейная станция/…)`);

    const license = parseBool(p[7] ?? 'false');
    row.requiresAlcoholLicense = license ?? false;
    if (license == null) row.warning = `флаг лицензии «${p[7]}» не распознан — считаю «нет»`;

    const season = parseSeasonality(p[8] ?? 'all_year');
    if (season == null) {
      row.warning = `сезонность «${p[8]}» не распознана — считаю «круглый год»`;
    } else {
      row.seasonMonths = season;
    }

    // Дубликат внутри файла: последняя строка выигрывает (как в импорте меню).
    if (byId.has(row.id)) {
      row.warning = (row.warning ? row.warning + '; ' : '') + 'дубликат id — перезапишет строку выше';
    }
    byId.set(row.id, row);
    rows.push(row);
  });

  // Лимит кастомного контента в состоянии.
  const existingIds = new Set(existingMenu.customDishes.map((d) => d.id));
  const validIds: string[] = [];
  for (const [id, row] of byId) {
    if (row.error) continue;
    if (!existingIds.has(id) && existingIds.size + validIds.length >= CUSTOM_DISHES_LIMIT) continue;
    validIds.push(id);
  }
  return { rows, validIds, errors: rows.filter((r) => r.error).length };
}

export interface RecipeImportRow {
  line: number;
  dishId: string;
  ingredientId: string;
  quantity: number | null;
  error: string | null;
}

export interface RecipeImportResult {
  rows: RecipeImportRow[];
  /** dishId → валидные позиции рецепта. */
  recipes: Record<string, { ingredientId: string; quantity: number }[]>;
  errors: number;
}

/** Парсинг файла рецептур (§35.4): dish_id;ingredient_id;quantity */
export function parseRecipesImport(text: string): RecipeImportResult {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerSkipped = lines.length > 0 && /^(dish_?id)/i.test(splitAuto(lines[0])[0] ?? '');
  const dataLines = headerSkipped ? lines.slice(1) : lines;

  const rows: RecipeImportRow[] = [];
  const recipes: Record<string, { ingredientId: string; quantity: number }[]> = {};
  dataLines.forEach((line, i) => {
    const p = splitAuto(line);
    const row: RecipeImportRow = {
      line: i + 1 + (headerSkipped ? 1 : 0),
      dishId: p[0] ?? '',
      ingredientId: p[1] ?? '',
      quantity: null,
      error: null,
    };
    const fail = (msg: string) => {
      row.error = msg;
      rows.push(row);
    };
    if (!row.dishId || !row.ingredientId) return fail('пустые dish_id/ingredient_id');
    const ing = INGREDIENTS_MAP[row.ingredientId];
    if (!ing) return fail(`ингредиент «${row.ingredientId}» не найден в справочнике`);
    const qty = Number((p[2] ?? '').replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100) {
      return fail(`количество «${p[2]}» вне диапазона (0…100)`);
    }
    row.quantity = qty;
    (recipes[row.dishId] ??= []).push({ ingredientId: row.ingredientId, quantity: qty });
    rows.push(row);
  });
  return { rows, recipes, errors: rows.filter((r) => r.error).length };
}

/** Сборка валидного Dish из разобранных файлов (вызывается предпросмотром). */
export function buildCustomDishes(
  dishes: DishImportResult,
  recipes: RecipeImportResult,
  existingMenu: { customDishes: Dish[] },
): { dishes: Dish[]; skipped: { id: string; reason: string }[] } {
  const existingIds = new Set([...Object.keys(DISHES_MAP), ...existingMenu.customDishes.map((d) => d.id)]);
  const out: Dish[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const byId = new Map(dishes.rows.filter((r) => !r.error).map((r) => [r.id, r]));

  for (const id of dishes.validIds) {
    const row = byId.get(id);
    if (!row || row.recommendedPrice == null) continue;
    const recipe = recipes.recipes[id];
    if (!recipe || recipe.length === 0) {
      skipped.push({ id, reason: 'нет позиций рецепта в файле рецептур' });
      continue;
    }
    // Схлопнуть повторяющиеся ингредиенты (сумма).
    const merged = new Map<string, number>();
    for (const item of recipe) merged.set(item.ingredientId, (merged.get(item.ingredientId) ?? 0) + item.quantity);
    const station = parseStation(row.station)!;
    const dish: Dish = {
      id: row.id,
      name: row.name,
      category: parseCategory(row.category)!,
      recommendedPrice: row.recommendedPrice,
      recipe: [...merged.entries()].map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
      prepWastePercent: row.wastePercent,
      prepMinutes: row.prepMinutes,
      station,
      basePopularity: CUSTOM_DEFAULT_POPULARITY,
      baseQuality: CUSTOM_DEFAULT_QUALITY,
      requiresAlcoholLicense: row.requiresAlcoholLicense,
      seasonMonths: row.seasonMonths,
    };
    out.push(dish);
    existingIds.add(id);
  }
  return { dishes: out, skipped };
}

/** Шаблоны файлов импорта новых блюд (§35.3–35.4). */
export function dishesImportTemplate(): string {
  const rows: (string | number)[][] = [
    ['id', 'name', 'category', 'recommended_price', 'waste_percent', 'prep_time_min', 'station', 'requires_license', 'seasonality'],
    ['dish_bruschetta_custom', 'Брускетта с томатами', 'закуски', 590, 4, 7, 'холодный цех', 'false', 'all_year'],
    ['dish_seabass_custom', 'Сибас на гриле', 'горячее', 1890, 6, 18, 'горячий цех', 'false', 'all_year'],
  ];
  return withBom(rows);
}

export function recipesImportTemplate(): string {
  const rows: (string | number)[][] = [
    ['dish_id', 'ingredient_id', 'quantity'],
    ['dish_bruschetta_custom', 'tomato', 0.12],
    ['dish_bruschetta_custom', 'bread_sourdough', 0.08],
    ['dish_seabass_custom', 'sea_bass', 0.22],
    ['dish_seabass_custom', 'lemon', 0.03],
  ];
  return withBom(rows);
}
