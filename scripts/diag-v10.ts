/** v10: верификация инфляции §10, переработок §5.2, меню-усталости §14. */
import { createGame, simulateDay, resolveEvent } from '../src/lib/game/engine';
import { menuFreshnessFactor, dishAge } from '../src/lib/game/engine';
import type { GameState } from '../src/lib/game/types';

let state: GameState = createGame({
  seed: 777,
  restaurantName: 'v10',
  locationId: 'tverskaya',
  premisesSize: 'medium',
  renovation: 'standard',
  loanAmount: 6_000_000,
  equipment: { kitchen: 'standard', coffee: 'standard', hall: 'standard' },
  veranda: false,
  alcoholLicense: false,
});

const inflLine = () => {
  const inf = state.restaurant!.finance.inflation!;
  return `шаги=${inf.steps} food=${inf.foodIdx.toFixed(3)} wage=${inf.wageIdx.toFixed(3)} util=${inf.utilIdx.toFixed(3)}`;
};

console.log('старт:', inflLine(), '· свежесть', (menuFreshnessFactor(state.restaurant!) * 100).toFixed(1) + '%');

let overtimeTx = 0;
let overtimeSum = 0;
let lastWeek = 0;
for (let i = 0; i < 26 * 7 && state.phase !== 'gameover'; i++) {
  const res = simulateDay(state, { plannedActions: [] }, state.seed);
  state = res.state;
  for (const e of state.activeEvents.filter((x) => !x.resolved)) {
    resolveEvent(state, e.id, 0);
  }
  if (state.week !== lastWeek) {
    lastWeek = state.week;
    const txs = state.restaurant!.finance.transactions.filter(
      (t) => t.type === 'overtime' && t.date.week === lastWeek - 1,
    );
    if (txs.length > 0) {
      overtimeTx += txs.length;
      overtimeSum += txs.reduce((s, t) => s + t.amount, 0);
    }
    if (state.week % 4 === 1) {
      const r = state.restaurant!;
      console.log(
        `нед ${String(lastWeek - 1).padStart(2)}:`,
        inflLine(),
        '· свежесть', (menuFreshnessFactor(r) * 100).toFixed(1) + '%',
        '· возраст борща', dishAge(r.menu, 'borsch') ?? '—',
        '· рейтинг', r.reputation.rating.toFixed(2),
      );
    }
  }
}
console.log('сверхурочные за 26 нед:', overtimeTx, 'транзакций,', Math.round(overtimeSum / 1000), 'тыс ₽');
const pnl = state.weekResult?.pnl;
console.log('P&L overtime последней недели:', pnl?.overtime ?? 0, '₽');
console.log('касса:', Math.round(state.restaurant!.finance.cash / 1000), 'тыс ₽');
