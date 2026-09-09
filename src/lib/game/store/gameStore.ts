/**
 * Хранилище игры (zustand) + сохранения LocalStorage (ТЗ §32).
 * Автосохранение после каждого дня; 3 ручных слота + автослот;
 * экспорт/импорт JSON.
 */
'use client';

import { create } from 'zustand';
import type { Dish, EmergencyActionId, GameState, MiddaySnapshot, PlayerAction } from '@/lib/game/types';
import {
  createGame,
  simulateDay,
  simulateDayUntilPause,
  resumeDay,
  applyEmergencyAction,
  simulateWeek,
  toggleMenuDish,
  setDishPrice,
  toggleStopList,
  importCustomDishes,
  purchaseIngredients,
  hireStaff,
  fireStaff,
  setScheduleShifts,
  startCampaign,
  stopCampaign,
  setCleaningBudget,
  buyEquipment,
  repairEquipment,
  deepCleaning,
  buyAlcoholLicense,
  repayLoan,
  resolveEvent,
  autoOrderAction,
  setAutoPurchase,
  replyToReviews,
  setProcurementPolicy,
  hireSeasonalStaff,
  type SetupOptions,
  type ActionResult,
} from '@/lib/game/engine';
import type { DayRunContext } from '@/lib/game/engine';

export type ScreenId =
  | 'restaurant'
  | 'menu'
  | 'warehouse'
  | 'staff'
  | 'schedule'
  | 'finance'
  | 'analytics'
  | 'marketing'
  | 'reviews'
  | 'events'
  | 'licenses'
  | 'equipment'
  | 'loans'
  | 'quarterly'
  | 'settings';

const AUTOSAVE_KEY = 'rest-sim-autosave-v1';
const SLOT_KEYS = ['rest-sim-slot-1', 'rest-sim-slot-2', 'rest-sim-slot-3'];

export interface SaveMeta {
  name: string;
  date: string; // ISO
  week: number;
  day: number;
  restaurantName: string;
  cash: number;
}

/** Активная пауза «экстренных решений» (ТЗ §8.4–8.6): день наполовину прожит,
 *  игрок применяет действия к оставшимся часам. Живёт ТОЛЬКО в памяти —
 *  в сейвы не пишется (после F5 день детерминированно переигрывается). */
export interface MiddayPause {
  draft: GameState;
  run: DayRunContext;
  snapshot: MiddaySnapshot;
  applied: EmergencyActionId[];
}

interface GameStore {
  state: GameState | null;
  screen: ScreenId;
  busy: boolean;
  lastToasts: { message: string; ok: boolean }[];
  setupDraft: Partial<SetupOptions> | null;
  midday: MiddayPause | null;

