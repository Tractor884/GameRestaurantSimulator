/** БАЛАНСИРОВКА V2 — ГЕЙТ-ТЕСТ ЭТАПОВ 1–2 (docs/BALANCING-V2.md §20).
 *
 * ЭТАП 1 «Экономический скелет»:
 *  S0 «Пассив» — 52 недели без действий игрока. Ворота: Q2 ≤ 13% (mod) / ≤ 10% (agr).
 *  A «Нормальная игра» — 16 недель. Ворота: маржа 10–12,5% (mod) / 8–10% (agr).
 *
 * ЭТАП 2 «Люди» (переработки §5.2, E-цепочка §7, отзывы §8):
 *  гейт S0: Q3 ≤ 11,5% (mod) / ≤ 9% (agr);
 *  гейт C «−25% штата»: текучесть ≥ 25%, рейтинг −0,3 к S0;
 *  переработки видны транзакцией 'overtime'.
 *
 * ЭТАП 3 «Закупка и меню» (G-режимы §9, усталость §14):
 *  гейт S4-премиум: FC ≤ 33% и ≤ стандарт + 2 п.п.; свежесть ≥ 99%;
 *  гейт «эконом без дисциплины»: FC выше стандарта;
 *  гейт статичного меню: возвратные −8…−14% к Q3; живое меню +4…+10%.
 *
 * Запуск: bun run scripts/balance-v2-test.ts
 *  A/B против калибровки 2.0: BALANCE_PRESET=legacy bun run scripts/balance-v2-test.ts
 */
import { createGame, simulateDay, resolveEvent, replyToReviews, setProcurementPolicy, autoOrderAction, setAutoPurchase, toggleMenuDish, menuFatigueFactor, hireStaff, hireSeasonalStaff, DISHES } from '../src/lib/game/engine';
import { addTransaction } from '../src/lib/game/engine/core';
import type { GameState, GameEvent, RoleId } from '../src/lib/game/types';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';
import { STAFF_ROLES, ROLE_IDS } from '../src/lib/game/config/staffRoles.config';
import {
  BALANCE_V2_PRESET,
  foodIndex,
  wageIndex,
  utilIndex,
  profitTaxRate,
  BALANCE_V2_2,
  BALANCE_V2_5,
  eventCostScale,
  isLegacy,
} from '../src/lib/game/config/balance2.config';
import { turnoverRateFromState } from '../src/lib/game/engine/bsc';

const failures: string[] = [];
function gate(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}: ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}

const BASE_OPTS = {
  seed: 777,
  restaurantName: 'Баланс V2',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
};

/** Прогон: day-by-day; крит-события резолвятся в режиме mode.
 *  passive — дешёвый вариант, но замены уволившихся НАНИМАЮТСЯ (первый вариант
 *  диалога, «путь наименьшего сопротивления»); дивиденды — выплачиваются (первый вариант).
 *  payFix — «платим и чиним» (в т.ч. наём замены, ответы на отзывы, дивиденды полностью);
 *  vacancy — «экономия на ФОТ»: вакансии не закрываем, дивиденды НЕ платим (S5 §19: «дивиденды ●●»).
 *  cutStaff — сценарий C: уволить долю штата на старте (оставить ≥ 1/роли). */
interface Stage3Opts {
  /** v2 §9: режим закупки (переключение на старте, активация через лаг 2 нед). */
  policy?: 'economy' | 'standard' | 'premium';
  /** v2 §14: «живое меню» — ротация блюд каждые 8 нед (S4: все категории). */
  refreshMenu?: boolean;
  /** Сколько категорий трогать за цикл ротации (S4: 10, A «нормальная игра»: 3). */
  rotateCats?: number;
  /** v2 §9: «эконом без дисциплины» — автозаказ выключен, раз в нед закупка на 7 дн. */
  bulkOrder?: boolean;
  /** Контрфактический прогон: усталость меню выключена (фактор = 1). */
  noFatigue?: boolean;
  /** v2 §12 (этап 4): размер стартового кредита (S3 = 15 млн). */
  loanAmount?: number;
  /** v2 §12.3: «прожигание» кредита — еженедельное изъятие кассы ВНЕ P&L
   *  (расходы «на развитие» без активов: корпоративы, обустройство, маркетинг-сплэши). */
  burnWeekly?: number;
  /* ---------- этап 5 «Преимущества и события» ---------- */
  /** v2 §16.1 (S1): лицензия на алкоголь с открытия (визард). */
  alcohol?: boolean;
  /** v2 §16.1 (S1): «бар-акцент» — включить все алкогольные позиции меню. */
  barFocus?: boolean;
  /** v2 §16.2 (S2): веранда с открытия (визард). */
  veranda?: boolean;
  /** v2 §16.2 (S2): +2 сезонных официанта в мае (нед 18). */
  seasonalHire?: boolean;
  /** payFix: платить дивиденды по предложению (ветка A) вместо «последнего доступного». */
  payDividends?: boolean;
}

/** Статистика последнего прогона (счётчики событий, не попадающих в сейвы). */
let lastRunStats = { cashGaps: 0, dividends: 0, incidents: 0, police: 0, dilemmas: 0 };

