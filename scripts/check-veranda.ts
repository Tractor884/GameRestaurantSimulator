/** Смоук сезонной веранды + текучести (26-b). Запуск: bun run scripts/check-veranda.ts */
import { createGame, simulateDay, resolveEvent, buyVerandaPermit, dismantleVeranda } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';
import { monthOfDay, dayOfYear } from '../src/lib/game/config/demandProfiles.config';
import { quarterTurnoverPct } from '../src/lib/game/engine';

function baseState(): GameState {
  return createGame({
    seed: 4242,
    restaurantName: 'Веранда',
    difficultyId: 'standard',
    locationId: 'tverskaya',
    premisesSize: 'medium',
    renovation: 'standard',
    loanAmount: 6_000_000,
    equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
    alcoholLicense: false,
  });
}

function playWeeks(state: GameState, n: number, onWeekEnd?: (s: GameState) => void): GameState {
  for (let i = 0; i < n * 7 && state.phase !== 'gameover'; i++) {
    const res = simulateDay(state, { plannedActions: [] }, state.seed);
    state = res.state;
    if (state.day === 0 && onWeekEnd) onWeekEnd(state);
  }
  return state;
}

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'OK ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
}

// === Сценарий A: веранду не покупали — ничего не происходит ===
{
  let s = baseState();
  let teardownSeen = false;
  let contentTx = 0;
  s = playWeeks(s, 52, (st) => {
    if (st.activeEvents.some((e) => e.templateId === 'veranda_teardown')) teardownSeen = true;
    contentTx += st.restaurant!.finance.transactions.filter((t) => t.description?.includes('веранд')).length;
  });
  check('A: без покупки — 0 событий демонтажа', !teardownSeen);
  check('A: без покупки — 0 транзакций содержания', contentTx === 0);
  check('A: verandaActive всегда false', s.restaurant!.verandaActive === false);
  const turn = quarterTurnoverPct(s.restaurant!.staff);
  check('A: текучесть посчитана за год', turn !== null && turn >= 0, `turnover=${turn}%`);
  check('A: снапшотов текучести ≤13', (s.restaurant!.staff.turnover?.snapshots.length ?? 0) <= 13);
}

// === Сценарий B: купить в апреле (нед ~15), демонтировать по событию ===
{
  let s = baseState();
  s = playWeeks(s, 15);
  const r = s.restaurant!;
  const month = monthOfDay(dayOfYear(s.week, s.day));
  const buy = buyVerandaPermit(s);
  check('B: разрешение куплено', buy.ok, `week=${s.week} month=${month} msg=${buy.message}`);
  check('B: транзакция лицензии есть', r.finance.transactions.some((t) => t.description?.includes('еранд') && t.direction === 'out'));
  check('B: места +20', r.verandaSeats === 20);
  s = playWeeks(s, 6);
  const activeJune = s.restaurant!.verandaActive;
  check('B: активна в тёплый месяц', activeJune === true, `week=${s.week} month=${monthOfDay(dayOfYear(s.week, s.day))}`);
  const content = s.restaurant!.finance.transactions.filter((t) => t.description === 'Содержание летней веранды');
  check('B: содержание списывается', content.length > 0, `${content.length} транзакций`);
  let found = false;
  for (let guard = 0; guard < 30 && !found; guard++) {
    s = playWeeks(s, 1);
    found = s.activeEvents.some((e) => e.templateId === 'veranda_teardown' && !e.resolved);
  }
  check('B: событие демонтажа в октябре появилось', found, `week=${s.week}`);
  const ev = s.activeEvents.find((e) => e.templateId === 'veranda_teardown' && !e.resolved)!;
  const res = resolveEvent(s, ev.id, 0);
  check('B: демонтаж решён', res.ok, res.message);
  check('B: removed=true', s.restaurant!.licenses.veranda?.removed === true);
  check('B: не испорчена', s.restaurant!.licenses.veranda?.spoiled !== true);
  check('B: verandaActive=false', s.restaurant!.verandaActive === false);
  const fine = s.restaurant!.finance.transactions.filter((t) => t.description?.includes('Порча'));
  check('B: порчи нет', fine.length === 0);
}

// === Сценарий C: не решать событие — авто-решение 3:1 ===
{
  let spoiled = 0;
  const RUNS = 8;
  for (let run = 0; run < RUNS; run++) {
    let s = baseState();
    s = playWeeks(s, 15 + run);
    buyVerandaPermit(s);
    s = playWeeks(s, 32);
    const permit = s.restaurant!.licenses.veranda;
    if (permit?.spoiled) spoiled++;
    const stillPending = s.activeEvents.some((e) => e.templateId === 'veranda_teardown' && !e.resolved);
    check(`C[${run}]: событие закрыто авто-решением`, !stillPending);
  }
  check('C: авто 3:1 — spoiled чаще половины прогонов', spoiled >= RUNS / 2, `spoiled=${spoiled}/${RUNS}`);
}

// === Сценарий D: демонтаж руками с экрана Лицензии ===
{
  let s = baseState();
  s = playWeeks(s, 15);
  buyVerandaPermit(s);
  let found = false;
  for (let guard = 0; guard < 30 && !found; guard++) {
    s = playWeeks(s, 1);
    found = s.activeEvents.some((e) => e.templateId === 'veranda_teardown' && !e.resolved);
  }
  const out = dismantleVeranda(s);
  check('D: демонтаж через экшен прошёл', out.ok, out.message);
  check('D: событие закрылось', !s.activeEvents.some((e) => e.templateId === 'veranda_teardown' && !e.resolved));
  check('D: removed=true', s.restaurant!.licenses.veranda?.removed === true);
}

// === Сценарий E: покупка в сентябре — сезон пропущен ===
{
  let s = baseState();
  s = playWeeks(s, 35);
  const month = monthOfDay(dayOfYear(s.week, s.day));
  const buy = buyVerandaPermit(s);
  if (month >= 9) {
    check('E: покупка в сентябре прошла (игрок вправе ошибиться)', buy.ok, `month=${month} msg=${buy.message}`);
    s = playWeeks(s, 2);
    check('E: веранда НЕ активна (октябрь)', s.restaurant!.verandaActive === false);
  } else {
    check('E: (месяц не сентябрь — информационно)', true, `month=${month} msg=${buy.message}`);
  }
}

console.log(fails === 0 ? '\n=== ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ===' : `\n=== ПРОВАЛОВ: ${fails} ===`);
process.exit(fails === 0 ? 0 : 1);
