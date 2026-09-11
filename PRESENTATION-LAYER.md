# PRESENTATION-LAYER.md — Архитектура presentation layer

> **Статус:** на утверждении (Ворота A, этап 1 DESIGN-CONCEPT-TZ).
> **Принцип:** тонкий слой «только-чтение» между GameState и UI. Движок
> ничего не знает о картинках; картинки ничего не решают в экономике.

---

## 1. Расположение

```
src/lib/game/presentation/        ← логика (pure, без React)
  types.ts          — Mood, GuestMood, QueueLevel, …VisualState
  thresholds.ts     — ВСЕ пороги из VISUAL_STATE_MAP (единственный источник)
  registry.ts       — ASSET_REGISTRY: ключи → пути webp + fallback
  characters.ts     — getCharacterMood(state, id): Mood
  scene.ts          — getRestaurantVisualState(state): SceneVisualState
  warehouse.ts      — getWarehouseVisualState(state): StockDisplay + Mood
  finance.ts        — getFinanceVisualState(state): Mood + runway
  equipment.ts      — getEquipmentVisualState(state): зоны + CoffeeDisplay
  index.ts          — публичный API слоя

src/components/game/visual/       ← React-компоненты (use client)
  CharacterPortrait.tsx
  CharacterPanel.tsx
  RestaurantScene.tsx
  SceneLayer.tsx
  GuestSprites.tsx
  VisualMessage.tsx
```

Слой НЕ импортирует движок для записи; импортирует только типы
`GameState` и конфиги (пороговые константы движка — только чтение).

## 2. Поток данных

```
GameState (Zustand)
   │  selector: state.restaurant / lastDayResult / weekResult
   ▼
presentation/*VisualState(state)   ← useMemo, pure
   │  { mood, layers, queue, guests… }
   ▼
visual/-компоненты
   │  ASSET_REGISTRY[key][state]  →  /game-art/**.webp  (или fallback)
   ▼
экраны (существующие 15)
```

Правила:
- все вычисления — в `useMemo(() => getX(state), [зависимости])`;
- ни одного `Math.random` / `Date.now()` в слое;
- слой не мутирует стор и не вызывает экшены;
- одинаковый GameState → одинаковый рендер (скриншот-стабильность).

## 3. Ключевые интерфейсы (эскиз)

```ts
// types.ts
interface CharacterVisual { id: CharacterId; mood: Mood; }
interface SceneVisualState {
  queue: QueueLevel;
  floor: LayerOn;
  dishes: LayerOn;
  coffee: CoffeeDisplay;
  kitchen: LayerOn;            // пар/дым
  guestMood: GuestMood;
  guestSegments: SegmentSpriteId[];   // топ-2-3 сегмента дня
  staff: { waiter: Mood; hostess: Mood };
  notice: 'none' | 'sanitary' | 'legal';
}
interface WarehouseVisual {
  stock: StockDisplay; keeper: Mood;
}

// registry.ts
const ASSET_REGISTRY = {
  characters: {
    hr: { great: '/game-art/characters/hr/hr_great.webp', … },
    …
  },
  staff: { waiter: {…}, cook: {…}, barista: {…}, hostess: {…} },
  guests: { business: { happy: '…', neutral: '…', unhappy: '…' }, … },
  scenes: { restaurant: '/game-art/scenes/restaurant/restaurant_base.webp', … },
  layers: { queue_small: '…', floor_dirty: '…', … },
  fallback: { character: '/game-art/characters/_fallback/character_normal.webp' },
} as const;

getAsset(group, key, state?): string   // с fallback-логикой + existsSync-таблица
```

**Fallback-механика:** реестр строится статически (compile-time пути);
`<CharacterPortrait>` при `onError` img показывает fallback-силуэт + иконку
роли (lucide) — экран не ломается, пока ассет не сгенерирован.

## 4. Компоненты

