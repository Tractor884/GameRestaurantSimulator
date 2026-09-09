/** ДИАГНОСТИКА ЭТАПА 6 «Представление» (BALANCING-V2 §20).
 *
 * Финальный ранг D−…A+ и спец-финалы на эталонных прогонах этапов 1–5:
 *  S0 «Пассив»      — ворота: ранг в зоне C−…C+ («пассив = середина»), финал не победа;
 *  S4 «Эталон года» — ворота: ранг ≥ B+ и победа (визуально отличный от S0 финал);
 *  S5 «Vacancy»      — ворота: спец-финал «Управленца сменили»;
 *  «Звёзды»          — контрфактическая проверка порога «Кухня со звёздами».
 *
 * --dump: сохраняет финальные состояния S0/S4 (обёртка автосейва) в /tmp для
 *  браузерного e2e (инжект в localStorage → GameOverDialog).
 *
 * Запуск: bun run scripts/diag-stage6.ts [--dump]
 */
import { createGame, simulateDay, resolveEvent, setProcurementPolicy, toggleMenuDish, replyToReviews, hireStaff, deepCleaning, hireSeasonalStaff, buyEquipment, setCleaningBudget, repairEquipment } from '../src/lib/game/engine';
import { addTransaction } from '../src/lib/game/engine/core';
import type { GameState } from '../src/lib/game/types';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';
import { difficultyWin } from '../src/lib/game/config/difficulty.config';
import { DISHES } from '../src/lib/game/content/dishes';
import { computeFinalGrade, axisHints, type FinalGrade } from '../src/lib/game/engine/finalGrade';
import { writeFileSync } from 'node:fs';

const DUMP = process.argv.includes('--dump');
const failures: string[] = [];
function gate(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}: ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}

const BASE_OPTS = {
  seed: 777,
  restaurantName: 'Эталон V2',
  locationId: 'tverskaya',
  premisesSize: 'medium' as const,
  renovation: 'standard' as const,
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard' as const, coffee: 'standard' as const, hall: 'standard' as const },
  veranda: false,
  alcoholLicense: false,
};

interface RunOpts {
  premium?: boolean;
  refreshMenu?: boolean;
  loanAmount?: number;
  /** Сильный игрок: professional-кухня/зал, +2 официанта, клининг,
   *  сезонная бригада, генуборки, ремонт оборудования 2×/год. */
  strong?: boolean;
  alcohol?: boolean;
  veranda?: boolean;
  /** v2 §12.3: еженедельное изъятие кассы вне P&L («прожигание» долга). */
  burnWeekly?: number;
}

