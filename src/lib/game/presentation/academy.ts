/**
 * ============================================================================
 * АКАДЕМИЯ УПРАВЛЯЮЩЕГО: ЖИВЫЕ ДАННЫЕ (бэклог «обучающие фичи»)
 * ============================================================================
 * Pure-функции от GameState: KPI-глоссарий с текущими значениями и нормами
 * (вкладка «Показатели») и приоритезированный разбор недели «причина →
 * следствие» (вкладка «Разбор недели»). Слой только читает состояние:
 * без RNG, без мутаций, без Date.now — эталоны движка не затрагиваются.
 */

import type { GameState } from '@/lib/game/types';
import type { ScreenId } from '@/lib/game/store/gameStore';
import type { LessonTrack } from '@/lib/game/content/lessons';
import { THRESHOLDS } from './thresholds';
import { avgWeeklyOut, runwayWeeks, anyOverdue } from './finance';
import { getWarehouseVisualState } from './warehouse';
import { serviceStatus } from '@/lib/game/config/equipmentService.config';

/** Статус метрики против нормы (для цвета и подписи). */
export type KpiStatus = 'good' | 'warn' | 'bad' | 'idle';

/** Карточка KPI на вкладке «Показатели». */
export interface KpiCardData {
  id: string;
  label: string;
  /** Отформатированное текущее значение. */
  value: string;
  /** Контекст: с чем сравниваем (динамика, разбор формулы в числах). */
  sub?: string;
  /** Что это такое — простым языком. */
  definition: string;
  /** Формула расчёта (строкой). */
  formula: string;
  /** Рыночный ориентир. */
  norm: string;
  status: KpiStatus;
  advice: string;
  /** Куда идти действовать. */
  screen?: ScreenId;
  /** Связанные уроки (id из content/lessons). */
  lessons?: string[];
  track: LessonTrack;
}

/** Одна проблема «Разбора недели»: цепочка причина → следствие. */
export interface DebriefIssue {
  id: string;
  severity: 'critical' | 'warning';
  /** Следствие — человеческим языком. */
  title: string;
  /** Цепочка шагов (без стрелок, UI их нарисует). */
  chain: string[];
  /** Что делать. */
  action: string;
  screen?: ScreenId;
}

/* ------------------------------ ХЕЛПЕРЫ ------------------------------ */

const fmtPct = (v: number, digits = 1): string => `${(v * 100).toFixed(digits)}%`;

/** Средневзвешенная усталость/мораль по ролям с штатом > 0. */
function weightedStaffMetric(state: GameState, field: 'fatigue' | 'morale'): number | null {
  const pools = Object.values(state.restaurant?.staff.pools ?? {});
  let sum = 0;
  let count = 0;
  for (const p of pools) {
    if (p.count <= 0) continue;
    sum += p[field] * p.count;
    count += p.count;
  }
  return count > 0 ? sum / count : null;
}

/** Усталость «кухни» (шеф + горячий/холодный цех) — драйвер качества блюд. */
function kitchenFatigue(state: GameState): number | null {
  const pools = state.restaurant?.staff.pools;
  if (!pools) return null;
  const ids = (['head_chef', 'hot_cook', 'cold_cook'] as const).map((id) => pools[id]).filter(Boolean);
  let sum = 0;
  let count = 0;
  for (const p of ids) {
    if (p.count <= 0) continue;
    sum += p.fatigue * p.count;
    count += p.count;
  }
  return count > 0 ? sum / count : null;
}

/** Доля потерянных гостей из очереди за последние дни (0..1). */
function lostShare(state: GameState): number | null {
  const logs = state.history.dayLogs.slice(-7);
  if (logs.length === 0) return null;
  const guests = logs.reduce((s, l) => s + l.kpi.guests, 0);
  const lost = logs.reduce((s, l) => s + l.kpi.lostGuests, 0);
  const total = guests + lost;
  return total > 0 ? lost / total : null;
}

