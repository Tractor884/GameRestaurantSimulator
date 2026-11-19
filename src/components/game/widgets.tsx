/**
 * Виджеты главного экрана (ТЗ §31.3) и общие компоненты.
 * Дизайн: тёплая ресторанная палитра (amber/stone), без индиго и синего.
 */
'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InfoHint, HINTS, type HintContent, type HintKey } from './hints';
import { MOOD_UI } from './visual/characterMeta';
import { useThemeStore } from '@/lib/game/store/themeStore';
import type { Mood } from '@/lib/game/presentation/types';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Inbox,
  type LucideIcon,
} from 'lucide-react';

/* ─────────── МУЛЬТЯШНАЯ ТЕМА: «звериный» язык цифр ───────────
 * В cartoon-режиме длинные числа прячутся за игровые единицы:
 * 1 ₽ → 🪙, 1 000 ₽ → 🧺 («корзина монет»), 1 000 000 ₽ → 🏦.
 * Точность сохраняется: при наведении (title) — обычная сумма. */
const MONEY_UNITS_CARTOON: [number, string][] = [
  [1_000_000, '🏦'],
  [1_000, '🧺'],
];

/** Эмодзи-«лицо» KPI для мультяшной темы (по ключевым словам подписи). */
export function KPI_EMOJI(label: string): string {
  const l = label.toLowerCase();
  if (/выруч|продаж|оборач/.test(l)) return '💰';
  if (/прибыл|марж|ebitda/.test(l)) return '📈';
  if (/убыт|расход|затрат/.test(l)) return '💸';
  if (/food.?cost|себестоим|продукт/.test(l)) return '🥘';
  if (/labor|зарплат|ФОТ/.test(l)) return '👥';
  if (/рейтинг|звезд|отзыв|репутаци/.test(l)) return '⭐';
  if (/гост|трафик|посещаем|чек/.test(l)) return '🍽️';
  if (/склад|запас|остатк/.test(l)) return '📦';
  if (/устал|морал|команд|персонал/.test(l)) return '😴';
  if (/касс|баланс|деньг|наличн/.test(l)) return '💵';
  if (/долг|кредит|заём/.test(l)) return '🏦';
  if (/санитар|haccp|лиценз|проверк/.test(l)) return '🧼';
  if (/износ|оборудован|поломк/.test(l)) return '🔧';
  if (/цель|план|bsc/.test(l)) return '🎯';
  return '✨';
}

/** Разрешение подсказки: ключ из HINTS / готовый объект / произвольный текст. */
export function resolveHint(
  hint: HintContent | string | HintKey | undefined,
  label: string,
): HintContent | undefined {
  if (hint === undefined) return undefined;
  if (typeof hint === 'string' && hint in HINTS) return HINTS[hint as HintKey];
  if (typeof hint === 'string') return { title: label, body: hint };
  return hint;
}

export type HintInput = HintContent | string | HintKey;

/* ─────────── SPARKLINE (UI/UX-рекомендация №6) ───────────
 * Мини-график 64×24 для KPI-карточек: чистый SVG без recharts —
 * полигоны+полилиния, цвет по тренду (последняя vs первая точка).
 * aria-label описывает динамику словами — доступно скринридерам. */