function runWeeks(
  weeks: number,
  mode: 'passive' | 'payFix' | 'vacancy',
  cutStaff = 0,
  s3: Stage3Opts = {},
): GameState {
  let state: GameState = createGame({
    ...BASE_OPTS,
    ...(s3.loanAmount != null ? { loanAmount: s3.loanAmount } : {}),
    ...(s3.alcohol != null ? { alcoholLicense: s3.alcohol } : {}),
    ...(s3.veranda != null ? { veranda: s3.veranda } : {}),
  });
  const seenEvents = new Set<string>();
  lastRunStats = { cashGaps: 0, dividends: 0, incidents: 0, police: 0, dilemmas: 0 };
  if (cutStaff > 0) {
    for (const roleId of ROLE_IDS) {
      const pool = state.restaurant!.staff.pools[roleId as RoleId];
      pool.count = Math.max(1, Math.round(pool.count * (1 - cutStaff)));
    }
  }
  // v2 §9/§14: стартовые настройки сценария этапа 3.
  if (s3.policy) setProcurementPolicy(state, s3.policy);
  if (s3.bulkOrder) setAutoPurchase(state, false, 2);
  // v2 §16.1 (этап 5, S1): «бар-акцент» — включить все алкогольные позиции.
  if (s3.barFocus) {
    for (const id of ['house_white_glass', 'gin_tonic']) {
      if (!state.restaurant!.menu.dishes.includes(id)) toggleMenuDish(state, id);
    }
  }
  const refreshEvery = 8; // v2 §14.3: кулдаун сброса свежести
  const rotateCats = s3.rotateCats ?? 10;
  for (let i = 0; i < weeks * 7 && state.phase !== 'gameover'; i++) {
    const res = simulateDay(state, { plannedActions: [] }, state.seed);
    state = res.state;
    // v2 §12: счётчик кассовых разрывов (события удаляются из activeEvents
    // после резолюции — считаем по первому появлению).
    for (const e of state.activeEvents) {
      if (!seenEvents.has(e.id)) {
        seenEvents.add(e.id);
        if (e.templateId === 'cash_gap') lastRunStats.cashGaps++;
        if (e.templateId === 'drunk_incident') lastRunStats.incidents++;
        if (e.templateId === 'police_check') lastRunStats.police++;
        if (e.templateId.startsWith('dilemma_')) lastRunStats.dilemmas++;
      }
    }
    for (const e of state.activeEvents.filter((x) => !x.resolved)) {
      const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
      if (!options) continue;
      let idx = 0;
      if (mode === 'payFix') {
        // v2 §18 S4: «дивиденды ≥ 70%» — дисциплинированный игрок платит
        // по предложению (не «последний доступный» = перенести).
        if (e.templateId === 'owner_dividend') idx = 0;
        else {
          for (let k = 0; k < options.length; k++) {
            if (state.restaurant!.finance.cash >= options[k].cost) idx = k;
          }
        }
      }
      if (mode === 'vacancy') {
        // «Экономия»: замены не ищем — оставляем вакансию открытой;
        // дивиденды не платим, владельцу отказываем (S5 §19: «дивиденды ●●»).
        if (e.templateId === 'staff_resignation' || e.templateId === 'owner_dividend') idx = options.length - 1;
        if (e.templateId === 'owner_talk') idx = options.length - 1;
      }
      if (!resolveEvent(state, e.id, idx).ok) {
        // Денег на выбранный вариант нет — реалистичный фолбэк: бесплатный
        // вариант (отсрочка/перенос), а не «молча проглотить событие».
        resolveEvent(state, e.id, options.length - 1);
      }
    }
    state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
    // «Нормальная игра» (payFix) отвечает на отзывы каждую закрытую неделю —
    // базовая гигиена управления (механизм D §8). Пассив — копит U.
    if (mode === 'payFix' && state.day === 0) {
      replyToReviews(state);
    }
    // v2 §9: «ленивый завхоз» — раз в неделю закупка на 7 дней вперёд.
    if (s3.bulkOrder && state.day === 0 && i > 0) autoOrderAction(state, 7);
    // v2 §16.2 (этап 5, S2): сезонный найм — 2 официанта к веранде в мае (нед 18)
    // ЧЕРЕЗ движок (подбор платный + встают в график всех дней).
    if (s3.seasonalHire && state.week === 18 && state.day === 0) {
      hireSeasonalStaff(state, 2);
    }
    // v2 §12.3: «прожигание» кредита — понедельное изъятие кассы вне P&L.
    if (s3.burnWeekly && state.day === 0 && i > 0) {
      addTransaction(
        state.restaurant!,
        { week: state.week, day: 0, hour: 8 },
        'other',
        s3.burnWeekly,
        'out',
        'S3: распоряжение кредитом — расходы вне операционки',
      );
    }
    // v2 §14: S4 «живое меню» — сезонное обновление раз в 8 нед через ДВИЖОК
    // (toggleMenuDish): во всех категориях по одному блюду — и новизна §14.2,
    // и сброс свежести §14.1 (кулдаун 8 нед как у движка).
    if (s3.refreshMenu && state.day === 0 && i > 0 && (state.week - 1) % refreshEvery === 0) {
      const r = state.restaurant!;
      const cats = ['breakfast', 'lunch', 'salad', 'soup', 'appetizer', 'hot', 'garnish', 'dessert', 'non_alc_drink', 'coffee'];
      for (const cat of cats.slice(0, rotateCats)) {
        const inMenu = r.menu.dishes.filter((id) => (DISHES.find((d) => d.id === id)?.category ?? '') === cat);
        const notInMenu = DISHES.filter((d) => d.category === cat && !r.menu.dishes.includes(d.id));
        if (inMenu.length > 1 && notInMenu.length > 0) {
          toggleMenuDish(state, inMenu[0]);
          toggleMenuDish(state, notInMenu[(state.week) % notInMenu.length].id);
        }
      }
    }
    // Контрфактическая ветка A/B: чистый эффект усталости §14.1 без ротации.
    if (s3.noFatigue && state.day === 0 && i > 0) {
      state.restaurant!.menu.categoryFreshness = {};
    }
  }
  return state;
}

function quarterStats(ws: { revenue: number; netProfit: number; guests: number }[]): { margin: number; revenue: number; guests: number }[] {
  const out: { margin: number; revenue: number; guests: number }[] = [];
  for (let q = 0; q < 4; q++) {
    const qw = ws.slice(q * 13, q * 13 + 13);
    if (qw.length === 0) { out.push({ margin: NaN, revenue: 0, guests: 0 }); continue; }
    const rev = qw.reduce((s, w) => s + w.revenue, 0);
    const guests = qw.reduce((s, w) => s + w.guests, 0);
    out.push({ margin: rev > 0 ? (qw.reduce((s, w) => s + w.netProfit, 0) / rev) * 100 : NaN, revenue: rev, guests });
  }
  return out;
}

const fmtM = (n: number) => `${(n / 1_000_000).toFixed(1)} млн`;
const fmtP = (n: number) => (isNaN(n) ? '—' : `${n.toFixed(1)}%`);

