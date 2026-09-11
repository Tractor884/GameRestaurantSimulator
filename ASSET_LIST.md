# ASSET_LIST.md — Реестр графических ассетов

> **Статус:** на утверждении (Ворота A, этап 1 DESIGN-CONCEPT-TZ).
> Форматы/размеры/QA — по ART_STYLE §7–9. Пути — по структуре ТЗ.
> Приоритеты: **P0a** — стиль-тест (Ворота B), **P0b** — пилотные 5 экранов,
> **P1** — остальные 10 экранов, **P2** — полировка.
> Итого полный комплект ≈ 98 ассетов (≈ 7–9 МБ WebP).

---

## 1. Персонажи — портреты (1024×1024, фон крем, без альфы)

### P0a — стиль-тест (16)

| Ассет | Состояния | KPI |
|---|---|---|
| `characters/hr/hr_{great,normal,warning,critical}.webp` | 4 | VISUAL_STATE_MAP §1 |
| `characters/accountant/accountant_{…}.webp` | 4 | §4 |
| `characters/warehouse_manager/warehouse_manager_{…}.webp` | 4 | §5 |
| `characters/technician/technician_{…}.webp` | 4 | §6 |

### P0b — пилот (20)

| Ассет | Состояния | KPI |
|---|---|---|
| `characters/chef/chef_{…}.webp` | 4 | §3 (Максим) |
| `characters/marketer/marketer_{…}.webp` | 4 | §7 (Ольга) — применяется и на P1-экранах |
| `characters/banker/banker_{…}.webp` | 4 | §8 (Андрей) |
| `characters/owner/owner_{…}.webp` | 4 | §9 (Игорь) |
| `characters/_fallback/character_normal.webp` | 1 | fallback-стандарт |

### Итого портретов: 37 (4+4+4+4 + 16 + 1)

## 2. Персонал смены — full-body спрайты (1024×1024, альфа)

Отображаются: в сцене зала (главный), в списке ролей (Персонал).

| Ассет | Состояния | Приоритет |
|---|---|---|
| `staff/waiter/waiter_{great,normal,warning,critical}.webp` | 4 | P0b |
| `staff/cook/cook_{…}.webp` | 4 | P0b (кухонная зона сцены) |
| `staff/barista/barista_{…}.webp` | 4 | P0b (кофе-станция) |
| `staff/hostess/hostess_{…}.webp` | 4 | P0b (вход/стойка) |

Итого: 16.

## 3. Гости — спрайты мини-групп (1024×1024, альфа)

Состояния: happy / neutral / unhappy (×3 каждый).

| Ассет | Папка | Приоритет | Сегменты движка |
|---|---|---|---|
| бизнес-гость | `guests/business/` | P0b | business_lunch, office_evening |
| семья с ребёнком | `guests/family/` | P0b | family, breakfast |
| пара на ужине | `guests/couple_evening/` | P0b | evening |
| туристы | `guests/tourist/` | P1 | tourist |
| молодёжь | `guests/youth/` | P1 | youth |
| премиум-пара | `guests/premium/` | P1 | premium |

Итого: 6 × 3 = 18 (P0b: 9, P1: 9).

## 4. Базовые сцены (1344×768, без альфы)

| Ассет | Приоритет | Что |
|---|---|---|
| `scenes/restaurant/restaurant_base.webp` | **P0a** | зал по ANCHOR-GRID (ART_STYLE §4.2), без людей |
| `scenes/warehouse/warehouse_base.webp` | P0b | стеллажи, морозилка, стол приёмки |
| `scenes/kitchen/kitchen_base.webp` | P1 | кухня крупно (экран Оборудование/Меню) |
| `scenes/office/office_base.webp` | P1 | кабинет (Квартальный разбор, финал) |

Итого: 4.

## 5. Слои сцены зала (1024×1024, альфа; якоря — ART_STYLE §4.2)

