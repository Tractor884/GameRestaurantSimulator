/**
 * ФИНАЛЬНЫЙ ЭКРАН (ТЗ §37 + БАЛАНСИРОВКА V2 §20 ЭТАП 6 «Представление»).
 *
 * 10 рангов ресторана D−…A+ (рейтинг × маржа × BSC × текучесть) + спец-финалы
 * («Кухня со звёздами», «Управленца сменили», «Банкротство» с причиной,
 * «Переезд») + UI-метрики этапа 6 (текучесть, кредитное плечо, доверие).
 *
 * Требование пользователя: окно НЕ закрывается само — пользователь сам решает,
 * когда закрыть (кнопка). После закрытия в топбаре остаётся кнопка «Результаты»,
 * возвращающая этот экран в любой момент.
 */
'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { STATUS_LABELS } from '@/lib/game/config/difficulty.config';
import { FINAL_SCORE_WEIGHTS } from '@/lib/game/config/bsc.config';
import {
  computeFinalGrade,
  axisHints,
  RANK_PRESENTATION,
  STARS_FINAL,
  RELOCATION_FINAL,
  BANKRUPT_REASONS,
  GRADE_AXIS_WEIGHTS,
  type FinalRankId,
} from '@/lib/game/engine/finalGrade';
import { isLegacy } from '@/lib/game/config/balance2.config';
import { ScoreBar, money, moneyShort } from './widgets';
import { Button } from '@/components/ui/button';
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
  UserX,
  Truck,
  TrendingDown,
  Percent,
  Scale,
  Handshake,
  CalendarDays,
  Gauge,
} from 'lucide-react';

/** Порядок рангов для шкалы внизу шапки. */
const RANK_ORDER: FinalRankId[] = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