  setScreen(screen: ScreenId): void;
  startGame(opts: SetupOptions): void;
  runDay(): void;
  runWeek(): void;
  apply(action: (state: GameState) => ActionResult): void;
  /** Экстренные решения (§8.4): применить действие в паузе. */
  applyEmergency(actionId: EmergencyActionId): void;
  /** Доиграть день после паузы. */
  continueMidday(): void;
  /** Настройки геймплея (§8.4 пауза и др.). */
  setOption(key: 'middayPause', value: boolean): void;
  // Действия игрока (обёртки).
  toggleDish(dishId: string): void;
  setPrice(dishId: string, price: number): void;
  /** Импорт кастомных блюд CSV (§35.3–35.4). */
  importDishes(dishes: Dish[]): void;
  stopListToggle(dishId: string): void;
  purchase(items: { ingredientId: string; quantity: number }[], urgent: boolean): void;
  autoOrder(days: number): void;
  autoPurchaseSet(enabled: boolean, coverDays: number): void;
  hire(roleId: Parameters<typeof hireStaff>[1], count: number): void;
  fire(roleId: Parameters<typeof fireStaff>[1], count: number): void;
  schedule(roleId: Parameters<typeof setScheduleShifts>[1], day: number, morning: number, evening: number): void;
  campaign(channelId: string, weeklyBudget: number, durationWeeks: number): void;
  stopCampaign(channelId: string): void;
  cleaning(weekly: number): void;
  equipment(zone: 'kitchen' | 'coffee' | 'hall', level: 'basic' | 'standard' | 'professional'): void;
  equipmentRepair(zone: 'kitchen' | 'coffee' | 'hall'): void;
  deepClean(): void;
  license(): void;
  /** v2 §16.2: сезонный найм официантов к веранде (подбор платный). */
  hireSeasonal(count?: number): void;
  loanRepay(loanIndex: number, amount: number): void;
  resolveCritical(eventId: string, resolutionIndex: number): void;
  /** v2 §8 (механизм D): ответить на все неотвеченные негативные отзывы. */
  replyReviews(): void;
  /** v2 §9 (G-режимы): переключить режим закупки (лаг 2 нед + 50 тыс ₽). */
  procurementSet(policy: 'economy' | 'standard' | 'premium'): void;
  // Сохранения.
  saveSlot(slot: number, name: string): void;
  loadSlot(slot: number): boolean;
  listSaves(): (SaveMeta | null)[];
  autosave(): void;
  loadAutosave(): boolean;
  exportSave(): string | null;
  importSave(json: string): boolean;
  resetGame(): void;
  dismissToasts(): void;
  /** Финальный экран: пользователь сам решает, когда закрыть (не автоскрывается). */
  finalSeen: boolean;
  showFinal(): void;
  hideFinal(): void;
}

