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
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  Info,
  Activity,
  Calculator,
  ChevronDown,
  GraduationCap,
  TrendingUp,
} from 'lucide-react';
import type { RoleId, StationType } from '@/lib/game/types';

/** Станция → роли, которые её укомплектовывают (вес > 0 в STAFF_ROLES). */
const STATION_ROLE_MAP: { station: StationType; roleId: RoleId; weight: number }[] = (() => {
  const list: { station: StationType; roleId: RoleId; weight: number }[] = [];
  for (const role of Object.values(STAFF_ROLES)) {
    for (const [st, w] of Object.entries(role.stationWeights)) {
      if ((w ?? 0) > 0) list.push({ station: st as StationType, roleId: role.id, weight: w ?? 0 });
    }
  }
  return list;
})();

/** Роли станции по убыванию веса (хостес/посудомойщик — не станции). */
function stationRoleIds(station: StationType): RoleId[] {
  return STATION_ROLE_MAP.filter((r) => r.station === station)
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.roleId);
}

/** Расширенные данные станции для умных советов (26-ui, задача 3б). */
interface StationAdvice {
  station: StationType;
  peak: number;
  top3: number;
  /** Все роли станции (вес > 0). */
  roles: RoleId[];
  /** Нанятые роли станции. */
  hired: RoleId[];
  /** Минимум людей роли по всем 14 сменам недели (7 дней × утро/вечер). */
  roleMin: Map<RoleId, number>;
  /** Минимальный суммарный состав станции по сменам. */
  stationMin: number;
  /** Роли, в какой-то смене работающие в одиночку (минимум по сменам = 1). */
  soloRoles: RoleId[];
  /** Роли, в каждой смене представленные ≥2 людьми. */
  multiRoles: RoleId[];
}