/** Худшая зона оборудования: износ + статус обслуживания. */
function worstZone(state: GameState): { name: string; wear: number; status: 'protected' | 'fresh' | 'neglected'; days: number } | null {
  const eq = state.restaurant?.equipment;
  if (!eq) return null;
  const absDay = (state.week - 1) * 7 + state.day;
  const zones = [
    { name: 'Кухня', zone: eq.kitchen },
    { name: 'Кофе', zone: eq.coffee },
    { name: 'Зал', zone: eq.hall },
  ];
  let worst: { name: string; wear: number; status: 'protected' | 'fresh' | 'neglected'; days: number } | null = null;
  for (const z of zones) {
    const st = serviceStatus(z.zone.lastServicedAt, absDay);
    const days = z.zone.lastServicedAt == null ? 999 : absDay - z.zone.lastServicedAt;
    if (!worst || z.zone.wear > worst.wear) worst = { name: z.name, wear: z.zone.wear, status: st, days };
  }
  return worst;
}

/* --------------------------- KPI-ГЛОССАРИЙ --------------------------- */

export function buildKpis(state: GameState): KpiCardData[] {
  const ws = state.history.weekStats.at(-1);
  const prev = state.history.weekStats.at(-2);
  const pnl = state.weekResult?.pnl;
  const r = state.restaurant;
  if (!ws || !r) return [];

  const runway = runwayWeeks(state);
  const fatigue = weightedStaffMetric(state, 'fatigue');
  const morale = weightedStaffMetric(state, 'morale');
  const coverDays = getWarehouseVisualState(state).coverDays;
  const wasteShare = ws.revenue > 0 ? ws.wasteCost / ws.revenue : 0;
  const lost = lostShare(state);
  const worst = worstZone(state);
  const prime = ws.foodCost + ws.laborCost;
  const ebitdaMargin = pnl && pnl.revenue > 0 ? pnl.operatingProfit / pnl.revenue : ws.revenue > 0 ? ws.netProfit / ws.revenue : 0;
  const netMargin = ws.revenue > 0 ? ws.netProfit / ws.revenue : 0;

  const kpis: KpiCardData[] = [
    {
      id: 'food-cost',
      label: 'Food Cost',
      value: fmtPct(ws.foodCost),
      sub: prev ? `неделю назад: ${fmtPct(prev.foodCost)}` : 'первая закрытая неделя',
      definition: 'Доля себестоимости проданной еды в выручке. Главный рычаг валовой прибыли.',
      formula: '(Себестоимость проданного + потери) / выручка',
      norm: '28–35% · тревога выше 36%',
      status: ws.foodCost <= 0.35 ? 'good' : ws.foodCost <= THRESHOLDS.foodCost.warning ? 'warn' : 'bad',
      advice:
        ws.foodCost > 0.35
          ? 'Ищите потери: порча, выход порций, цены закупки. Меню — убрать/переоценить позиции с низкой маржой.'
          : 'В норме: держите инвентаризацию еженедельно, чтобы не «поплыть».',
      screen: 'menu',
      lessons: ['food-cost', 'prime-cost'],
      track: 'finance',
    },
    {
      id: 'labor-cost',
      label: 'Labor Cost',
      value: fmtPct(ws.laborCost),
      sub: pnl ? `ФОТ+взносы: ${Math.round(ws.payroll)} ₽ (гросс за неделю)` : undefined,
      definition: 'Доля оплаты труда со страховыми взносами в выручке. Вторая половина Prime Cost.',
      formula: '(Оклады + сдельно + страховые взносы) / выручка',
      norm: '25–32% · тревога выше 37%',
      status: ws.laborCost <= 0.32 ? 'good' : ws.laborCost <= 0.37 ? 'warn' : 'bad',
      advice:
        ws.laborCost > 0.32
          ? 'Проверьте график под почасовой спрос: пустые утренние смены в дорогу, недоукомплектованные пики — в убыток.'
          : 'В норме: следите за усталостью — она «съедает» качество раньше, чем бюджет.',
      screen: 'schedule',
      lessons: ['scheduling', 'prime-cost'],
      track: 'team',
    },
    {
      id: 'prime-cost',
      label: 'Prime Cost',
      value: fmtPct(prime),
      sub: 'еда + люди = главные переменные расходы',
      definition: 'Сумма Food Cost и Labor Cost — то, что управленец реально контролирует каждую неделю.',
      formula: 'Food Cost % + Labor Cost %',
      norm: '55–67% · красная зона выше 72%',
      status: prime <= 0.67 ? 'good' : prime <= 0.72 ? 'warn' : 'bad',
      advice:
        prime > 0.67
          ? 'Один процент Prime Cost = примерно процент операционной прибыли. Считайте еженедельно и разбирайте отклонения.'
          : 'Здоровая зона: каждый удержанный процент идёт прямо в прибыль.',
      screen: 'analytics',
      lessons: ['prime-cost'],
      track: 'finance',
    },
    {
      id: 'ebitda',
      label: 'Операционная маржа (EBITDA)',
      value: fmtPct(ebitdaMargin),
      sub: pnl ? `операционная прибыль ${Math.round(pnl.operatingProfit).toLocaleString('ru-RU')} ₽` : undefined,
      definition: 'Сколько зарабатывает сам ресторан до кредитов, налогов и амортизации.',
      formula: 'Операционная прибыль (P&L) / выручка',
      norm: '10–20%',
      status: ebitdaMargin >= 0.1 ? 'good' : ebitdaMargin >= 0.05 ? 'warn' : 'bad',
      advice:
        ebitdaMargin < 0.1
          ? 'Разбирайте P&L сверху вниз: какая статья съела маржу относительно нормы.'
          : 'Хороший уровень: часть маржи направляйте в буфер и развитие, не только в дивиденды.',
      screen: 'finance',
      lessons: ['read-pnl'],
      track: 'finance',
    },
    {
      id: 'net-margin',
      label: 'Чистая маржа',
      value: fmtPct(netMargin),
      sub: `чистая прибыль недели: ${Math.round(ws.netProfit).toLocaleString('ru-RU')} ₽`,
      definition: 'Что остаётся после всех расходов, включая кредиты и налоги. «Зарплата ресторана».',
      formula: 'Чистая прибыль / выручка',
      norm: '5–10%',
      status: netMargin >= 0.05 ? 'good' : netMargin >= 0 ? 'warn' : 'bad',
      advice:
        netMargin < 0
          ? 'Убыток: временен (реклама, разовый ремонт) или системен (Prime Cost/аренда)? Системный лечится только рычагами.'
          : 'Проверяйте, что из этой прибыли формируется буфер кассы — см. взлётную полосу.',
      screen: 'finance',
      lessons: ['read-pnl', 'profit-not-cash'],
      track: 'finance',
    },
    {
      id: 'avg-check',
      label: 'Средний чек',
      value: `${Math.round(ws.avgCheck).toLocaleString('ru-RU')} ₽`,
      sub: prev ? `динамика: ${ws.avgCheck >= prev.avgCheck ? '+' : ''}${fmtPct((ws.avgCheck - prev.avgCheck) / Math.max(1, prev.avgCheck))}` : undefined,
      definition: 'Сколько платит средний гость за визит. Растёт от десертов/напитков и структуры меню, а не от «накрутки».',
      formula: 'Выручка / число гостей',
      norm: 'зависит от концепции; следите за динамикой',
      status: 'idle',
      advice: 'Растите чек структурой меню (комбо, сезонные позиции), а не индексацией цен «вслепую» — спрос эластичен.',
      screen: 'menu',
      lessons: ['food-cost'],
      track: 'guests',
    },
    {
      id: 'returning',
      label: 'Доля возвратных гостей',
      value: fmtPct(ws.returningShare, 0),
      definition: 'Какая часть трафика — люди, уже бывавшие у вас. Возвратный гость дешевле нового и берёт больше.',
      formula: 'Возвратные визиты / все визиты',
      norm: '15–30% для зрелого ресторана',
      status: ws.returningShare >= 0.15 ? 'good' : ws.returningShare >= 0.08 ? 'warn' : 'bad',
      advice:
        ws.returningShare < 0.15 && state.week >= 4
          ? 'Ниже нормы: сначала качество визита (очередь, стоп-листы, чистота), потом маркетинг — иначе сливаете бюджет на разочарование.'
          : 'Держите качество визита стабильным — это главный двигатель возвратов.',
      screen: 'reviews',
      lessons: ['retention'],
      track: 'guests',
    },
    {
      id: 'satisfaction',
      label: 'Удовлетворённость гостей',
      value: `${ws.satisfaction.toFixed(0)}/100`,
      sub: prev ? `неделю назад: ${prev.satisfaction.toFixed(0)}` : undefined,
      definition: 'Средняя оценка визита обслуженных гостей. Опережающий индикатор рейтинга и возвратов.',
      formula: 'Средняя по когортам дня (0..100)',
      norm: '≥85 · ниже 68 — красная зона',
      status: ws.satisfaction >= 85 ? 'good' : ws.satisfaction >= 68 ? 'warn' : 'bad',
      advice:
        ws.satisfaction < 85
          ? 'Обычные драйверы падения: время ожидания (очередь/стоп-листы), качество блюд (усталость кухни/износ), грязь.'
          : 'Отлично: это конвертируется в рейтинг, возвраты и сарафан.',
      screen: 'analytics',
      lessons: ['retention', 'reviews-power'],
      track: 'guests',
    },
    {
      id: 'rating',
      label: 'Рейтинг',
      value: `${r.reputation.rating.toFixed(2)} ★`,
      sub: r.reputation.unansweredNeg ? `неотвеченных негативных: ${r.reputation.unansweredNeg}` : undefined,
      definition: 'Байесовский средний отзыв (учитывает объём и вес скандалов). Конверсия новых гостей зависит от него.',
      formula: 'Взвешенное среднее отзывов (окно 100 + априор)',
      norm: '≥4,3 · тревога ниже 4,0',
      status: r.reputation.rating >= 4.3 ? 'good' : r.reputation.rating >= 4.0 ? 'warn' : 'bad',
      advice:
        r.reputation.rating < 4.3
          ? 'Отвечайте на негатив (экран «Отзывы») и чините причину: отзывы — следствие, качество визита — причина.'
          : 'Держите темп: отвечайте на негативные, чтобы конверсия не проседала.',
      screen: 'reviews',
      lessons: ['reviews-power'],
      track: 'guests',
    },
    {
      id: 'runway',
      label: 'Взлётная полоса кассы',
      value: `${runway.toFixed(1)} нед`,
      sub: `отток ~${Math.round(avgWeeklyOut(state) / 1000).toLocaleString('ru-RU')} тыс ₽/нед`,
      definition: 'Сколько недель ресторан проживёт при текущих расходах, если выручка станет нулевой. Прибыль ≠ деньги.',
      formula: 'Касса / средний недельный отток',
      norm: '8+ нед — здоровый запас · <4 — опасно',
      status: runway >= 8 ? 'good' : runway >= 4 ? 'warn' : 'bad',
      advice:
        runway < 4
          ? 'Сократите крупные оттоки, проверьте календарь платежей (аренда/кредит) — кассовый разрыв убивает быстрее убытков.'
          : 'Хороший запас: резервируйте под большие платежи и непредвиденное.',
      screen: 'finance',
      lessons: ['profit-not-cash'],
      track: 'finance',
    },
    {
      id: 'waste',
      label: 'Потери (порча и брак)',
      value: fmtPct(wasteShare),
      sub: `≈ ${Math.round(ws.wasteCost).toLocaleString('ru-RU')} ₽ за неделю`,
      definition: 'Стоимость испорченного и списанного напрямую съедает валовую маржу.',
      formula: 'Потери склада + брак кухни / выручка',
      norm: 'до 3% — рабочая · выше 5% — системная проблема',
      status: wasteShare <= 0.03 ? 'good' : wasteShare <= 0.05 ? 'warn' : 'bad',
      advice:
        wasteShare > 0.03
          ? 'Проверьте покрытие склада (цель автозаказа) и FIFO: переизбыток скоропорта — главный источник порчи.'
          : 'В рабочей зоне: продолжайте еженедельную сверку остатков.',
      screen: 'warehouse',
      lessons: ['stock-cover'],
      track: 'operations',
    },
    {
      id: 'lost-guests',
      label: 'Потерянные в очереди',
      value: lost == null ? '—' : fmtPct(lost, 0),
      sub: 'доля гостей, ушедших из очереди (7 дней)',
      definition: 'Гости, которые пришли, но не сели: очередь длиннее терпения. Выручка и репутация теряются одновременно.',
      formula: 'Ушедшие из очереди / (обслуженные + ушедшие)',
      norm: 'до 5% · выше 12% — красная',
      status: lost == null ? 'idle' : lost <= 0.05 ? 'good' : lost <= 0.12 ? 'warn' : 'bad',
      advice:
        lost != null && lost > 0.05
          ? 'Усильте пиковые смены (график по часам) или сократите время стола — очередь дороже лишней смены.'
          : 'В норме: следите за вечерами пятницы/субботы, там очередь рождается первой.',
      screen: 'schedule',
      lessons: ['scheduling'],
      track: 'operations',
    },
    {
      id: 'equipment',
      label: 'Износ оборудования',
      value: worst ? `${worst.wear.toFixed(0)}/100` : '—',
      sub: worst ? `худшая зона: ${worst.name}${worst.status === 'neglected' ? ' · без ТО' : worst.status === 'protected' ? ' · ТО недавно' : ''}` : undefined,
      definition: 'Износ растёт от загрузки; выше 60 — риск поломок, выше 80 — «ждём беды». ТО замедляет износ, запущенность ускоряет.',
      formula: 'Максимальный износ зоны (кухня/кофе/зал)',
      norm: '<40 хорошо · 60+ тревога · 80+ критично',
      status: !worst ? 'idle' : worst.wear < THRESHOLDS.wear.great ? 'good' : worst.wear < THRESHOLDS.wear.warning ? 'warn' : 'bad',
      advice:
        worst && worst.wear >= 60
          ? 'Профилактика дешевле ремонта (≈8% стоимости): не доводите до поломки в пик — простой стоит дороже обоих.'
          : 'Регулярное ТО каждые ~4 недели удерживает риск поломок почти вдвое ниже.',
      screen: 'equipment',
      lessons: ['prevention'],
      track: 'operations',
    },
    {
      id: 'fatigue',
      label: 'Усталость команды',
      value: fatigue == null ? '—' : `${fatigue.toFixed(0)}/100`,
      sub: morale != null ? `мораль: ${morale.toFixed(0)}/100` : undefined,
      definition: 'Копится от переработок. Выше 60 падает качество, выше 80 — ошибки и увольнения.',
      formula: 'Средневзвешенно по ролям со штатом',
      norm: '<30 отлично · 60+ тревога · 80+ критично',
      status: fatigue == null ? 'idle' : fatigue < THRESHOLDS.fatigue.warning ? 'good' : fatigue < THRESHOLDS.fatigue.critical ? 'warn' : 'bad',
      advice:
        fatigue != null && fatigue >= 60
          ? 'Переработки: разгрузите график (пики ≠ все смены), премия/тренинг восстанавливают мораль и усталость.'
          : 'Держите запас прочности: пятничные пики должны покрываться свежей сменой.',
      screen: 'staff',
      lessons: ['scheduling', 'turnover-cost'],
      track: 'team',
    },
    {
      id: 'cover',
      label: 'Покрытие склада',
      value: `${coverDays.toFixed(1)} дн`,
      definition: 'На сколько дней хватит остатков при текущем темпе продаж. Меньше 1 — стоп-листы, больше 5 — замороженные деньги.',
      formula: 'Остатки (в позициях) / дневная потребность',
      norm: '1,5–3 дня по скоропорту',
      status: coverDays >= 1.5 && coverDays <= 3 ? 'good' : coverDays > 5 || coverDays < 0.5 ? 'bad' : 'warn',
      advice:
        coverDays > 5
          ? 'Переизбыток: снизьте цель автозаказа — порча почти неизбежна при таком запасе.'
          : coverDays < 1.5
            ? 'Дефицит: поднимите цель автозаказа или проверьте сбои поставок — стоп-лист дороже.'
            : 'Золотая середина: продолжайте сверять цель с динамикой выручки.',
      screen: 'warehouse',
      lessons: ['stock-cover'],
      track: 'operations',
    },
  ];

  return kpis;
}