function pushToast(get: () => GameStore, message: string, ok: boolean) {
  const s = get();
  s.lastToasts = [...s.lastToasts.slice(-4), { message, ok }];
}

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  screen: 'restaurant',
  busy: false,
  lastToasts: [],
  setupDraft: null,
  finalSeen: false,
  midday: null,

  setScreen: (screen) => set({ screen }),

  startGame: (opts) => {
    const state = createGame(opts);
    set({ state, screen: 'restaurant', midday: null, lastToasts: [{ message: `Ресторан «${opts.restaurantName}» открыт!`, ok: true }] });
    persist(AUTOSAVE_KEY, state);
  },

  runDay: () => {
    const s = get();
    if (!s.state || s.busy || s.state.phase === 'gameover') return;
    if (s.state.activeEvents.some((e) => !e.resolved)) return;
    if (s.midday) return; // день на паузе — сначала завершите его
    set({ busy: true });
    try {
      // Пауза «экстренных решений» (ТЗ §8.4): после обеденного пика движок
      // оценивает проблемы; есть проблемы — диалог, нет — день доигрывается сразу.
      if (s.state.options?.middayPause) {
        const { midday, draft, run, finished } = simulateDayUntilPause(s.state, s.state.seed);
        if (midday && run) {
          set({ busy: false, midday: { draft, run, snapshot: midday, applied: [] } });
          return;
        }
        // Проблем нет: draft — уже финализированное состояние.
        set({ state: draft });
        persist(AUTOSAVE_KEY, draft);
        const toasts = [...(finished?.warnings ?? []).slice(0, 2).map((w) => ({ message: w, ok: false }))];
        if (draft.activeEvents.some((e) => !e.resolved)) {
          toasts.push({ message: '⚠️ Критическое событие! Требуется решение.', ok: false });
        }
        set({ busy: false, lastToasts: toasts });
        return;
      }
      const { state: newState } = simulateDay(s.state, { plannedActions: [] }, s.state.seed);
      set({ state: newState });
      persist(AUTOSAVE_KEY, newState);
      const toasts = [...newState.lastDayResult?.warnings.slice(0, 2).map((w) => ({ message: w, ok: false })) ?? []];
      if (newState.activeEvents.some((e) => !e.resolved)) {
        toasts.push({ message: '⚠️ Критическое событие! Требуется решение.', ok: false });
      }
      set({ busy: false, lastToasts: toasts });
    } catch (e) {
      set({ busy: false, lastToasts: [{ message: `Ошибка симуляции: ${String(e)}`, ok: false }] });
    }
  },

  applyEmergency: (actionId) => {
    const s = get();
    if (!s.midday) return;
    const { draft, run, applied } = s.midday;
    // draft/run — живые объекты в памяти; действия применяются к ним.
    const res = applyEmergencyAction(draft, run, actionId);
    if (res.ok) {
      set({ midday: { ...s.midday, applied: [...applied, actionId], snapshot: { ...s.midday.snapshot } } });
    }
    set({ lastToasts: [...s.lastToasts.slice(-4), { message: res.message, ok: res.ok }] });
  },

  continueMidday: () => {
    const s = get();
    if (!s.midday || s.busy) return;
    set({ busy: true });
    try {
      const { draft, run } = s.midday;
      const { state: newState, result } = resumeDay(draft, run, s.state?.seed ?? 1);
      set({ state: newState, midday: null });
      persist(AUTOSAVE_KEY, newState);
      const toasts: { message: string; ok: boolean }[] = [];
      if (result.emergencyActions && result.emergencyActions.length > 0) {
        toasts.push({ message: `День доигран. Экстренных мер: ${result.emergencyActions.length}`, ok: true });
      }
      toasts.push(...(result.warnings.slice(0, 2).map((w) => ({ message: w, ok: false }))));
      if (newState.activeEvents.some((e) => !e.resolved)) {
        toasts.push({ message: '⚠️ Критическое событие! Требуется решение.', ok: false });
      }
      set({ busy: false, lastToasts: toasts });
    } catch (e) {
      set({ busy: false, lastToasts: [{ message: `Ошибка симуляции: ${String(e)}`, ok: false }] });
    }
  },

  setOption: (key, value) => {
    const s = get();
    if (!s.state || s.midday) return;
    const draft = structuredClone(s.state);
    if (!draft.options) draft.options = { middayPause: true };
    draft.options[key] = value;
    set({ state: draft });
    persist(AUTOSAVE_KEY, draft);
  },

  runWeek: () => {
    const s = get();
    if (!s.state || s.busy || s.state.phase === 'gameover') return;
    if (s.state.activeEvents.some((e) => !e.resolved)) return;
    set({ busy: true });
    try {
      const { state: newState, result } = simulateWeek(s.state, s.state.seed);
      set({ state: newState, finalSeen: false });
      persist(AUTOSAVE_KEY, newState);
      const toasts: { message: string; ok: boolean }[] = [];
      if (result) {
        // Итог закрытой недели — короткая сводка в тосте.
        const profit = result.pnl.netProfit;
        toasts.push({
          message: `Неделя ${result.week} закрыта: прибыль ${(profit / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} тыс ₽`,
          ok: profit >= 0,
        });
      }
      if (result?.gameOver) {
        toasts.push({
          message: result.finalScore
            ? `Финал! Счёт: ${result.finalScore.total}/1000 (${result.gameStatus})`
            : `Игра окончена: ${result.gameStatus}`,
          ok: result.gameStatus !== 'bankrupt',
        });
      }
      if (result?.quarterlyReview) {
        toasts.push({ message: `Квартальный разбор: BSC ${result.quarterlyReview.bscAvg} — ${result.quarterlyReview.verdict}`, ok: true });
      }
      if (newState.activeEvents.some((e) => !e.resolved)) {
        toasts.push({ message: '⚠️ Неделя прервана критическим событием!', ok: false });
      }
      set({ busy: false, lastToasts: toasts });
    } catch (e) {
      set({ busy: false, lastToasts: [{ message: `Ошибка симуляции: ${String(e)}`, ok: false }] });
    }
  },

  apply: (action) => {
    const s = get();
    if (!s.state || s.state.phase === 'gameover') return;
    if (s.midday) return; // день на паузе: остальные действия заблокированы до продолжения
    // Действия применяются к клоны и записываются назад.
    const draft = structuredClone(s.state);
    const res = action(draft);
    set({ state: draft, lastToasts: [...s.lastToasts.slice(-4), { message: res.message, ok: res.ok }] });
    persist(AUTOSAVE_KEY, draft);
  },

  toggleDish: (dishId) => get().apply((st) => toggleMenuDish(st, dishId)),
  setPrice: (dishId, price) => get().apply((st) => setDishPrice(st, dishId, price)),
  importDishes: (dishes) => get().apply((st) => importCustomDishes(st, dishes)),
  stopListToggle: (dishId) => get().apply((st) => toggleStopList(st, dishId)),
  purchase: (items, urgent) => get().apply((st) => purchaseIngredients(st, items, urgent)),
  autoOrder: (days) => get().apply((st) => autoOrderAction(st, days)),
  autoPurchaseSet: (enabled, coverDays) => get().apply((st) => setAutoPurchase(st, enabled, coverDays)),
  hire: (roleId, count) => get().apply((st) => hireStaff(st, roleId, count)),
  fire: (roleId, count) => get().apply((st) => fireStaff(st, roleId, count)),
  schedule: (roleId, day, morning, evening) =>
    get().apply((st) => setScheduleShifts(st, roleId, day, { morning, evening })),
  campaign: (channelId, weeklyBudget, durationWeeks) =>
    get().apply((st) => startCampaign(st, channelId, weeklyBudget, durationWeeks)),
  stopCampaign: (channelId) => get().apply((st) => stopCampaign(st, channelId)),
  cleaning: (weekly) => get().apply((st) => setCleaningBudget(st, weekly)),
  equipment: (zone, level) => get().apply((st) => buyEquipment(st, zone, level)),
  equipmentRepair: (zone) => get().apply((st) => repairEquipment(st, zone)),
  deepClean: () => get().apply((st) => deepCleaning(st)),
  license: () => get().apply((st) => buyAlcoholLicense(st)),
  hireSeasonal: (count) => get().apply((st) => hireSeasonalStaff(st, count ?? 2)),
  loanRepay: (loanIndex, amount) => get().apply((st) => repayLoan(st, loanIndex, amount)),
  resolveCritical: (eventId, resolutionIndex) =>
    get().apply((st) => resolveEvent(st, eventId, resolutionIndex)),

  replyReviews: () => get().apply((st) => replyToReviews(st)),
  procurementSet: (policy) => get().apply((st) => setProcurementPolicy(st, policy)),

  saveSlot: (slot, name) => {
    const s = get();
    if (!s.state) return;
    persist(SLOT_KEYS[slot - 1], s.state, name);
    pushToast(get, `Сохранено в слот ${slot}`, true);
    set({ lastToasts: [...get().lastToasts] });
  },

  loadSlot: (slot) => {
    const raw = localStorage.getItem(SLOT_KEYS[slot - 1]);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const state = data.state ?? data;
    migrateState(state);
    set({ state, screen: 'restaurant', finalSeen: false, midday: null });
    return true;
  },

  listSaves: () =>
    SLOT_KEYS.map((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const st: GameState = data.state ?? data;
        return {
          name: data.name ?? 'Без названия',
          date: data.date ?? '',
          week: st.week,
          day: st.day,
          restaurantName: st.restaurant?.name ?? '',
          cash: st.restaurant?.finance.cash ?? 0,
        };
      } catch {
        return null;
      }
    }),

  autosave: () => {
    const s = get();
    if (s.state) persist(AUTOSAVE_KEY, s.state);
  },

  loadAutosave: () => {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    try {
      // persist() пишет обёртку { state, name, date } — распаковываем (как loadSlot/importSave).
      const data = JSON.parse(raw);
      const state = (data.state ?? data) as GameState;
      if (!state.restaurant || !state.history) return false;
      migrateState(state);
      set({ state, screen: 'restaurant', finalSeen: false, midday: null });
      return true;
    } catch {
      return false;
    }
  },

  exportSave: () => {
    const s = get();
    if (!s.state) return null;
    return JSON.stringify({ state: s.state, date: new Date().toISOString() }, null, 2);
  },

  importSave: (json) => {
    try {
      const data = JSON.parse(json);
      const state: GameState = data.state ?? data;
      if (!state.restaurant || !state.history) return false;
      migrateState(state);
      set({ state, screen: 'restaurant', finalSeen: false, midday: null });
      persist(AUTOSAVE_KEY, state);
      return true;
    } catch {
      return false;
    }
  },

  resetGame: () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    set({ state: null, screen: 'restaurant', lastToasts: [], finalSeen: false, midday: null });
  },

  dismissToasts: () => set({ lastToasts: [] }),
  showFinal: () => set({ finalSeen: false }),
  hideFinal: () => set({ finalSeen: true }),
}));

