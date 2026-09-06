/**
 * ЭКСТРЕННЫЕ РЕШЕНИЯ ВНУТРИ ДНЯ (ТЗ §8.4–8.6, дорожная карта паспорта §12.5).
 *
 * МЕХАНИКА: после обеденного пика (пауза перед 16:00) движок оценивает
 * «полудневные» метрики. Есть проблемы — день встаёт на паузу, игроку
 * показываются карточки решений (ТЗ §8.6: название, стоимость, время,
 * описание, ориентировочные последствия, диапазон риска). Действия
 * применяются к ОСТАВШИМСЯ часам дня; затем resumeDay доигрывает вечер.
 *
 * ФИЛОСОФИЯ ПОРОГОВ: здоровый ресторан НЕ прерывается — пауза срабатывает
 * только при реальных проблемах (ушедшие гости, перегруз кухни, стоп-листы,
 * грязь, поломка, пустая касса). Это контур «плановых и экстренных решений»
 * ТЗ §5: между днями — планы, внутри дня — тушение пожаров.
 *
 * ДЕТЕРМИНИРОВАННОСТЬ: контекст паузы живёт в памяти сторы (rng-замыкания),
 * в сейвы не пишется. Перезагрузка страницы в паузе → день переигрывается
 * с начала теми же rng-потоками (результат воспроизводим).
 */
import type {
  EmergencyActionId,
  EmergencyOption,
  GameState,
  MiddayProblem,
  MiddaySnapshot,
  StationType,
  RoleId,
} from '../types';
import { STAFF_ROLES, STATIONS } from '../config/staffRoles.config';
import { INGREDIENTS_MAP } from '../content/ingredients';
import { dishOf } from '../content/resolve';
import { URGENT_PURCHASE_MARKUP } from '../config/finance.config';
import { addTransaction, clamp, dayIndex } from './core';
import { buildAutoOrder } from './inventory';
import { startDayRun, runHoursUntil, finishDay, type DayRunContext } from './day';
import type { DaySimulationResult } from '../types';

/** Час, ПЕРЕД которым ставится пауза (обеденный пик 12–15 закончился,
 *  вечерний ещё не начался). Если рабочий день короче — паузы нет. */
const PAUSE_BEFORE_HOUR = 16;
/** Минимальное число уже прожитых часов, чтобы пауза имела смысл. */
const MIN_HOURS_BEFORE_PAUSE = 5;

/* ============================= ЗАПУСК ДНЯ С ПАУЗОЙ ============================= */

/**
 * Прогоняет день до контрольной точки. Если проблемы найдены — возвращает
 * контекст паузы (день НЕ завершён, время НЕ двигалось). Если проблем нет —
 * день доигрывается и финализируется сразу (midday = null, state готов).
 */
export function simulateDayUntilPause(
  state: GameState,
  seed: number,
): { midday: MiddaySnapshot | null; draft: GameState; run: DayRunContext | null; finished: DaySimulationResult | null } {
  const { draft, run } = startDayRun(state, seed);

  const hourAt = run.hours[run.hourIndex] ?? 24;
  const canPause = run.hours.length >= MIN_HOURS_BEFORE_PAUSE && hourAt <= PAUSE_BEFORE_HOUR;
  const stopBefore = canPause ? PAUSE_BEFORE_HOUR : undefined;

  runHoursUntil(draft, run, stopBefore);

  if (stopBefore == null || run.hourIndex === 0) {
    // Короткий день/пауза невозможна — доигрываем без паузы.
    const { result, state: finished } = finishDay(draft, run, seed);
    return { midday: null, draft: finished, run: null, finished: result };
  }

  const midday = detectProblems(draft, run);
  if (midday.problems.length === 0) {
    // Здоровый ресторан: пауза не нужна — ДОИГРЫВАЕМ вечер и финализируем день.
    // (КРИТИЧНО: раньше finishDay звался сразу после обеда — вечер «пропадал».)
    runHoursUntil(draft, run);
    const { result, state: finished } = finishDay(draft, run, seed);
    return { midday: null, draft: finished, run: null, finished: result };
  }
  midday.options = buildOptions(draft, run, midday.problems);
  return { midday, draft, run, finished: null };
}

/** Доиграть день после паузы (применённые действия уже в run.emergency/draft). */
export function resumeDay(draft: GameState, run: DayRunContext, seed: number): { result: DaySimulationResult; state: GameState } {
  runHoursUntil(draft, run);
  return finishDay(draft, run, seed);
}

