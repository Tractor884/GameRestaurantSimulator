/**
 * ============================================================================
 * ПРЕЗЕНТАЦИОННЫЙ СЛОЙ — типы (PRESENTATION-LAYER.md §3)
 * ============================================================================
 * Слой «только-чтение» между GameState и UI: настроение персонажей,
 * состояние сцены, слои. НИКАКОГО влияния на движок и сейвы.
 * Один GameState → один визуальный результат (скриншот-стабильность).
 */

import type { RoleId } from '@/lib/game/types';

/** Настроение именного персонажа / роли смены (ART_STYLE §3.4). */
export type Mood = 'great' | 'normal' | 'warning' | 'critical';

/** Настроение гостей (гостям не нужен «critical»). */
export type GuestMood = 'happy' | 'neutral' | 'unhappy';

/** Уровень очереди у входа (§11). */
export type QueueLevel = 'none' | 'small' | 'medium' | 'large';

/** Бинарный слой сцены (грязь, пар/дым). */
export type LayerOn = 'off' | 'on' | 'heavy';

/** Состояние кофемашины (§6). */
export type CoffeeDisplay = 'ok' | 'warning' | 'broken';

/** Состояние полок склада (§5). */
export type StockDisplay =
  | 'overstock'
  | 'balanced'
  | 'low_stock'
  | 'near_expiry'
  | 'spoiled'
  | 'empty';

/** Идентификаторы именных персонажей (CHARACTER_BIBLE). */
export type CharacterId =
  | 'hr' // Анна
  | 'chef' // Максим
  | 'accountant' // Ирина
  | 'warehouse_manager' // Сергей
  | 'technician' // Николай
  | 'marketer' // Ольга
  | 'banker' // Андрей
  | 'owner'; // Игорь

/** Спрайты гостей в сцене (§10): сегменты движка → обобщённые группы. */
export type GuestSpriteId = 'business' | 'family' | 'couple_evening' | 'tourist' | 'youth' | 'premium';

/** Слой-«наклейка» сцены: предписание на входе (§11). */
export type NoticeKind = 'none' | 'sanitary' | 'legal';

/** Резолюция слота арта: приоритет пользовательской загрузки. */
export type ArtSource = 'custom' | 'builtin' | 'placeholder';

/* ── Композитная сцена зала (§11, ГЛАВНЫЙ ЭКРАН) ── */

export interface StaffSceneMood {
  roleId: RoleId;
  mood: Mood;
}

export interface SceneVisualState {
  queue: QueueLevel;
  floor: LayerOn;
  dishes: LayerOn;
  coffee: CoffeeDisplay;
  kitchen: LayerOn;
  guestMood: GuestMood;
  guestSegments: GuestSpriteId[];
  staff: StaffSceneMood[];
  notice: NoticeKind;
}

/** Склад (§5). */
export interface WarehouseVisual {
  stock: StockDisplay;
  coverDays: number;
  nearExpiryShare: number;
  wasteShare: number;
  keeper: Mood;
}

/** Финансы (§4). */
export interface FinanceVisual {
  mood: Mood;
  runwayWeeks: number;
  avgWeeklyOut: number;
  overdue: boolean;
  lastNetProfit: number;
}

/** Оборудование (§6). */
export interface EquipmentVisual {
  mood: Mood;
  coffee: CoffeeDisplay;
  zones: { zone: 'kitchen' | 'coffee' | 'hall'; wear: number; critical: boolean }[];
  brokenNow: boolean;
}

/** Итоговое визуальное состояние персонажа для панели. */
export interface CharacterVisual {
  id: CharacterId;
  mood: Mood;
}
