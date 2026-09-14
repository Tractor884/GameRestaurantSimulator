/**
 * ЛОКАЛЬНЫЙ (ОФЛАЙН) РЕЙТИНГ — персональная история финалов (Task 30).
 *
 * Зачем: статическая сборка для VPS (output:export) не умеет API-роуты,
 * поэтому общий рейтинг /api/leaderboard там недоступен. Каждый финал года
 * ВСЕГДА дополнительно пишется в localStorage — в оффлайн-версии таблица
 * рейтинга показывает эту локальную историю, а в онлайн-версии — общий топ.
 *
 * Записи дедуплицируются по id (= отпечаток финала nick|seed|score|weeks),
 * так что повторная отправка после перезагрузки страницы не создаёт дублей.
 */

/** Запись локального рейтинга — форма совместима с ответом GET /api/leaderboard. */
export interface LocalLeaderboardEntry {
  id: string;
  nick: string;
  restaurantName: string;
  level: string;
  score: number;
  difficulty: string;
  weeksLived: number;
  createdAt: string;
}

const KEY = 'rest-sim-leaderboard-local-v1';
const MAX_ENTRIES = 50;

function isEntry(v: unknown): v is LocalLeaderboardEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.nick === 'string' &&
    typeof e.restaurantName === 'string' &&
    typeof e.level === 'string' &&
    typeof e.score === 'number' &&
    typeof e.difficulty === 'string' &&
    typeof e.weeksLived === 'number' &&
    typeof e.createdAt === 'string'
  );
}

/** Локальная история финалов: сортировка как на сервере (очки ↓, раньше сыгравший выше). */
export function loadLocalEntries(): LocalLeaderboardEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .sort((a, b) => (b.score - a.score) || (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, MAX_ENTRIES);
  } catch {
    /* приватный режим браузера / битый JSON — просто нет истории */
    return [];
  }
}

/** Сохранить финал в локальную историю (идемпотентно по id, максимум 50 записей). */
export function saveLocalEntry(entry: LocalLeaderboardEntry): void {
  try {
    const next = [
      ...loadLocalEntries().filter((e) => e.id !== entry.id),
      entry,
    ]
      .sort((a, b) => (b.score - a.score) || (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* приватный режим браузера — не критично */
  }
}