| Ассет | Слой | Приоритет | Триггер |
|---|---|---|---|
| `objects/queue_small.webp` | у входа, 2–3 чел. | P0b | queue 3–5 |
| `objects/queue_medium.webp` | 4–6 чел. | P0b | queue 6–10 |
| `objects/queue_large.webp` | 7+ чел., недовольные | P0b | queue >10 |
| `objects/floor_dirty.webp` | разводы/крошки переднего плана | P0b | cleanliness <50 (α40% лёгкая / <35 full) |
| `objects/dirty_dishes.webp` | стопка тарелок у пасса | P0b | §11 dishes |
| `objects/coffee_warning.webp` | кофемашина: лужица, капли | P0b | coffee.wear 60–79 |
| `objects/coffee_broken.webp` | машина: дым, «×» на дисплее | P0b | wear≥80 / break |
| `objects/kitchen_steam.webp` | лёгкий пар над пассом | P0b | peak 1.0–1.19 |
| `objects/kitchen_smoke.webp` | густой дым + искры | P0b | peak ≥1.2 |
| `objects/penalty_notice.webp` | предписание на двери | P0b | сан/юр. событие активно |
| `objects/evening_glow.webp` | янтарная виньетка | P2 | опция |

Итого: 11 (P0b: 10).

## 6. Слои сцены склада (1024×1024, альфа)

| Ассет | Приоритет | Триггер |
|---|---|---|
| `objects/shelves_full.webp` | полные ящики | P0b | overstock |
| `objects/shelves_low.webp` | полупустые | P0b | low_stock |
| `objects/shelves_empty.webp` | пустые + паутинка | P0b | empty |
| `objects/spoiled_food.webp` | зелёная тухль, мухи | P0b | spoiled |
| `objects/near_expiry.webp` | коробка с «!»-стикером (без текста) | P1 | near_expiry |

Итого: 5 (P0b: 4).

## 7. Объекты-иконки событий (1024×1024, альфа)

| Ассет | Приоритет | Где |
|---|---|---|
| `objects/broken_coffee_machine.webp` | P1 | крупно: экран Оборудование, событие |
| `objects/inspection.webp` | P1 | проверка (событие) |
| `objects/blogger_scandal.webp` | P1 | инфо-скандал |
| `objects/celebration.webp` | P1 | позитивные события, юбилей |
| `objects/cash_register.webp` | P2 | виджет кассы (Финансы) |

Итого: 5.

## 8. Сводка по объёму

| Приоритет | Кол-во | Когда |
|---|---|---|
| P0a — стиль-тест | 17 (16 портретов + сцена) | Ворота B (после утв. документов) |
| P0b — пилот 5 экранов | 45 | этапы 9–10 |
| P1 — остальные экраны | 28 | этап 6 (после Ворот C) |
| P2 — полировка | 8 | опционально |
| **Итого** | **98** | — |

## 9. Партии генерации (батчи)

Батч = 8–12 изображений одного типа (стабильнее стиль внутри типа):

1. Батч 1 (P0a): Анна×4 → VLM-QA → правки промпта → Ирина×4 → … → сцена.
   После каждого персонажа — мини-QA (соответствие канону, 4 состояния
   различимы).
2. Батчи 2–5 (P0b): Максим/Ольга/Андрей/Игорь → стафф 4×4 → гости →
   слои зала → склад.
3. Постобработка каждого батча: `scripts/art-postprocess.ts` —
   хрома-ключ → WebP → в `public/game-art/…` + отчёт QA.

## 10. Правила реестра

1. Имя файла = ключ реестра в коде (`ASSET_REGISTRY`), расширение —
   только `.webp`.
2. Нельзя переименовывать ассеты после включения в реестр (только
   депрекация + новый ключ).
3. Каждая генерация сохраняет промпт в `public/game-art/_prompts.md`
   (воспроизводимость/дорисовка).
4. Отсутствие файла = fallback, экран обязан работать без ассета.
5. Ассеты не попадают в git-игнор; коммитятся обычным способом (это код
   проекта, не пользовательские данные).
