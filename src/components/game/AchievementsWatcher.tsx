'use client';

/**
 * НАБЛЮДАТЕЛЬ ДОСТИЖЕНИЙ (UI/UX №8) — пассивный «сторож»: при закрытии
 * недель и первом выполнении условий показывает тосты достижений (sonner,
 * доступен по умолчанию: aria-live + иконка lucide).
 *
 * Инварианты:
 *  - ЧИСТОЕ ЧТЕНИЕ состояния (useGame((s) => s.state)): ни одной мутации
 *    движка/стора; свой прогресс — localStorage 'rest-sim-achievements-v1'
 *    = { unlocked: string[], seen: string[] } (как Академия/туториал);
 *  - «дней без ЧП»: история событий в состоянии короткая (dayLogs — 7
 *    дней, lastDayResult — день, activeEvents — незакрытые), поэтому
 *    последний день критического события дозапоминаем в отдельном ключе
 *    'rest-sim-achievements-ctx-v1';
 *  - тостов ≤ 2 за прогон (очередь sonner не заваливаем), НО все новые
 *    достижения помечаются разблокированными;
 *  - StrictMode-двойной вызов: lastRunRef (тот же объект state → скип).
 *
 * Рендерит null; монтируется в GameShell рядом с <MentorWidget />.
 * Шкалы полей сверены с types.ts: foodCost/laborCost/returningShare —
 * доли 0..1; bsc/cleanliness — 0..100; rating — 1..5; деньги — целые ₽.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useGame } from '@/lib/game/store/gameStore';
import type { GameDate, GameState } from '@/lib/game/types';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote, CalendarCheck, ChefHat, Flag, Flame, Gauge, Landmark,
  Repeat, ShieldCheck, Sparkles, Star, TrendingUp, Trophy, Users,
} from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  iconClass: string; // тёплая палитра (amber/emerald)
  check: (state: GameState, daysClean: number) => boolean;
}

const PROGRESS_KEY = 'rest-sim-achievements-v1';
const INCIDENT_KEY = 'rest-sim-achievements-ctx-v1';
const MAX_TOASTS_PER_CHECK = 2;

/* ------------------------------ helpers ------------------------------ */

/** Абсолютный день игры (week 1..52+, day 0..6) — арифметика «дней без ЧП». */
function absDay(d: Pick<GameDate, 'week' | 'day'>): number {
  return (d.week - 1) * 7 + d.day;
}

/** Последняя ЗАКРЫТАЯ неделя (undefined до первого отчёта). */
function lastWeekOf(state: GameState) {
  const ws = state.history.weekStats;
  return ws.length > 0 ? ws[ws.length - 1] : undefined;
}

/* ------------------------------ localStorage ------------------------------ */

interface AchievementProgress {
  unlocked: string[];
  seen: string[];
}

/** Трекер критических событий (свой, вне игрового сейва). */
interface IncidentCtx {
  lastCriticalDay: number | null;
  startDay: number;
  weeksLen: number;
}

function sanitizeStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function loadProgress(): AchievementProgress {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return { unlocked: [], seen: [] };
    const obj = parsed as Record<string, unknown>;
    return { unlocked: sanitizeStrings(obj.unlocked), seen: sanitizeStrings(obj.seen) };
  } catch {
    return { unlocked: [], seen: [] };
  }
}

function saveProgress(p: AchievementProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* приватный режим — достижения не критичны */
  }
}

function loadIncidentCtx(): IncidentCtx {
  const empty: IncidentCtx = { lastCriticalDay: null, startDay: 0, weeksLen: 0 };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(INCIDENT_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return empty;
    const o = parsed as Record<string, unknown>;
    return {
      lastCriticalDay: typeof o.lastCriticalDay === 'number' ? o.lastCriticalDay : null,
      startDay: typeof o.startDay === 'number' ? o.startDay : 0,
      weeksLen: typeof o.weeksLen === 'number' ? o.weeksLen : 0,
    };
  } catch {
    return empty;
  }
}

