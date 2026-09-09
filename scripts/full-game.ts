/** Полная игра 52 недели с условиями победы выбранной сложности (аудит §4.3 + ТЗ §36).
 * v2: поквартальная маржа (гейты этапов BALANCING-V2 §20), события с
 * динамическими резолюциями (цепочка арендодателя §6) резолвятся наравне
 * с шаблонными.
 * Запуск: bun run scripts/full-game.ts [novice|standard|professional] (по умолчанию standard) */
import { createGame, simulateDay, resolveEvent } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';
import { EVENT_TEMPLATES_MAP } from '../src/lib/game/config/risks.config';
import { difficultyWin, difficultyOf } from '../src/lib/game/config/difficulty.config';

const DIFFICULTY = process.argv[2] ?? 'standard';

let state: GameState = createGame({
  seed: 777,
  restaurantName: 'Полный цикл',
  difficultyId: DIFFICULTY,
  locationId: 'tverskaya',
  premisesSize: 'medium',
  renovation: 'standard',
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
  veranda: false,
  alcoholLicense: false,
});

let events = 0;
for (let i = 0; i < 52 * 7 && state.phase !== 'gameover'; i++) {
  const res = simulateDay(state, { plannedActions: [] }, state.seed);
  state = res.state;
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    // v2 §6.2: динамические резолюции приоритетнее шаблонных (как в resolveEvent).
    const options = e.resolutions ?? EVENT_TEMPLATES_MAP[e.templateId]?.resolutions;
    if (!options) continue;
    let idx = 0;
    for (let k = 0; k < options.length; k++) {
      if (state.restaurant!.finance.cash >= options[k].cost) idx = k;
    }
    if (!resolveEvent(state, e.id, idx).ok) resolveEvent(state, e.id, 0);
  }
  state.activeEvents = state.activeEvents.filter((e) => e.resolved !== false);
  events += res.result.events.length;
}

const ws = state.history.weekStats;
const totalRev = ws.reduce((s, w) => s + w.revenue, 0);
const totalNet = ws.reduce((s, w) => s + w.netProfit, 0);
const last12 = ws.slice(-12);
const bscAvg = last12.reduce((s, w) => s + w.bsc, 0) / Math.max(1, last12.length);
console.log('=== ПОЛНАЯ ИГРА 52 НЕДЕЛИ ===');
console.log('сложность:', difficultyOf(DIFFICULTY).name, '·', difficultyOf(DIFFICULTY).description.slice(0, 60) + '…');
console.log('недель закрыто:', ws.length, '· статус:', state.status, '· phase:', state.phase);
console.log(`выручка за год: ${(totalRev / 1_000_000).toFixed(1)} млн ₽, чистая: ${(totalNet / 1_000_000).toFixed(1)} млн ₽ (${(totalNet / totalRev * 100).toFixed(1)}%)`);
// v2 §20: поквартальная чистая маржа — гейт этапов (Q1–Q4).
const landlord = state.restaurant!.landlord;
for (let q = 0; q < 4; q++) {
  const qw = ws.slice(q * 13, q * 13 + 13);
  if (qw.length === 0) continue;
  const qr = qw.reduce((s, w) => s + w.revenue, 0);
  const qn = qw.reduce((s, w) => s + w.netProfit, 0);
  console.log(`  Q${q + 1}: выручка ${(qr / 1_000_000).toFixed(1)} млн · маржа ${(qr > 0 ? (qn / qr * 100) : 0).toFixed(1)}%`);
}
const rentBase = landlord?.rentBase ?? state.restaurant!.rentMonthly;
console.log(`аренда: ${(state.restaurant!.rentMonthly / 1000).toFixed(0)} тыс/мес (база ${(rentBase / 1000).toFixed(0)} тыс, рост ${(((state.restaurant!.rentMonthly / rentBase) - 1) * 100).toFixed(1)}%, отношения арендодателя ${landlord?.relation ?? '—'}`);
console.log(`касса на финале: ${(state.restaurant!.finance.cash / 1_000_000).toFixed(2)} млн ₽`);
console.log(`рейтинг: ${state.restaurant!.reputation.rating.toFixed(2)}, BSC (12 нед): ${bscAvg.toFixed(0)}`);
console.log(`события за год: ${events} (~1 в ${(52 / Math.max(1, events)).toFixed(1)} нед)`);
const win = difficultyWin(DIFFICULTY);
console.log(`накопленная прибыль: ${(state.history.cumulativeNetProfit / 1_000_000).toFixed(1)} млн ₽ (порог победы ${(win.minCumulativeProfit / 1_000_000).toFixed(0)} млн на ${difficultyOf(DIFFICULTY).name})`);
console.log(`positiveOpWeeks подряд: ${state.history.positiveOpWeeks}`);
if (state.weekResult?.finalScore) {
  const fs = state.weekResult.finalScore;
  console.log('ФИНАЛЬНЫЙ СЧЁТ:', fs.total, '/ 1000');
  console.log(`  финансы ${fs.financialHealth}/250 · клиенты ${fs.customerHealth}/200 · процессы ${fs.operationalHealth}/200 · персонал ${fs.staffHealth}/150 · рост ${fs.growth}/100 · риски ${fs.riskManagement}/100`);
}
const loan = state.restaurant!.finance.loans[0];
console.log('кредит остаток:', loan ? `${(loan.remaining / 1_000_000).toFixed(2)} млн ₽` : 'закрыт');
