/**
 * ТУТОРИАЛ ПЕРВЫХ НЕДЕЛЬ — «Совет управляющего» (ТЗ §31.6 + аудит №15).
 *
 * ДВА СЛОЯ ПОДСКАЗОК:
 *  1. ПОШАГОВЫЙ ТУТОРИАЛ (недели 1–8): вводные советы — куда смотреть
 *     и что попробовать (склад → графики → маркетинг → P&L → отзывы →
 *     кредит → BSC). Шаги привязаны к ДНЯМ ИГРЫ и сменяются САМИ по мере
 *     того, как игрок проживает дни: календарь — главный двигатель
 *     прогресса. Кнопка «Понятно» прячет текущий шаг до времени
 *     следующего (или сразу показывает его, если его день уже настал).
 *     Прогресс в localStorage (`tutorial-step`), не в сейве: это
 *     мета-информация игрока, не состояние ресторана.
 *  2. КОНТЕКСТНЫЕ СОВЕТЫ (приоритет над туториалом): реакция на живое
 *     состояние — Food Cost выше 36%, касса ниже 1.5 млн, рейтинг ниже 3.8,
 *     стоп-лист, усталость, очередь. Каждый совет = конкретный рецепт.
 *
 * Показывается ТОЛЬКО на главном экране. Скрытие шага — кнопкой «Понятно»
 * (следующий шаг придёт в свой день). Контекстные советы возвращаются,
 * пока проблема не решена (не глушатся навсегда, но не чаще раза в сессию —
 * флаг в localStorage со днём игры).
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame, type ScreenId } from '@/lib/game/store/gameStore';
import { difficultyWin } from '@/lib/game/config/difficulty.config';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GraduationCap, X, Lightbulb, ChevronRight } from 'lucide-react';

interface Tip {
  id: string;
  title: string;
  body: string;
  tone: 'tutorial' | 'warning';
  action?: { label: string; screen: ScreenId };
}

/** Пошаговый туториал: день игры → совет (аудит №15 «режим первых 4 недель»).
 * `day` — сколько дней прожито к моменту показа шага (0 = сразу после старта).
 * «{{goals}}» в первом шаге подставляется из условий победы ТЕКУЩЕЙ сложности. */
const STEPS: { day: number; tip: Tip }[] = [
  {
    day: 0,
    tip: {
      id: 't-start',
      title: 'Добро пожаловать за руль ресторана!',
      tone: 'tutorial',
      body:
        'Цель года: {{goals}}. Каждое нажатие «День» проживает день с 8:00 до 23:00: спрос → очередь → заказы → кухня → выручка. «Неделя» прогоняет 7 дней разом. Начните с кнопки «День» и смотрите, как идёт первый день. Советы управляющего будут сменяться сами по мере игры.',
      action: { label: 'Жмите «День» в верхней панели', screen: 'restaurant' },
    },
  },
  {
    day: 2,
    tip: {
      id: 't-warehouse',
      title: 'Склад — сердце кухни',
      tone: 'tutorial',
      body:
        'Автозаказ завхоза уже включён (2 дня запаса): с утра он сам дозакупает продукты. Откройте «Склад»: жёлтые/красные бейджи сроков годности — это будущие списания и санитарный риск. Срочная закупка дороже на 35% — пользуйтесь ей только при стоп-листах.',
      action: { label: 'Открыть «Склад»', screen: 'warehouse' },
    },
  },
  {
    day: 7,
    tip: {
      id: 't-schedule',
      title: 'График: найдите лишние смены',
      tone: 'tutorial',
      body:
        'Дефолтный график — «с запасом», это осознанно. На экране «Графики» внизу — панель «Загрузка станций»: серые станции (ниже 50%) означают лишние смены — уберите одну и сэкономьте ФОТ; красные (выше 115%) — кухня не успевает, добавьте смену.',
      action: { label: 'Открыть «Графики»', screen: 'schedule' },
    },
  },
  {
    day: 9,
    tip: {
      id: 't-marketing',
      title: 'Первый маркетинг',
      tone: 'tutorial',
      body:
        'Без рекламы поток гостей медленно тает. «Карты и поиск» лучше всего работают для завтраков и ланчей, «Соцсети» — для вечеров и молодёжи. Начните с 70–100 тыс ₽/нед на 4 недели: кампания выйдет на полную силу за пару дней.',
      action: { label: 'Открыть «Маркетинг»', screen: 'marketing' },
    },
  },
  {
    day: 14,
    tip: {
      id: 't-pnl',
      title: 'Прибыль ≠ деньги: читайте P&L',
      tone: 'tutorial',
      body:
        'На «Финансах» два отчёта: P&L показывает заработали ли вы, Cash Flow — есть ли деньги заплатить. Следите за главными строками: Food Cost 30–34%, Labor Cost 25–32%, EBITDA 10–20%. Аренда и налоги уходят раз в 4 недели — касса падает скачком.',
      action: { label: 'Открыть «Финансы»', screen: 'finance' },
    },
  },
  {
    day: 21,
    tip: {
      id: 't-reviews',
      title: 'Рейтинг лечится сервисом',
      tone: 'tutorial',
      body:
        'На «Отзывах» фильтр «1–2★» показывает, что именно бесит гостей: «вечно ждать» → добавьте хостес/официантов; «нет половины меню» → стоп-лист из-за склада; «грязно» → бюджет клининга. Один плохой день не обрушит рейтинг — но хроника убьёт.',
      action: { label: 'Открыть «Отзывы»', screen: 'reviews' },
    },
  },
  {
    day: 35,
    tip: {
      id: 't-loan',
      title: 'Кредит давит — планируйте',
      tone: 'tutorial',
      body:
        'Платежи по кредиту — каждые 4 недели. Прогноз на 4 недели (внизу этого экрана) показывает, хватит ли кассы. Держите запас 3+ млн ₽ и DSCR выше 1.3; просрочка = штраф и рост финансового риска, 8 подряд — банкротство.',
      action: { label: 'Открыть «Кредиты»', screen: 'loans' },
    },
  },
  {
    day: 49,
    tip: {
      id: 't-bsc',
      title: 'BSC — термометр ресторана',
      tone: 'tutorial',
      body:
        'BSC 70+ = здоровый ресторан: финансы 30%, клиенты 25%, процессы 25%, персонал 20%. На 12-й неделе — первый квартальный разбор. После остановки кампаний спрос сползает −50%/нед: планируйте «волнами», а не вечной рекламой.',
      action: { label: 'Открыть «Аналитику»', screen: 'analytics' },
    },
  },
];