/* ============================= ДИАГНОСТИКА ПРОБЛЕМ ============================= */

function detectProblems(draft: GameState, run: DayRunContext): MiddaySnapshot {
  const restaurant = draft.restaurant!;
  const t = run.totals;
  const guests = Math.round(t.guests);
  const problems: MiddayProblem[] = [];

  const lost = Math.round(t.lost);
  const queueNow = Math.round(run.queue.reduce((s, q) => s + q.guests, 0));
  if (lost >= Math.max(6, guests * 0.1) || queueNow >= 10) {
    problems.push({
      id: 'queue',
      title: 'Гости уходят из очереди',
      detail: `К 15:00 ушло ${lost} гостей${queueNow > 0 ? `, в очереди сейчас ~${queueNow}` : ''}. Посадка не справляется: хостес, места или оборачиваемость.`,
      severity: lost >= Math.max(10, guests * 0.15) ? 'high' : 'medium',
    });
  }

  // Загрузка станций: топ-2 за прожитые часы.
  const peak = new Map<StationType, number>();
  for (const h of run.hourLogs) {
    for (const [st, load] of Object.entries(h.stationLoads)) {
      const prev = peak.get(st as StationType) ?? 0;
      if ((load ?? 0) > prev) peak.set(st as StationType, load ?? 0);
    }
  }
  const stationPeak = [...peak.entries()]
    .map(([station, load]) => ({ station, load }))
    .sort((a, b) => b.load - a.load)
    .slice(0, 2);
  const worst = stationPeak[0]?.load ?? 0;
  if (worst > 1.15) {
    const worstRu = STATIONS[stationPeak[0].station]?.name ?? stationPeak[0].station;
    problems.push({
      id: 'kitchen',
      title: 'Кухня перегружена',
      detail: `${worstRu}: загрузка ${Math.round(worst * 100)}% (норма ≤115%). Заказы зависают, растут ошибки и время ожидания.`,
      severity: worst > 1.4 ? 'high' : 'medium',
    });
  }

  // ОТНОСИТЕЛЬНЫЙ порог: стоп-листы есть всегда (2–8% позиций «не сегодня»
  // и в здоровом ресторане — завтраки кончаются к обеду). Проблемой считаем
  // только настоящий дефицит: ≥12 позиций И ≥10% от проданного объёма.
  const hitRate = t.orders > 0 ? t.stopListHits / t.orders : 0;
  if (t.stopListHits >= 12 && hitRate >= 0.1) {
    problems.push({
      id: 'stockout',
      title: 'Стоп-листы бьют по заказам',
      detail: `${Math.round(t.stopListHits)} позиций не выполнено (${Math.round(hitRate * 100)}% заказов) из-за отсутствия продуктов. Гости не находят блюда в меню.`,
      severity: hitRate >= 0.25 ? 'high' : 'medium',
    });
  }

  const satisfactionSoFar = t.satisfactionCount > 0 ? Math.round(t.satisfactionWeighted / t.satisfactionCount) : 100;
  if (satisfactionSoFar < 62 && guests >= 20) {
    problems.push({
      id: 'service',
      title: 'Сервис проседает',
      detail: `Удовлетворённость гостей ${satisfactionSoFar}/100 при норме 70+. Вечером ждите плохие отзывы и удар по рейтингу.`,
      severity: satisfactionSoFar < 50 ? 'high' : 'medium',
    });
  }

  if (restaurant.finance.cash < 300_000) {
    problems.push({
      id: 'cash',
      title: 'Кассовый разрыв на горизонте',
      detail: `На счёте ${(restaurant.finance.cash / 1000).toFixed(0)} тыс ₽. Закупка и зарплата могут не пройти.`,
      severity: restaurant.finance.cash < 150_000 ? 'high' : 'medium',
    });
  }

  if (restaurant.cleanliness < 50 || restaurant.risks.sanitary > 55) {
    problems.push({
      id: 'sanitary',
      title: 'Чистота под вопросом',
      detail: `Чистота ${Math.round(restaurant.cleanliness)}/100, санитарный риск ${Math.round(restaurant.risks.sanitary)}/100. Есть шанс проверки или жалоб.`,
      severity: restaurant.risks.sanitary > 70 ? 'high' : 'medium',
    });
  }

  if (restaurant.risks.technical > 60 || restaurant.equipment.kitchen.wear > 70) {
    problems.push({
      id: 'equipment',
      title: 'Оборудование на грани',
      detail: `Износ кухни ${Math.round(restaurant.equipment.kitchen.wear)}/100, техриск ${Math.round(restaurant.risks.technical)}/100. Поломка в вечерний пик остановит станцию.`,
      severity: restaurant.equipment.kitchen.wear > 85 ? 'high' : 'medium',
    });
  }

  return {
    hour: PAUSE_BEFORE_HOUR,
    guests,
    lostGuests: lost,
    queueNow,
    revenueSoFar: Math.round(t.revenue),
    satisfactionSoFar,
    stationPeak,
    stopListHits: Math.round(t.stopListHits),
    cash: Math.round(restaurant.finance.cash),
    problems,
    options: [],
  };
}