/** Текст совета по станции с учётом того, кто реально стоит в сменах. */
function stationAdviceText(s: StationAdvice): { tone: 'red' | 'amber' | 'emerald' | 'stone'; text: string } {
  const roleNames = (ids: RoleId[]) => ids.map((id) => STAFF_ROLES[id].shortName).join(', ');
  if (s.top3 > 1.15) {
    return {
      tone: 'red',
      text: `не хватает мощности — добавьте смену/людей: ${roleNames(s.hired.length > 0 ? s.hired : s.roles)}`,
    };
  }
  if (s.top3 >= 0.85) return { tone: 'emerald', text: 'оптимум 85–115%' };
  // top3 < 0.85 — мощность станции с запасом.
  if (s.stationMin === 0 && s.top3 > 0.3) {
    return { tone: 'red', text: 'смена НЕ закрыта — станция без персонала!' };
  }
  if (s.soloRoles.length > 0) {
    if (s.station === 'coffee') {
      return {
        tone: 'amber',
        text: 'бариста один на смену — снимать смену нельзя, сократите штат либо держите резерв на болезни',
      };
    }
    return {
      tone: 'amber',
      text: `запас мощности есть, но смена нужна для покрытия: ${roleNames(s.soloRoles)} — 1 чел/смену. Вместо снятия смены — сократите штат на 1 (экран «Персонал»), если запас держится 2+ недели`,
    };
  }
  if (s.hired.length > 0 && s.multiRoles.length === s.hired.length) {
    return { tone: 'emerald', text: `есть запас — одну смену роли можно убрать: ${roleNames(s.hired)}` };
  }
  if (s.multiRoles.length > 0) {
    return {
      tone: 'emerald',
      text: `есть запас — смену можно убрать только у ролей с ≥2 чел в каждой смене: ${roleNames(s.multiRoles)}`,
    };
  }
  return {
    tone: 'stone',
    text:
      s.hired.length === 0
        ? 'персонал станции не нанят'
        : 'запас есть, но штат уже минимален для покрытия — убирать смены нельзя',
  };
}

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

  // 26-ui (задача 3б): кто реально стоит в сменах станции — минимум людей
  // по 14 сменам недели для каждой роли и для станции суммарно.
  const stationAdvice = useMemo<StationAdvice[]>(() => {
    return stationPeaks.map((s) => {
      const roles = stationRoleIds(s.station);
      const hired = roles.filter((id) => (staff.pools[id]?.count ?? 0) > 0);
      const roleMin = new Map<RoleId, number>();
      let stationMin = Infinity;
      for (let d = 0; d < 7; d++) {
        for (const part of ['morning', 'evening'] as const) {
          let total = 0;
          for (const id of roles) {
            const sh = staff.schedule[id]?.[d];
            const n = sh ? (part === 'morning' ? sh.morning : sh.evening) : 0;
            total += n;
            roleMin.set(id, Math.min(roleMin.get(id) ?? Infinity, n));
          }
          stationMin = Math.min(stationMin, total);
        }
      }
      if (!Number.isFinite(stationMin)) stationMin = 0;
      const soloRoles = hired.filter((id) => (roleMin.get(id) ?? 0) === 1);
      const multiRoles = hired.filter((id) => (roleMin.get(id) ?? 0) >= 2);
      return { ...s, roles, hired, roleMin, stationMin, soloRoles, multiRoles };
    });
  }, [stationPeaks, staff]);

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
        <ScheduleCalcHint />
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="group">
                {/* Sticky-колонка «Роль» (мобайл 390px): фон обязателен — без
                    него прокручиваемые ячейки просвечивают под колонкой. */}
                <TableHead className="sticky left-0 z-10 bg-white group-hover:bg-stone-50 w-44">Роль</TableHead>
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
                <TableRow key={roleId} className="group">
                  <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-stone-50">
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
              <TableRow className="group bg-stone-50 font-semibold">
                <TableCell className="sticky left-0 z-10 bg-stone-50 text-sm text-stone-700">Σ смен в день</TableCell>
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
        {stationAdvice.length === 0 ? (
          <p className="text-sm text-stone-400">Пока нет данных — сыграйте хотя бы день.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {stationAdvice.map((s) => {
                const adv = stationAdviceText(s);
                const people = s.roles
                  .map((id) => ({ id, count: staff.pools[id]?.count ?? 0, weight: STATION_ROLE_MAP.find((r) => r.station === s.station && r.roleId === id)?.weight ?? 0 }))
                  .filter((r) => r.count > 0)
                  .map((r) => `${STAFF_ROLES[r.id].shortName} ×${r.count}`)
                  .join(', ');
                const peopleTitle = s.roles
                  .map((id) => {
                    const w = STATION_ROLE_MAP.find((r) => r.station === s.station && r.roleId === id)?.weight ?? 0;
                    return `${STAFF_ROLES[id].name} (вес ${w}) — в штате ${staff.pools[id]?.count ?? 0}`;
                  })
                  .join('; ');
                return (
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
                    <p
                      className="text-[10px] text-stone-500 leading-tight"
                      title={peopleTitle}
                      aria-label={`Люди станции: ${peopleTitle}`}
                    >
                      люди: {people || 'не наняты'}
                    </p>
                    <span
                      className={cn(
                        'text-[10px] leading-tight',
                        adv.tone === 'red'
                          ? 'text-red-600 font-medium'
                          : adv.tone === 'amber'
                            ? 'text-amber-700'
                            : adv.tone === 'emerald'
                              ? 'text-emerald-600'
                              : 'text-stone-400',
                      )}
                    >
                      {adv.text}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-stone-400">
              Советы учитывают, кто реально стоит в сменах: у одиночных ролей (бариста, хостес-функции)
              снимать смену нельзя — только менять штат.
            </p>
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

/** 26-ui (задача 3а): методичка-калькулятор смен над сеткой. */
function ScheduleCalcHint() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <Collapsible defaultOpen={false} className="mb-3">
      <CollapsibleTrigger className="group flex w-full min-h-11 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-left transition-colors hover:bg-stone-100">
        <Calculator className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <span className="text-sm font-medium text-stone-800">Как рассчитать нужные смены и людей</span>
        <ChevronDown
          className="ml-auto h-4 w-4 shrink-0 text-stone-400 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role="region"
          aria-label="Методичка: как рассчитать необходимое количество смен и сотрудников на неделю"
          className="mt-2 space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 text-sm text-stone-700"
        >
          <div>
            <p className="font-semibold text-stone-800">1. Пропускная способность на человека</p>
            <ul className="mt-1 grid list-disc gap-x-4 gap-y-0.5 pl-4 text-xs text-stone-600 sm:grid-cols-2">
              <li>официант — ~12 гостей/час;</li>
              <li>хостес — ~45 гостей/час (посадка);</li>
              <li>повар горячего цеха — ~14 блюд/час;</li>
              <li>повар холодного цеха — ~22 блюда/час;</li>
              <li>заготовщик — ~30 заготовок/час;</li>
              <li>бариста — ~40 напитков/час;</li>
              <li>посудомойщик — ~70 предметов/час;</li>
              <li>уборщик — ~45 посадок/час.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-stone-800">2. Формула</p>
            <p className="mt-1 text-xs leading-relaxed">
              людей в смену = <b>пиковая нагрузка часа ÷ норма на человека × 1,15</b> (запас на болезни и
              отпуска). Пиковую нагрузку часа смотрите в «Загрузке станций» ниже (топ-3 часа) и на
              главном экране (почасовой график гостей).
            </p>
          </div>
          <div>
            <p className="font-semibold text-stone-800">3. Правило пула</p>
            <p className="mt-1 text-xs leading-relaxed">
              штат роли ≥ max(утро, вечер) худшего дня недели — иначе график не закрыт (покрытие
              &lt;100%, см. KPI «Ср. покрытие» внизу экрана).
            </p>
          </div>
          <div>
            <p className="font-semibold text-stone-800">4. Норма занятости</p>
            <p className="mt-1 text-xs leading-relaxed">
              1 сотрудник ≈ 5–6 смен × 8 ч в неделю (40-часовая неделя). Пример: нужно 2 официанта
              утром и 3 вечером все 7 дней = 35 смен/нед → 35 ÷ 5,5 ≈ <b>7 официантов в штате</b>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-stone-800">5. Пример расчёта для зала на 70 мест</p>
            <p className="mt-1 text-xs leading-relaxed">
              Пик ужина субботы ~65 гостей/час → хостес: 65 ÷ 45 ≈ 1,4 → <b>2 хостес</b> в вечер;
              официанты: 65 ÷ 12 ≈ 5,4 → <b>6 официантов</b> в вечер.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => setScreen('restaurant')}
            >
              <TrendingUp className="h-4 w-4 mr-1.5 text-amber-700" aria-hidden />
              Смотреть почасовой график
            </Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setScreen('academy')}>
              <GraduationCap className="h-4 w-4 mr-1.5 text-amber-700" aria-hidden />
              Академия: планирование смен
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
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