| Компонент | Props | Что делает |
|---|---|---|
| `CharacterPortrait` | `src, mood, size, name?` | img + статус-ореол (цвет §2.2 ART_STYLE), `aria-label` «Анна, HR: обеспокоена», ленивая загрузка |
| `CharacterPanel` | `characterId, state` | портрет + имя + роль + 1–2 строки «VisualMessage» + мини-KPI зоны (значения из state) |
| `RestaurantScene` | `SceneVisualState` | относительный контейнер: base + `SceneLayer`-ы + `GuestSprites` + стафф; переключатель «Живая сцена / План зала (HallScene)» |
| `SceneLayer` | `src, anchor, opacity?` | абсолютный img по ANCHOR-GRID, `pointer-events-none`, fade-in 200 мс |
| `GuestSprites` | `segments[], mood` | 2–3 спрайта гостей у столов |
| `VisualMessage` | `characterId, mood` | короткие реплики (таблица шаблонов по состоянию; выбор — детерминированный хэш от недели/дня, НЕ RNG) |

## 5. Интеграция с пилотными экранами (этап 10)

| Экран | Точка вставки | Что добавляем |
|---|---|---|
| RestaurantScreen | верх страницы | `RestaurantScene` (с переключателем на существующий `HallScene`) |
| StaffScreen | верх | `CharacterPanel(Анна)` + Mood-бейджи в списке ролей |
| WarehouseScreen | верх | `CharacterPanel(Сергей)` + мини-сцена склада (base + слой StockDisplay) |
| FinanceScreen | верх | `CharacterPanel(Ирина)` (mood = §4 карты) |
| EquipmentScreen | верх | `CharacterPanel(Николай)` + зоны износа с CoffeeDisplay-иконками |

Существующие таблицы/KPI/панели НЕ удаляются — визуальный блок добавляется
сверху. Вёрстка: `grid lg:grid-cols-[280px,1fr]` — панель персонажа слева
(на мобиле — сверху), контент экрана справа.

## 6. HallScene (решено пользователем: оставить)

- переключатель «Сцена / План» (Tabs) на главном экране;
- обе view читают одни данные (`lastDayResult.hourLogs`), друг друга не знают;
- выбор запоминается в `GameOptions` (мини-миграция v5) — опция UI,
  не экономика.

## 7. Постобработка графики (этап 8)

`scripts/art-postprocess.ts`:
- вход: `download/art-raw/*.png` (генерация на пурпурном фоне);
- хрома-ключ: `sharp` (порог ΔE к `#FF00FF`, feather 1.5px);
- конвертация: PNG → WebP (quality 82/85, effort 4);
- выкладка в `public/game-art/…` по реестру + контроль размеров;
- отчёт: таблица «ассет → ок/брак» + средние тона палитры (ΔE-сверка).

## 8. Верификация (после каждого код-этапа)

1. `bunx tsc --noEmit` — 0 ошибок;
2. `bun run lint` — чисто;
3. `bun scripts/engine-test.ts` — результат **байт-в-байт** равен эталону
   (4149 тыс / 4.16 / BSC 70.1);
4. `bun scripts/audit-scenarios.ts` — A–F в эталонах паспорта;
5. `bun scripts/full-game.ts standard` — эталон 211/36.0/4.00;
6. agent-browser: 15 экранов, консоль 0 ошибок, мобайл 390px без
   горизонтального скролла, sticky-footer жив.

## 9. Порядок реализации (после Ворот A)

| Подэтап | Что | Код-объём |
|---|---|---|
| 9.1 | `presentation/` каркас: types, thresholds, registry (+fallback), characters, scene | ~600 строк |
| 9.2 | визуал-компоненты (5 шт. + GuestSprites) | ~450 строк |
| 9.3 | интеграция 5 пилотных экранов + Tabs с HallScene + миграция v5 | ~250 строк правок |
| 9.4 | `art-postprocess.ts` + первый полный прогон QA | ~200 строк |

После 9.1–9.4 — прогон верификации §8, скриншоты, Ворота C.

## 10. Риски и защита

| Риск | Защита |
|---|---|
| генерация выбьется из стиля между батчами | промпт-формула дословно + QA каждого ассета VLM ≥8/10 |
| хрома-ключ оставит ореолы | feather + ручная проверка слоёв; брак → перегенерация |
| сцена «не оживёт» (слоёв мало) | зарезервированы P2-слои; якоря позволяют добавлять слои без переделки базы |
| производительность (много img) | все слои — статические webp, `loading="lazy"`, `decoding="async"`; их ≤ 8 на экран |
| regress движка | слой pure; верификация §8 после каждого подэтапа |