/** Прогон днями с авто-резолюцией событий (режимы как в balance-v2-test). */
function runWeeks(weeks: number, mode: 'passive' | 'payFix' | 'vacancy', s: RunOpts = {}): GameState {
  let state: GameState = createGame({
    ...BASE_OPTS,
    ...(s.loanAmount != null ? { loanAmount: s.loanAmount } : {}),
    ...(s.alcohol != null ? { alcoholLicense: s.alcohol } : {}),
    ...(s.veranda != null ? { veranda: s.veranda } : {}),
  });
  if (s.premium) setProcurementPolicy(state, 'premium');
  if (s.strong) {
    // Ёмкость сервиса: запас официантов снижает очереди → satisfaction → рейтинг.
    hireStaff(state, 'waiter', 2);
    // Кухня и зал премиум-класса: качество блюд и атмосфера (satisfaction §15).
    buyEquipment(state, 'kitchen', 'professional');
    buyEquipment(state, 'hall', 'professional');
    // Усиленный клининг: чистота держится выше (weight 15%).
    setCleaningBudget(state, 100_000);
  }
  const refreshEvery = 8;
  for (let i = 0; i < weeks * 7 && state.phase !== 'gameover'; i++) {
    const res = simulateDay(state, { plannedActions: [] }, state.seed);
    state = res.state;
    for (const e of state.activeEvents.filter((x) => !x.resolved)) {
      const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
      if (!options) continue;
      let idx = 0;
      if (mode === 'payFix') {
        if (e.templateId === 'owner_dividend') idx = 0;
        // Дисциплинированный игрок НЕ ссорится с арендодателем: принимает
        // индексацию и ультиматум (переезд = −25% спроса и 2 млн — путь S5,
        // не «сильного» игрока).
        else if (e.templateId === 'landlord_offer' || e.templateId === 'landlord_ultimatum') idx = 0;
        else {
          for (let k = 0; k < options.length; k++) {
            if (state.restaurant!.finance.cash >= options[k].cost) idx = k;
          }
        }
      }
      if (mode === 'vacancy') {
        if (e.templateId === 'staff_resignation' || e.templateId === 'owner_dividend' || e.templateId === 'owner_talk')
          idx = options.length - 1;
      }
      if (!resolveEvent(state, e.id, idx).ok) resolveEvent(state, e.id, options.length - 1);
    }
    state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
    if (mode === 'payFix' && state.day === 0) replyToReviews(state);
    // v2 §12.3: «прожигание» — понедельное изъятие кассы вне P&L.
    if (s.burnWeekly && state.day === 0 && i > 0) {
      addTransaction(
        state.restaurant!,
        { week: state.week, day: 0, hour: 8 },
        'other',
        s.burnWeekly,
        'out',
        'S3B: распоряжение кредитом — расходы вне операционки',
      );
    }
    // Сильный игрок: генуборка в начале кварталов, бригада в мае,
    // ремонт оборудования при износе (equipQuality × (1 − wear/200) — скрытый
    // драйвер удовлетворённости: без ремонта рейтинг вязнет на ~4,18).
    if (s.strong) {
      if (state.day === 0 && (state.week === 14 || state.week === 27 || state.week === 40)) deepCleaning(state);
      if (state.day === 0 && (state.week === 26 || state.week === 44)) {
        repairEquipment(state, 'kitchen');
        repairEquipment(state, 'hall');
        repairEquipment(state, 'coffee');
      }
      if (state.day === 0 && state.week === 18) hireSeasonalStaff(state, 2);
    }
    if (s.refreshMenu && state.day === 0 && i > 0 && (state.week - 1) % refreshEvery === 0) {
      const r = state.restaurant!;
      const cats = ['breakfast', 'lunch', 'salad', 'soup', 'appetizer', 'hot', 'garnish', 'dessert', 'non_alc_drink', 'coffee'];
      for (const cat of cats) {
        const inMenu = r.menu.dishes.filter((id) => (DISHES.find((d) => d.id === id)?.category ?? '') === cat);
        const notInMenu = DISHES.filter((d) => d.category === cat && !r.menu.dishes.includes(d.id));
        if (inMenu.length > 1 && notInMenu.length > 0) {
          toggleMenuDish(state, inMenu[0]);
          toggleMenuDish(state, notInMenu[(state.week) % notInMenu.length].id);
        }
      }
    }
  }
  return state;
}