export function GameOverDialog() {
  const state = useGame((s) => s.state);
  const finalSeen = useGame((s) => s.finalSeen);
  const hideFinal = useGame((s) => s.hideFinal);
  const resetGame = useGame((s) => s.resetGame);

  // §20 этап 6: ранг и спец-финалы считаются чистой функцией из состояния —
  // никаких новых ГСЧ, детерминизм движка не затрагивается.
  const grade = useMemo(() => (state ? computeFinalGrade(state) : null), [state]);

  if (!state || state.phase !== 'gameover' || !grade) return null;

  const fs = state.weekResult?.finalScore;
  const restaurant = state.restaurant!;
  const weeksLived = grade.metrics.weeksLived;
  const { special } = grade;
  const presentation = RANK_PRESENTATION[grade.rank];
  const hints = axisHints(grade);

  const bankruptReason =
    special.bankrupt && special.bankruptReason ? BANKRUPT_REASONS[special.bankruptReason] : null;

  // Шапка: спец-финалы важнее ранга (звёзды/банкрот/смена), иначе title ранга.
  const headTitle = special.starsKitchen
    ? STARS_FINAL.title
    : special.bankrupt
      ? 'Банкротство'
      : special.ownerReplaced
        ? 'Управленца сменили'
        : presentation.title;
  const HeadIcon = special.starsKitchen
    ? Star
    : special.bankrupt
      ? AlertOctagon
      : special.ownerReplaced
        ? UserX
        : grade.rank.startsWith('A')
          ? Trophy
          : grade.rank.startsWith('B')
            ? Award
            : grade.rank.startsWith('D')
              ? TrendingDown
              : Gauge;
  const headCls = special.bankrupt
    ? 'bg-gradient-to-br from-red-800 to-red-950'
    : special.ownerReplaced
      ? 'bg-gradient-to-br from-orange-800 to-stone-900'
      : special.starsKitchen
        ? 'bg-gradient-to-br from-amber-400 to-amber-700'
        : `bg-gradient-to-br ${presentation.headCls}`;

  return (
    <Dialog open={!finalSeen} onOpenChange={(open) => !open && hideFinal()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 overflow-x-hidden"
      >
        {/* Шапка: вердикт + РАНГ (DialogTitle внутри — требование доступности Radix) */}
        <DialogHeader className="p-0 space-y-0">
        <DialogTitle asChild>
        <div className={cn('rounded-t-lg px-6 py-6 text-white', headCls)}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="rounded-2xl bg-white/15 p-3 shrink-0">
              <HeadIcon className="h-9 w-9" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest opacity-80">
                {special.bankrupt
                  ? 'Игра окончена'
                  : special.ownerReplaced
                    ? 'Решение владельца'
                    : special.starsKitchen
                      ? 'Особый финал года'
                      : 'Финал 52 недель'}
              </p>
              <p className="text-2xl font-bold leading-tight">{headTitle}</p>
              <p className="text-sm opacity-90 mt-0.5">
                «{restaurant.name}» · {STATUS_LABELS[state.status]} ·{' '}
                {weeksLived === 52
                  ? 'полный год'
                  : `${weeksLived} ${weeksLived % 10 === 1 && weeksLived % 100 !== 11 ? 'неделя' : 'недель'}`}
                {special.relocated && !special.bankrupt ? ' · после переезда' : ''}
              </p>
            </div>
            {/* Бейдж финального ранга */}
            <div className="ml-auto shrink-0 text-right">
              <p className={cn('text-5xl font-black leading-none tracking-tight', presentation.rankCls)}>
                {grade.rank}
              </p>
              <p className="text-[11px] uppercase tracking-widest opacity-80 mt-1">ранг ресторана</p>
              {fs && <p className="text-xs opacity-80 mt-0.5">{fs.total}/1000</p>}
            </div>
          </div>
          {/* Шкала рангов: маркер на прогрессии D−…A+ */}
          {!special.bankrupt && (
            <div className="mt-4" aria-hidden>
              <div className="flex items-center gap-0.5">
                {RANK_ORDER.map((r) => (
                  <span
                    key={r}
                    className={cn(
                      'flex-1 h-1.5 rounded-full',
                      RANK_ORDER.indexOf(r) <= RANK_ORDER.indexOf(grade.rank)
                        ? 'bg-white/90'
                        : 'bg-white/25',
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-[10px] font-medium opacity-70 mt-1">
                <span>D−</span>
                <span>C</span>
                <span>B</span>
                <span>A+</span>
              </div>
            </div>
          )}
        </div>
        </DialogTitle>
        <DialogDescription asChild>
          <span className="sr-only">
            Итоговый ранг {grade.rank} из D−…A+, счёт {fs?.total ?? '—'} из 1000. Статус:{' '}
            {STATUS_LABELS[state.status]}.
          </span>
        </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* §20 спец-финал «Кухня со звёздами» */}
          {special.starsKitchen && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <Star className="h-4 w-4" aria-hidden />
                {STARS_FINAL.title} · рейтинг {grade.metrics.rating.toFixed(2)} + BSC{' '}
                {grade.metrics.bscAvg.toFixed(1)} + победа
              </p>
              <p className="text-sm text-stone-700 mt-1.5 leading-relaxed">{STARS_FINAL.text}</p>
              <p className="text-xs text-stone-500 mt-2">{STARS_FINAL.advice}</p>
            </div>
          )}

          {/* §20 спец-финал «Управленца сменили» (v2 §13.2) */}
          {special.ownerReplaced && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                <UserX className="h-4 w-4" aria-hidden />
                Доверие владельца упало ниже 15
              </p>
              <p className="text-sm text-stone-700 mt-1.5 leading-relaxed">
                Владелец не увидел ни дивидендов, ни плана, ни заботы о капитале: ресторан для него
                превратился в «закрома управляющего». Ключи и печать переданы новому менеджеру —
                ваш путь здесь закончен.
              </p>
              <p className="text-xs text-stone-500 mt-2">
                Совет: следите за предложениями дивидендов в конце каждого квартала и за индикатором
                доверия на экране «Кредиты». Выплаты ≥ 70% предложения возвращают доверие (+8),
                регулярные отказы при сильном FCF обнуляют его за год.
              </p>
            </div>
          )}

          {/* §20 спец-финал «Банкротство» с причиной (§37) */}
          {special.bankrupt && bankruptReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <AlertOctagon className="h-4 w-4" aria-hidden />
                {bankruptReason.title}
              </p>
              <p className="text-sm text-stone-700 mt-1.5 leading-relaxed">{bankruptReason.text}</p>
              <p className="text-xs text-stone-500 mt-2">{bankruptReason.advice}</p>
            </div>
          )}

          {/* §20 спец-финал «Переезд» (ультиматум арендодателя) */}
          {special.relocated && !special.bankrupt && (
            <div className="rounded-lg border border-stone-300 bg-stone-100 p-4">
              <p className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                <Truck className="h-4 w-4" aria-hidden />
                {RELOCATION_FINAL.title}
              </p>
              <p className="text-sm text-stone-700 mt-1.5 leading-relaxed">{RELOCATION_FINAL.text}</p>
              <p className="text-xs text-stone-500 mt-2">{RELOCATION_FINAL.advice}</p>
            </div>
          )}

          {/* Ключевые цифры + UI-метрики этапа 6 (текучесть/плечо/доверие) */}
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
              value={grade.metrics.rating.toFixed(2)}
              tone={grade.metrics.rating >= 4.2 ? 'good' : grade.metrics.rating >= 3.8 ? 'warn' : 'bad'}
            />
            <FinalStat
              icon={Users}
              label="Гостей принято"
              value={state.history.weekStats.reduce((s, w) => s + w.guests, 0).toLocaleString('ru-RU')}
            />
            <FinalStat
              icon={Percent}
              label="Текучесть за год"
              value={isLegacy() ? '—' : `${grade.metrics.turnoverPct.toFixed(0)}%`}
              tone={
                grade.metrics.turnoverPct <= 20
                  ? 'good'
                  : grade.metrics.turnoverPct <= 35
                    ? 'warn'
                    : 'bad'
              }
            />
            <FinalStat
              icon={Scale}
              label="Кредитное плечо"
              value={(restaurant.finance.leverage ?? 0).toFixed(2)}
              tone={
                (restaurant.finance.leverage ?? 0) <= 0.5
                  ? 'good'
                  : (restaurant.finance.leverage ?? 0) <= 1
                    ? 'warn'
                    : 'bad'
              }
            />
            <FinalStat
              icon={Handshake}
              label="Доверие владельца"
              value={`${restaurant.finance.ownerTrust ?? 60}`}
              tone={
                (restaurant.finance.ownerTrust ?? 60) >= 60
                  ? 'good'
                  : (restaurant.finance.ownerTrust ?? 60) >= 30
                    ? 'warn'
                    : 'bad'
              }
            />
            <FinalStat
              icon={TrendingDown}
              label="Чистая маржа года"
              value={`${grade.metrics.marginPct.toFixed(1)}%`}
              tone={grade.metrics.marginPct >= 10 ? 'good' : grade.metrics.marginPct >= 4 ? 'warn' : 'bad'}
            />
          </div>

          {/* Состав ранга: 4 управленческие оси §20 */}
          <div>
            <p className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2">
              Из чего сложился ранг {grade.rank}
              <span className="text-xs font-normal text-stone-400">
                (рейтинг × маржа × BSC × текучесть, скор {(grade.score * 100).toFixed(0)}/100)
              </span>
            </p>
            <div className="space-y-3.5">
              <GradeAxisBar
                label="Рейтинг гостей"
                weight={GRADE_AXIS_WEIGHTS.rating}
                axis={grade.axes.rating}
                value={`${grade.metrics.rating.toFixed(2)} (норма ≥ 4,2)`}
              />
              <GradeAxisBar
                label="Чистая маржа"
                weight={GRADE_AXIS_WEIGHTS.margin}
                axis={grade.axes.margin}
                value={`${grade.metrics.marginPct.toFixed(1)}% (сильный ≥ 14%)`}
              />
              <GradeAxisBar
                label="BSC квартала"
                weight={GRADE_AXIS_WEIGHTS.bsc}
                axis={grade.axes.bsc}
                value={`${grade.metrics.bscAvg.toFixed(1)} (выдающийся ≥ 85)`}
              />
              <GradeAxisBar
                label="Удержание персонала"
                weight={GRADE_AXIS_WEIGHTS.turnover}
                axis={grade.axes.turnover}
                value={`текучесть ${grade.metrics.turnoverPct.toFixed(0)}% (норма ≤ 20%)`}
              />
            </div>
            {/* Динамические подсказки по слабым осям (§20 «~25 состояний») */}
            {hints.length > 0 && !special.bankrupt && (
              <div className="mt-3 rounded-lg bg-stone-50 border border-stone-200 p-3">
                <p className="text-xs font-semibold text-stone-700 mb-1.5">
                  Что качать в первую очередь
                </p>
                <ul className="space-y-1">
                  {hints.map((h) => (
                    <li key={h.axis} className="text-xs text-stone-600 flex gap-1.5">
                      <span className="text-stone-400 shrink-0" aria-hidden>
                        ↳
                      </span>
                      <span>
                        <b className="text-stone-700">{h.axis}</b> — {h.hint}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Вердикт ранга: текст + совет */}
          {!special.bankrupt && !special.ownerReplaced && (
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-sm font-semibold text-stone-800">
                Вердикт: {presentation.title} ({grade.rank})
              </p>
              <p className="text-sm text-stone-700 mt-1.5 leading-relaxed">{presentation.text}</p>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                <b>Совет:</b> {presentation.advice}
              </p>
            </div>
          )}

          {/* Разбор счёта по 6 компонентам (ТЗ §37.2) */}
          {fs ? (
            <div>
              <p className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2">
                Из чего сложился счёт
                <span className="text-xs font-normal text-stone-400">
                  (6 направлений с весами итога)
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

          {/* Легенда: ранги и статусы */}
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-600 space-y-1.5">
            <p className="font-semibold text-stone-700 text-sm">Как читать результат</p>
            <p>
              <b>Ранг D−…A+</b> — итоговая сила ресторана по 4 осям: D — кризис, C — середина
              (пассив даёт C+), B — уверенно, A — эталон. Ранг не зависит от того, выиграли ли вы
              по условиям сложности: ресторан может быть сильным, а победа — нет.
            </p>
            <p>
              <b>Устойчивый ресторан</b> — все условия победы выполнены: деньги, рейтинг, прибыль и
              BSC квартала выше целей. <b>Отличный</b> — то же + выдающийся BSC и рейтинг 4,5.
            </p>
            <p>
              <b>Кухня со звёздами</b> — особый финал: победа + рейтинг ≥ 4,8 + BSC ≥ 85.
              <b> Стабильный</b> — дожили до 52 недель, но часть планок не дотянули.
            </p>
            <p>
              <b>Банкротство</b> — деньги кончились (или рейтинг/долги добили): причина указана
              выше. <b>Управленца сменили</b> — доверие владельца ниже 15.
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

/** Ось ранга: бар 0..1 с весом оси и фактическим значением метрики. */
function GradeAxisBar({
  label,
  weight,
  axis,
  value,
}: {
  label: string;
  weight: number;
  axis: number;
  value: string;
}) {
  const pct = Math.round(axis * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-stone-700 font-medium">
          {label}
          <span className="text-stone-400 font-normal"> · вес {Math.round(weight * 100)}%</span>
        </span>
        <span className="font-semibold tabular-nums text-stone-800">{value}</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-label={`${label}: ${pct}%`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
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

/** Бейдж финального статуса для топбара (этап 6: ранг крупнее). */
export function FinalStatusBadge() {
  const state = useGame((s) => s.state);
  const showFinal = useGame((s) => s.showFinal);
  const grade = useMemo(
    () => (state && state.phase === 'gameover' ? computeFinalGrade(state) : null),
    [state],
  );
  if (!state || state.phase !== 'gameover' || !grade) return null;
  const fs = state.weekResult?.finalScore;
  return (
    <button
      onClick={showFinal}
      className="inline-flex items-center gap-1.5 rounded-full bg-stone-800 px-3 h-8 text-xs font-semibold text-white hover:bg-stone-700 transition-colors"
      aria-label="Открыть экран результатов"
    >
      <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden />
      {grade.rank}
      <span className="opacity-80">· {STATUS_LABELS[state.status]}</span>
      {fs != null && <span className="tabular-nums opacity-80">· {fs.total}</span>}
    </button>
  );
}

/** Экспорт для CalendarDays-иконки (используется в шапке). */
export const FinalIcons = { CalendarDays, Gauge };
