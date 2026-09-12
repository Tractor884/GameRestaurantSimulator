/**
 * ФИНАЛЬНЫЙ ЭКРАН (ТЗ §37 + БАЛ-v2 §20 + запрос пользователя v9):
 * ЕДИНАЯ шкала 0–1000 (6 направлений: финансы/клиенты/операционка/
 * персонал/рост/риски) и 10 уровней D−…A+ (полосы по 100 очков) +
 * спец-финалы («Кухня со звёздами», «Переезд», «Управленца сменили»,
 * причины банкротства) и динамические советы по слабым местам.
 * Прежние ДВЕ оценки (ранг 0–100 из 4 осей + счёт 0–1000) и две категории
 * («сильный/устойчивый ресторан») заменены одной шкалой и одним уровнем;
 * статусы — фактическая строка итога (выполнены ли условия победы).
 *
 * Требование пользователя: окно НЕ закрывается само — пользователь сам решает,
 * когда закрыть (кнопка). После закрытия в топбаре остаётся кнопка «Результаты»,
 * возвращающая этот экран в любой момент.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { STATUS_LABELS } from '@/lib/game/config/difficulty.config';
import { FINAL_SCORE_WEIGHTS } from '@/lib/game/config/bsc.config';
import {
  computeFinalGrade,
  RANK_PRESENTATION,
  STARS_FINAL,
  OWNER_REPLACED_FINAL,
  RELOCATION_FINAL,
  BANKRUPT_REASONS,
  axisHints,
  scoreBandRange,
} from '@/lib/game/engine';
import { ScoreBar, money, moneyShort } from './widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Trophy,
  Award,
  AlertOctagon,
  RotateCcw,
  Eye,
  Star,
  Banknote,
  Users,
  CalendarDays,
  MapPin,
  Sparkles,
  Lightbulb,
} from 'lucide-react';

export function GameOverDialog() {
  const state = useGame((s) => s.state);
  const finalSeen = useGame((s) => s.finalSeen);
  const hideFinal = useGame((s) => s.hideFinal);
  const resetGame = useGame((s) => s.resetGame);

  if (!state || state.phase !== 'gameover') return null;

  const fs = state.weekResult?.finalScore;
  const grade = computeFinalGrade(state);
  const rankPres = RANK_PRESENTATION[grade.rank];
  const band = scoreBandRange(grade.rank);
  const isWin = state.status !== 'bankrupt' && state.status !== 'stable' && state.status !== 'owner_replaced';
  const restaurant = state.restaurant!;
  const weeksLived = state.history.weekStats.length;
  const hints = axisHints(grade);

  const HeadIcon =
    state.status === 'bankrupt'
      ? AlertOctagon
      : state.status === 'owner_replaced'
        ? Users
        : grade.special.starsKitchen
          ? Sparkles
          : Trophy;

  const headGradient = state.status === 'bankrupt'
    ? 'bg-gradient-to-br from-red-800 to-red-950'
    : state.status === 'owner_replaced'
      ? 'bg-gradient-to-br from-stone-700 to-stone-900'
      : isWin
        ? `bg-gradient-to-br ${rankPres.headCls}`
        : `bg-gradient-to-br ${rankPres.headCls}`;

  return (
    <Dialog open={!finalSeen} onOpenChange={(open) => !open && hideFinal()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 overflow-x-hidden"
      >
        {/* Шапка: ЕДИНАЯ шкала 0–1000 + уровень D−…A+ (DialogTitle внутри — требование доступности Radix) */}
        <DialogHeader className="p-0 space-y-0">
        <DialogTitle asChild>
        <div className={cn('rounded-t-lg px-6 py-6 text-white', headGradient)}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="rounded-2xl bg-white/15 p-3 shrink-0">
              <HeadIcon className="h-9 w-9" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest opacity-80">
                {state.status === 'bankrupt'
                  ? 'Игра окончена'
                  : state.status === 'owner_replaced'
                    ? 'Игра окончена'
                    : 'Финал 52 недель'}
              </p>
              <p className="text-2xl font-bold leading-tight">
                {state.status === 'bankrupt'
                  ? 'Банкротство'
                  : state.status === 'owner_replaced'
                    ? OWNER_REPLACED_FINAL.title
                    : rankPres.title}
              </p>
              <p className="text-sm opacity-90 mt-0.5">
                «{restaurant.name}» · пройдено {weeksLived}{' '}
                {weeksLived % 10 === 1 && weeksLived % 100 !== 11 ? 'неделя' : 'недель'} ·{' '}
                {isWin ? 'условия победы выполнены' : 'итог см. в деталях'}
              </p>
            </div>
            {/* Единая оценка: X / 1000 + уровень */}
            <div className="ml-auto text-right shrink-0">
              <p className={cn('text-5xl font-black leading-none tabular-nums', 'text-white drop-shadow')}>
                {grade.score1000}
                <span className="text-2xl font-semibold opacity-80"> / 1000</span>
              </p>
              <p className="text-xs mt-1 uppercase tracking-wider font-semibold">
                уровень {rankPres.label} · полоса {band.min}–{band.max}
              </p>
            </div>
          </div>
        </div>
        </DialogTitle>
        <DialogDescription asChild>
          <span className="sr-only">
            Финальный счёт {grade.score1000} из 1000, уровень {rankPres.label} — {rankPres.title}. Итог:{' '}
            {STATUS_LABELS[state.status]}.
          </span>
        </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Текст ранга / спец-финала */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-700 leading-relaxed">{rankPres.text}</p>
            <p className="text-xs text-stone-500 mt-2 flex items-start gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden />
              {rankPres.advice}
            </p>
          </div>

          {/* Спец-финалы (§20) */}
          {(grade.special.starsKitchen || grade.special.relocated || grade.special.ownerReplaced || grade.special.bankrupt) && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-stone-800">Особые обстоятельства финала</p>
              {grade.special.starsKitchen && (
                <SpecialFinalCard icon={Sparkles} title={STARS_FINAL.title} text={STARS_FINAL.text} advice={STARS_FINAL.advice} tone="amber" />
              )}
              {grade.special.relocated && (
                <SpecialFinalCard icon={MapPin} title={RELOCATION_FINAL.title} text={RELOCATION_FINAL.text} advice={RELOCATION_FINAL.advice} tone="stone" />
              )}
              {grade.special.ownerReplaced && (
                <SpecialFinalCard icon={Users} title={OWNER_REPLACED_FINAL.title} text={OWNER_REPLACED_FINAL.text} advice={OWNER_REPLACED_FINAL.advice} tone="red" />
              )}
              {grade.special.bankrupt && grade.special.bankruptReason && (
                <SpecialFinalCard
                  icon={AlertOctagon}
                  title={BANKRUPT_REASONS[grade.special.bankruptReason].title}
                  text={BANKRUPT_REASONS[grade.special.bankruptReason].text}
                  advice={BANKRUPT_REASONS[grade.special.bankruptReason].advice}
                  tone="red"
                />
              )}
            </div>
          )}

          {/* Ключевые цифры */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <FinalStat
              icon={Banknote}
              label="Касса"
              value={moneyShort(restaurant.finance.cash)}
              tone={restaurant.finance.cash >= 3_000_000 ? 'good' : 'bad'}
            />
            <FinalStat
              icon={Trophy}
              label="Прибыль за игру"
              value={moneyShort(state.history.cumulativeNetProfit)}
              tone={state.history.cumulativeNetProfit >= 0 ? 'good' : 'bad'}
            />
            <FinalStat
              icon={Star}
              label="Рейтинг"
              value={restaurant.reputation.rating.toFixed(2)}
              tone={restaurant.reputation.rating >= 4.2 ? 'good' : restaurant.reputation.rating >= 3.8 ? 'warn' : 'bad'}
            />
            <FinalStat
              icon={Users}
              label="Гостей принято"
              value={state.history.weekStats.reduce((s, w) => s + w.guests, 0).toLocaleString('ru-RU')}
            />
          </div>

          {/* Диагностика итога: что стоит за уровнем (без второго счёта) */}
          <div>
            <p className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2 flex-wrap">
              Что стоит за уровнем {grade.rank}
              <span className="text-xs font-normal text-stone-400">
                диагноз по 4 направлениям — подсказки, не вторая оценка
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <GradeMetricChip label="Рейтинг гостей" value={`${grade.metrics.rating.toFixed(2)} ★`} good={grade.metrics.rating >= 4.2} />
              <GradeMetricChip label="Годовая маржа" value={`${grade.metrics.marginPct.toFixed(1)}%`} good={grade.metrics.marginPct >= 10} />
              <GradeMetricChip label="BSC квартала" value={`${grade.metrics.bscAvg.toFixed(0)}/100`} good={grade.metrics.bscAvg >= 60} />
              <GradeMetricChip label="Текучесть ~" value={`${grade.metrics.turnoverPct.toFixed(0)}%`} good={grade.metrics.turnoverPct <= 20} />
            </div>
            {/* Динамические советы по слабым местам */}
            {hints.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800">Куда расти (слабые направления)</p>
                {hints.map((h) => (
                  <p key={h.axis} className="text-xs text-amber-900/90 flex gap-1.5">
                    <span className="font-semibold shrink-0">{h.axis}:</span>
                    <span>{h.hint}</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Разбор счёта по 6 компонентам — ЕДИНСТВЕННАЯ оценка игры */}
          {fs ? (
            <div>
              <p className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2 flex-wrap">
                Из чего сложился счёт {grade.score1000}/1000
                <span className="text-xs font-normal text-stone-400">
                  6 направлений — единственная итоговая шкала игры
                </span>
              </p>
              <div className="space-y-3.5">
                <FinalScoreBar
                  label="Финансовое здоровье"
                  hint="касса, прибыль, долговая нагрузка"
                  value={fs.financialHealth}
                  max={FINAL_SCORE_WEIGHTS.financialHealth}
                />
                <FinalScoreBar
                  label="Клиенты"
                  hint="рейтинг, отзывы, возвратность"
                  value={fs.customerHealth}
                  max={FINAL_SCORE_WEIGHTS.customerHealth}
                />
                <FinalScoreBar
                  label="Операционная эффективность"
                  hint="Food Cost, Labor Cost, стабильность"
                  value={fs.operationalHealth}
                  max={FINAL_SCORE_WEIGHTS.operationalHealth}
                />
                <FinalScoreBar
                  label="Персонал"
                  hint="усталость, мораль, покрытие смен"
                  value={fs.staffHealth}
                  max={FINAL_SCORE_WEIGHTS.staffHealth}
                />
                <FinalScoreBar
                  label="Рост"
                  hint="динамика выручки и среднего чека"
                  value={fs.growth}
                  max={FINAL_SCORE_WEIGHTS.growth}
                />
                <FinalScoreBar
                  label="Управление рисками"
                  hint="санитария, техника, репутация, кадры"
                  value={fs.riskManagement}
                  max={FINAL_SCORE_WEIGHTS.riskManagement}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Детальный счёт не рассчитан — ресторан закрылся до финала.
            </p>
          )}

          {/* Как читать итог: одна шкала — 10 уровней */}
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-600 space-y-1.5">
            <p className="font-semibold text-stone-700 text-sm">Как читать итог</p>
            <p>
              <b>Счёт 0–1000 — единственная оценка</b>: сумма 6 направлений (финансы 250, клиенты 200,
              операционка 200, команда 150, рост 100, риски 100). Уровень — полоса по 100 очков:
              D−…D+ до 299, C−…C+ 300–599, B/B+ 600–799, A/A+ 800+. Сегодня — {rankPres.label}{' '}
              ({band.min}–{band.max}):
              {isWin
                ? ' все условия победы этой сложности выполнены.'
                : state.status === 'bankrupt'
                  ? ' ресторан закрылся до конца года — счёт честно считается по прожитым неделям.'
                  : ' до конца года дожили, но часть целевых метрик не дотянула.'}
            </p>
            <p>
              <b>«Отличный ресторан»</b> в деталях — то же самое подножие A/A+ с выдающимся BSC и рейтингом 4.5+.
              Статусы («устойчивый», «стабильный») — только фактическая строка итога, категория всегда одна: уровень.
            </p>
          </div>

          {/* Действия: пользователь сам решает, когда закрыть */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className="h-11 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={hideFinal}
            >
              <Eye className="h-4 w-4 mr-2" aria-hidden />
              Закрыть и посмотреть результаты
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 border-stone-300"
              onClick={() => {
                hideFinal();
                resetGame();
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" aria-hidden />
              Начать новую игру
            </Button>
          </div>
          <p className="text-xs text-stone-400 text-center">
            Окно можно позже открыть кнопкой «Результаты» в верхней панели
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Карточка спец-финала (§20). */
function SpecialFinalCard({
  icon: Icon,
  title,
  text,
  advice,
  tone,
}: {
  icon: typeof Star;
  title: string;
  text: string;
  advice: string;
  tone: 'amber' | 'stone' | 'red';
}) {
  const cls = {
    amber: 'border-amber-300 bg-amber-50/70',
    stone: 'border-stone-300 bg-stone-50',
    red: 'border-red-300 bg-red-50/60',
  }[tone];
  const iconCls = {
    amber: 'text-amber-600',
    stone: 'text-stone-500',
    red: 'text-red-600',
  }[tone];
  return (
    <div className={cn('rounded-xl border p-4', cls)}>
      <p className="text-sm font-bold text-stone-800 flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', iconCls)} aria-hidden />
        {title}
      </p>
      <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">{text}</p>
      <p className="text-[11px] text-stone-500 mt-2 flex items-start gap-1.5">
        <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" aria-hidden />
        {advice}
      </p>
    </div>
  );
}

/** Компактная метрика диагностики (значение + норма, без второй оценки). */
function GradeMetricChip({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
      <span className="text-xs text-stone-500 truncate">{label}</span>
      <span className={cn('text-sm font-bold tabular-nums shrink-0', good ? 'text-emerald-700' : 'text-amber-700')}>
        {value}
      </span>
    </div>
  );
}

function FinalStat({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
}) {
  const toneCls = {
    default: 'text-stone-900',
    good: 'text-emerald-700',
    bad: 'text-red-700',
    warn: 'text-amber-700',
  }[tone];
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-stone-500">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="text-xs truncate">{label}</span>
      </div>
      <p className={cn('text-base sm:text-lg font-bold tabular-nums mt-1 truncate', toneCls)}>{value}</p>
    </div>
  );
}

function FinalScoreBar({
  label,
  hint,
  value,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-stone-700 font-medium">
          {label}
          <span className="text-stone-400 font-normal"> — {hint}</span>
        </span>
        <span className="font-semibold tabular-nums text-stone-800">
          {Math.round(value)} / {max}
        </span>
      </div>
      <ScoreBar label="" value={value} max={max} unit="" />
    </div>
  );
}

/** Бейдж финального результата для топбара: единая шкала + уровень. */
export function FinalStatusBadge() {
  const state = useGame((s) => s.state);
  const showFinal = useGame((s) => s.showFinal);
  if (!state || state.phase !== 'gameover') return null;
  const grade = computeFinalGrade(state);
  return (
    <button
      onClick={showFinal}
      className="inline-flex items-center gap-1.5 rounded-full bg-stone-800 px-3 h-8 text-xs font-semibold text-white hover:bg-stone-700 transition-colors"
      aria-label="Открыть экран результатов"
    >
      <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden />
      {grade.score1000}/1000
      <span className="tabular-nums">· уровень {grade.rank}</span>
      <span className="opacity-70">· Результаты</span>
    </button>
  );
}

/** Экспорт для CalendarDays-иконки (используется в шапке). */
export const FinalIcons = { CalendarDays, Badge };