export function Sparkline({
  data,
  label,
  invert = false,
  className,
}: {
  data: number[];
  /** Подпись тренда для скринридеров (напр. «Выручка по неделям»). */
  label?: string;
  /** true — рост серии считается плохим (Food Cost, усталость): рисуем красным. */
  invert?: boolean;
  className?: string;
}) {
  const series = data.filter((v) => Number.isFinite(v));
  if (series.length < 2) return null;
  const W = 64;
  const H = 24;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const stepX = W / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = i * stepX;
    const y = H - 2 - ((v - min) / span) * (H - 4);
    return [x, y] as const;
  });
  const up = series[series.length - 1] >= series[0];
  const good = invert ? !up : up;
  const stroke = good ? '#059669' : '#dc2626';
  const fill = good ? 'rgba(5,150,105,0.10)' : 'rgba(220,38,38,0.08)';
  const polyline = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${H} ${polyline} ${W},${H}`;
  const delta = max - min !== 0 ? Math.round(((series[series.length - 1] - series[0]) / (Math.abs(series[0]) || 1)) * 100) : 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={`${label ? label + ': ' : ''}${good ? 'рост' : 'снижение'}${Math.abs(delta) >= 1 ? ` ~${Math.abs(delta)}%` : ''} за ${series.length} нед.`}
    >
      <polygon points={area} fill={fill} stroke="none" />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={stroke} />
    </svg>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  tone = 'default',
  hint,
  spark,
  sparkLabel,
  sparkInvert,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  trend?: number; // доля изменения
  tone?: 'default' | 'good' | 'bad' | 'warn';
  /** Ключ из HINTS, готовый объект или текст — карточка-подсказка при наведении на (i). */
  hint?: HintInput;
  /** Мини-график динамики (последние N недель) — Sparkline 64×24. */
  spark?: number[];
  /** Подпись данных спарклайна для aria-label (напр. «Выручка по неделям»). */
  sparkLabel?: string;
  /** Рост серии — плохо (Food Cost и др.). Цвет спарклайна инвертируется. */
  sparkInvert?: boolean;
}) {
  const toneCls = {
    default: 'text-stone-800',
    good: 'text-emerald-700',
    bad: 'text-red-700',
    warn: 'text-amber-700',
  }[tone];
  // Мультяшная тема: подписи KPI получают «игровое» лицо (эмодзи-иконка),
  // классы карточки становятся «подушечными» (cartoon:* варианты Tailwind).
  const cartoon = useThemeStore((s) => s.cartoon);
  const hintContent = resolveHint(hint, label);
  return (
    <Card
      data-kpi={label}
      className={cn(
        'group border-stone-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md active:translate-y-0 active:shadow-sm focus-within:border-amber-400',
        cartoon && 'cartoon:border-4 cartoon:border-amber-200 cartoon:bg-[#fffdf6] cartoon:hover:-rotate-1',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-stone-500 font-medium uppercase tracking-wide truncate flex items-center gap-1">
              <span className="truncate">
                {cartoon ? `${KPI_EMOJI(label)} ${label}` : label}
              </span>
              {hintContent && <InfoHint hint={hintContent} />}
            </p>
            <p className={cn('text-xl font-bold tabular-nums mt-1', toneCls)}>{value}</p>
            {sub && <p className="text-xs text-stone-500 mt-0.5 truncate">{sub}</p>}
          </div>
          <div className="rounded-lg bg-stone-50 p-2.5 shrink-0 transition-transform duration-200 group-hover:scale-110">
            <Icon className="h-5 w-5 text-amber-700" aria-hidden />
          </div>
        </div>
        <div className="flex items-end justify-between gap-2 mt-2">
          {typeof trend === 'number' ? (
            <div className="flex items-center gap-1 text-xs">
              {trend > 0.001 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : trend < -0.001 ? (
                <TrendingDown className="h-3.5 w-3.5 text-red-600" aria-hidden />
              ) : (
                <Minus className="h-3.5 w-3.5 text-stone-400" aria-hidden />
              )}
              <span className={cn('tabular-nums', trend > 0.001 ? 'text-emerald-600' : trend < -0.001 ? 'text-red-600' : 'text-stone-400')}>
                {trend > 0 ? '+' : ''}
                {(trend * 100).toFixed(1)}%
              </span>
            </div>
          ) : (
            <span aria-hidden />
          )}
          {spark && spark.length >= 2 && <Sparkline data={spark} label={sparkLabel} invert={sparkInvert} />}
        </div>
      </CardContent>
    </Card>
  );
}

/** Единый бейдж состояния (MOOD_UI, UI/UX-рекомендация №4): точка + подпись.
 *  Используется в карточках персонала, строках таблиц и статусах — одинаковая
 *  семантика цветов во всём интерфейсе (emerald/amber/red/stone). */
export function MoodBadge({
  mood,
  label,
  prefix,
  className,
}: {
  mood: Mood;
  /** Свой текст вместо стандартного «отлично/норма/тревога/критично». */
  label?: string;
  /** Префикс перед текстом, напр. «Состояние:». */
  prefix?: string;
  className?: string;
}) {
  const ui = MOOD_UI[mood];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        ui.border,
        ui.bg,
        ui.text,
        className,
      )}
      title={label ?? ui.label}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ui.dot)} aria-hidden />
      {prefix && <span className='opacity-70'>{prefix}</span>}
      {label ?? ui.label}
    </span>
  );
}

/** Бейдж с зоной значения (FoodCost, Labor Cost и др.). */
export function RangeBadge({
  value,
  min,
  max,
  label,
  invert = false,
}: {
  value: number;
  min: number;
  max: number;
  label?: string;
  invert?: boolean;
}) {
  const ok = invert ? value >= min : value <= max;
  const warn = invert ? value >= min * 0.75 : value <= max * 1.25;
  return (
    <Badge
      variant="secondary"
      className={cn(
        'tabular-nums font-semibold',
        ok && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
        !ok && warn && 'bg-amber-100 text-amber-800 hover:bg-amber-100',
        !ok && !warn && 'bg-red-100 text-red-800 hover:bg-red-100',
      )}
    >
      {label ? `${label} ` : ''}
      {typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : value}
    </Badge>
  );
}

export function MetricRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  /** Ключ из HINTS / объект / текст — вместо примитивного title теперь карточка-подсказка. */
  hint?: HintInput;
  tone?: 'good' | 'bad' | 'neutral';
}) {
  const hintContent = resolveHint(hint, label);
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-stone-100 last:border-0">
      <span className="text-sm text-stone-600 flex items-center gap-1">
        {label}
        {hintContent && <InfoHint hint={hintContent} />}
      </span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-red-700',
          (!tone || tone === 'neutral') && 'text-stone-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ScoreBar({
  label,
  value,
  max = 100,
  unit = '',
  hint,
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  hint?: HintInput;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  // Мультяшная тема: полоски превращаем в «шкалу настроения» со смайлом.
  const cartoon = useThemeStore((s) => s.cartoon);
  const face = pct >= 70 ? '😄' : pct >= 45 ? '😐' : '😟';
  const hintContent = resolveHint(hint, label);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-600 flex items-center gap-1">
          {label}
          {hintContent && <InfoHint hint={hintContent} />}
        </span>
        <span className="font-semibold tabular-nums text-stone-800">
          {cartoon ? `${face} ` : ''}
          {value.toFixed(0)}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  children,
  right,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  const Icon = icon;
  return (
    <Card className={cn('border-stone-200 bg-white shadow-sm', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-stone-800">
            {Icon && <Icon className="h-4 w-4 text-amber-700" aria-hidden />}
            {title}
          </CardTitle>
          {right}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

export function WarningBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5" role="alert">
      {warnings.slice(0, 4).map((w, i) => (
        <div key={i} className="flex gap-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

/** Пустое состояние: приглушённая иконка + центрированный текст. */
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-stone-400 max-w-xs mx-auto">
      <Inbox className="h-8 w-8 mb-2" aria-hidden />
      <p className="text-sm">{text}</p>
    </div>
  );
}

/** Формат денег. */
export function money(v: number): string {
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(Math.round(v));
  return `${sign}${abs.toLocaleString('ru-RU')} ₽`;
}

export function moneyShort(v: number): string {
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} млн ₽`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)} тыс ₽`;
  return `${sign}${Math.round(abs).toLocaleString('ru-RU')} ₽`;
}

/** Мультяшная версия moneyShort: «3.4 🧺» вместо «3 400 тыс ₽» и т.п.
 *  Точная сумма — в title/aria при наведении. */
export function moneyCartoon(v: number): string {
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  for (const [unit, icon] of MONEY_UNITS_CARTOON) {
    if (abs >= unit) {
      const n = abs / unit;
      return `${sign}${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')} ${icon}`;
    }
  }
  return `${sign}${Math.round(abs)} 🪙`;
}

/** Деньги с учётом активной темы (строгий/мультяшный формат). */
export function moneyT(v: number): string {
  return useThemeStore.getState().cartoon ? moneyCartoon(v) : moneyShort(v);
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
