/**
 * ФИНАЛЬНЫЙ ЭКРАН (ТЗ §37): счёт игры, статус ресторана, разбор 6 компонент.
 *
 * Требование пользователя: окно НЕ закрывается само — пользователь сам решает,
 * когда закрыть (кнопка). После закрытия в топбаре остаётся кнопка «Результаты»,
 * возвращающая этот экран в любой момент.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { STATUS_LABELS } from '@/lib/game/config/difficulty.config';
import { FINAL_SCORE_WEIGHTS } from '@/lib/game/config/bsc.config';
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
} from 'lucide-react';

export function GameOverDialog() {
  const state = useGame((s) => s.state);
  const finalSeen = useGame((s) => s.finalSeen);
  const hideFinal = useGame((s) => s.hideFinal);
  const resetGame = useGame((s) => s.resetGame);

  if (!state || state.phase !== 'gameover') return null;

  const fs = state.weekResult?.finalScore;
  const isWin = state.status !== 'bankrupt' && state.status !== 'stable';
  const restaurant = state.restaurant!;
  const weeksLived = state.history.weekStats.length;

  const grade = !fs
    ? null
    : fs.total >= 850
      ? { icon: Trophy, label: 'Легендарный ресторан', cls: 'text-amber-600' }
      : fs.total >= 700
        ? { icon: Award, label: 'Отличный результат', cls: 'text-emerald-600' }
        : fs.total >= 550
          ? { icon: Award, label: 'Уверенный результат', cls: 'text-emerald-600' }
          : fs.total >= 400
            ? { icon: Star, label: 'Средний результат', cls: 'text-amber-600' }
            : { icon: AlertOctagon, label: 'Ниже ожиданий', cls: 'text-red-600' };

  const HeadIcon = state.status === 'bankrupt' ? AlertOctagon : grade ? grade.icon : Star;

  return (
    <Dialog open={!finalSeen} onOpenChange={(open) => !open && hideFinal()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 overflow-x-hidden"
      >
        {/* Шапка: вердикт + статус (DialogTitle внутри — требование доступности Radix) */}
        <DialogHeader className="p-0 space-y-0">
        <DialogTitle asChild>
        <div
          className={cn(
            'rounded-t-lg px-6 py-6 text-white',
            state.status === 'bankrupt'
              ? 'bg-gradient-to-br from-red-800 to-red-950'
              : isWin
                ? 'bg-gradient-to-br from-amber-600 to-amber-800'
                : 'bg-gradient-to-br from-stone-600 to-stone-800',
          )}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="rounded-2xl bg-white/15 p-3 shrink-0">
              <HeadIcon className="h-9 w-9" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest opacity-80">
                {state.status === 'bankrupt' ? 'Игра окончена' : 'Финал 52 недель'}
              </p>
              <p className="text-2xl font-bold leading-tight">
                {state.status === 'bankrupt' ? 'Банкротство' : grade?.label ?? 'Результат'}
              </p>
              <p className="text-sm opacity-90 mt-0.5">
                «{restaurant.name}» · {STATUS_LABELS[state.status]} · пройдено {weeksLived}{' '}
                {weeksLived % 10 === 1 && weeksLived % 100 !== 11 ? 'неделя' : 'недель'}
              </p>
            </div>
            {fs && (
              <div className="ml-auto text-right shrink-0">
                <p className="text-5xl font-black tabular-nums leading-none">{fs.total}</p>
                <p className="text-xs opacity-80 mt-1">из 1000 очков</p>
              </div>
            )}
          </div>
        </div>
        </DialogTitle>
        <DialogDescription asChild>
          <span className="sr-only">
            Итоговый счёт {fs?.total ?? '—'} из 1000. Статус: {STATUS_LABELS[state.status]}.
          </span>
        </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
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

          {/* Разбор счёта по 6 компонентам */}
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

          {/* Легенда статусов */}
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-600 space-y-1.5">
            <p className="font-semibold text-stone-700 text-sm">Что означают статусы</p>
            <p>
              <b>Устойчивый ресторан</b> — все условия победы выполнены: деньги, рейтинг, прибыль и
              BSC квартала выше целей.
            </p>
            <p>
              <b>Отличный ресторан</b> — то же + выдающийся BSC и рейтинг 4.5: редкий результат.
            </p>
            <p>
              <b>Стабильный</b> — вы дожили до 52 недель, но часть целевых метрик не дотянула.
            </p>
            <p>
              <b>Банкротство</b> — деньги кончились (или рейтинг/долги добили). Попробуйте снова:
              ранние недели решают многое.
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

/** Бейдж финального статуса для топбара. */
export function FinalStatusBadge() {
  const state = useGame((s) => s.state);
  const showFinal = useGame((s) => s.showFinal);
  if (!state || state.phase !== 'gameover') return null;
  const fs = state.weekResult?.finalScore;
  return (
    <button
      onClick={showFinal}
      className="inline-flex items-center gap-1.5 rounded-full bg-stone-800 px-3 h-8 text-xs font-semibold text-white hover:bg-stone-700 transition-colors"
      aria-label="Открыть экран результатов"
    >
      <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden />
      {STATUS_LABELS[state.status]}
      {fs != null && <span className="tabular-nums">· {fs.total}/1000</span>}
      <span className="opacity-70">· Результаты</span>
    </button>
  );
}

/** Экспорт для CalendarDays-иконки (используется в шапке). */
export const FinalIcons = { CalendarDays, Badge };