/** Миграция сейвов старых версий формата (ТЗ §32.4).
 *  v1 → v2: источник отзывов (sourceId), автозаказ.
 *  v2 → v3 (аудит): счётчики id в состоянии; priorReviews 35; weekStats
 *  старых сейвов без returningShare.
 *  v3 → v4: настройки геймплея (options.middayPause) и кастомные блюда
 *  меню (customDishes, CSV-импорт §35.3–35.4).
 *  v4 → v5 (балансировка v2 §20): состояние арендодателя (индексация
 *  аренды/переговоры); старым сейвам — база = текущая аренда, разговор
 *  назначается детерминированно через 8–23 недели.
 *  v5 → v6 (этап 2 «Люди»): неотвеченные отзывы (§8), лог увольнений
 *  и headcount недель (§7.2 метрика текучести).
 *  v6 → v7 (этап 3 «Закупка и меню»): режим закупки (§9, старт = standard),
 *  свежесть категорий и новизна блюд (§14, старым сейвам — грейс заново).
 *  v7 → v8 (этап 4): доверие владельца/дивиденды/FCF-накопители.
 *  v8 → v9 (этап 5 «Преимущества и события»): перманентные эффекты дилемм
 *  §15, счётчики инцидентов алкоголя §16.1, окна триггеров дилемм. */
