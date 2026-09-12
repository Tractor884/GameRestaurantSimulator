/**
 * НАСТАВНИК — компактный виджет в шапке (рекомендация пользователя №2).
 *
 * Живые KPI, а не календарь: источником данных служит presentation-слой
 * buildDebrief() (academy.ts) — до 11 детекторов проблем с приоритезацией
 * «критично/внимание». Виджет берёт САМЫЙ приоритетный детектор (issues уже
 * отсортированы: сначала critical, потом warning) и показывает его суть +
 * короткий совет. Проблем нет — позитивная фраза (выбор детерминированный
 * по календарю игры: week+day, БЕЗ ГСЧ — слой только читает состояние).
 *
 * Взаимодействие: клик → Popover с 2–3 верхними подсказками и кнопкой
 * «В Академию». НЕ дублирует TutorialCoach (календарные шаги первых 10 нед
 * на главном экране): Наставник — про живые KPI, работают одновременно.
 *
 * Точка-индикатор на аватаре: критично — red, внимание — amber, норма — emerald.
 * До создания ресторана виджет не рендерится (проверка state.restaurant/phase).
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { buildDebrief, type DebriefIssue } from '@/lib/game/presentation/academy';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GraduationCap, ChevronRight, CircleAlert, AlertTriangle, Sparkles } from 'lucide-react';

/** Тон момента: критично / внимание / норма (цвет точки и рамки). */
type MentorTone = 'critical' | 'warning' | 'good';

/** Позитивные фразы, когда детекторы buildDebrief() ничего не нашли. */
const POSITIVE_PHRASES = [
  'Показатели в норме — время думать о росте',
  'Ключевые метрики в норме: усилите то, что работает',
  'Ресторан здоров: хороший момент для новинок и кампаний',
];

/** Спец-фраза, пока нет ни одной закрытой недели (данных KPI ещё нет). */
const NO_DATA_PHRASE = 'Первая неделя покажет цифры — прожейте её кнопкой «День»';

/** Тон и подпись статуса по характеру проблемы. */
function toneOf(main: DebriefIssue | null): MentorTone {
  if (!main) return 'good';
  return main.severity === 'critical' ? 'critical' : 'warning';
}

const TONE_LABEL: Record<MentorTone, string> = {
  critical: 'критично',
  warning: 'внимание',
  good: 'норма',
};

const TONE_DOT: Record<MentorTone, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  good: 'bg-emerald-500',
};

export function MentorWidget() {
  const state = useGame((s) => s.state);
  const setScreen = useGame((s) => s.setScreen);
  const [open, setOpen] = useState(false);

  /** Только чтение состояния: buildDebrief — pure-функция (без RNG/мутаций). */
  const mentor = useMemo(() => {
    if (!state?.restaurant) return null;
    const { issues } = buildDebrief(state);
    /** issues уже отсортированы (critical → warning): issues[0] — самый приоритетный. */
    const main = issues[0] ?? null;
    const top = issues.slice(0, 3);
    let phrase: string | null = null;
    if (!main) {
      // Детерминированный выбор позитивной фразы по календарю игры (не ГСЧ).
      phrase =
        state.history.weekStats.length === 0
          ? NO_DATA_PHRASE
          : POSITIVE_PHRASES[(state.week + state.day) % POSITIVE_PHRASES.length];
    }
    return { main, top, phrase };
  }, [state]);

  // Не рендеримся: ресторан ещё не создан (визард) или игра завершена.
  if (!mentor || !state?.restaurant || state.phase === 'gameover') return null;

  const tone = toneOf(mentor.main);
  /** Главная подсказка момента: суть проблемы (или позитив) для свёрнутого вида. */
  const headline = mentor.main ? mentor.main.title : mentor.phrase;
  const advice = mentor.main?.action;

  const goScreen = (screen: DebriefIssue['screen']) => {
    if (!screen) return;
    setOpen(false);
    setScreen(screen);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="button"
          aria-label={`Наставник: ${TONE_LABEL[tone]} — ${headline}`}
          aria-haspopup="dialog"
          title={headline ?? undefined}
          className={cn(
            'flex h-11 items-center gap-2 rounded-full border pl-1.5 pr-2.5 transition-colors active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            tone === 'critical'
              ? 'border-red-200 bg-red-50 hover:bg-red-100'
              : tone === 'warning'
                ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
          )}
        >
          {/* Аватар-кружок + точка-индикатор */}
          <span className="relative shrink-0" aria-hidden>
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                tone === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : tone === 'warning'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700',
              )}
            >
              <GraduationCap className="h-4 w-4" />
            </span>
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white',
                TONE_DOT[tone],
              )}
            />
          </span>
          {/* Текст — от md; на мобайле виджет сворачивается в иконку */}
          <span className="hidden md:flex min-w-0 max-w-[210px] lg:max-w-[260px] flex-col items-start text-left">
            <span
              className={cn(
                'text-[10px] font-semibold uppercase leading-tight tracking-wide',
                tone === 'critical'
                  ? 'text-red-600'
                  : tone === 'warning'
                    ? 'text-amber-700'
                    : 'text-emerald-700',
              )}
            >
              Наставник · {TONE_LABEL[tone]}
            </span>
            <span className="w-full truncate text-xs font-medium text-stone-700">{headline}</span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-3" aria-label="Подсказки наставника">
        <div className="flex items-start gap-2.5 border-b border-stone-100 pb-2.5">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              tone === 'critical'
                ? 'bg-red-100 text-red-700'
                : tone === 'warning'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700',
            )}
            aria-hidden
          >
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-800">Наставник</p>
            <p className="text-xs text-stone-500">
              Живые показатели ресторана: что важнее всего прямо сейчас.
            </p>
          </div>
        </div>

        {mentor.top.length > 0 ? (
          <ul className="my-2.5 max-h-80 space-y-2 overflow-y-auto pr-1">
            {mentor.top.map((issue, i) => (
              <li
                key={issue.id}
                className={cn(
                  'rounded-lg border p-2.5',
                  issue.severity === 'critical'
                    ? 'border-red-200 bg-red-50/60'
                    : 'border-amber-200 bg-amber-50/60',
                )}
              >
                <div className="flex items-start gap-2">
                  {issue.severity === 'critical' ? (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-snug text-stone-800">
                      {i + 1}. {issue.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-stone-600">{issue.action}</p>
                    {issue.screen && (
                      <button
                        type="button"
                        onClick={() => goScreen(issue.screen)}
                        className="mt-1.5 inline-flex min-h-9 items-center gap-0.5 text-[11px] font-medium text-amber-700 hover:text-amber-900"
                      >
                        Перейти к экрану
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="my-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <p className="text-xs leading-relaxed text-stone-700">
                {mentor.phrase}
                {state.history.weekStats.length > 0 && ' — KPI без критичных отклонений.'}
              </p>
            </div>
          </div>
        )}

        <Button
          size="sm"
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => goScreen('academy')}
        >
          <GraduationCap className="h-4 w-4 mr-1" aria-hidden />
          В Академию
          <span className="sr-only">— открыть экран «Академия управляющего»</span>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
