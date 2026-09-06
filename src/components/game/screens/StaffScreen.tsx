/**
 * Экран «Персонал» (ТЗ §19/§14): штат по ролям, усталость/мораль,
 * найм/увольнение, ФОТ и Labor Cost.
 */
'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import {
  SectionCard,
  KpiCard,
  MetricRow,
  ScoreBar,
  RangeBadge,
  WarningBanner,
  money,
  moneyShort,
  pct,
} from '../widgets';
import { STAFF_ROLES, ROLE_IDS } from '@/lib/game/config/staffRoles.config';
import { TAXES } from '@/lib/game/config/finance.config';
import { hourlyRate, dayCoverage } from '@/lib/game/engine/staff';
import { InfoHint } from '../hints';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Users, UserPlus, UserMinus, Wallet, Percent, Coins } from 'lucide-react';
import type { RoleId } from '@/lib/game/types';

export function StaffScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const hire = useGame((s) => s.hire);
  const fire = useGame((s) => s.fire);
  const disabled = state.phase === 'gameover';

  const staff = restaurant.staff;
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];

  // Оценка ФОТ недели: Σ запланированных смен × 8 ч × почасовая ставка.
  const payrollWeekly = useMemo(
    () =>
      ROLE_IDS.reduce((sum, roleId) => {
        const shifts = staff.schedule[roleId] ?? [];
        const totalShifts = shifts.reduce((s, sh) => s + sh.morning + sh.evening, 0);
        return sum + totalShifts * 8 * hourlyRate(roleId);
      }, 0),
    [staff.schedule],
  );

  const payrollWithSocial = payrollWeekly * (1 + TAXES.socialContributions);
  const laborCostPct =
    lastWeek && lastWeek.revenue > 0 ? payrollWithSocial / lastWeek.revenue : null;

  const totalHeadcount = ROLE_IDS.reduce((s, roleId) => s + (staff.pools[roleId]?.count ?? 0), 0);

  const avgMorale = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const roleId of ROLE_IDS) {
      const pool = staff.pools[roleId];
      if (pool.count > 0) {
        sum += pool.morale * pool.count;
        n += pool.count;
      }
    }
    return n > 0 ? sum / n : 0;
  }, [staff.pools]);

  const coverage = useMemo(() => {
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += dayCoverage(staff, d);
    return sum / 7;
  }, [staff]);

  const warnings: string[] = [];
  if (coverage < 0.85) {
    warnings.push(
      `График закрыт не полностью (${pct(coverage, 0)}) — в какие-то дни смен больше, чем сотрудников. Смотрите экран «Графики».`,
    );
  }
  if (laborCostPct !== null && laborCostPct > 0.34) {
    warnings.push(
      `Labor Cost ${pct(laborCostPct)} — выше целевых 25–32%. Проверьте графики: возможно, смен избыточны.`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="Штат"
          value={`${totalHeadcount} чел`}
          sub={`${ROLE_IDS.length} ролей`}
        />
        <KpiCard
          icon={Wallet}
          label="ФОТ (оценка/нед)"
          value={moneyShort(payrollWeekly)}
          sub={`с взносами ${moneyShort(payrollWithSocial)}`}
        />
        <KpiCard
          icon={Percent}
          label="Labor Cost"
          value={laborCostPct !== null ? pct(laborCostPct) : '—'}
          sub="цель 25–32% с взносами"
          hint="laborCost"
          tone={
            laborCostPct === null
              ? 'default'
              : laborCostPct > 0.34
                ? 'bad'
                : laborCostPct < 0.32
                  ? 'good'
                  : 'warn'
          }
        />
        <KpiCard
          icon={Coins}
          label="Средняя мораль"
          value={`${avgMorale.toFixed(0)}/100`}
          sub={avgMorale < 40 ? 'риск увольнений' : 'штат в порядке'}
          hint="morale"
          tone={avgMorale >= 60 ? 'good' : avgMorale >= 40 ? 'warn' : 'bad'}
        />
      </div>

      {warnings.length > 0 && <WarningBanner warnings={warnings} />}

      <SectionCard title="Команда по ролям" icon={Users}>
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Роль</TableHead>
                <TableHead className="w-32 text-right">Оклад</TableHead>
                <TableHead className="w-24 text-center">В штате</TableHead>
                <TableHead className="w-40">Состояние</TableHead>
                <TableHead className="w-44">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_IDS.map((roleId) => {
                const cfg = STAFF_ROLES[roleId as RoleId];
                const pool = staff.pools[roleId];
                return (
                  <TableRow key={roleId}>
                    <TableCell>
                      <p className="text-sm font-medium text-stone-800">{cfg.name}</p>
                      <p className="text-xs text-stone-500 mt-0.5 max-w-[280px]">{cfg.description}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-stone-800">
                      {money(cfg.monthlySalary)}
                      <p className="text-[10px] text-stone-400">ставка {money(hourlyRate(roleId))}/ч</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-lg font-bold tabular-nums text-stone-800">{pool.count}</span>
                      {pool.newHires > 0 && (
                        <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">
                          +{pool.newHires} новых
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2 w-36">
                        <FatigueBar value={pool.fatigue} />
                        <ScoreBar label="Мораль" value={pool.morale} hint="morale" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="icon"
                          className="h-11 w-11 bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => hire(roleId, 1)}
                          disabled={disabled}
                          title={`Нанять ${cfg.name} (оклад ${money(cfg.monthlySalary)}/мес)`}
                          aria-label={`Нанять ${cfg.name}`}
                        >
                          <UserPlus className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-11 w-11 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          onClick={() => fire(roleId, 1)}
                          disabled={disabled || pool.count <= 0}
                          title={`Уволить ${cfg.name}`}
                          aria-label={`Уволить ${cfg.name}`}
                        >
                          <UserMinus className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Итоги по штату" icon={Coins}>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <MetricRow label="Сотрудников в штате" value={`${totalHeadcount} чел`} />
            <MetricRow
              label="Смен запланировано (нед)"
              value={String(
                ROLE_IDS.reduce(
                  (s, roleId) =>
                    s + (staff.schedule[roleId] ?? []).reduce((q, sh) => q + sh.morning + sh.evening, 0),
                  0,
                ),
              )}
              hint="Смена = 8 часов. Плотный график без выходных медленно накапливает усталость — следите за полосами выше"
            />
            <MetricRow
              label="ФОТ (gross, оценка/нед)"
              value={money(payrollWeekly)}
              hint="Σ смен × 8 часов × почасовая ставка"
            />
          </div>
          <div>
            <MetricRow
              label="Соц. взносы (30%)"
              value={money(payrollWeekly * TAXES.socialContributions)}
            />
            <MetricRow label="ФОТ с взносами" value={money(payrollWithSocial)} />
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-stone-600">Labor Cost к выручке</span>
              {laborCostPct !== null ? (
                <RangeBadge value={Math.round(laborCostPct * 100)} min={0} max={32} label="цель ≤ 32%:" />
              ) : (
                <span className="text-sm text-stone-400">нет данных недели</span>
              )}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/** Полоса усталости: красная > 60, янтарная > 35. С подсказкой как формируется. */
function FatigueBar({ value }: { value: number }) {
  const color = value > 60 ? 'bg-red-500' : value > 35 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-500 flex items-center gap-1">
          Усталость
          <InfoHint hint="fatigue" />
        </span>
        <span className={cn('font-semibold tabular-nums', value > 60 ? 'text-red-700' : 'text-stone-800')}>
          {value.toFixed(0)}/100
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-label="Усталость"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
