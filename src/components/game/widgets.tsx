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
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from 'lucide-react';

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

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  tone = 'default',
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  trend?: number; // доля изменения
  tone?: 'default' | 'good' | 'bad' | 'warn';
  /** Ключ из HINTS, готовый объект или текст — карточка-подсказка при наведении на (i). */
  hint?: HintInput;
}) {
  const toneCls = {
    default: 'text-stone-800',
    good: 'text-emerald-700',
    bad: 'text-red-700',
    warn: 'text-amber-700',
  }[tone];
  const hintContent = resolveHint(hint, label);
  return (
    <Card className="border-stone-200 bg-white shadow-sm hover:shadow transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-stone-500 font-medium uppercase tracking-wide truncate flex items-center gap-1">
              <span className="truncate">{label}</span>
              {hintContent && <InfoHint hint={hintContent} />}
            </p>
            <p className={cn('text-xl font-bold tabular-nums mt-1', toneCls)}>{value}</p>
            {sub && <p className="text-xs text-stone-500 mt-0.5 truncate">{sub}</p>}
          </div>
          <div className="rounded-lg bg-amber-50 p-2 shrink-0">
            <Icon className="h-4 w-4 text-amber-700" aria-hidden />
          </div>
        </div>
        {typeof trend === 'number' && (
          <div className="flex items-center gap-1 mt-2 text-xs">
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
        )}
      </CardContent>
    </Card>
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
  const hintContent = resolveHint(hint, label);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-600 flex items-center gap-1">
          {label}
          {hintContent && <InfoHint hint={hintContent} />}
        </span>
        <span className="font-semibold tabular-nums text-stone-800">
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

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-stone-400">
      <div className="text-4xl mb-2" aria-hidden>
        🍽️
      </div>
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

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