/** Туториал завершается сам к 10-й неделе: дальше работают Академия и алерты. */
const TUTORIAL_END_DAY = 63;

const STEP_STORAGE = 'rest-sim-tutorial-step';
const ALERT_STORAGE = 'rest-sim-tutorial-alert-day';

function loadStep(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(STEP_STORAGE);
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function saveStep(step: number): void {
  try {
    window.localStorage.setItem(STEP_STORAGE, String(step));
  } catch {
    /* приватный режим — просто не сохраняем */
  }
}

/** «со 3-го дня» / «с 2-й недели» — человекочитаемая метка дня шага
 *  относительно текущего прогресса (шаг той же недели — днём, будущей — неделей). */
function dayLabel(day: number, daysPlayed: number): string {
  const week = Math.floor(day / 7) + 1;
  const curWeek = Math.floor(daysPlayed / 7) + 1;
  return week <= curWeek ? `со ${day + 1}-го дня` : `с ${week}-й недели`;
}

export function TutorialCoach() {
  const state = useGame((s) => s.state)!;
  const setScreen = useGame((s) => s.setScreen);
  /** id скрытого «Понятно» совета: окно возвращается, когда придёт СЛЕДУЮЩИЙ шаг. */
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const [step, setStep] = useState<number>(() => loadStep());

  const restaurant = state.restaurant;
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];
  /** Прожито дней: (неделя − 1) × 7 + день (day 0..6 = следующий к прожитию). */
  const daysPlayed = (state.week - 1) * 7 + state.day;

  /** Цели текущей сложности (плейсхолдер {{goals}} первого шага). */
  const goalText = useMemo(() => {
    const w = difficultyWin(state.difficultyId);
    const short = (v: number) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10} млн ₽` : `${Math.round(v / 1000)} тыс ₽`);
    return `рейтинг ${w.minRating}+, накопленная прибыль ${short(w.minCumulativeProfit)}, касса ${short(w.minCash)} и BSC ${w.minBscAvgQuarter}+`;
  }, [state.difficultyId]);

  /** Контекстные советы: приоритет над туториалом (проблема важнее вводных). */
  const alert = useMemo<Tip | null>(() => {
    if (!restaurant || !lastWeek) return null;
    // Не чаще одного алерта в игровой день.
    try {
      const lastAlertDay = window.localStorage.getItem(ALERT_STORAGE);
      if (lastAlertDay === String(daysPlayed)) return null;
    } catch {
      /* ignore */
    }
    if (restaurant.finance.cash < 1_500_000) {
      return {
        id: 'a-cash',
        tone: 'warning',
        title: 'Касса на дне',
        body: `На счёте ${Math.round(restaurant.finance.cash / 1000)} тыс ₽. Сократите расходы (маркетинг/график), приостановите досрочные погашения и проверьте прогноз: аренда/налоги/кредит приходят раз в 4 недели одной пачкой.`,
      };
    }
    if (lastWeek.foodCost > 0.36 && lastWeek.revenue > 0) {
      return {
        id: 'a-fc',
        tone: 'warning',
        title: 'Food Cost выше нормы',
        body: `Себестоимость съедает ${(lastWeek.foodCost * 100).toFixed(1)}% выручки. Поднимите цены на популярные блюда на 5–8%, выведите из стоп-листа маржинальные позиции и не закупайте впрок скоропорт.`,
        action: { label: 'Открыть «Меню»', screen: 'menu' },
      };
    }
    if (restaurant.reputation.rating < 3.8) {
      return {
        id: 'a-rating',
        tone: 'warning',
        title: 'Рейтинг падает',
        body: `Рейтинг ${restaurant.reputation.rating.toFixed(2)} — ниже 3.8 спрос тает. Откройте «Отзывы» → фильтр 1–2★: чаще всего причины — очередь, стоп-листы и грязь. Быстрый ремонт: хостес на смене, автозаказ включён, бюджет клининга не ниже базового.`,
        action: { label: 'Открыть «Отзывы»', screen: 'reviews' },
      };
    }
    if (restaurant.menu.stopList.length >= 5) {
      return {
        id: 'a-stop',
        tone: 'warning',
        title: 'Стоп-лист растёт',
        body: `${restaurant.menu.stopList.length} блюд недоступны — гости уходят разочарованными. Проверьте «Склад»: чего не хватает, закажите срочно (+35% к цене, но продажи вернутся сразу).`,
        action: { label: 'Открыть «Склад»', screen: 'warehouse' },
      };
    }
    const avgFatigue =
      Object.values(restaurant.staff.pools).reduce((s, p) => s + p.fatigue * p.count, 0) /
      Math.max(1, Object.values(restaurant.staff.pools).reduce((s, p) => s + p.count, 0));
    if (avgFatigue > 60) {
      return {
        id: 'a-fatigue',
        tone: 'warning',
        title: 'Команда выгорает',
        body: `Средняя усталость ${avgFatigue.toFixed(0)}: растут ошибки и увольнения. Поставьте запасного на горячий цех или снизьте смены — усталость падает на выходных и при недогрузе.`,
        action: { label: 'Открыть «Персонал»', screen: 'staff' },
      };
    }
    return null;
  }, [restaurant, lastWeek, daysPlayed]);

  /** Календарный шаг: последний, чей день уже прожит (главный двигатель
   *  прогресса — советы сменяются сами, без нажатий). */
  const calendarIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < STEPS.length; i++) {
      if (STEPS[i].day <= daysPlayed) idx = i;
      else break;
    }
    return idx;
  }, [daysPlayed]);

  /** Текущий шаг туториала. Правила:
   *  − календарь опережает ручной прогресс → показываем шаг календаря;
   *  − игрок закрыл шаг раньше времени → ждём день следующего шага;
   *  − все шаги пройдены или туториал «постарел» → советы заканчиваются. */
  const tutorialTip = useMemo<Tip | null>(() => {
    if (daysPlayed >= TUTORIAL_END_DAY) return null;
    const idx = Math.max(step, calendarIdx);
    if (idx >= STEPS.length) return null;
    if (idx > calendarIdx) return null;
    return STEPS[idx].tip;
  }, [step, calendarIdx, daysPlayed]);

  if (state.phase === 'gameover') return null;
  const tip = alert ?? tutorialTip;
  if (!tip || tip.id === hiddenId) return null;
  const tipBody = tip.body.replace('{{goals}}', goalText);

  const isTutorial = tip.tone === 'tutorial';
  const stepNumber = STEPS.findIndex((s) => s.tip.id === tip.id) + 1;
  const nextStep = stepNumber > 0 && stepNumber < STEPS.length ? STEPS[stepNumber] : null;

  const dismiss = () => {
    setHiddenId(tip.id);
    if (tip.tone === 'warning') {
      try {
        window.localStorage.setItem(ALERT_STORAGE, String(daysPlayed));
      } catch {
        /* ignore */
      }
    } else {
      const next = Math.max(step, stepNumber);
      setStep(next);
      saveStep(next);
    }
  };

  return (
    <section
      aria-label="Совет управляющего"
      aria-live="polite"
      className={cn(
        'relative rounded-xl border p-4 sm:p-5 shadow-sm',
        isTutorial
          ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-stone-50 to-orange-50'
          : 'border-red-200 bg-gradient-to-br from-red-50 via-stone-50 to-amber-50',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isTutorial ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600',
          )}
          aria-hidden
        >
          {isTutorial ? <GraduationCap className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-stone-800">{tip.title}</h2>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                isTutorial ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700',
              )}
            >
              {isTutorial ? `шаг ${stepNumber}/${STEPS.length}` : 'внимание'}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{tipBody}</p>
          {tip.action && tip.action.screen && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 h-9 border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
              onClick={() => setScreen(tip.action!.screen)}
            >
              {tip.action.label}
              <ChevronRight className="h-4 w-4 ml-0.5" aria-hidden />
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-stone-400 hover:text-stone-600"
          onClick={dismiss}
          aria-label={isTutorial ? 'Понятно, скрыть шаг' : 'Скрыть предупреждение'}
          title={isTutorial ? 'Понятно' : 'Скрыть до следующего дня'}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isTutorial && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-12" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s.tip.id}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i < stepNumber - 1 ? 'w-4 bg-amber-400/70' : i === stepNumber - 1 ? 'w-6 bg-amber-500' : 'w-4 bg-stone-200',
              )}
            />
          ))}
          {nextStep && (
            <span className="ml-1 text-[10px] text-stone-400">
              дальше — шаг {stepNumber + 1} {dayLabel(nextStep.day, daysPlayed)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
