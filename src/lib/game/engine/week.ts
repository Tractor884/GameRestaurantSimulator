/**
 * СИМУЛЯЦИЯ НЕДЕЛИ (ТЗ §3.4): прогоняет дни до конца ТЕКУЩЕЙ недели.
 *
 * Финансовое закрытие недели выполняется внутри simulateDay при переходе
 * дня 6 → следующая неделя (см. weekclose.ts) — это чинит баг «неделя
 * не закрывается, если играть только кнопкой День».
 *
 * Кнопка «Неделя» теперь означает «довести текущую неделю до конца»:
 * нажатие в любой день недели досимулирует оставшиеся дни и закроет неделю
 * (P&L, зарплата, аренда/налоги/кредиты по графику, BSC, weekStats).
 * Прерывание: критическое событие (пауза) или конец игры.
 */
import type { GameState, WeekSimulationResult } from '../types';
import { cloneState } from './core';
import { simulateDay } from './day';
import { closeWeek } from './weekclose';

export { closeWeek } from './weekclose';

export function simulateWeek(
  state: GameState,
  seed: number,
): { result: WeekSimulationResult | null; state: GameState } {
  let current = cloneState(state);
  const startWeek = current.week;
  let guard = 0; // страховка от бесконечного цикла (не больше 8 дней)

  while (
    current.week === startWeek &&
    current.phase !== 'gameover' &&
    !current.activeEvents.some((e) => !e.resolved) &&
    guard < 8
  ) {
    const { state: next } = simulateDay(current, { plannedActions: [] }, seed);
    current = next;
    guard++;
  }

  // Отчёт возвращаем только если закрыта именно та неделя, с которой начали.
  // Если неделю прервало критическое событие — result = null (закрытия не было).
  const result =
    current.weekResult && current.weekResult.week === startWeek ? current.weekResult : null;
  return { result, state: current };
}
