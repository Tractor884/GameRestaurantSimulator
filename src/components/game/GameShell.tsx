/**
 * Оболочка игры: боковое меню (ТЗ §31.5), топбар с виджетами (ТЗ §31.3),
 * кнопки «День»/«Неделя», диалог критических событий, тосты.
 */
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useGame, type ScreenId } from '@/lib/game/store/gameStore';
import { EVENT_TEMPLATES_MAP } from '@/lib/game/config/risks.config';
import { DIFFICULTIES } from '@/lib/game/config/difficulty.config';
import { moneyShort, money } from './widgets';
import { cn } from '@/lib/utils';
import {
  Utensils,
  BookOpen,
  Boxes,
  Users,
  CalendarDays,
  Wallet,
  BarChart3,
  Megaphone,
  Star,
  Zap,
  FileCheck,
  Wrench,
  Landmark,
  ClipboardList,
  Settings,
  Play,
  FastForward,
  AlertTriangle,
  Banknote,
  TrendingUp,
  Loader2,
  Gauge,
  Clock,
  ImageIcon,
  GraduationCap,
  Rows3,
} from 'lucide-react';

import { GameOverDialog, FinalStatusBadge } from './GameOverDialog';
import { EmergencyDialog } from './EmergencyDialog';
import { MentorWidget } from './MentorWidget';
import { AchievementsWatcher } from './AchievementsWatcher';
import { useUiPrefs } from '@/lib/game/store/uiPrefs';
import { useArtStore } from '@/lib/game/presentation/artState';
import dynamic from 'next/dynamic';
import { RestaurantScreen } from './screens/RestaurantScreen';

/* ------------------------- CODE SPLITTING (рекомендация №6) -------------------------
 * Стартовый экран (RestaurantScreen) — статический импорт для мгновенного
 * первого рендера; остальные экраны вкладок — next/dynamic (ssr: false,
 * клиентские компоненты): каждый экран получает свой чанк и грузится при
 * первом открытии вкладки. Обёртки собраны В module scope — компоненты не
 * пересоздаются на каждом рендере GameShell.
 * НЕ лени: визард (SetupWizard), GameOverDialog, EmergencyDialog — не экраны вкладок. */

/** Компактный скелетон загрузки (~108px): пульсирующие прямоугольники в стиле
 *  KpiCard/SectionCard — переключение экранов не «прыгает» по высоте. */
function ScreenSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Экран загружается">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-stone-200/80 animate-pulse" />
        ))}
      </div>
      <div className="h-10 rounded-xl bg-stone-100 animate-pulse" />
    </div>
  );
}

