# VISUAL_STATE_MAP.md — Карта визуальных состояний (KPI → визуал)

> **Статус:** на утверждении (Ворота A, этап 1 DESIGN-CONCEPT-TZ).
> **Принципиальное правило:** все функции этого слоя — **чистые
> производные от GameState**. Никакого RNG, никаких новых чисел в сейв,
> никакого влияния на движок. Один GameState → одно визуальное состояние.
> Пороги собраны здесь централизованно (в коде лягут в
> `src/lib/game/presentation/thresholds.ts`).

---

## 0. Общие типы

```ts
type Mood = 'great' | 'normal' | 'warning' | 'critical';
type GuestMood = 'happy' | 'neutral' | 'unhappy';
type QueueLevel = 'none' | 'small' | 'medium' | 'large';
type LayerOn = 'off' | 'on' | 'heavy';   // для бинарных слоёв (грязь, дым)
type CoffeeDisplay = 'ok' | 'warning' | 'broken';
type StockDisplay = 'overstock' | 'balanced' | 'low_stock' | 'near_expiry' | 'spoiled' | 'empty';
```

## 1. Анна — HR (экран «Персонал»)

**Входы:** `restaurant.staff.pools[*].fatigue|morale` (все роли, среднее по
штатной численности), `pools[*].newHires`, укомплектованность (см. §2).

```
avgFatigue = Σ(fatigue_i × count_i) / Σcount_i        // по всем ролям
avgMorale  = Σ(morale_i  × count_i) / Σcount_i
newHireShare = ΣnewHires_i / Σcount_i

critical: avgFatigue > 80 или avgMorale < 30 или understaffed(any) = severe
warning:  avgFatigue > 60 или avgMorale < 50 или newHireShare > 0.25
great:    avgFatigue < 30 и avgMorale > 75 и newHireShare < 0.1
normal:   иначе
```

Порог согласован с движком: усталость 76 в сценарии «увольнение 25%» — это
уже warning/critical-зона; 30–60 — рабочая норма (fatigueRate 18/день при
перегрузе, отдых в выходные).

## 2. Персонал смены по ролям (экран «Персонал», сцена зала)

**Входы:** конкретный `staff.pools[roleId]` (fatigue, morale, count) +
укомплектованность смен: `schedule[roleId][day]` vs pool.count.

```
understaffed(role): пул < max(morning, evening) по неделе  → true
severe: пул < max × 0.75

critical: fatigue > 80 или morale < 30 или severe
warning:  fatigue > 60 или morale < 50 или understaffed
great:    fatigue < 30 и morale > 75
normal:   иначе
```

Спрайт роли (waiter/cook/barista/hostess) показывает вычисленное Mood.
Хостес дополнительно «одна за стойкой» (critical) при understaffed(hostess).

## 3. Максим — шеф (сцена кухни, экран «Меню»)

**Входы:** пиковая загрузка станций `lastDayResult.hourLogs[*].stationLoads`
(max по hot/cold/prep), `equipment.kitchen.wear`, Food Cost
(`weekResult.pnl` → cogs+waste / revenue, fallback `kpi.foodCost`),
`kpi.stopListHits`.

```
peakKitchen = max(stationLoads[hot_kitchen|cold_kitchen|prep])  // 0.7–1.3+
fc = неделя: (pnl.cogs + pnl.wasteCost) / pnl.revenue; иначе kpi.foodCost

critical: peakKitchen ≥ 1.2 или kitchen.wear ≥ 80 или fc > 0.40
warning:  peakKitchen ≥ 1.0 или kitchen.wear ≥ 60 или fc > 0.36 или stopListHits ≥ 12
great:    peakKitchen < 0.85 и kitchen.wear < 40 и fc < 0.32
normal:   иначе
```

Согласование с балансом: здоровая кухня 0.8–1.06 по станциям, цель FC
30–34%, тревога аудита — FC > 36%.

## 4. Ирина — бухгалтер (экран «Финансы»)

**Входы:** `finance.cash`, средний недельный отток (из последних 4–6
`weekStats`: revenue−netProfit ≈ полные расходы; fallback: rent+payroll
прошлой недели), `loans[*].overduePayments`, серия убыточных недель
(`history.positiveOpWeeks` = 0 свежая).

