/**
 * Экран «Графики» (ТЗ §19/§14): сетка смен роль × день недели.
 * Утро 08–16, вечер 15–23; пересечение 15–16 — пересменка.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, MetricRow, WarningBanner, money, pct } from '../widgets';
import { STAFF_ROLES, ROLE_IDS, STATIONS } from '@/lib/game/config/staffRoles.config';
import { hourlyRate, dayCoverage } from '@/lib/game/engine/staff';
import { DAYS_RU } from '@/lib/game/engine';
import { HintedLabel } from '../hints';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CalendarDays, Info, Activity } from 'lucide-react';
import type { RoleId, StationType } from '@/lib/game/types';

export function ScheduleScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const schedule = useGame((s) => s.schedule);
  const disabled = state.phase === 'gameover';

  const staff = restaurant.staff;

  const totalsPerDay = useMemo(
    () =>
      DAYS_RU.map(
        (_, day) =>
          ROLE_IDS.reduce((sum, roleId) => {
            const sh = staff.schedule[roleId]?.[day];
            return sum + (sh ? sh.morning + sh.evening : 0);
          }, 0),
      ),
    [staff.schedule],
  );

  const payrollWeekly = useMemo(
    () =>
      ROLE_IDS.reduce((sum, roleId) => {
        const shifts = staff.schedule[roleId] ?? [];
        const total = shifts.reduce((s, sh) => s + sh.morning + sh.evening, 0);
        return sum + total * 8 * hourlyRate(roleId);
      }, 0),
    [staff.schedule],
  );

  const lowCoverageDays = useMemo(() => {
    const days: { day: number; coverage: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const c = dayCoverage(staff, d);
      if (c < 0.85) days.push({ day: d, coverage: c });
    }
    return days;
  }, [staff]);

  // АУДИТ §2.4: загрузка станций за последнюю неделю — видимость
  // «лишних» и «недостающих» смен. Топ-3 часа станции = устойчивый пик.
  const stationPeaks = useMemo(() => {
    const perStation: Record<string, number[]> = {};
    for (const log of state.history.dayLogs) {
      for (const h of log.hourLogs) {
        for (const [st, v] of Object.entries(h.stationLoads)) {
          if ((v ?? 0) > 0.01) (perStation[st] ??= []).push(v ?? 0);
        }
      }
    }
    const out: { station: StationType; peak: number; top3: number }[] = [];
    for (const [st, vals] of Object.entries(perStation)) {
      const sorted = [...vals].sort((a, b) => b - a);
      out.push({
        station: st as StationType,
        peak: sorted[0] ?? 0,
        top3: sorted.length > 0 ? sorted.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, sorted.length) : 0,
      });
    }
    return out.sort((a, b) => b.top3 - a.top3);
  }, [state.history.dayLogs]);

  return (
    <div className="space-y-4">
      {lowCoverageDays.length > 0 && (
        <WarningBanner
          warnings={lowCoverageDays.map(
            (d) =>
              `${fullDayName(d.day)}: график закрыт только на ${pct(d.coverage, 0)} — смен больше, чем людей в штате. Нанимайте или сокращайте смены.`,
          )}
        />
      )}

      <SectionCard title="Сетка смен на неделю" icon={CalendarDays}>
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Роль</TableHead>
                {DAYS_RU.map((d, i) => (
                  <TableHead
                    key={d}
                    className={cn('text-center', i >= 5 && 'bg-amber-50 text-amber-800')}
                  >
                    <div>{d}</div>
                    <div className="text-[10px] font-normal text-stone-400">Ут · Веч</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_IDS.map((roleId: RoleId) => (
                <TableRow key={roleId}>
                  <TableCell>
                    <p className="text-sm font-medium text-stone-800">{STAFF_ROLES[roleId].name}</p>
                    <p className="text-[10px] text-stone-400 tabular-nums">
                      в штате: {staff.pools[roleId]?.count ?? 0}
                    </p>
                  </TableCell>
                  {DAYS_RU.map((_, day) => {
                    const sh = staff.schedule[roleId]?.[day] ?? { morning: 0, evening: 0 };
                    const roleName = STAFF_ROLES[roleId].name;
                    return (
                      <TableCell key={day} className={cn('py-1.5', day >= 5 && 'bg-amber-50/60')}>
                        <div className="flex items-center justify-center gap-1">
                          {/* key пересоздаёт инпут при изменении значения в сторе */}
                          <ShiftInput
                            key={`m-${sh.morning}`}
                            value={sh.morning}
                            disabled={disabled}
                            ariaLabel={`${roleName}, ${fullDayName(day)}, утренняя смена`}
                            onCommit={(v) => schedule(roleId, day, v, sh.evening)}
                            tone="morning"
                          />
                          <ShiftInput
                            key={`e-${sh.evening}`}
                            value={sh.evening}
                            disabled={disabled}
                            ariaLabel={`${roleName}, ${fullDayName(day)}, вечерняя смена`}
                            onCommit={(v) => schedule(roleId, day, sh.morning, v)}
                            tone="evening"
                          />
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow className="bg-stone-50 font-semibold">
                <TableCell className="text-sm text-stone-700">Σ смен в день</TableCell>
                {totalsPerDay.map((t, i) => (
                  <TableCell
                    key={i}
                    className={cn('text-center tabular-nums text-stone-800', i >= 5 && 'bg-amber-100/60')}
                  >
                    {t}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard
        title="Загрузка станций (последняя неделя)"
        icon={Activity}
        right={
          <HintedLabel
            label={<span className="text-xs text-stone-400 whitespace-nowrap">пик · топ-3 часа</span>}
            hint="stationLoad"
          />
        }
      >
        {stationPeaks.length === 0 ? (
          <p className="text-sm text-stone-400">Пока нет данных — сыграйте хотя бы день.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stationPeaks.map((s) => (
              <div
                key={s.station}
                className="flex flex-col gap-1 rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2"
              >
                <span className="text-xs font-medium text-stone-700">{STATIONS[s.station]?.name ?? s.station}</span>
                <span className="flex items-baseline gap-1">
                  <span
                    className={cn(
                      'text-lg font-bold tabular-nums',
                      s.top3 > 1.15
                        ? 'text-red-600'
                        : s.top3 >= 0.85
                          ? 'text-emerald-600'
                          : 'text-stone-400',
                    )}
                  >
                    {(s.top3 * 100).toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-stone-400 tabular-nums">макс {(s.peak * 100).toFixed(0)}%</span>
                </span>
                <span
                  className={cn(
                    'text-[10px] leading-tight',
                    s.top3 > 1.15
                      ? 'text-red-500'
                      : s.top3 >= 0.85
                        ? 'text-emerald-600'
                        : 'text-stone-400',
                  )}
                >
                  {s.top3 > 1.15 ? 'не хватает смен/мощности' : s.top3 >= 0.85 ? 'оптимум 85–115%' : 'есть запас — смену можно убрать'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Легенда" icon={Info}>
          <div className="space-y-2.5 text-sm text-stone-600">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 rounded border-2 border-amber-500" aria-hidden />
              <span>
                <b className="text-stone-800">Утро</b> — смена 08:00–16:00 (8 часов)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 rounded border-2 border-stone-500" aria-hidden />
              <span>
                <b className="text-stone-800">Вечер</b> — смена 15:00–23:00 (8 часов)
              </span>
            </div>
            <p>
              Час 15:00–16:00 — <b className="text-stone-800">пересменка</b>: на смене обе бригады,
              передача дел. Оплата почасовая: каждая смена = 8 часов.
            </p>
            <p>
              Сб и Вс выделены цветом — уикенд обычно даёт пиковую загрузку. Официанты обслуживают
              ~12 гостей/час каждый; хостес сажает до 45 гостей/час.
            </p>
            <p className="text-xs text-stone-400">
              Введите 0, чтобы закрыть смену. Изменения применяются к следующему дню симуляции.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Итоги расписания" icon={CalendarDays}>
          <MetricRow
            label="Смен за неделю"
            value={String(totalsPerDay.reduce((s, t) => s + t, 0))}
            hint="Σ всех ролей по всем дням"
          />
          <MetricRow
            label="Часов работы"
            value={`${totalsPerDay.reduce((s, t) => s + t, 0) * 8} ч`}
          />
          <MetricRow label="ФОТ (gross, оценка/нед)" value={money(payrollWeekly)} />
          <MetricRow
            label="Ср. покрытие графика"
            value={pct(
              DAYS_RU.reduce((s, _, d) => s + dayCoverage(staff, d), 0) / 7,
            )}
            tone={
              DAYS_RU.reduce((s, _, d) => s + dayCoverage(staff, d), 0) / 7 >= 0.85 ? 'good' : 'bad'
            }
            hint="Доля смен, которые реально может закрыть штат"
          />
        </SectionCard>
      </div>
    </div>
  );
}

/** Один инпут смены: локальное значение, коммит по вводу/blur. */
function ShiftInput({
  value,
  disabled,
  ariaLabel,
  onCommit,
  tone,
}: {
  value: number;
  disabled: boolean;
  ariaLabel: string;
  onCommit: (v: number) => void;
  tone: 'morning' | 'evening';
}) {
  const [val, setVal] = useState(String(value));

  const tryCommit = () => {
    const n = Number.parseInt(val, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 30) {
      onCommit(n);
      return true;
    }
    setVal(String(value));
    return false;
  };

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={30}
      value={val}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        setVal(v);
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 30 && v === String(n)) onCommit(n);
      }}
      onBlur={tryCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        'w-14 h-11 px-1 text-center tabular-nums text-sm',
        tone === 'morning' ? 'border-amber-300 focus-visible:ring-amber-300' : 'border-stone-300',
      )}
    />
  );
}

function fullDayName(day: number): string {
  return ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'][day] ?? '';
}