/* ============================= КАРТОЧКИ РЕШЕНИЙ ============================= */

/** Стоимость вызова персонала: (хостес + официант) × 8 ч × двойная ставка срочности.
 *  Ставка = оклад/167 (как в payroll); внешние temps приходят «со стороны». */
function callInCost(): number {
  const rate = (role: RoleId) => (STAFF_ROLES[role].monthlySalary / 167) * 8 * 2;
  return Math.round(rate('hostess') + rate('waiter'));
}

function buildOptions(draft: GameState, run: DayRunContext, problems: MiddayProblem[]): EmergencyOption[] {
  const restaurant = draft.restaurant!;
  const ids = new Set(problems.map((p) => p.id));
  const t = run.totals;
  const options: EmergencyOption[] = [];

  options.push({
    id: 'call_extra_staff',
    title: 'Вызвать персонал на вечер',
    icon: 'UserPlus',
    cost: callInCost(),
    time: 'с 16:00',
    description: 'Хостес + официант со стороны на вечернюю смену (с двойной ставкой за срочность вызова).',
    consequences: [
      'посадка ускоряется ~на 15–25 гостей за вечер',
      'обслуживание стола быстрее — чаевые и мораль выше',
      'разовая трата не попадает в недельный ФОТ',
    ],
    riskNote: 'риск 0 — внешний найм не затрагивает штат',
    targets: ['queue', 'service'],
  });

  const queueGuests = Math.max(1, Math.round(run.queue.reduce((s, q) => s + q.guests, 0)));
  options.push({
    id: 'queue_compensation',
    title: 'Компенсация ожидающим',
    icon: 'Coffee',
    cost: Math.min(30, queueGuests) * 350,
    time: 'немедленно',
    description: `Напиток/десерт за ожидание каждому в очереди (~${Math.min(30, queueGuests)} гостей). Гости успокаиваются и остаются.`,
    consequences: [
      'ча очереди остаётся ждать вместо ухода',
      '+4 к удовлетворённости всех оставшихся часов',
      'лучшие отзывы вечером («внимание к гостям»)',
    ],
    riskNote: 'риск 0 — затраты фиксированы',
    targets: ['queue', 'service'],
  });

  options.push({
    id: 'evening_discount',
    title: 'Экстренная скидка 15%',
    icon: 'Percent',
    cost: 0,
    time: 'с 16:00 до закрытия',
    description: 'Объявить скидку на всё меню до конца дня: вечерний трафик оживится, но чек снизится.',
    consequences: [
      'новый трафик +12% (прохожие и сарафан)',
      'чек на позицию −15%: выручка вечера может упасть',
      'восприятие цены лучше — удовлетворённость выше',
    ],
    riskNote: 'риск низкий; при пустом зале — прямой минус',
    targets: ['service', 'queue'],
  });

  // Срочная закупка: стоимость оценивается по дефициту на вечер.
  const eveningGuests = Math.max(30, t.guests * 0.75);
  const order = buildAutoOrder(restaurant, 0.45, eveningGuests);
  let purchaseCost = 0;
  for (const item of order) {
    const ing = INGREDIENTS_MAP[item.ingredientId];
    if (ing) purchaseCost += item.quantity * ing.baseCost * (1 + URGENT_PURCHASE_MARKUP);
  }
  purchaseCost = Math.round(Math.min(purchaseCost, 280_000));
  options.push({
    id: 'urgent_purchase',
    title: 'Срочная закупка продуктов',
    icon: 'Truck',
    cost: purchaseCost,
    time: 'доставка ~1 час, с 17:00 на кухне',
    description: `Завхоз собрал срочный заказ на вечер (~${order.length} позиций, наценка +35%). Партии приходят сразу, стоп-листы снимаются.`,
    consequences: [
      'стоп-листы вечера закрываются',
      'выручка вечера сохраняется',
      `списание ${(purchaseCost / 1000).toFixed(0)} тыс ₽ из кассы сейчас`,
    ],
    riskNote: 'риск 0 по деньгам; FIFO-цена партий выше обычной',
    targets: ['stockout'],
  });

  const complexDishes = restaurant.menu.dishes
    .map((id) => dishOf(restaurant.menu, id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .filter((d) => d.prepMinutes >= 15 && !restaurant.menu.stopList.includes(d.id))
    .slice(0, 6);
  options.push({
    id: 'simplify_menu',
    title: 'Упростить меню на вечер',
    icon: 'ChefHat',
    cost: 0,
    time: 'с 16:00 до закрытия',
    description: `Снять ${complexDishes.length} сложных блюд (тех. время 15+ мин) до конца дня: кухня сконцентрируется на быстрых позициях.`,
    consequences: [
      'загрузка кухни −15–25% на пике',
      'часть гостей не найдёт любимое блюдо',
      'завтра блюда вернутся в меню автоматически',
    ],
    riskNote: 'риск низкий; лёгкий удар по Availability',
    targets: ['kitchen'],
  });

  options.push({
    id: 'express_sanitation',
    title: 'Экспресс-санобработка',
    icon: 'Sparkles',
    cost: 25_000,
    time: '~40 минут, зона не закрывается',
    description: 'Клининг-бригада моет зал и линии сейчас: чистота вверх, санитарный риск вниз.',
    consequences: [
      'чистота +25, санитарный риск −12',
      'комфортная атмосфера вечера (+удовлетворённость)',
      'страховка от проверки/жалоб',
    ],
    riskNote: 'риск 0',
    targets: ['sanitary', 'service'],
  });

  const kitchen = restaurant.equipment.kitchen;
  const repairCost = Math.round(kitchen.value * (kitchen.wear / 100) * 0.4);
  options.push({
    id: 'urgent_repair',
    title: 'Срочный ремонт кухни',
    icon: 'Wrench',
    cost: repairCost,
    time: 'инженер в течение часа',
    description: 'Механик разбирается с самым изношенным оборудованием кухни до вечернего пика (формула как обычный ремонт).',
    consequences: [
      'износ кухни −30',
      'технический риск −10',
      'качество исполнения блюд стабильнее',
    ],
    riskNote: 'риск 0; при износе <15 ремонт не нужен',
    targets: ['equipment', 'kitchen'],
  });

  // Показываем только релевантные проблемам карточки (ТЗ §8.6: варианты К событию).
  return options.filter((o) => o.targets.some((tgt) => ids.has(tgt as MiddayProblem['id'])));
}

/* ============================= ПРИМЕНЕНИЕ ДЕЙСТВИЙ ============================= */

/**
 * Применить экстренное решение к draft+run. День НЕ завершается — доигрывается
 * кнопкой «Продолжить день» (resumeDay). Деньги списываются СЕЙЧАС (addTransaction
 * 'emergency'), эффекты действуют на оставшиеся часы.
 */
export function applyEmergencyAction(
  draft: GameState,
  run: DayRunContext,
  actionId: EmergencyActionId,
): { ok: boolean; message: string } {
  const restaurant = draft.restaurant!;
  if (run.emergency.applied.includes(actionId)) {
    return { ok: false, message: 'Уже применено' };
  }
  const date = { ...run.date, hour: PAUSE_BEFORE_HOUR };

  switch (actionId) {
    case 'call_extra_staff': {
      const cost = callInCost();
      if (restaurant.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
      addTransaction(restaurant, date, 'emergency', cost, 'out', 'Экстренный вызов персонала (вечер)');
      restaurant.staff.callIns = [
        { day: dayIndex(run.date), roleId: 'hostess', count: 1 },
        { day: dayIndex(run.date), roleId: 'waiter', count: 1 },
      ];
      break;
    }
    case 'queue_compensation': {
      const queueGuests = Math.min(30, Math.max(1, Math.round(run.queue.reduce((s, q) => s + q.guests, 0))));
      const cost = queueGuests * 350;
      if (restaurant.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
      addTransaction(restaurant, date, 'emergency', cost, 'out', `Компенсация ожидания (${queueGuests} гостей)`);
      // Гости «остывают»: половина терпения возвращается (ТЗ §9.7 в обратную сторону).
      for (const q of run.queue) q.waitedMinutes = Math.round(q.waitedMinutes * 0.5);
      run.emergency.satisfactionBonus += 4;
      break;
    }
    case 'evening_discount': {
      // Цены масштабируются вниз до конца дня (finishDay восстановит).
      const k = 1 - 0.15;
      for (const id of Object.keys(restaurant.menu.prices)) {
        restaurant.menu.prices[id] = Math.max(1, Math.round(restaurant.menu.prices[id] * k));
      }
      run.emergency.discount = 0.15;
      run.emergency.demandLift *= 1.12; // walk-ins/сарафан на скидку
      run.emergency.satisfactionBonus += 2; // восприятие цены
      break;
    }
    case 'urgent_purchase': {
      const eveningGuests = Math.max(30, run.totals.guests * 0.75);
      const order = buildAutoOrder(restaurant, 0.45, eveningGuests);
      let cost = 0;
      const purchases: { ingredientId: string; quantity: number; unitCost: number }[] = [];
      for (const item of order) {
        const ing = INGREDIENTS_MAP[item.ingredientId];
        if (!ing) continue;
        const unitCost = ing.baseCost * (1 + URGENT_PURCHASE_MARKUP);
        if (cost + item.quantity * unitCost > 280_000) continue; // бюджет экстренности
        cost += item.quantity * unitCost;
        purchases.push({ ingredientId: item.ingredientId, quantity: item.quantity, unitCost });
      }
      cost = Math.round(cost);
      if (cost <= 0) return { ok: false, message: 'Дефицита не найдено' };
      if (restaurant.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
      addTransaction(restaurant, date, 'emergency', cost, 'out', `Срочная закупка на вечер (${purchases.length} позиций, +35%)`);
      // Партии приходят немедленно: arrivedAt = сейчас, expiresAt по сроку годности.
      const dayNow = dayIndex(run.date);
      for (const p of purchases) {
        const ing = INGREDIENTS_MAP[p.ingredientId];
        const exp = { ...run.date, day: run.date.day + Math.max(1, Math.floor(ing.shelfLifeDays)) };
        restaurant.inventory.batches.push({
          ingredientId: p.ingredientId,
          quantity: p.quantity,
          unitCost: p.unitCost,
          arrivedAt: { ...run.date },
          expiresAt: normalizeGameDate(exp, dayNow),
        });
      }
      break;
    }
    case 'simplify_menu': {
      const complexDishes = restaurant.menu.dishes
        .map((id) => dishOf(restaurant.menu, id))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .filter((d) => d.prepMinutes >= 15 && !restaurant.menu.stopList.includes(d.id))
        .slice(0, 6);
      for (const d of complexDishes) {
        restaurant.menu.stopList.push(d.id);
        run.emergency.tempStopList.push(d.id);
      }
      break;
    }
    case 'express_sanitation': {
      const cost = 25_000;
      if (restaurant.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
      addTransaction(restaurant, date, 'emergency', cost, 'out', 'Экспресс-санобработка зала');
      restaurant.cleanliness = clamp(restaurant.cleanliness + 25, 0, 100);
      restaurant.risks.sanitary = clamp(restaurant.risks.sanitary - 12, 0, 100);
      run.emergency.satisfactionBonus += 2;
      break;
    }
    case 'urgent_repair': {
      const kitchen = restaurant.equipment.kitchen;
      if (kitchen.wear < 15) return { ok: false, message: 'Износ низкий — ремонт не нужен' };
      const cost = Math.round(kitchen.value * (kitchen.wear / 100) * 0.4);
      if (restaurant.finance.cash < cost) return { ok: false, message: 'Недостаточно денег' };
      addTransaction(restaurant, date, 'emergency', cost, 'out', 'Срочный ремонт оборудования кухни');
      kitchen.wear = Math.max(0, kitchen.wear - 30);
      restaurant.risks.technical = clamp(restaurant.risks.technical - 10, 0, 100);
      break;
    }
  }

  run.emergency.applied.push(actionId);
  const label: Record<EmergencyActionId, string> = {
    call_extra_staff: 'Персонал вызван на вечер',
    queue_compensation: 'Компенсация выдана очереди',
    evening_discount: 'Скидка 15% до конца дня',
    urgent_purchase: 'Срочная закупка в пути (~1 час)',
    simplify_menu: 'Меню упрощено до конца дня',
    express_sanitation: 'Санобработка запущена',
    urgent_repair: 'Ремонтник выехал',
  };
  return { ok: true, message: label[actionId] };
}

/** Нормализация даты экспирации (день недели может вылезти за 6). */
function normalizeGameDate(d: { week: number; day: number; hour: number }, _dayNow: number) {
  let week = d.week;
  let day = d.day;
  while (day > 6) {
    day -= 7;
    week += 1;
  }
  return { week, day, hour: 8 };
}
