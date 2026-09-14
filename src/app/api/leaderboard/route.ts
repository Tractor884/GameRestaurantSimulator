/**
 * API РЕЙТИНГА ИГРОКОВ (Task 28 — «играть с друзьями»).
 *
 * GET  /api/leaderboard      → топ-50 попыток (score desc, createdAt asc — при
 *                              равных очках раньше сыгравший выше).
 * POST /api/leaderboard      → сохранить результат финала (валидация zod).
 *
 * Каждая завершённая игра = ОТДЕЛЬНАЯ строка (история попыток, ничего не
 * перезаписывается). Уровень — ранг A+…D− из computeFinalGrade, очки — 0–1000.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
// Значения рангов/сложностей берём из движка — единственный источник правды.
import { RANK_PRESENTATION } from '@/lib/game/engine/finalGrade';
import { DIFFICULTIES } from '@/lib/game/config/difficulty.config';

export const dynamic = 'force-dynamic';

/** Допустимые ранги финальной оценки (ключи RANK_PRESENTATION: A+…D−). */
const RANK_IDS = Object.keys(RANK_PRESENTATION) as [string, ...string[]];
/** Допустимые сложности (ключи DIFFICULTIES: novice|standard|professional). */
const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as [string, ...string[]];

const postSchema = z.object({
  nick: z
    .string({ message: 'Ник обязателен' })
    .trim()
    .min(2, 'Ник: минимум 2 символа')
    .max(24, 'Ник: максимум 24 символов'),
  restaurantName: z
    .string({ message: 'Название ресторана обязательно' })
    .trim()
    .min(1, 'Название ресторана: минимум 1 символ')
    .max(60, 'Название ресторана: максимум 60 символов'),
  level: z.enum(RANK_IDS, { message: 'Недопустимый уровень (ранг A+…D−)' }),
  score: z
    .number({ message: 'Очки должны быть числом' })
    .int('Очки должны быть целым числом')
    .min(0, 'Очки: минимум 0')
    .max(1000, 'Очки: максимум 1000'),
  difficulty: z.enum(DIFFICULTY_IDS, { message: 'Недопустимая сложность' }),
  weeksLived: z
    .number({ message: 'Недели должны быть числом' })
    .int('Недели должны быть целым числом')
    .min(1, 'Недель прожито: минимум 1')
    .max(52, 'Недель прожито: максимум 52'),
});

/** Топ-50 результатов. */
export async function GET() {
  try {
    const results = await db.playerResult.findMany({
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: 50,
    });
    return NextResponse.json({ results });
  } catch (e) {
    console.error('[leaderboard] GET failed:', e);
    return NextResponse.json(
      { error: 'Не удалось загрузить рейтинг — попробуйте позже' },
      { status: 500 },
    );
  }
}

/** Сохранить результат финала (каждый финал = новая строка истории). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Тело запроса — не JSON' }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'Некорректные данные результата' },
      { status: 400 },
    );
  }

  try {
    const created = await db.playerResult.create({ data: parsed.data });
    return NextResponse.json({ result: created }, { status: 201 });
  } catch (e) {
    console.error('[leaderboard] POST failed:', e);
    return NextResponse.json(
      { error: 'Не удалось сохранить результат — попробуйте позже' },
      { status: 500 },
    );
  }
}