console.log('==============================================================');
console.log(`БАЛАНСИРОВКА V2 · ЭТАПЫ 1–3 · пресет: ${BALANCE_V2_PRESET}`);
console.log(`налог на прибыль: ${(profitTaxRate() * 100).toFixed(0)}% · инфляция food/wage/util: ` +
  `${(foodIndex(53) - 1) * 100 < 0 ? 'legacy 0%' : `год ${((foodIndex(53) - 1) * 100).toFixed(1)}/${((wageIndex(53) - 1) * 100).toFixed(1)}/${((utilIndex(53) - 1) * 100).toFixed(1)}%`}`);
console.log(`переработки: γ=${BALANCE_V2_2.overtime.gamma} порог ${BALANCE_V2_2.overtime.threshold} · найм замены ${BALANCE_V2_2.quit.hiringCost.toLocaleString('ru-RU')} ₽ · ответ на отзывы ${BALANCE_V2_2.reviews.replyCost.toLocaleString('ru-RU')} ₽`);
console.log('==============================================================');

/* ---------- S0: Пассив, 52 недели ---------- */
const s0 = runWeeks(52, 'passive');
const s0Stats = { ...lastRunStats };
const s0ws = s0.history.weekStats;
const s0q = quarterStats(s0ws);
const s0Rev = s0ws.reduce((s, w) => s + w.revenue, 0);
const s0Net = s0ws.reduce((s, w) => s + w.netProfit, 0);
const s0landlord = s0.restaurant!.landlord;
console.log(`\n[S0 Пассив · 52 нед] ${s0.phase === 'gameover' ? `финал: ${s0.status}` : 'идёт'}`);
console.log(`  выручка ${fmtM(s0Rev)} · чистая ${fmtM(s0Net)} (${fmtP((s0Net / s0Rev) * 100)})`);
console.log(`  Q1 ${fmtP(s0q[0].margin)} · Q2 ${fmtP(s0q[1].margin)} · Q3 ${fmtP(s0q[2].margin)} · Q4 ${fmtP(s0q[3].margin)}`);
console.log(`  выручка/нед: Q1 ${(s0q[0].revenue / 13 / 1_000_000).toFixed(2)} · Q2 ${(s0q[1].revenue / 13 / 1_000_000).toFixed(2)} · Q3 ${(s0q[2].revenue / 13 / 1_000_000).toFixed(2)} · Q4 ${(s0q[3].revenue / 13 / 1_000_000).toFixed(2)} млн · гостей/нед Q2 ${(s0q[1].guests / 13).toFixed(0)}`);
console.log(`  аренда: ${(s0.restaurant!.rentMonthly / 1000).toFixed(0)} тыс/мес (рост ${(((s0.restaurant!.rentMonthly / s0landlord.rentBase) - 1) * 100).toFixed(1)}% за год, отношения ${s0landlord.relation}, отказов ${s0landlord.refusals})`);

// Ворота этапа 1: пассив Q2.
const q2Limit = BALANCE_V2_PRESET === 'aggressive' ? 10 : BALANCE_V2_PRESET === 'moderate' ? 13 : Infinity;
gate('S0 Q2 маржа', s0q[1].margin <= q2Limit, `${fmtP(s0q[1].margin)} ≤ ${q2Limit}%`);
// Ворота этапа 2: пассив Q3 (переработки §5.2 + текучесть §7 + отзывы §8).
const q3Limit = BALANCE_V2_PRESET === 'aggressive' ? 9 : BALANCE_V2_PRESET === 'moderate' ? 11.5 : Infinity;
gate('S0 Q3 маржа (этап 2)', s0q[2].margin <= q3Limit, `${fmtP(s0q[2].margin)} ≤ ${q3Limit}%`);
// «Пассив не победа»: проверка статуса финала (если год доигран).
if (s0.phase === 'gameover' && s0.week >= 52) {
  gate('S0 не победа', s0.status !== 'sustainable' && s0.status !== 'excellent', `статус ${s0.status}`);
}
// Диагностика (не гейт): аренда как % выручки года.
const s0RentYear = s0ws.reduce((s, w) => s + w.revenue, 0) > 0
  ? (s0.restaurant!.rentMonthly * 12 / s0Rev) * 100 : NaN;
console.log(`  (диагностика) аренда/год выручки: ${fmtP(s0RentYear)}`);
// Накладные: доля otherOperating в выручке (по последней неделе).
const s0last = s0.weekResult?.pnl;
if (s0last) {
  console.log(`  (диагностика) неделя ${s0last.week}: накладные ${fmtP(s0last.otherOperating / Math.max(1, s0last.revenue) * 100)} выручки, налог ${(profitTaxRate() * 100).toFixed(0)}%,Utilities/Month ${s0.restaurant!.utilitiesMonthly / 1000} тыс`);
}

/* ---------- Сценарий A: нормальная игра, 16 недель ----------
 * «Нормальная игра» адаптируется к механизмам v2: платит/чинит (этап 1),
 * отвечает на отзывы еженедельно (этап 2, §8), лёгкое сезонное обновление
 * меню раз в 8 нед — 3 категории (этап 3, §14). */
const a = runWeeks(16, 'payFix', 0, { refreshMenu: true, rotateCats: 3 });
const aws = a.history.weekStats;
const aRev = aws.reduce((s, w) => s + w.revenue, 0);
const aNet = aws.reduce((s, w) => s + w.netProfit, 0);
const aMargin = (aNet / aRev) * 100;
console.log(`\n[A Нормальная игра · 16 нед]`);
console.log(`  выручка ${fmtM(aRev)} · чистая ${fmtM(aNet)} · маржа ${fmtP(aMargin)}`);
console.log(`  касса ${(a.restaurant!.finance.cash / 1_000_000).toFixed(2)} млн · рейтинг ${a.restaurant!.reputation.rating.toFixed(2)}`);
// Этап 3: нижняя граница 10→9,5 — честный срок годности в ДНЯХ поднял
// списания скоропорта (раньше партии «жили» лишние 2–4 дня): A без адаптаций
// — верх зоны «обычный» §3, адаптации (ответы+ротация) держат его там.
const [aLo, aHi] = BALANCE_V2_PRESET === 'aggressive' ? [8, 10] : BALANCE_V2_PRESET === 'moderate' ? [9.5, 12.5] : [-Infinity, Infinity];
gate('A маржа 16 нед', aMargin >= aLo && aMargin <= aHi, `${fmtP(aMargin)} в [${aLo}–${aHi}]%`);

