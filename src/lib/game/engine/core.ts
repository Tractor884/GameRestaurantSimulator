/**
 * Ядро движка: транзакции, деньги, клонирование, время.
 * ГЛАВНЫЙ ИНВАРИАНТ (ТЗ §26.4): деньги не создаются из воздуха.
 * Любое изменение cash — только через addTransaction().
 */
import type {
  FinancialTransaction,
  GameDate,
  GameState,
  Restaurant,
  TransactionType,
} from '../types';
import { FINANCE } from '../config/finance.config';

let txCounter = 0;

/** Записать транзакцию и изменить кассу. Единственная точка движения денег. */
export function addTransaction(
  restaurant: Restaurant,
  date: GameDate,
  type: TransactionType,
  amount: number,
  direction: 'in' | 'out',
  description: string,
): FinancialTransaction {
  const tx: FinancialTransaction = {
    id: `tx-${++txCounter}-${date.week}-${date.day}`,
    date,
    type,
    amount: Math.max(0, Math.round(amount)),
    direction,
    description,
  };
  restaurant.finance.transactions.push(tx);
  restaurant.finance.cash += direction === 'in' ? tx.amount : -tx.amount;
  if (restaurant.finance.transactions.length > FINANCE.maxTransactions) {
    restaurant.finance.transactions.splice(0, restaurant.finance.transactions.length - FINANCE.maxTransactions);
  }
  return tx;
}

/** Глубокий клон состояния (иммутабельность входа, ТЗ §2.2). */
export function cloneState<T>(state: T): T {
  return structuredClone(state);
}

/** День года: неделя 1, день 0 = 1 января. */
export function dayIndex(date: GameDate): number {
  return (date.week - 1) * 7 + date.day;
}

export function gameDateEqual(a: GameDate, b: GameDate): boolean {
  return a.week === b.week && a.day === b.day;
}

/** Часы работы: будни openHours.end; пт/сб до weekendEnd (ТЗ §4.2). */
export function workingHours(restaurant: Restaurant, dayOfWeek: number): number[] {
  const start = restaurant.openHours.start;
  const end = dayOfWeek === 4 || dayOfWeek === 5 ? restaurant.weekendEnd : restaurant.openHours.end;
  const hours: number[] = [];
  for (let h = start; h < end; h++) hours.push(h);
  return hours;
}

export const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Сумма транзакций недели по типу. */
export function sumTransactions(state: GameState, week: number, type: TransactionType): number {
  return state.restaurant?.finance.transactions
    .filter((t) => t.date.week === week && t.type === type)
    .reduce((s, t) => s + (t.direction === 'out' ? -t.amount : t.amount), 0) ?? 0;
}

/** Форматирование денег для UI. */
export function fmtMoney(v: number): string {
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(Math.round(v));
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} млн ₽`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)} тыс ₽`;
  return `${sign}${abs.toLocaleString('ru-RU')} ₽`;
}

export function fmtNum(v: number, digits = 0): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

export function fmtPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