function saveIncidentCtx(ctx: IncidentCtx): void {
  try {
    window.localStorage.setItem(INCIDENT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

/* ------------------------------ достижения ------------------------------ */

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'firstWeek', // history.weekStats.length
    title: 'Первый отчёт',
    desc: 'Первая неделя закрыта — ресторан работает!',
    icon: Flag,
    iconClass: 'text-amber-600',
    check: (s) => s.history.weekStats.length >= 1,
  },
  {
    id: 'million1', // history.cumulativeNetProfit, ₽
    title: 'Первый миллион',
    desc: 'Накопленная чистая прибыль перевалила за 1 000 000 ₽',
    icon: Banknote,
    iconClass: 'text-emerald-600',
    check: (s) => s.history.cumulativeNetProfit >= 1_000_000,
  },
  {
    id: 'profit5m', // history.cumulativeNetProfit, ₽
    title: 'Пять миллионов прибыли',
    desc: 'Накопленная чистая прибыль — 5 000 000 ₽ и больше',
    icon: TrendingUp,
    iconClass: 'text-emerald-600',
    check: (s) => s.history.cumulativeNetProfit >= 5_000_000,
  },
  {
    id: 'rating45', // restaurant.reputation.rating (1..5)
    title: 'Рейтинг 4.5+',
    desc: 'Гости в восторге — держите планку сервиса',
    icon: Star,
    iconClass: 'text-amber-600',
    check: (s) => (s.restaurant?.reputation.rating ?? 0) >= 4.5,
  },
  {
    id: 'fc30', // WeekStat.foodCost (доля 0..1) последней закрытой недели
    title: 'Food Cost < 30%',
    desc: 'Кухня в форме: себестоимость последней недели ≤ 30%',
    icon: ChefHat,
    iconClass: 'text-emerald-600',
    check: (s) => (lastWeekOf(s)?.foodCost ?? 1) <= 0.3,
  },
  {
    id: 'lc32', // WeekStat.laborCost (доля 0..1)
    title: 'Labor Cost ≤ 32%',
    desc: 'График выверен: ФОТ последней недели ≤ 32%',
    icon: Users,
    iconClass: 'text-emerald-600',
    check: (s) => (lastWeekOf(s)?.laborCost ?? 1) <= 0.32,
  },
  {
    id: 'bsc70', // средний WeekStat.bsc (0..100) последних 12 недель
    title: 'BSC 70+',
    desc: 'Здоровый ресторан: средний BSC последних 12 недель ≥ 70',
    icon: Gauge,
    iconClass: 'text-amber-600',
    check: (s) => {
      const q = s.history.weekStats.slice(-12);
      return q.length > 0 && q.reduce((sum, w) => sum + w.bsc, 0) / q.length >= 70;
    },
  },
  {
    id: 'cash10m', // restaurant.finance.cash, ₽
    title: 'Касса 10+ млн ₽',
    desc: 'Запас прочности: на счёте 10 000 000 ₽ и больше',
    icon: Landmark,
    iconClass: 'text-emerald-600',
    check: (s) => (s.restaurant?.finance.cash ?? 0) >= 10_000_000,
  },
  {
    id: 'streak4', // WeekStat.netProfit (₽) с конца — как positiveStreak
    title: 'Четыре недели в плюсе',
    desc: 'Серия положительных недель подряд — ресторан на подъёме',
    icon: Flame,
    iconClass: 'text-amber-600',
    check: (s) => {
      const ws = s.history.weekStats;
      return ws.length >= 4 && ws.slice(-4).every((w) => w.netProfit > 0);
    },
  },
  {
    id: 'clean85', // restaurant.cleanliness (number 0..100)
    title: 'Чистота 85+',
    desc: 'Блестящий зал — гости это замечают',
    icon: Sparkles,
    iconClass: 'text-amber-600',
    check: (s) => (s.restaurant?.cleanliness ?? 0) >= 85,
  },
  {
    id: 'returners15', // WeekStat.returningShare (доля 0..1; норма 15–30%)
    title: 'Каждый шестой возвращается',
    desc: 'Возвратные гости — 15%+ трафика последней недели',
    icon: Repeat,
    iconClass: 'text-emerald-600',
    check: (s) => (lastWeekOf(s)?.returningShare ?? 0) >= 0.15,
  },
  {
    id: 'noIncidents14', // трекер: events[].criticality === 'critical'
    title: '14 дней без ЧП',
    desc: 'Ни одного критического события две недели — стабильность',
    icon: ShieldCheck,
    iconClass: 'text-emerald-600',
    check: (_s, daysClean) => daysClean >= 14,
  },
  {
    id: 'halfYear', // state.week
    title: 'Полгода в бизнесе',
    desc: '26 недель за рулём ресторана',
    icon: CalendarCheck,
    iconClass: 'text-amber-600',
    check: (s) => s.week >= 26,
  },
  {
    id: 'yearDone', // state.week
    title: 'Год за рулём',
    desc: '52 недели — финиш прямой, подводите итоги!',
    icon: Trophy,
    iconClass: 'text-amber-600',
    check: (s) => s.week >= 52,
  },
];

/* ------------------------------ логика ------------------------------ */

/** Самый поздний день критического события, видимый в состоянии. */
function latestCriticalDay(state: GameState): number | null {
  const days: number[] = [];
  for (const log of state.history.dayLogs) {
    if (log.events.some((e) => e.criticality === 'critical')) days.push(absDay(log.date));
  }
  if (state.lastDayResult && state.lastDayResult.events.some((e) => e.criticality === 'critical')) {
    days.push(absDay(state.lastDayResult.date));
  }
  for (const e of state.activeEvents) {
    if (e.criticality === 'critical') days.push(absDay(e.date));
  }
  return days.length > 0 ? Math.max(...days) : null;
}

/**
 * Один прогон проверки. silent=true — «базовый» прогон сессии (первое
 * наблюдение загруженного сейва): уже выполненные условия фиксируются
 * БЕЗ тостов — иначе каждая перезагрузка страницы устраивала бы залп.
 */
function runCheck(state: GameState, silent: boolean): void {
  const weeksLen = state.history.weekStats.length;
  const now = absDay({ week: state.week, day: state.day });

  /* Трекер критических событий: чтение состояния + свой localStorage. */
  const before = loadIncidentCtx();
  let ctx: IncidentCtx = { ...before };
  if (weeksLen < ctx.weeksLen || now < ctx.startDay) {
    // новая игра или загрузка более раннего сейва — отсчёт заново
    ctx = { lastCriticalDay: null, startDay: now, weeksLen };
  }
  const crit = latestCriticalDay(state);
  if (crit != null && (ctx.lastCriticalDay == null || crit > ctx.lastCriticalDay)) {
    ctx.lastCriticalDay = crit;
  }
  if (ctx.weeksLen !== weeksLen) ctx.weeksLen = weeksLen;
  if (
    ctx.lastCriticalDay !== before.lastCriticalDay ||
    ctx.startDay !== before.startDay ||
    ctx.weeksLen !== before.weeksLen
  ) {
    saveIncidentCtx(ctx);
  }
  const daysClean = ctx.lastCriticalDay == null ? now - ctx.startDay : now - ctx.lastCriticalDay;

  /* Достижения: все новые → unlocked; тостов ≤ 2 за прогон. */
  const progress = loadProgress();
  const known = new Set(progress.unlocked);
  const seen = new Set(progress.seen);
  const fresh = ACHIEVEMENTS.filter((a) => !known.has(a.id) && a.check(state, daysClean));
  // не показанные ранее (третий и дальше из прошлого прогона) — вперёд очереди
  const pending = ACHIEVEMENTS.filter((a) => known.has(a.id) && !seen.has(a.id));
  for (const a of fresh) known.add(a.id);

  const toShow = silent ? [] : [...pending, ...fresh].slice(0, MAX_TOASTS_PER_CHECK);
  for (const a of toShow) {
    seen.add(a.id);
    toast.success(a.title, {
      description: a.desc,
      duration: 5000,
      icon: <a.icon className={a.iconClass} aria-hidden />,
    });
  }
  if (silent) {
    // ретроспективные (выполненные до появления наблюдателя) — тихо
    for (const a of fresh) seen.add(a.id);
  }

  if (fresh.length > 0 || toShow.length > 0) {
    saveProgress({ unlocked: [...known], seen: [...seen] });
  }
}

/* ------------------------------ компонент ------------------------------ */

export function AchievementsWatcher() {
  const state = useGame((s) => s.state);
  const weeksLen = state?.history.weekStats.length ?? 0;
  const week = state?.week ?? 0;
  const lastRunRef = useRef<GameState | null>(null); // guard StrictMode-повтора
  const baselineRef = useRef(true);

  useEffect(() => {
    if (!state || !state.restaurant) return;
    if (lastRunRef.current === state) return; // тот же state — скип
    lastRunRef.current = state;
    const silent = baselineRef.current; // первый прогон сессии — без тостов
    baselineRef.current = false;
    runCheck(state, silent);
    // weeksLen/week — производные state (закрытие/смена недели) — по ТЗ.
  }, [state, weeksLen, week]);

  return null;
}