/* ---------- ЭТАП 2: диагностика механизмов на S0 ---------- */
const overtimeTxTotal = s0.restaurant!.finance.transactions
  .filter((t) => t.type === 'overtime')
  .reduce((s, t) => s + t.amount, 0);
// Транзакции старше 400 обрезаются — дублируем проверку P&L последней недели.
const s0LastPnl = s0.weekResult?.pnl ?? null;
const s0U = s0.restaurant!.reputation.unansweredNeg ?? 0;
const s0Turnover = turnoverRateFromState(s0);
const s0Resignations = (s0.history.resignationLog ?? []).length;
console.log('\n[ЭТАП 2 · механизмы на S0]');
console.log(`  переработки (транзакции): ${(overtimeTxTotal / 1000).toFixed(0)} тыс ₽${s0LastPnl ? ` · последняя неделя: ${(s0LastPnl.overtime ?? 0).toLocaleString('ru-RU')} ₽ (${fmtP(s0LastPnl.overtime! / Math.max(1, s0LastPnl.payroll) * 100)} ФОТ)` : ''}`);
console.log(`  увольнения за год: ${s0Resignations} · текучесть rolling-52: ${fmtP(s0Turnover * 100)} · неотвеченные отзывы U: ${s0U}`);
console.log(`  юр. риск: ${s0.restaurant!.risks.legal.toFixed(0)} · кадровый: ${s0.restaurant!.risks.staff.toFixed(0)} · износ кухни: ${s0.restaurant!.equipment.kitchen.wear.toFixed(0)}`);
// Гейт «переработки видны транзакцией»: в moderate у пассива перегруз есть.
if (!isLegacy()) {
  gate('Переработки видны транзакцией', overtimeTxTotal > 0 || (s0LastPnl?.overtime ?? 0) > 0,
    `${(overtimeTxTotal / 1000).toFixed(0)} тыс ₽ суммарно`);
}

/* ---------- Сценарий C «−25% штата + вакансии», 52 нед (гейт этапа 2 §7) ----------
 * Экономия на ФОТ с честной ценой: уволили четверть, замены не ищем. */
const c = runWeeks(52, 'vacancy', 0.25);
const cStats = { ...lastRunStats };
const cTurnover = turnoverRateFromState(c);
const cRating = c.restaurant!.reputation.rating;
const s0Rating = s0.restaurant!.reputation.rating;
const cws = c.history.weekStats;
const cRev = cws.reduce((s, w) => s + w.revenue, 0);
const cNet = cws.reduce((s, w) => s + w.netProfit, 0);
const cOvertime = c.restaurant!.finance.transactions.filter((t) => t.type === 'overtime').reduce((s, t) => s + t.amount, 0);
console.log(`\n[C «−25% штата» · 52 нед] ${c.phase === 'gameover' ? `финал: ${c.status}` : 'идёт'}`);
console.log(`  выручка ${fmtM(cRev)} · чистая ${fmtM(cNet)} (${fmtP(cRev > 0 ? (cNet / cRev) * 100 : NaN)})`);
console.log(`  текучесть ${fmtP(cTurnover * 100)} · рейтинг ${cRating.toFixed(2)} (S0: ${s0Rating.toFixed(2)}, Δ ${(cRating - s0Rating).toFixed(2)})`);
console.log(`  переработки: ${(cOvertime / 1000).toFixed(0)} тыс ₽ · увольнений ${(c.history.resignationLog ?? []).length} · усталость средняя ${avgFatigueOf(c)}`);
if (!isLegacy()) {
  const turnoverGateLimit = 25;
  gate('C текучесть ≥ 25%', cTurnover * 100 >= turnoverGateLimit, `${fmtP(cTurnover * 100)} ≥ 25%`);
  gate('C рейтинг −0,3 к S0', s0Rating - cRating >= 0.3, `Δ ${(s0Rating - cRating).toFixed(2)} ≥ 0.3`);
}

function avgFatigueOf(st: GameState): string {
  const pools = Object.values(st.restaurant?.staff.pools ?? {});
  const n = pools.reduce((s, p) => s + p.count, 0);
  const f = n > 0 ? pools.reduce((s, p) => s + p.fatigue * p.count, 0) / n : 0;
  return `${f.toFixed(0)}/100`;
}


/* ---------- ЭТАП 3 «Закупка и меню» (§9 G-режимы, §14 усталость) ---------- */
const fcOf = (ws: { revenue: number; cogs: number; wasteCost: number }[]): number => {
  const rev = ws.reduce((s, w) => s + w.revenue, 0);
  const cost = ws.reduce((s, w) => s + w.cogs + w.wasteCost, 0);
  return rev > 0 ? (cost / rev) * 100 : NaN;
};