function describe(tag: string, grade: FinalGrade, state: GameState) {
  const m = grade.metrics;
  const special: string[] = [];
  if (grade.special.starsKitchen) special.push('ЗВЁЗДЫ');
  if (grade.special.relocated) special.push('ПЕРЕЕЗД');
  if (grade.special.bankrupt) special.push(`БАНКРОТ(${grade.special.bankruptReason})`);
  if (grade.special.ownerReplaced) special.push('СМЕНА УПРАВЛЕНЦА');
  console.log(
    `  ${tag}: ранг ${grade.rank} (скор ${grade.score.toFixed(3)}) · ${state.status} · нед ${m.weeksLived}` +
      ` · рейтинг ${m.rating.toFixed(2)} · маржа ${m.marginPct.toFixed(1)}% · BSC ${m.bscAvg.toFixed(1)} · текучесть ${m.turnoverPct.toFixed(0)}%` +
      (special.length ? ` · спец: ${special.join(', ')}` : ''),
  );
  // Диагностика победы (какой планки не хватило).
  if (state.status === 'stable') {
    const r = state.restaurant!;
    const last12 = state.history.weekStats.slice(-12);
    const bscAvg = last12.reduce((s, w) => s + w.bsc, 0) / Math.max(1, last12.length);
    const win = difficultyWin(state.difficultyId);
    const misses: string[] = [];
    if (r.finance.cash < win.minCash) misses.push(`касса ${fmtM(r.finance.cash)} < ${fmtM(win.minCash)}`);
    if (bscAvg < win.minBscAvgQuarter) misses.push(`BSC ${bscAvg.toFixed(1)} < ${win.minBscAvgQuarter}`);
    if (r.reputation.rating < win.minRating) misses.push(`рейтинг ${r.reputation.rating.toFixed(2)} < ${win.minRating}`);
    if (state.history.cumulativeNetProfit < win.minCumulativeProfit) misses.push(`прибыль ${fmtM(state.history.cumulativeNetProfit)} < ${fmtM(win.minCumulativeProfit)}`);
    if (state.history.positiveOpWeeks < win.minPositiveOpWeeks) misses.push(`+нед ${state.history.positiveOpWeeks} < ${win.minPositiveOpWeeks}`);
    if (misses.length) console.log(`      ↳ до победы не хватило: ${misses.join(' · ')}`);
  }
  for (const h of axisHints(grade)) console.log(`      ↳ слабая ось «${h.axis}»: ${h.hint}`);
}

const fmtM = (n: number) => `${(n / 1_000_000).toFixed(1)} млн`;

console.log('==============================================================');
console.log('ЭТАП 6 «ПРЕДСТАВЛЕНИЕ» · финальные ранги на эталонах v2');
console.log('==============================================================');

/* ---------- S0: Пассив ---------- */
const s0 = runWeeks(52, 'passive');
const s0g = computeFinalGrade(s0);
describe('S0 пассив', s0g, s0);
const rankOrder = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B', 'B+', 'A', 'A+'];
gate('S0 ранг в середине (C−…C+)', ['C-', 'C', 'C+'].includes(s0g.rank), `ранг ${s0g.rank}`);
gate('S0 не победа', !s0g.special.win, `статус ${s0.status}`);

/* ---------- S4: Сильный игрок (payFix + премиум + живое меню + бар + забота об оборудовании) ---------- */
// Гейт обещания §18 «Победа S4 — воспроизводится»: дисциплинированный игрок
// на СТАНДАРТЕ. Ключи: (а) ремонт оборудования 2×/год — износ режет качество
// блюд (×(1−wear/200)) и рейтинг вязнет на 4,18; (б) сезонная бригада —
// единственный способ удержать текучесть и сервис летом; (в) без веранды
// (ёмкостный рикошет §16.2 — не для победы, а для масштаба).
const s4 = runWeeks(52, 'payFix', {
  premium: true,
  refreshMenu: true,
  strong: true,
  alcohol: true,
});
const s4g = computeFinalGrade(s4);
describe('S4 сильный игрок', s4g, s4);
gate('S4 победа', s4g.special.win, `статус ${s4.status}`);
gate('S4 ранг ≥ B+ (сильный год)', rankOrder.indexOf(s4g.rank) >= rankOrder.indexOf('B+'), `ранг ${s4g.rank}`);
gate('S4 ранг выше S0 минимум на 2 ступени', rankOrder.indexOf(s4g.rank) - rankOrder.indexOf(s0g.rank) >= 2, `${s4g.rank} vs ${s0g.rank}`);