```
runwayWeeks = cash / avgWeeklyOut   // avgWeeklyOut ≥ 1, отсечка по 4–6 нед

critical: overduePayments > 0 (любой) или runwayWeeks < 1
warning:  runwayWeeks < 4 или (последняя неделя netProfit < 0 и касса падает 2 нед подряд)
great:    runwayWeeks ≥ 8 и netProfit последней недели > 0
normal:   иначе
```

Согласование: `minSafeCashEnd` из ForecastReport используется как
дублирующий сигнал (cash < minSafeCashEnd → не ниже warning).

## 5. Сергей — кладовщик + сцена склада (экран «Склад»)

**Входы:** `inventory.batches[*]` (quantity, expiry по типу хранения),
`inventory.pendingOrders`, дневная потребность (оценка: средний расход =
последние 7 дней `kpi.ordersCount` × 3.9 позиции/гость — константа движка),
`pnl.wasteCost`/revenue.

```
coverDays = Σquantity / dailyDemand
nearExpiryShare = стоимость партий с истечением ≤2 дней / Σ стоимости
wasteShare = pnl.wasteCost / pnl.revenue

StockDisplay:
  empty:        coverDays < 0.5
  spoiled:      wasteShare > 0.05 или есть просроченные партии на складе
  low_stock:    coverDays < 1.5
  near_expiry:  nearExpiryShare > 0.08
  overstock:    coverDays > 5
  balanced:     иначе (2–4 дня — цель автозакупки coverDays)

Кладовщик Mood: great=balanced; normal=balanced/low_stock(лёгкая);
warning=low_stock|near_expiry; critical=empty|spoiled
```

## 6. Николай — техник + кофемашина (экран «Оборудование», сцена)

**Входы:** `equipment.{kitchen,coffee,hall}.wear`, `risks.technical`,
`activeEvents[].effect.equipmentBreak`.

```
maxWear = max(трёх зон)
brokenNow = есть активное событие с equipmentBreak

critical: brokenNow или maxWear ≥ 80 или risks.technical ≥ 70
warning:  maxWear ≥ 60 или risks.technical ≥ 50
great:    maxWear < 35 и risks.technical < 30
normal:   иначе

CoffeeDisplay (для слоя сцены):
  broken:   equipment.coffee.wear ≥ 80 или brokenNow-событие
  warning:  equipment.coffee.wear ≥ 60
  ok:       иначе (слой не показывается)
```

## 7. Ольга — маркетолог (экран «Маркетинг»)

**Входы:** `marketing.campaigns` (активные = без endedWeek, бюджет
`pnl.marketing`), тренд гостей (`weekStats` последние 4: средн. 2-х посл. к
средн. 2-х прежних), `risks.reputation`.

```
guestTrend = avg(guests[посл 2 нед]) / avg(guests[нед 3–4 назад]) − 1
activeBudgetShare = pnl.marketing / pnl.revenue

critical: рисковое репутационное событие активно (скандал) или guestTrend < −0.25
warning:  (кампаний нет и guestTrend < −0.05) или activeBudgetShare > 0.08
great:    guestTrend > +0.08 и есть активные кампании
normal:   иначе
```

## 8. Андрей — банкир (экран «Кредиты»)

**Входы:** `finance.loans[*]` (remaining, payment, overduePayments),
`finance.cash`.

```
monthlyDebt = Σ(payment × 13/12)   // аннуитет ₽/4 нед → мес
pessimisticRunway = cash / (monthlyDebt/4.3 + прочие фикс. мин.)

critical: любой overduePayments > 0
warning:  loans.length > 0 и runwayWeeks (§4) < 6
great:    loans.length = 0 и runwayWeeks ≥ 6
normal:   иначе
```

## 9. Игорь — владелец (панель «Цели года», Квартальный разбор)

**Входы:** `weekResult.bsc.total`, прогресс целей сложности
(difficultyWin: cash/rating/BSC), `status` игры, серия плохих недель
(`lowRatingWeeks`).

```
critical: status в зоне провала (низкий рейтинг <2.0 серия) или близость
          банкрот-условий движка или отставание ≥3 из 5 целей
warning:  отставание 1–2 целей (прогноз недели 52 ниже планки)
great:    BSC ≥ 70 и опережение графика целей
normal:   иначе
```

## 10. Гости (сцена зала, иконки сегментов)