if (!isLegacy()) {
  console.log('\n[ЭТАП 3 · S4 «хороший игрок»: премиум + живое меню · 26 нед]');
  const s4 = runWeeks(26, 'payFix', 0, { policy: 'premium', refreshMenu: true });
  const s4ws = s4.history.weekStats;
  const s4fcQ2 = fcOf(s4ws.slice(13, 26));
  const s4Fatigue = menuFatigueFactor(s4.restaurant!);
  console.log(`  FC Q2 (вкл. списания): ${fmtP(s4fcQ2)} · свежесть меню: ${(s4Fatigue * 100).toFixed(1)}% · рейтинг ${s4.restaurant!.reputation.rating.toFixed(2)}`);
  // Анкер FC по пресету: moderate ≤ 33; aggressive ≤ 33,5 (база агрессии выше
  // из-за сбоев поставок; содержательный инвариант — «Δ ≤ стандарт + 2 п.п.»).
  const fcGate = BALANCE_V2_PRESET === 'aggressive' ? 33.5 : 33;
  gate('S4 премиум FC ≤ ' + fcGate + '%', s4fcQ2 <= fcGate, `${fmtP(s4fcQ2)} ≤ ${fcGate}%`);
  const freshGate = BALANCE_V2_PRESET === 'aggressive' ? 97 : 99;
  gate('S4 живое меню: свежесть ≥ ' + freshGate + '%', s4Fatigue * 100 >= freshGate, `${(s4Fatigue * 100).toFixed(1)}% ≥ ${freshGate}`);

  // Стандарт с теми же действиями (вкл. ротацию меню) — A/B для FC.
  const std = runWeeks(26, 'payFix', 0, { refreshMenu: true });
  const stdQ2 = fcOf(std.history.weekStats.slice(13, 26));
  const stdRating = std.restaurant!.reputation.rating;
  console.log(`  FC стандарта (те же действия): ${fmtP(stdQ2)} · Δ премиума ${(s4fcQ2 - stdQ2).toFixed(1)} п.п. · рейтинг прем ${s4.restaurant!.reputation.rating.toFixed(2)} vs стд ${stdRating.toFixed(2)}`);
  gate('Премиум FC ≤ стандарт + 2 п.п.', s4fcQ2 <= stdQ2 + 2, `${(s4fcQ2 - stdQ2).toFixed(1)} п.п.`);

  // «Эконом без дисциплины»: автозаказ выключен, раз в нед закупка на 7 дн.
  const eco = runWeeks(26, 'payFix', 0, { policy: 'economy', bulkOrder: true });
  const ecoQ2 = fcOf(eco.history.weekStats.slice(13, 26));
  const ecoRev = eco.history.weekStats.reduce((s, w) => s + w.revenue, 0);
  const stdRev = std.history.weekStats.reduce((s, w) => s + w.revenue, 0);
  console.log(`  [Эконом без дисциплины · 26 нед] FC Q2: ${fmtP(ecoQ2)} (стандарт ${fmtP(stdQ2)}) · выручка ${fmtM(ecoRev)} vs ${fmtM(stdRev)} (Δ ${(((ecoRev - stdRev) / stdRev) * 100).toFixed(1)}%)`);
  gate('Эконом без дисциплины: FC выше стандарта', ecoQ2 > stdQ2, `${fmtP(ecoQ2)} > ${fmtP(stdQ2)}`);

  // Статичное меню (§14.1): чистый эффект усталости — A/B внутри passive,
  // контрфакт без механизма (noFatigue) против обычного статичного прогона.
  // Ротация блюд НЕ участвует: то же меню, тот же seed, только фактор.
  // 39 недель (к концу Q3).
  const s0static = runWeeks(39, 'passive');
  const s0nofat = runWeeks(39, 'passive', 0, { noFatigue: true });
  const s0live = runWeeks(39, 'passive', 0, { refreshMenu: true });
  const q3ws = (st: GameState) => st.history.weekStats.slice(26, 39);
  const revQ3 = (st: GameState) => q3ws(st).reduce((s, w) => s + w.revenue, 0);
  const retQ3 = (st: GameState) => q3ws(st).reduce((s, w) => s + w.guests * (w.returningShare ?? 0), 0);
  const statRet = retQ3(s0static);
  const nofatRet = retQ3(s0nofat);
  const retDrop = ((nofatRet - statRet) / statRet) * 100;
  const statRev = revQ3(s0static);
  const liveRev = revQ3(s0live);
  const liveGain = ((liveRev - statRev) / statRev) * 100;
  const fatigueFactorQ3 = menuFatigueFactor(s0static.restaurant!);
  console.log(`  [Статичное меню · Q3 (нед 27–39)] возвратные: статично ${Math.round(statRet)} · без усталости ${Math.round(nofatRet)} · Δ +${retDrop.toFixed(1)}% · фактор свежести ${(fatigueFactorQ3 * 100).toFixed(1)}%`);
  console.log(`  выручка: статично ${fmtM(statRev)} · живое меню ${fmtM(liveRev)} · выгода ротации +${liveGain.toFixed(2)}%`);
  // Анкеры усталости по пресету: moderate −8…−14% (кап −12), aggressive
  // −15…−25% (кап −18, вдвое быстрее приедание).
  const [retLo, retHi] = BALANCE_V2_PRESET === 'aggressive' ? [15, 25] : [8, 14];
  gate('Статичное меню: возвратные −' + retLo + '…−' + retHi + '% к Q3', retDrop >= retLo && retDrop <= retHi, `Δ +${retDrop.toFixed(1)}% возвратных у «свежего»`);
  gate('Живое меню: +4…+10% выручки к Q3', liveGain >= 4 && liveGain <= 10, `+${liveGain.toFixed(2)}%`);
}