function migrateState(state: GameState): void {
  const r = state.restaurant;
  // v4: настройки геймплея.
  if (!state.options) state.options = { middayPause: true };
  if (r) {
    // v4: кастомные блюда (CSV-импорт новых блюд §35.3–35.4).
    if (!r.menu.customDishes) r.menu.customDishes = [];
    // Мусор от прерванной паузы не должен попадать в сейвы.
    if (r.staff.callIns) r.staff.callIns = [];
    // v5: цепочка арендодателя (балансировка v2 §6).
    if (!r.landlord) {
      const talkIn = 8 + ((state.week * 7) % 16); // детерминированно, без Math.random
      r.landlord = {
        relation: 60,
        refusals: 0,
        nextTalkWeek: state.week + talkIn,
        rentBase: r.rentMonthly,
        stepSum: 0,
      };
    }
  }
  if (!r) return;
  if (!r.marketing.autoPurchase) {
    r.marketing.autoPurchase = { enabled: true, coverDays: 2 };
  }
  // Отзывы без источника: восстанавливаем по тексту (старый формат писал источник в конце текста).
  for (const rev of r.reputation.windowReviews) {
    if (!rev.sourceId) {
      const t = rev.text;
      rev.sourceId = t.includes('Карты')
        ? 'maps'
        : t.includes('Агрегатор')
          ? 'aggregator'
          : t.includes('Соцсети')
            ? 'social'
            : 'word_of_mouth';
    }
  }
  // v3 (аудит §6.1): счётчики id отзывов/транзакций живут в состоянии.
  if (r.reputation.reviewCounter == null) r.reputation.reviewCounter = 0;
  if (r.finance.txCounter == null) r.finance.txCounter = r.finance.transactions.length;
  // v3 (аудит §3.3): усиленный байесовский буфер рейтинга.
  if ((r.reputation.priorReviews ?? 0) < 45) r.reputation.priorReviews = 45;
  // v3: недостающие метрики недельной статистики.
  for (const w of state.history.weekStats) {
    if (w.returningShare == null) w.returningShare = 0;
  }
  // v6 (балансировка v2 этап 2 «Люди», §7.2/§8): счётчик неотвеченных
  // отзывов, лог увольнений и численность в неделях (база текучести).
  if (r.reputation.unansweredNeg == null) r.reputation.unansweredNeg = 0;
  if (!state.history.resignationLog) state.history.resignationLog = [];
  {
    const headcount = Object.values(r.staff.pools).reduce((s, p) => s + (p?.count ?? 0), 0);
    for (const w of state.history.weekStats) {
      if (w.headcount == null) w.headcount = headcount;
    }
  }
  // v7 (балансировка v2 этап 3 «Закупка и меню», §9/§14): режим закупки
  // (старт = standard — без шока для старых сейвов), свежесть категорий
  // (новые сейвы считают с нуля; старым — грейс-период заново) и новизна.
  if (!r.inventory.procurement) r.inventory.procurement = { policy: 'standard', pendingSwitch: null };
  if (!r.menu.categoryFreshness) r.menu.categoryFreshness = {};
  if (!r.menu.lastFreshReset) r.menu.lastFreshReset = {};
  if (!r.menu.dishAddedAt) r.menu.dishAddedAt = {};
  // v8 (балансировка v2 этап 4 «Финансовая дисциплина», §12/§13): доверие
  // владельца, дивиденды, накопители квартального FCF. Старым сейвам — стартовое
  // доверие 60 (нейтрально: «новый управляющий, счёт с чистого листа»).
  if (r.finance.ownerTrust == null) r.finance.ownerTrust = 60;
  if (!r.finance.dividends) r.finance.dividends = { history: [], lastProposal: null };
  if (r.finance.accrued.ocfQuarter == null) {
    r.finance.accrued.ocfQuarter = 0;
    r.finance.accrued.principalQuarter = 0;
    r.finance.accrued.equipQuarter = 0;
    r.finance.accrued.licenseQuarter = 0;
  }
  // v8: неделя последнего кассового разрыва (кулдаун триггера).
  if (r.lastCashGapWeek == null) r.lastCashGapWeek = 0;
  // v9 (балансировка v2 этап 5 «Преимущества и события», §15/§16/§11.2):
  // перманентные эффекты дилемм, счётчики инцидентов алкоголя и окнами
  // триггеров (усталость/рейтинг). Старым сейвам — нейтральные нули.
  if (!r.permanentEffects) r.permanentEffects = {};
  if (r.alcoholIncidents == null) r.alcoholIncidents = [];
  if (r.lastDilemmaWeek == null) r.lastDilemmaWeek = 0;
  if (r.fatigueHighWeeks == null) r.fatigueHighWeeks = 0;
  if (r.ratingHighWeeks == null) r.ratingHighWeeks = 0;
  if (r.leverageHighWeeks == null) r.leverageHighWeeks = 0;
  if (r.verandaDismantledWeek == null) r.verandaDismantledWeek = 0;
  // v10 (балансировка v2 этап 6 «Представление», §20): счётчик переездов —
  // база спец-финала «Переезд». Старым сейвам — 0 (переезда не было).
  if (state.history.relocations == null) state.history.relocations = 0;
}

function persist(key: string, state: GameState, name?: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ state, name, date: new Date().toISOString() }));
  } catch {
    // LocalStorage переполнен — молча пропускаем (ТЗ §32.5: IndexedDB при росте).
  }
}

/** Загрузка автосейва при старте страницы. */
export function tryRestore(): boolean {
  return useGame.getState().loadAutosave();
}
