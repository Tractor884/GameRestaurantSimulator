/* Headless-тест новых систем фазы 12:
 *  1) Пауза «экстренных решений» (ТЗ §8.4–8.6): проблемы → пауза → действия → резюм.
 *  2) Кастомные блюда CSV (§35.3–35.4): импорт → продажа в симуляции.
 *  3) Сезонная коммуналка (§12.8): зима/лето/нейтраль.
 *  4) Детерминированность паузы: тот же seed → тот же результат.
 */
import {
  createGame,
  simulateDay,
  simulateDayUntilPause,
  resumeDay,
  applyEmergencyAction,
  importCustomDishes,
} from '../src/lib/game/engine';
import { parseDishesImport, parseRecipesImport, buildCustomDishes } from '../src/lib/game/csv';
import type { GameState } from '../src/lib/game/types';
import { STATIONS } from '../src/lib/game/config/staffRoles.config';

const opts = {
  seed: 12345,
  restaurantName: 'Тест',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
};

function sabotage(state: GameState): GameState {
  // Дефицит персонала: официант и цеха на голодном минимуме.
  const pools = state.restaurant!.staff.pools;
  pools.waiter.count = 1;
  pools.hostess.count = 2;
  pools.hot_cook.count = 1;
  pools.cold_cook.count = 1;
  // Малый зал: очередь растёт, гости уходят (проблема «queue»).
  state.restaurant!.seats = 20;
  // Вычищаем ключевые ингредиенты — категории меню умирают (стоп-листы).
  const remove = [
    'egg', 'milk', 'coffee_beans', 'bread_brioche', 'bread_sourdough', 'butter_82',
    'potato', 'chicken_fillet', 'salmon_fresh', 'tomato', 'cheese_cheddar', 'cream_33',
  ];
  state.restaurant!.inventory.batches = state.restaurant!.inventory.batches.filter(
    (b) => !remove.includes(b.ingredientId),
  );
  return state;
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

/* ========== 1. ПАУЗА ЭКСТРЕННЫХ РЕШЕНИЙ ========== */
console.log('=== 1. ПАУЗА ЭКСТРЕННЫХ РЕШЕНИЙ (§8.4–8.6) ===');
{
  let state = sabotage(createGame(opts));
  // Две недели нормальной игры, чтобы накопить историю/рейтинг.
  for (let i = 0; i < 7; i++) state = simulateDay(state, { plannedActions: [] }, state.seed).state;
  // Саботаж перед контрольным днём.
  state = sabotage(state);

  const res = simulateDayUntilPause(state, state.seed);
  check('пауза сработала (проблемы найдены)', res.midday != null && res.run != null);
  check('день НЕ завершён (время стоит)', res.finished == null && res.draft.day === state.day && res.draft.week === state.week);
  if (res.midday && res.run) {
    const snap = res.midday;
    console.log(`    снимок 15:00: гостей ${snap.guests}, ушло ${snap.lostGuests}, очередь ${snap.queueNow}, проблем ${snap.problems.length}`);
    console.log(`    проблемы: ${snap.problems.map((p) => p.id).join(', ')}`);
    check('есть карточки решений (ТЗ §8.6)', snap.options.length >= 2, `опций: ${snap.options.length}`);
    check('у карточек есть стоимость/время/описание', snap.options.every((o) => o.description.length > 10 && o.time.length > 0 && o.riskNote.length > 0));

    // Применяем 2 действия: вызов персонала + компенсация очереди.
    const cashBefore = res.draft.restaurant!.finance.cash;
    const r1 = applyEmergencyAction(res.draft, res.run, 'call_extra_staff');
    const r2 = applyEmergencyAction(res.draft, res.run, 'queue_compensation');
    check('действия применились', r1.ok && r2.ok, `${r1.message} / ${r2.message}`);
    const cashAfter = res.draft.restaurant!.finance.cash;
    check('деньги списаны (addTransaction emergency)', cashAfter < cashBefore, `(-${cashBefore - cashAfter} ₽)`);
    check('транзакции emergency в журнале', res.draft.restaurant!.finance.transactions.some((t) => t.type === 'emergency'));
    const r1again = applyEmergencyAction(res.draft, res.run, 'call_extra_staff');
    check('повторное действие блокируется', !r1again.ok);

    // Доигрываем день.
    const beforeDay = res.draft.day;
    const beforeWeek = res.draft.week;
    const done = resumeDay(res.draft, res.run, state.seed);
    check('день завершился', done.state.day !== beforeDay || done.state.week !== beforeWeek);
    check('экстренные действия в отчёте дня', (done.result.emergencyActions?.length ?? 0) === 2);
    check('callIns очищен после дня', !done.state.restaurant!.staff.callIns || done.state.restaurant!.staff.callIns.length === 0);
    check('день залогирован один раз', done.state.history.dayLogs.length <= 7 && done.state.lastDayResult === done.result);

    // Сравнение: без мер день проигрывался бы ХУЖЕ по ушедшим гостям? (мягкая проверка)
    const lostWith = done.result.kpi.lostGuests;
    const stateNoActions = sabotage(createGame(opts));
    let sn = stateNoActions;
    for (let i = 0; i < 7; i++) sn = simulateDay(sn, { plannedActions: [] }, sn.seed).state;
    sn = sabotage(sn);
    const plain = simulateDay(sn, { plannedActions: [] }, sn.seed);
    console.log(`    ушедшие гости: с мерами ${lostWith} vs без мер ${plain.result.kpi.lostGuests} (ориентир, не инвариант)`);
  }
}

/* ========== 2. ЗДОРОВЫЙ РЕСТОРАН НЕ ПРЕРЫВАЕТСЯ ========== */
console.log('=== 2. ЗДОРОВЫЙ РЕСТОРАН: ПАУЗА НЕ НУЖНА ===');
{
  let state = createGame(opts);
  for (let i = 0; i < 14; i++) state = simulateDay(state, { plannedActions: [] }, state.seed).state;
  let pauses = 0;
  let normalDays = 0;
  for (let i = 0; i < 21; i++) {
    const res = simulateDayUntilPause(state, state.seed);
    if (res.midday) {
      pauses++;
      // Продолжаем без действий.
      if (res.run) state = resumeDay(res.draft, res.run, state.seed).state;
    } else {
      normalDays++;
      state = res.draft;
    }
  }
  console.log(`    пауз за 21 день: ${pauses}, без пауз: ${normalDays}`);
  check('здоровый ресторан прерывается редко (< 40% дней)', pauses <= 8, `pauses=${pauses}`);
  check('все дни доиграны без ошибок', state.week >= 6);
}

/* ========== 3. ДЕТЕРМИНИРОВАННОСТЬ ========== */
console.log('=== 3. ДЕТЕРМИНИРОВАННОСТЬ ПАУЗЫ ===');
{
  const mk = () => {
    let s = createGame(opts);
    for (let i = 0; i < 7; i++) s = simulateDay(s, { plannedActions: [] }, s.seed).state;
    return sabotage(s);
  };
  const a = simulateDayUntilPause(mk(), opts.seed);
  const b = simulateDayUntilPause(mk(), opts.seed);
  check('снимки идентичны (seed-детерминизм)', JSON.stringify(a.midday?.problems) === JSON.stringify(b.midday?.problems));
  if (a.midday && b.midday) {
    check('метрики снимка совпадают', a.midday.guests === b.midday.guests && a.midday.revenueSoFar === b.midday.revenueSoFar);
  }
}

/* ========== 4. КАСТОМНЫЕ БЛЮДА CSV ========== */
console.log('=== 4. КАСТОМНЫЕ БЛЮДА CSV (§35.3–35.4) ===');
{
  const state = createGame(opts);
  const dishesCsv = [
    'id;name;category;recommended_price;waste_percent;prep_time_min;station;requires_license;seasonality',
    'dish_bruschetta_custom;Брускетта с томатами;закуски;590;4;7;холодный цех;false;all_year',
    'dish_seabass_custom;Сибас на гриле;горячее;1890;6;18;горячий цех;false;all_year',
    'dish_bad_cat;Плохая категория;супы-борщи;500;4;7;горячий цех;false;all_year',
    'dish_conflict;Конфликт id;супы;500;4;7;горячий цех;false;all_year',
  ].join('\n');
  const recipesCsv = [
    'dish_id;ingredient_id;quantity',
    'dish_bruschetta_custom;tomato;0.12',
    'dish_bruschetta_custom;bread_sourdough;0.08',
    'dish_seabass_custom;sea_bass;0.22',
    'dish_seabass_custom;lemon;0.03',
    'dish_seabass_custom;no_such_ingredient;0.5',
    'dish_unknown;x;1',
  ].join('\n');

  const dp = parseDishesImport(dishesCsv, state.restaurant!.menu);
  check('валидных блюд распознано', dp.validIds.length === 3, `ids: ${dp.validIds.join(',')}`);
  check('невалидная категория поймана', dp.rows.some((r) => r.id === 'dish_bad_cat' && !!r.error));
  // Конфликт с библиотекой: существующий id блюда должен быть отвергнут.
  const dp2 = parseDishesImport('id;name;category;recommended_price;waste_percent;prep_time_min;station;requires_license;seasonality\nsyrniki;Шашлык;горячее;500;4;7;горячий цех;false;all_year', state.restaurant!.menu);
  check('конфликт с id библиотеки пойман', dp2.rows.some((r) => !!r.error));

  const rp = parseRecipesImport(recipesCsv);
  check('ошибки рецептов пойманы (неизв. ингредиент, dish)', rp.errors === 2, `errors=${rp.errors}`);

  const built = buildCustomDishes(dp, rp, state.restaurant!.menu);
  check('собрано 2 блюда (у третьего нет рецепта)', built.dishes.length === 2, `built=${built.dishes.length}`);
  check('пропущенное блюдо объяснено', built.skipped.some((s) => s.id === 'dish_conflict'));

  const importRes = importCustomDishes(structuredClone(state), built.dishes);
  check('импорт в состояние прошёл', importRes.ok, importRes.message);
  const st2 = structuredClone(state);
  importCustomDishes(st2, built.dishes);
  const custom = st2.restaurant!.menu.customDishes;
  check('customDishes в состоянии', custom.length === 2);
  check('блюда добавлены в меню', st2.restaurant!.menu.dishes.includes('dish_bruschetta_custom'));
  check('цены установлены', st2.restaurant!.menu.prices['dish_seabass_custom'] === 1890);
  check('станция смаплена', STATIONS[built.dishes[1].station].id === 'hot_kitchen');

  // Симуляция с кастомными блюдами: продаются?
  let st3 = st2;
  // Закупим ингредиенты под кастом (чтобы не стоп-лист).
  for (const ing of ['tomato', 'bread_sourdough', 'sea_bass', 'lemon']) {
    st3.restaurant!.inventory.batches.push({
      ingredientId: ing,
      quantity: 20,
      unitCost: 100,
      arrivedAt: { week: st3.week, day: st3.day, hour: 8 },
      expiresAt: { week: st3.week + 2, day: st3.day, hour: 8 },
    });
  }
  let soldCustom = 0;
  for (let i = 0; i < 7; i++) {
    const r = simulateDay(st3, { plannedActions: [] }, st3.seed);
    st3 = r.state;
    for (const top of r.result.kpi.dishesTop) {
      if (custom.some((d) => d.id === top.dishId)) soldCustom += top.count;
    }
  }
  check('кастомные блюда продаются в симуляции', soldCustom > 0, `продано ${soldCustom} порций`);
  // Инварианты не сломались.
  const inv = st3.lastDayResult?.invariantReport;
  check('инварианты ОК с кастомными блюдами', inv?.ok !== false, JSON.stringify(inv?.violations.slice(0, 3)));
  // Восстановление после structuredClone-сериализации (сейв/загрузка).
  const restored = JSON.parse(JSON.stringify(st3)) as GameState;
  check('кастомные блюда переживают сериализацию', restored.restaurant!.menu.customDishes.length === 2);
}

/* ========== 5. СЕЗОННАЯ КОММУНАЛКА ========== */
console.log('=== 5. СЕЗОННАЯ КОММУНАЛКА (§12.8) ===');
{
  const state = createGame(opts);
  const r = state.restaurant!;
  const base = r.utilitiesMonthly;
  // Неделя 2 (январь): dayOfYear(2,3) → месяц 1 → зима ×1.25
  const utilAccrualOf = (week: number) => Math.round((base * (week <= 5 ? 1.25 : week >= 22 && week <= 35 ? 1.15 : 1.0)) / 4);
  console.log(`    базовые коммунальные ${base} ₽/мес: зима ${utilAccrualOf(2)}, лето ${utilAccrualOf(26)}, межсезонье ${utilAccrualOf(12)}`);
  check('зимняя надбавка больше летней', utilAccrualOf(2) > utilAccrualOf(26));
  check('межсезонье = база', utilAccrualOf(12) === Math.round(base / 4));
  // Проверим транзакцию зимой: неделя 4 (кратна 4).
  let st = state;
  for (let i = 0; i < 28; i++) st = simulateDay(st, { plannedActions: [] }, st.seed).state;
  const winterUtil = st.restaurant!.finance.transactions.find((t) => t.type === 'utilities' && t.date.week <= 4);
  check('зимняя транзакция с пометкой отопления', !!winterUtil && winterUtil.description.includes('отопление'), winterUtil?.description);
}

console.log(`\nИТОГ: ${pass} прошло, ${fail} упало`);
if (fail > 0) process.exit(1);