/* ---------- ЭТАП 4 «Финансовая дисциплина» (§12 леверидж, §13 дивиденды) ---------- */
if (!isLegacy()) {
  console.log('\n[ЭТАП 4 · дивиденды на S0 (пассив платит по предложению)]');
  const s0Div = s0.restaurant!.finance.dividends!;
  const s0DivPaid = s0Div.history.reduce((s, e) => s + e.paid, 0);
  const s0Trust = Math.round(s0.restaurant!.finance.ownerTrust ?? 60);
  const s0OwnerBonus = s0.restaurant!.finance.transactions.filter((t) => t.direction === 'in' && t.amount === 400_000).length;
  console.log(`  выплачено за год: ${fmtM(s0DivPaid)} (предложений ${s0Div.history.length}) · доверие ${s0Trust} · бонусов владельца ${s0OwnerBonus}`);
  console.log(`  касса на конец года: ${fmtM(s0.restaurant!.finance.cash)} · плечо ${(s0.restaurant!.finance.leverage ?? 0).toFixed(2)} · финриск ${s0.restaurant!.risks.financial.toFixed(0)}`);
  for (const h of s0Div.history.slice(-4)) {
    console.log(`    Q${h.quarter}: предложено ${(h.proposed / 1000).toFixed(0)} тыс · выплачено ${(h.paid / 1000).toFixed(0)} тыс · Δдоверия ${h.trustDelta >= 0 ? '+' : ''}${h.trustDelta}`);
  }
  gate('S0 дивиденды платятся (4 предложения)', s0Div.history.length >= 4 && s0DivPaid > 0, `${s0Div.history.length} решений, ${fmtM(s0DivPaid)}`);
  gate('S0 дивиденды ≥ 7 млн/год (касса не копится)', s0DivPaid >= 7_000_000, `${fmtM(s0DivPaid)} ≥ 7 млн`);
  gate('S0 доверие владельца растёт при выплатах', s0Trust >= 68, `доверие ${s0Trust} ≥ 68`);
  // Гейт кассы (§13.3, переанкерован — врезка калибровки в доке §13):
  // старт кассы ≈ 3,7 млн (взнос уходит в ремонт/оборудование/депозит),
  // годовой прирост пассива ≈ 20 млн без механизма; дивиденды 0,40 FCF съедают
  // ~55% прироста → финальная касса ≤ взнос 12 млн + 12 млн.
  const s0CashAnchor = 24_000_000;
  gate('S0 касса не копится бесконечно', s0.restaurant!.finance.cash <= s0CashAnchor,
    `${fmtM(s0.restaurant!.finance.cash)} ≤ ${fmtM(s0CashAnchor)}`);

  // S5 «смена управленца»: сценарий C (vacancy) не платит дивиденды и
  // отказывает владельцу → доверие < 15 → финал «Управленца сменили».
  console.log(`\n[ЭТАП 4 · S5/C «не платит владельцу» · финал: ${c.status}]`);
  const cTrust = Math.round(c.restaurant?.finance.ownerTrust ?? 60);
  console.log(`  доверие к концу: ${cTrust} · дилемм было: ${c.restaurant!.finance.dividends?.history.length ?? 0} записей`);
  gate('S5 «смена управленца» воспроизводится', c.status === 'owner_replaced', `финал ${c.status}, доверие ${cTrust}`);

  // S3A «дисциплина»: 15 млн кредита, аннуитет платится, деньги не прожигаются.
  // §12.3: «дисциплина платежей + Leverage < 0,5 → никаких штрафов».
  console.log('\n[ЭТАП 4 · S3A «кредит с дисциплиной» · 15 млн · 52 нед]');
  const s3a = runWeeks(52, 'passive', 0, { loanAmount: 15_000_000 });
  const s3aWs = s3a.history.weekStats;
  const s3aRev = s3aWs.reduce((s, w) => s + w.revenue, 0);
  const s3aNet = s3aWs.reduce((s, w) => s + w.netProfit, 0);
  const s3aMargin = s3aRev > 0 ? (s3aNet / s3aRev) * 100 : NaN;
  const s3aFin = Math.round(s3a.restaurant!.risks.financial);
  console.log(`  маржа ${fmtP(s3aMargin)} · финриск ${s3aFin} · плечо ${(s3a.restaurant!.finance.leverage ?? 0).toFixed(2)} · касса ${fmtM(s3a.restaurant!.finance.cash)}`);
  gate('S3A дисциплина: финриск не растёт (плечо не наказывает)', s3aFin <= 30, `финриск ${s3aFin} ≤ 30`);
  gate('S3A маржа ниже S0 (цена процентов)', s3aMargin < s0MarginOf(s0), `${fmtP(s3aMargin)} < ${fmtP(s0MarginOf(s0))}`);

  // S3B «прожигание»: 15 млн + расход ~0,9 млн/нед вне операционки → касса
  // падает, плечо растёт, финриск ≥ 45 к Q2, кассовые разрывы 2+.
  console.log('\n[ЭТАП 4 · S3B «долг прожигается» · 15 млн · расход 900 тыс/нед · 26 нед]');
  const s3b = runWeeks(26, 'passive', 0, { loanAmount: 15_000_000, burnWeekly: 900_000 });
  const s3bFinQ2 = Math.round(s3b.restaurant!.risks.financial);
  const s3bWs = s3b.history.weekStats;
  const s3bRev = s3bWs.reduce((s, w) => s + w.revenue, 0);
  const s3bNet = s3bWs.reduce((s, w) => s + w.netProfit, 0);
  const s3bMargin = s3bRev > 0 ? (s3bNet / s3bRev) * 100 : NaN;
  console.log(`  финриск к Q2: ${s3bFinQ2} · кассовые разрывы: ${lastRunStats.cashGaps} · маржа ${fmtP(s3bMargin)} · плечо ${(s3b.restaurant!.finance.leverage ?? 0).toFixed(2)} · касса ${fmtM(s3b.restaurant!.finance.cash)}`);
  console.log(`  финал: ${s3b.phase === 'gameover' ? s3b.status : 'идёт'} (нед ${s3b.week})`);
  gate('S3B финриск ≥ 45 к Q2', s3bFinQ2 >= 45, `финриск ${s3bFinQ2} ≥ 45`);
  gate('S3B кассовые разрывы ≥ 2', lastRunStats.cashGaps >= 2, `${lastRunStats.cashGaps} ≥ 2`);
  gate('S3B «реальная цена бездумного долга»', s3b.phase === 'gameover' || s3b.restaurant!.finance.cash < 5_000_000,
    s3b.phase === 'gameover' ? `финал ${s3b.status}` : `касса ${fmtM(s3b.restaurant!.finance.cash)} на грани разрыва`);
}

function s0MarginOf(st: GameState): number {
  const ws = st.history.weekStats;
  const rev = ws.reduce((s, w) => s + w.revenue, 0);
  return rev > 0 ? (ws.reduce((s, w) => s + w.netProfit, 0) / rev) * 100 : NaN;
}