const MenuScreen = dynamic(() => import('./screens/MenuScreen').then((m) => m.MenuScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const WarehouseScreen = dynamic(() => import('./screens/WarehouseScreen').then((m) => m.WarehouseScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const StaffScreen = dynamic(() => import('./screens/StaffScreen').then((m) => m.StaffScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const ScheduleScreen = dynamic(() => import('./screens/ScheduleScreen').then((m) => m.ScheduleScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const FinanceScreen = dynamic(() => import('./screens/FinanceScreen').then((m) => m.FinanceScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const AnalyticsScreen = dynamic(() => import('./screens/AnalyticsScreen').then((m) => m.AnalyticsScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const MarketingScreen = dynamic(() => import('./screens/MarketingScreen').then((m) => m.MarketingScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const ReviewsScreen = dynamic(() => import('./screens/ReviewsScreen').then((m) => m.ReviewsScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const EventsScreen = dynamic(() => import('./screens/EventsScreen').then((m) => m.EventsScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const LicensesScreen = dynamic(() => import('./screens/LicensesScreen').then((m) => m.LicensesScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const EquipmentScreen = dynamic(() => import('./screens/EquipmentScreen').then((m) => m.EquipmentScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const LoansScreen = dynamic(() => import('./screens/LoansScreen').then((m) => m.LoansScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const QuarterlyScreen = dynamic(() => import('./screens/QuarterlyScreen').then((m) => m.QuarterlyScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const AcademyScreen = dynamic(() => import('./screens/AcademyScreen').then((m) => m.AcademyScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const ArtManagerScreen = dynamic(() => import('./screens/ArtManagerScreen').then((m) => m.ArtManagerScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});
const SettingsScreen = dynamic(() => import('./screens/SettingsScreen').then((m) => m.SettingsScreen), {
  ssr: false,
  loading: ScreenSkeleton,
});

const NAV: { group: string; items: { id: ScreenId; label: string; icon: typeof Utensils }[] }[] = [
  {
    group: 'Ресторан',
    items: [
      { id: 'restaurant', label: 'Главный экран', icon: Utensils },
      { id: 'menu', label: 'Меню', icon: BookOpen },
      { id: 'warehouse', label: 'Склад', icon: Boxes },
    ],
  },
  {
    group: 'Команда',
    items: [
      { id: 'staff', label: 'Персонал', icon: Users },
      { id: 'schedule', label: 'Графики', icon: CalendarDays },
    ],
  },
  {
    group: 'Деньги',
    items: [
      { id: 'finance', label: 'Финансы', icon: Wallet },
      { id: 'loans', label: 'Кредиты', icon: Landmark },
      { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
    ],
  },
  {
    group: 'Развитие',
    items: [
      { id: 'marketing', label: 'Маркетинг', icon: Megaphone },
      { id: 'reviews', label: 'Отзывы', icon: Star },
      { id: 'events', label: 'События', icon: Zap },
      { id: 'equipment', label: 'Оборудование', icon: Wrench },
      { id: 'licenses', label: 'Лицензии', icon: FileCheck },
    ],
  },
  {
    group: 'Отчёты',
    items: [
      { id: 'quarterly', label: 'Квартальный разбор', icon: ClipboardList },
      { id: 'academy', label: 'Академия управляющего', icon: GraduationCap },
      { id: 'art', label: 'Иллюстрации', icon: ImageIcon },
      { id: 'settings', label: 'Настройки и сейвы', icon: Settings },
    ],
  },
];

const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function GameShell() {
  const state = useGame((s) => s.state);
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const density = useUiPrefs((s) => s.density);
  const toggleDensity = useUiPrefs((s) => s.toggleDensity);
  const runDay = useGame((s) => s.runDay);
  const runWeek = useGame((s) => s.runWeek);
  const busy = useGame((s) => s.busy);
  const resolveCritical = useGame((s) => s.resolveCritical);
  const toasts = useGame((s) => s.lastToasts);
  const dismiss = useGame((s) => s.dismissToasts);

  const restaurant = state?.restaurant;
  const lastWeek = state?.history.weekStats[state.history.weekStats.length - 1];
  const pendingCritical = state?.activeEvents.find((e) => !e.resolved) ?? null;
  const middayActive = useGame((s) => s.midday != null);

  // Тосты через sonner.
  useEffect(() => {
    if (toasts.length === 0) return;
    for (const t of toasts) {
      if (t.ok) toast.success(t.message);
      else toast.error(t.message);
    }
    dismiss();
  }, [toasts, dismiss]);

  const [navOpen, setNavOpen] = useState(false);

  // Арт-пак (IndexedDB): инициализация object URL один раз за сессию.
  useEffect(() => {
    void useArtStore.getState().init();
  }, []);

  // Горячие клавиши (ТЗ §31.7 — быстрый доступ): D/Д — день, W/Н — неделя.
  // Не срабатываем при вводе текста (input/textarea/contenteditable) и при
  // открытых диалогах/модалках (иначе «д» в названии ресторана прожигала день).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (document.querySelector('[data-state="open"][role="dialog"], [role="dialog"][data-state="open"]')) return;
      const s = useGame.getState();
      if (!s.state || s.busy || s.state.phase === 'gameover') return;
      if (s.state.activeEvents.some((ev) => !ev.resolved)) return;
      const key = e.key.toLowerCase();
      // День на паузе «экстренных решений»: D продолжает его (W заблокирован).
      if (s.midday) {
        if (key === 'd' || key === 'в') {
          e.preventDefault();
          s.continueMidday();
        }
        return;
      }
      if (key === 'd' || key === 'в') {
        e.preventDefault();
        s.runDay();
      } else if (key === 'w' || key === 'н' || key === 'ц') {
        e.preventDefault();
        s.runWeek();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const weekDayLabel = state ? `Неделя ${state.week} · ${DAYS_RU[state.day]}` : '';

  if (!state || !restaurant) return null;

  return (
    /* h-screen: фиксируем высоту оболочки, чтобы скроллились только nav и main,
       а body не уезжал под sticky-хедер (инвариант кликабельности навигации) */
    <div className="h-screen flex flex-col bg-stone-50 overflow-hidden">
      {/* Топбар */}
      <header className="border-b border-stone-200 bg-white sticky top-0 z-40">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-stone-100"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Меню"
          >
            <Utensils className="h-5 w-5 text-stone-700" aria-hidden />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-stone-900 truncate leading-tight">{restaurant.name}</p>
              <Badge
                className={cn(
                  'hidden sm:inline-flex shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0',
                  state.difficultyId === 'novice' && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
                  state.difficultyId === 'professional' && 'bg-red-100 text-red-800 hover:bg-red-100',
                  state.difficultyId !== 'novice' && state.difficultyId !== 'professional' && 'bg-stone-100 text-stone-600 hover:bg-stone-100',
                )}
                title={`Сложность года: условия победы и цена ошибок (см. Квартальный разбор)`}
              >
                <Gauge className="h-3 w-3 mr-1" aria-hidden />
                {DIFFICULTIES[state.difficultyId]?.name ?? 'Стандарт'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-stone-500">{weekDayLabel}</p>
              {/* Индикатор недели: 7 точек-дней (прошедшие stone-300, текущий amber, будущие stone-200) */}
              <span
                className="hidden sm:flex items-center gap-1"
                role="img"
                aria-label={`День недели ${state.day + 1} из 7`}
              >
                {DAYS_RU.map((d, i) => (
                  <span
                    key={d}
                    title={`${d} — ${i < state.day ? 'прожит' : i === state.day ? 'сегодня' : 'впереди'}`}
                    className={cn(
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      i < state.day
                        ? 'bg-stone-400'
                        : i === state.day
                          ? 'bg-amber-600 ring-2 ring-amber-200'
                          : 'bg-stone-200',
                    )}
                  />
                ))}
              </span>
            </div>
          </div>

          <div className="flex-1" />

          {/* Наставник: контекстная подсказка по живым KPI (рекомендация №2) */}
          <MentorWidget />

          {/* Достижения: пассивный наблюдатель (тосты при выполнении условий, рекомендация №8); рендерит null */}
          <AchievementsWatcher />

          {/* Плотность информации «Новичок/Эксперт» (UI/UX №5): быстрый переключатель (сама настройка — в «Настройках») */}
          <button
            type="button"
            onClick={toggleDensity}
            title={
              density === 'novice'
                ? 'Режим «Новичок»: только ключевые KPI. Нажмите, чтобы включить «Эксперт» (все метрики и мини-графики)'
                : 'Режим «Эксперт»: все метрики и мини-графики. Нажмите, чтобы вернуться к «Новичку»'
            }
            aria-label={`Плотность информации: ${density === 'novice' ? 'новичок' : 'эксперт'} (переключить)`}
            aria-pressed={density === 'expert'}
            className={cn(
              'hidden sm:inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
              density === 'expert'
                ? 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'border-stone-200 bg-white text-stone-500 hover:text-stone-800 hover:border-stone-300',
            )}
          >
            <Rows3
              className={cn('h-3.5 w-3.5', density === 'expert' ? 'text-amber-600' : 'text-stone-400')}
              aria-hidden
            />
            <span className="hidden lg:inline">{density === 'novice' ? 'Новичок' : 'Эксперт'}</span>
          </button>

          {/* Мини-виджеты */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5" title="Деньги на счёте">
              <Banknote className="h-4 w-4 text-emerald-600" aria-hidden />
              <span className="font-bold tabular-nums text-stone-900">{moneyShort(restaurant.finance.cash)}</span>
            </div>
            {lastWeek && (
              <div className="flex items-center gap-1.5" title="Прибыль за последнюю неделю">
                <TrendingUp className="h-4 w-4 text-stone-400" aria-hidden />
                <span
                  className={cn(
                    'font-bold tabular-nums',
                    lastWeek.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700',
                  )}
                >
                  {moneyShort(lastWeek.netProfit)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5" title="Рейтинг">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <span className="font-bold tabular-nums text-stone-900">{restaurant.reputation.rating.toFixed(2)}</span>
            </div>
          </div>

          {/* Кнопки симуляции */}
          <div className="flex items-center gap-2">
            {middayActive ? (
              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                <Clock className="h-3.5 w-3.5 mr-1" aria-hidden />
                Пауза: экстренные решения
              </Badge>
            ) : pendingCritical ? (
              <Badge variant="secondary" className="bg-red-100 text-red-800">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden />
                Требуется решение
              </Badge>
            ) : state.phase === 'gameover' ? (
              <FinalStatusBadge />
            ) : (
              <>
                <Button
                  onClick={runDay}
                  disabled={busy}
                  variant="outline"
                  size="sm"
                  className="border-stone-300 active:scale-[0.98]"
                  data-tutorial="day-btn"
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden /> : <Play className="h-4 w-4 mr-1" aria-hidden />}
                  День
                </Button>
                <Button
                  onClick={runWeek}
                  disabled={busy}
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white active:scale-[0.98]"
                  data-tutorial="week-btn"
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden /> : <FastForward className="h-4 w-4 mr-1" aria-hidden />}
                  Неделя
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* min-h-0: иначе flex-строка растягивается контентом и body скроллится под sticky-хедером */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Боковое меню */}
        <nav
          className={cn(
            'w-56 shrink-0 border-r border-stone-200 bg-white overflow-y-auto transition-transform',
            'hidden lg:block',
            navOpen && 'fixed inset-y-0 left-0 z-50 block shadow-xl',
          )}
          aria-label="Основная навигация"
        >
          <div className="p-2 space-y-4">
            {NAV.map((group) => (
              <div key={group.group}>
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  {group.group}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    data-tutorial={`nav-${item.id}`}
                    onClick={() => {
                      setScreen(item.id);
                      setNavOpen(false);
                    }}
                    className={cn(
                      'group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                      screen === item.id
                        ? 'bg-amber-100 text-amber-900 font-semibold'
                        : 'text-stone-600 hover:bg-stone-100',
                    )}
                    aria-current={screen === item.id ? 'page' : undefined}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-transform group-hover:scale-105',
                        screen === item.id && 'text-amber-700',
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                    {item.id === 'events' && state.activeEvents.length > 0 && (
                      <Badge className="ml-auto bg-red-500 text-white text-[10px] px-1.5 min-w-5 justify-center">
                        {state.activeEvents.length}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
        {navOpen && <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}

        {/* Контент экрана: лёгкий fade+slide при смене экрана (0.18с, easeOut) */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={screen}
              className="p-4 lg:p-6 max-w-[1400px] mx-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {screen === 'restaurant' && <RestaurantScreen />}
              {screen === 'menu' && <MenuScreen />}
              {screen === 'warehouse' && <WarehouseScreen />}
              {screen === 'staff' && <StaffScreen />}
              {screen === 'schedule' && <ScheduleScreen />}
              {screen === 'finance' && <FinanceScreen />}
              {screen === 'analytics' && <AnalyticsScreen />}
              {screen === 'marketing' && <MarketingScreen />}
              {screen === 'reviews' && <ReviewsScreen />}
              {screen === 'events' && <EventsScreen />}
              {screen === 'licenses' && <LicensesScreen />}
              {screen === 'equipment' && <EquipmentScreen />}
              {screen === 'loans' && <LoansScreen />}
              {screen === 'quarterly' && <QuarterlyScreen />}
              {screen === 'academy' && <AcademyScreen />}
              {screen === 'art' && <ArtManagerScreen />}
              {screen === 'settings' && <SettingsScreen />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Диалог критического события (ТЗ §20.4) */}
      <Dialog open={!!pendingCritical} onOpenChange={() => undefined}>
        <DialogContent className="max-w-lg" aria-describedby="critical-desc">
          {/* Постоянные заголовок/описание для доступности (Radix требует DialogTitle). */}
          <DialogHeader className={pendingCritical ? undefined : 'sr-only'}>
            <DialogTitle className="flex items-center gap-2 text-red-800">
              {pendingCritical ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden />
                  {pendingCritical.title}
                </>
              ) : (
                'Событие'
              )}
            </DialogTitle>
            <DialogDescription>
              {pendingCritical?.description ?? 'Критическое событие требует решения.'}
              <span id="critical-desc" className="sr-only">Выберите вариант реакции</span>
            </DialogDescription>
          </DialogHeader>
          {pendingCritical && (
            <div className="space-y-2">
              {/* Динамические резолюции системных событий (дилеммы/дивиденды/
                  арендодатель/уход шефа, v8) приоритетнее шаблона пула. */}
              {(pendingCritical.resolutions ?? EVENT_TEMPLATES_MAP[pendingCritical.templateId]?.resolutions)?.map((res, i) => (
                <button
                  key={i}
                  onClick={() => resolveCritical(pendingCritical.id, i)}
                  className="w-full rounded-lg border border-stone-200 p-3 text-left hover:border-amber-400 hover:bg-amber-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-stone-800">{res.label}</span>
                    {res.cost > 0 && (
                      <Badge variant="secondary" className="bg-stone-100 tabular-nums">
                        {money(res.cost)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{res.note}</p>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Финальный экран: счёт и статус НЕ исчезают сами — пользователь закрывает сам */}
      <GameOverDialog />

      {/* Пауза «экстренных решений» (ТЗ §8.4–8.6): полудневный снимок + действия */}
      <EmergencyDialog />
    </div>
  );
}