/* --------------------------- РАЗБОР НЕДЕЛИ --------------------------- */

export function buildDebrief(state: GameState): { issues: DebriefIssue[]; healthy: boolean } {
  const ws = state.history.weekStats.at(-1);
  const prev = state.history.weekStats.at(-2);
  const r = state.restaurant;
  const issues: DebriefIssue[] = [];
  if (!ws || !r) return { issues, healthy: true };

  const runway = runwayWeeks(state);
  const cash = r.finance.cash;
  const out = avgWeeklyOut(state);

  // 1. Кассовая безопасность.
  if (runway < THRESHOLDS.runway.critical) {
    issues.push({
      id: 'runway-critical',
      severity: 'critical',
      title: 'Касса на исходе: недели до нуля',
      chain: [
        `касса ${Math.round(cash / 1000).toLocaleString('ru-RU')} тыс ₽ при оттоке ${Math.round(out / 1000).toLocaleString('ru-RU')} тыс ₽/нед`,
        `взлётная полоса ${runway.toFixed(1)} нед — меньше критического порога`,
        'любая мелочь (поломка, штраф) = неплатёжеспособность',
      ],
      action: 'Немедленно: сокращайте крупные оттоки, проверьте календарь платежей; кредит — только если разрыв временный.',
      screen: 'finance',
    });
  } else if (runway < THRESHOLDS.runway.warning) {
    issues.push({
      id: 'runway-warn',
      severity: 'warning',
      title: 'Запас кассы тоньше нормы',
      chain: [
        `взлётная полоса ${runway.toFixed(1)} нед (норма ≥ 4)`,
        'аренда/ФОТ/кредит не оставят манёвра при сбое',
      ],
      action: 'Резервируйте под ближайшие большие платежи, притормозите необязательные расходы.',
      screen: 'finance',
    });
  }
  if (anyOverdue(state)) {
    issues.push({
      id: 'overdue',
      severity: 'critical',
      title: 'Просроченные платежи по кредиту',
      chain: ['есть просрочки', 'банк повышает ставку и портит отношения', 'дальше — требование досрочного погашения'],
      action: 'Погасите просрочку в приоритете перед всем остальным — это самый дорогой долг.',
      screen: 'loans',
    });
  }

  // 2. Качество визита: усталость → качество → рейтинг → спрос.
  const kf = kitchenFatigue(state);
  if (kf != null && kf >= THRESHOLDS.fatigue.warning) {
    issues.push({
      id: 'fatigue',
      severity: kf >= THRESHOLDS.fatigue.critical ? 'critical' : 'warning',
      title: 'Усталая кухня портит качество блюд',
      chain: [
        `усталость кухонной бригады ${kf.toFixed(0)}/100`,
        'качество блюд проседает, ошибки растут',
        `удовлетворённость ${ws.satisfaction.toFixed(0)}/100 → отзывы хуже → рейтинг ${r.reputation.rating.toFixed(2)}`,
        'рейтинг ниже 4,0 режет конверсию новых гостей',
      ],
      action: 'Разгрузите график пик-смена ≠ все смены; премия/тренинг снимают усталость и мораль.',
      screen: 'schedule',
    });
  }

  // 3. Оборудование: износ + обслуживание.
  const worst = worstZone(state);
  if (worst && worst.wear >= THRESHOLDS.wear.warning) {
    const negl = worst.status === 'neglected';
    issues.push({
      id: 'equipment',
      severity: worst.wear >= THRESHOLDS.wear.critical ? 'critical' : 'warning',
      title: `Оборудование на грани: ${worst.name.toLowerCase()} ${worst.wear.toFixed(0)}/100`,
      chain: negl
        ? [
            `зона «${worst.name}» без обслуживания ${worst.days > 900 ? 'давно' : `${worst.days} дн`}`,
            'запущенность: износ ×1,3, поломки ×1,6',
            `износ уже ${worst.wear.toFixed(0)} — поломка в пик = простой + стоп-листы + потерянная выручка`,
          ]
        : [
            `износ зоны «${worst.name}» ${worst.wear.toFixed(0)}/100`,
            'вероятность поломки растёт с износом',
            'поломка в пик = простой станции, стоп-листы, злые гости',
          ],
      action: 'Профилактика (≈8% стоимости) сразу; ремонт — если износ уже критический. Не ждите поломки в пятницу.',
      screen: 'equipment',
    });
  } else if (worst && worst.status === 'neglected') {
    issues.push({
      id: 'equipment-neglect',
      severity: 'warning',
      title: `Оборудование без обслуживания: ${worst.name.toLowerCase()}`,
      chain: [
        `без ТО ${worst.days > 900 ? 'с установки' : `${worst.days} дн`}`,
        'износ растёт ×1,3, поломки ×1,6 (запущенность)',
        'дешёвое «потом» превращается в дорогой «сейчас»',
      ],
      action: 'Одно ТО в ~4 недели на зону — дешевле любого ремонта и тем более простоя.',
      screen: 'equipment',
    });
  }

  // 4. Экономика еды.
  if (ws.foodCost > THRESHOLDS.foodCost.warning) {
    const wasteShare = ws.revenue > 0 ? ws.wasteCost / ws.revenue : 0;
    issues.push({
      id: 'fc',
      severity: ws.foodCost > THRESHOLDS.foodCost.critical ? 'critical' : 'warning',
      title: `Food Cost ${fmtPct(ws.foodCost)} — выше нормы`,
      chain: [
        `себестоимость+потери съедают ${fmtPct(ws.foodCost)} выручки (норма ≤ 35%)`,
        wasteShare > 0.03 ? `из них потери ${fmtPct(wasteShare)} — порча/брак` : 'порча в норме — ищите в закупках/выходе/миксе',
        'каждый лишний процент FC — минус процент операционной маржи',
      ],
      action: 'Проверьте покрытие склада и режим закупки (цены/качество входа), выведите из меню низкомаржинальные позиции.',
      screen: 'menu',
    });
  }

  // 5. Очередь и потерянные гости.
  const lost = lostShare(state);
  if (lost != null && lost > THRESHOLDS.lostShare.unhappy) {
    issues.push({
      id: 'queue',
      severity: lost > 0.2 ? 'critical' : 'warning',
      title: `Гости уходят из очереди: ${fmtPct(lost, 0)}`,
      chain: [
        'очередь в пики длиннее терпения гостей',
        `потеряно ${Math.round(state.history.dayLogs.slice(-7).reduce((s, l) => s + l.kpi.lostGuests, 0))} гостей за неделю`,
        'недополученная выручка + риск негативных отзывов про «не дождались»',
      ],
      action: 'Усильте пиковые смены (график по часам) — дороже только потерянные гости навсегда.',
      screen: 'schedule',
    });
  }

  // 6. Отзывы: неотвеченный негатив.
  const un = r.reputation.unansweredNeg ?? 0;
  if (un > 0) {
    issues.push({
      id: 'reviews',
      severity: un >= 10 ? 'critical' : 'warning',
      title: `Неотвеченных негативных отзывов: ${un}`,
      chain: [
        'жалобы ≤3,5★ без ответа',
        'конверсия новых гостей падает, юр. риск растёт каждую неделю',
        'Роспотребнадзор читает те же площадки',
      ],
      action: 'Ответьте на все (экран «Отзывы», одна операция) — конверсия восстанавливается, риск спадает.',
      screen: 'reviews',
    });
  }

  // 7. Возвратность (после 4 недель, когда метрика устоялась).
  if (state.week >= 4 && ws.returningShare < 0.1) {
    issues.push({
      id: 'retention',
      severity: 'warning',
      title: `Возвратных гостей всего ${fmtPct(ws.returningShare, 0)}`,
      chain: [
        'гости не возвращаются после первого визита',
        'маркетинг «арендует» трафик вместо того, чтобы строить базу',
        'CAC растёт, а LTR нет',
      ],
      action: 'Почините качество первого визита (очередь/стоп-листы/чистота) до новых вложений в привлечение.',
      screen: 'reviews',
    });
  }

  // 8. Мораль → увольнения.
  const morale = weightedStaffMetric(state, 'morale');
  if (morale != null && morale < THRESHOLDS.morale.warning) {
    issues.push({
      id: 'morale',
      severity: morale < THRESHOLDS.morale.critical ? 'critical' : 'warning',
      title: `Мораль команды ${morale.toFixed(0)}/100 — риск увольнений`,
      chain: [
        'недовольство копится (переработки, несправедливость)',
        'вероятность увольнений растёт',
        'замена одного сотрудника ≈ 1–3 оклада + брак новичков + нагрузка на остальных',
      ],
      action: 'Премия вовремя, тренинг, страховка — дешевле, чем вербовать половину команды.',
      screen: 'staff',
    });
  }

  // 9. Сбои поставок.
  const supplyErr = r.inventory.supplyErrorsWeek ?? 0;
  if (supplyErr > 0) {
    issues.push({
      id: 'supply',
      severity: supplyErr >= 3 ? 'warning' : 'warning',
      title: `Сбои поставок за неделю: ${supplyErr}`,
      chain: [
        'поставщик недовозит позиции',
        'стоп-листы и срочные закупки по завышенной цене',
        'пассивная реакция = хроническая дыра в качестве и FC',
      ],
      action: 'Смените режим закупки (эконом→стандарт/премиум) или поднимите цель автозаказа — сбои стоят дороже разницы цен.',
      screen: 'warehouse',
    });
  }

  // 10. Доверие владельца.
  const trust = r.finance.ownerTrust;
  if (typeof trust === 'number' && trust < 35) {
    issues.push({
      id: 'owner-trust',
      severity: trust < 25 ? 'critical' : 'warning',
      title: `Доверие владельца ${trust.toFixed(0)}/100`,
      chain: [
        'владелец недоволен денежной дисциплиной',
        'близко «Разговор с владельцем» с требованием выплат из оборотки',
        'ниже 15 — смена управляющего и конец игры',
      ],
      action: 'Выплатите дивиденды при первой возможности и держите буфер кассы — доверие восстанавливается медленно.',
      screen: 'finance',
    });
  }

  // 11. Убывающая динамика выручки (2 недели подряд).
  if (prev && prev.revenue > 0 && ws.revenue < prev.revenue * 0.9 && state.history.weekStats.length >= 3) {
    issues.push({
      id: 'demand-drop',
      severity: 'warning',
      title: 'Выручка падает вторую неделю',
      chain: [
        `неделя ${ws.week}: −${fmtPct(1 - ws.revenue / prev.revenue, 0)} к предыдущей`,
        'спрос снижается: рейтинг? конкуренты? маркетинг завершился?',
        'при падении ниже точки безубыточности убыток ускоряется',
      ],
      action: 'Проверьте рейтинг/отзывы и запущенные кампании; временные акции — быстрая поддержка трафика.',
      screen: 'marketing',
    });
  }

  const order = { critical: 0, warning: 1 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, healthy: issues.length === 0 };
}