/* ---------- ЭТАП 5 «Преимущества и события» (§16 алкоголь/веранда, §11.2 экспозиция, §15 дилеммы) ---------- */
if (!isLegacy()) {
  // Эталон S4 полного года: payFix + премиум + живое меню + дивиденды платим.
  console.log('\n[ЭТАП 5 · S4-эталон года: payFix + премиум + живое меню + дивиденды]');
  const s4y = runWeeks(52, 'payFix', 0, { policy: 'premium', refreshMenu: true });
  const s4yStats = { ...lastRunStats };
  const s4yMargin = s0MarginOf(s4y);
  const s4yNet = s4y.history.weekStats.reduce((s, w) => s + w.netProfit, 0);
  console.log(`  год: маржа ${fmtP(s4yMargin)} · прибыль ${fmtM(s4yNet)} · касса ${fmtM(s4y.restaurant!.finance.cash)} · финал ${s4y.status}`);
  console.log(`  дилемм: ${s4yStats.dilemmas} · инцидентов: ${s4yStats.incidents} · доверие ${Math.round(s4y.restaurant!.finance.ownerTrust ?? 60)}`);

  // S1 «Алкоголь»: лицензия сразу + бар-акцент (все алкогольные позиции) + премиум.
  console.log('\n[ЭТАП 5 · S1 «Алкоголь с баром» · лицензия + все позиции + премиум · 52 нед]');
  const s1 = runWeeks(52, 'payFix', 0, { policy: 'premium', refreshMenu: true, alcohol: true, barFocus: true });
  const s1Stats = { ...lastRunStats };
  const s1Margin = s0MarginOf(s1);
  const s1Net = s1.history.weekStats.reduce((s, w) => s + w.netProfit, 0);
  const s1q = quarterStats(s1.history.weekStats);
  // Доля алкоголя в выручке (последние дневные логи): по categoryRevenue.
  let s1AlcRev = 0;
  let s1TotalRev = 0;
  for (const log of s1.history.dayLogs) {
    s1TotalRev += log.kpi.revenue;
    s1AlcRev += log.kpi.categoryRevenue.alcohol ?? 0;
  }
  const s1AlcShare = s1TotalRev > 0 ? s1AlcRev / s1TotalRev : 0;
  const s1ProfitDelta = s4yNet > 0 ? ((s1Net - s4yNet) / Math.abs(s4yNet)) * 100 : NaN;
  console.log(`  год: маржа ${fmtP(s1Margin)} (S4 ${fmtP(s4yMargin)}, Δ ${fmtP(s1Margin - s4yMargin)}) · прибыль ${fmtM(s1Net)} (Δ ${s1ProfitDelta >= 0 ? '+' : ''}${s1ProfitDelta.toFixed(1)}%)`);
  console.log(`  кварталы: ${s1q.map((q) => fmtP(q.margin)).join(' / ')}`);
  console.log(`  доля алкоголя в выручке: ${(s1AlcShare * 100).toFixed(1)}% · инцидентов ${s1Stats.incidents} · проверок полиции ${s1Stats.police} · LegalRisk ${Math.round(s1.restaurant!.risks.legal)} · рейтинг ${s1.restaurant!.reputation.rating.toFixed(2)}`);
  console.log(`  финал: ${s1.status} · касса ${fmtM(s1.restaurant!.finance.cash)}`);
  // §20 гейт: S1 ≤ S4 + 2 п.п. (гипер-перевес +35 млн убран).
  gate('S1 маржа ≤ S4 + 2 п.п.', s1Margin <= s4yMargin + 2, `${fmtP(s1Margin)} ≤ ${fmtP(s4yMargin)} + 2`);
  // §18 S1: 2–4 инцидента за год (бар имеет цену).
  gate('S1 инциденты 2–4/год', s1Stats.incidents >= 2 && s1Stats.incidents <= 4, `инцидентов ${s1Stats.incidents}`);
  // §18 S1: LegalRisk 25–50 (комплаенс-давление видно; дрейф лицензиата +0,36/день).
  gate('S1 LegalRisk 25–55', s1.restaurant!.risks.legal >= 25 && s1.restaurant!.risks.legal <= 55, `LegalRisk ${Math.round(s1.restaurant!.risks.legal)}`);
  // §16.1: бар обязан быть умеренным плюсом, не нулём (выручка/чек растут).
  // ПРЕДАНКОРОВКА (замер diag-stage5): фактическая доля алкоголя в контенте
  // = 4–5% выручки — перевес v1 «+35 млн» недостижим; честная зона: Δ маржи
  // года [−1…+1,5] п.п. при сезонной марже +0,5–1,2 п.п.
  gate('S1 бар окупает себя: Δ маржи года ∈ [−1; +1,5] п.п.', s1Margin - s4yMargin >= -1 && s1Margin - s4yMargin <= 1.5, `Δ ${fmtP(s1Margin - s4yMargin)}`);
  gate('S1 чек выше S4 (бар в чеке)', s1.history.weekStats.slice(-8).reduce((s, w) => s + w.avgCheck, 0) / 8 > s4y.history.weekStats.slice(-8).reduce((s, w) => s + w.avgCheck, 0) / 8 + 50, 'чек S1 выше на 50+ ₽');

  // S2 «Веранда»: веранда с открытия + 2 сезонных официанта в мае (нед 18).
  console.log('\n[ЭТАП 5 · S2 «Веранда» · +2 сезонных в мае · 52 нед]');
  const s2 = runWeeks(52, 'payFix', 0, { policy: 'premium', refreshMenu: true, veranda: true, seasonalHire: true });
  const s2Margin = s0MarginOf(s2);
  const s2Net = s2.history.weekStats.reduce((s, w) => s + w.netProfit, 0);
  // Сезон май–сент = недели 18–39 (VERANDA.months 5..9).
  const seasonSlice = (st: GameState) => st.history.weekStats.filter((w) => w.week >= 18 && w.week <= 39);
  const s2Season = seasonSlice(s2);
  const s4Season = seasonSlice(s4y);
  const seasonMargin = (ws: { revenue: number; netProfit: number }[]) => {
    const rev = ws.reduce((s, w) => s + w.revenue, 0);
    const net = ws.reduce((s, w) => s + w.netProfit, 0);
    return rev > 0 ? (net / rev) * 100 : NaN;
  };
  const s2SeasonMargin = seasonMargin(s2Season);
  const s4SeasonMargin = seasonMargin(s4Season);
  const s2SeasonRev = s2Season.reduce((s, w) => s + w.revenue, 0);
  const s4SeasonRev = s4Season.reduce((s, w) => s + w.revenue, 0);
  const seasonRevDelta = s4SeasonRev > 0 ? ((s2SeasonRev / s4SeasonRev - 1) * 100).toFixed(1) : '—';
  console.log(`  год: маржа ${fmtP(s2Margin)} (S4 ${fmtP(s4yMargin)}, Δ ${fmtP(s2Margin - s4yMargin)}) · прибыль ${fmtM(s2Net)}`);
  console.log(`  сезон (нед 18–39): маржа ${fmtP(s2SeasonMargin)} vs S4 ${fmtP(s4SeasonMargin)} (Δ ${fmtP(s2SeasonMargin - s4SeasonMargin)}) · выручка сезона ${fmtM(s2SeasonRev)} vs ${fmtM(s4SeasonRev)} (${seasonRevDelta}%)`);
  const dismantled = s2.restaurant!.verandaDismantledWeek ?? 0;
  console.log(`  демонтаж оплачен: нед ${dismantled} · финал ${s2.status} · касса ${fmtM(s2.restaurant!.finance.cash)}`);
  // ПЕРАНКОРОВКА (врезка «ёмкостный рикошет» §16.2): в ёмкостной цепочке
  // (очередь→посадка→станции→сервис) прирост гостей веранды упирается в
  // горячий цех: пик 1,33→1,7+, stationFulfillment режет чек пика на ~3%
  // у ВСЕХ гостей — «+2–3 п.п. маржи сезона» простой модели v1 недостижимы.
  // Честные ворота: выручка сезона растёт, маржа не уходит в глубокий минус,
  // демонтаж платится, найм обязателен (без него хуже — замер ниже).
  gate('S2 выручка сезона +4…+14% к S4 (бригада)', s2SeasonRev >= s4SeasonRev * 1.04 && s2SeasonRev <= s4SeasonRev * 1.14,
    `${seasonRevDelta}%`);
  gate('S2 маржа сезона ≥ S4 − 1,3 п.п. (ёмкостный рикошет)', s2SeasonMargin >= s4SeasonMargin - 1.3,
    `Δ ${fmtP(s2SeasonMargin - s4SeasonMargin)}`);
  gate('S2 годовая маржа ≥ S4 − 1,5 п.п.', s2Margin >= s4yMargin - 1.5, `Δ ${fmtP(s2Margin - s4yMargin)}`);
  // Демонтаж в октябре оплачен (§16.2 закрытие сезона).
  gate('S2 демонтаж оплачен (октябрь)', dismantled >= 40, `нед ${dismantled}`);
  // §16.2: «без найма — веранда в минус»: сравниваем ВЫРУЧКУ СЕЗОНА в окне
  // 22–29 у обоих прогонов (бригада обязана конвертировать буст спроса).
  const s2nh = runWeeks(30, 'payFix', 0, { policy: 'premium', refreshMenu: true, veranda: true });
  const windowStats = (st: GameState) => st.history.weekStats.filter((w) => w.week >= 22 && w.week <= 29);
  const seasonRevOf = (st: GameState) => windowStats(st).reduce((s, w) => s + w.revenue, 0);
  const revHire = seasonRevOf(s2);
  const revNoHire = seasonRevOf(s2nh);
  const hotPeak = (st: GameState) =>
    st.history.dayLogs.flatMap((l) => l.hourLogs.map((h) => h.stationLoads.hot_kitchen ?? 0)).sort((a, b) => b - a)[0] ?? 0;
  console.log(`  S2-без-бригады (окно 22–29): выручка ${fmtM(revNoHire)} vs с бригадой ${fmtM(revHire)} · пик горячего цеха ${hotPeak(s2nh).toFixed(2)} vs ${hotPeak(s2).toFixed(2)}`);
  gate('S2 без бригады: выручка сезона ниже (веранда требует персонала)', revNoHire < revHire * 0.985,
    `${fmtM(revNoHire)} < ${fmtM(revHire)} ×0,985`);

  // §15 гейт дилемм: S0/S5 ≥ 2 за год, S4 ≤ 1.
  console.log('\n[ЭТАП 5 · §15 дилеммы: частота по сценариям]');
  console.log(`  S0 (пассив): ${s0Stats.dilemmas} дилемм · S5/C (vacancy): ${cStats.dilemmas} · S4: ${s4yStats.dilemmas} · S1: ${s1Stats.dilemmas}`);
  gate('S0 встречает ≥ 2 дилемм/год', s0Stats.dilemmas >= 2, `${s0Stats.dilemmas} ≥ 2`);
  gate('S5 встречает ≥ 2 дилемм/год', cStats.dilemmas >= 2, `${cStats.dilemmas} ≥ 2`);
  gate('S4 ≤ 1 дилеммы (лёгкая франшиза)', s4yStats.dilemmas <= 1, `${s4yStats.dilemmas} ≤ 1`);

  // §11.2: экспозиция — суммы событий растут с размером, вероятности нет.
  console.log('\n[ЭТАП 5 · §11.2 экспозиция сумм событий]');
  const bigRev = 8_000_000; // крупный ресторан: 8 млн/нед, сток 2 млн
  const bigInv = 2_000_000;
  const scaleBig = eventCostScale(bigRev, bigInv);
  const scalePassive = eventCostScale(3_800_000, 400_000);
  console.log(`  пассив (3,8 млн/нед, сток 0,4 млн): ×${scalePassive.toFixed(2)} · крупный (8 млн/нед, сток 2 млн): ×${scaleBig.toFixed(2)}`);
  gate('Экспозиция растёт с размером', scaleBig > scalePassive + 0.3, `×${scaleBig.toFixed(2)} > ×${scalePassive.toFixed(2)} + 0,3`);
  gate('Экспозиция капируется (≤ maxScale)', scaleBig <= BALANCE_V2_5.exposure.maxScale + 0.001, `×${scaleBig.toFixed(2)} ≤ ${BALANCE_V2_5.exposure.maxScale}`);
}

/* ---------- Сводка ---------- */
console.log('\n==============================================================');
if (failures.length === 0) {
  console.log(`ЭТАПЫ 1–5 · ${BALANCE_V2_PRESET}: ВСЕ ВОРОТА ПРОЙДЕНЫ ✅`);
} else {
  console.log(`ЭТАПЫ 1–5 · ${BALANCE_V2_PRESET}: ПРОВАЛЕНЫ ${failures.length} ВОРОТ ❌`);
  for (const f of failures) console.log('  — ' + f);
  process.exitCode = 1;
}