**Входы:** `lastDayResult.kpi.satisfaction`, доля потерянных
(`kpi.lostGuests / (guests + lostGuests)`), топ-сегменты дня
(`customerMemory.cohorts` последние, по guests).

```
GuestMood (общий, для сцены):
  happy:   satisfaction ≥ 85 и lostShare < 0.05
  unhappy: satisfaction < 68 или lostShare > 0.12
  neutral: иначе
```

Спрайты: показываем 2–3 сегмента-лидера дня (по трафику) в зоне столов;
mood-вариант каждого = общий GuestMood.

## 11. Композитная сцена зала (ГЛАВНЫЙ ЭКРАН)

Сводная функция `getRestaurantVisualState(state)`:

| Признак | Источник | Значения → слой |
|---|---|---|
| queue | max(`hourLogs[*].queueAvg`) последнего дня | 0–2 none; 3–5 small; 6–10 medium; >10 large |
| floor (чистота) | `restaurant.cleanliness` | ≥75 off; 50–74 лёгкий `floor_dirty` (α 40%); 35–49 on; <35 heavy (+совместно с сан-риском) |
| dishes (посуда) | understaffed(cleaner/dishwasher) или `equipment.hall.wear`≥70 | off / on (`dirty_dishes` у пасса) |
| coffee | §6 CoffeeDisplay | ok — нет слоя; warning `coffee_warning`; broken `coffee_broken` |
| kitchen (дым) | peakKitchen §3 | <1.0 off; 1.0–1.19 on (лёгкий пар); ≥1.2 heavy (дым + красная подсветка пасса) |
| guests | §10 GuestMood + топ-сегменты | happy/neutral/unhappy спрайты у столов |
| staff в зале | §2 Mood официанта/хостес | спрайт в зоне зала |
| special | активные events | `penalty_notice` на входе (проверки), `evening_glow` (P2) |

Комбинаций ~729 — при ~18 слоях (см. ASSET_LIST).

## 12. Пороговое соответствие с движком (сводка)

| KPI движка | healthy | warning | critical | Источник эталона |
|---|---|---|---|---|
| усталость | <30 (отдых) | 60–80 | >80 | fatigueRate 18/день; сценарий C=76 |
| мораль | >75 | 30–50 | <30 | движок увольнений |
| износ | <40 | 60–80 | >80 | поломки растут с wear |
| загрузка станций | 0.72–1.06 | ≥1.0 | ≥1.2 | калибровка 2.0 |
| FC | 30–34% | 36–40% | >40% | паспорт §1.1 |
| чистота | ≥75 | 50–74 | <35 | сан-риски |
| coverDays склада | 2–4 | 1–2 / >5 | <0.5 | автозакупка по coverDays |
| удовлетворённость | ≥85 | 68–85 | <68 | целевой рейтинг 4.2+ |
| очередь (пик дня) | 0–2 | 3–10 | >10 | ТЗ (§ «очередь») |

## 13. Экраны → визуальные подсистемы

| Экран | Персонаж | Сцена/слои | Прочее |
|---|---|---|---|
| Главный (Restaurant) | — | композит §11 | GoalsPanel + Игорь (мини) |
| Персонал | Анна | — | спрайты ролей §2 |
| Склад | Сергей | сцена склада §5 | полки/порча |
| Финансы | Ирина | — | касса-виджет (см. ASSET_LIST) |
| Оборудование | Николай | зоны кухонь | break-события |
| Меню | Максим (мини) | — | реакция на FC |
| Маркетинг | Ольга | — | — |
| Отзывы | Ольга (мини) | — | — |
| Кредиты | Андрей | — | — |
| События | по зоне | penalty_notice и пр. | — |
| Квартальный | Игорь | офис (P1) | — |
| Прочие 4 | fallback | — | — |

## 14. Правила детерминизма и fallback

1. Функции слоя — pure от `GameState`, без RNG и `Date.now()`.
2. Слой не пишет в state; изменения только в React-рендере.
3. Отсутствующий ассет → fallback (ART_STYLE §10), layout не ломается.
4. Пороги — единственный источник констант слоя (один файл на код);
   правка порогов не требует трогать движок.
5. Верификация: прогоны `engine-test` / `audit-scenarios` / `full-game`
   до/после внедрения слоя — байт-в-байт идентичны.