/* ---------- S5: Vacancy (не платит владельцу) ---------- */
const s5 = runWeeks(52, 'vacancy');
const s5g = computeFinalGrade(s5);
describe('S5 не платит владельцу', s5g, s5);
gate('S5 спец-финал «Управленца сменили»', s5g.special.ownerReplaced, `финал ${s5.status}, доверие ${s5.restaurant?.finance.ownerTrust}`);

/* ---------- S3B: «прожигание» долга (этап 4: банкрот от кассы) ---------- */
const s3b = runWeeks(52, 'passive', { loanAmount: 15_000_000, burnWeekly: 900_000 });
const s3bg = computeFinalGrade(s3b);
describe('S3B долг прожигается', s3bg, s3b);
gate(
  'S3B финал проигрышный (банкрот или смена)',
  s3bg.special.bankrupt || s3bg.special.ownerReplaced,
  `финал ${s3b.status}${s3bg.special.bankrupt ? `, причина ${s3bg.special.bankruptReason}` : ''}`,
);
gate('S3B причина банкротства определена', s3bg.special.bankrupt ? s3bg.special.bankruptReason != null : true,
  s3bg.special.bankruptReason ?? '—');

/* ---------- «Кухня со звёздами»: контрфактический порог ---------- */
// Звёзды = рейтинг ≥ 4,8 + BSC ≥ 85 + победа: на эталоне S4 проверяем расстояние
// до порога (достижимость «идеальным» игроком с верандой/баром/маркетингом).
const starsDist = 4.8 - s4g.metrics.rating;
console.log(`\n  Порог «Кухня со звёздами»: рейтинг 4,8 + BSC 85 + победа`);
console.log(`  S4-эталон: рейтинг ${s4g.metrics.rating.toFixed(2)} (до 4,8: ${starsDist >= 0 ? '+' : ''}${(-starsDist).toFixed(2)}) · BSC ${s4g.metrics.bscAvg.toFixed(1)} (до 85: ${(85 - s4g.metrics.bscAvg).toFixed(1)})`);
gate('Звёзды не «бесплатны» у эталона S4', !(s4g.special.win && s4g.metrics.rating >= 4.8 && s4g.metrics.bscAvg >= 85),
  s4g.special.starsKitchen ? 'звёзды у эталона — порог слишком низкий' : 'эталон S4 звёзд не даёт');
gate('Звёзды достижимы теоретически (BSC эталона ≥ 70)', s4g.metrics.bscAvg >= 70, `BSC ${s4g.metrics.bscAvg.toFixed(1)} ≥ 70`);

/* ---------- Чистота функции: детерминизм ---------- */
const s0g2 = computeFinalGrade(runWeeks(52, 'passive'));
gate('computeFinalGrade детерминирован', s0g.rank === s0g2.rank && Math.abs(s0g.score - s0g2.score) < 1e-12, `${s0g.rank}/${s0g.score.toFixed(6)}`);

/* ---------- Дампы для браузерного e2e ---------- */
if (DUMP) {
  const wrap = (state: GameState, name: string) =>
    JSON.stringify({ state, name, date: new Date().toISOString() });
  writeFileSync('/tmp/final-s0.json', wrap(s0, 'e2e S0'));
  writeFileSync('/tmp/final-s4.json', wrap(s4, 'e2e S4'));
  writeFileSync('/tmp/final-s5.json', wrap(s5, 'e2e S5'));
  writeFileSync('/tmp/final-s3b.json', wrap(s3b, 'e2e S3B'));
  console.log('\nДампы финальных состояний: /tmp/final-s0.json, /tmp/final-s4.json, /tmp/final-s5.json');
}

/* ---------- Сводка ---------- */
console.log('\n==============================================================');
if (failures.length === 0) {
  console.log('ЭТАП 6 · ДВИЖКОВЫЕ ВОРОТА ПРОЙДЕНЫ ✅');
} else {
  console.log(`ЭТАП 6 · ПРОВАЛЕНО ${failures.length} ВОРОТ ❌`);
  for (const f of failures) console.log('  — ' + f);
  process.exitCode = 1;
}
