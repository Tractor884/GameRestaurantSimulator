/**
 * ============================================================================
 * ЭКРАН «СОВЕТНИКИ»: БРИФЫ РУКОВОДСТВА (запрос пользователя, 27-a)
 * ============================================================================
 * Ольга (маркетолог), Андрей (банкир), Игорь (владелец) — три советника,
 * у которых до этого экрана не было «своего места» в интерфейсе.
 * Pure-функции от GameState (как academy.ts): только чтение, без мутаций,
 * без RNG и Date.now() — эталоны движка не затрагиваются.
 */
import type { GameState, MarketingCampaign, SegmentId } from '@/lib/game/types';
import { LOCATIONS_MAP } from '@/lib/game/config/locations.config';
import { MARKETING_CHANNELS, MARKETING_CHANNELS_MAP } from '@/lib/game/config/marketing.config';
import { SEGMENTS } from '@/lib/game/config/segments.config';
import { difficultyWin } from '@/lib/game/config/difficulty.config';
import { leverageOf } from '@/lib/game/engine/permanent';
import { guestTrend } from './characters';
import { runwayWeeks } from './finance';

/* ───────────────────────── Ольга — маркетолог ───────────────────────── */

export interface AdvisorCampaign {
  channelId: string;
  channelName: string;
  weeklyBudget: number; // ₽/нед
  remainingWeeks: number; // до конца кампании
}

export interface MarketerBrief {
  /** Тренд гостей (guestTrend, доля: +0.08 = +8%). */
  trend: number;
  /** Идущие кампании (endedWeek == null — списывают бюджет). */
  activeCampaigns: AdvisorCampaign[];
  /** Суммарный бюджет идущих кампаний, ₽/нед. */
  weeklySpend: number;
  /** Доля маркетинга в выручке последней недели (pnl.marketing/revenue). */
  budgetShare: number | null;
  /** Ядро-сегмент локации (max доля в segmentShares). */
  coreSegmentId: SegmentId | null;
  coreSegmentName: string;
  /** Канал с максимальной аффинностью ядро-сегмента. */
  bestChannelId: string | null;
  bestChannelName: string;
  /** Совет маркетолога (правила из ТЗ задачи 27-a). */
  advice: string;
}

/** Ядро-сегмент локации: максимальная доля в segmentShares. */
export function coreSegmentOf(state: GameState): SegmentId | null {
  const loc = LOCATIONS_MAP[state.restaurant?.locationId ?? ''];
  if (!loc) return null;
  let best: SegmentId | null = null;
  let bestShare = -1;
  for (const [id, share] of Object.entries(loc.segmentShares)) {
    if ((share ?? 0) > bestShare) {
      bestShare = share ?? 0;
      best = id as SegmentId;
    }
  }
  return best;
}

export function marketerBrief(state: GameState): MarketerBrief {
  const r = state.restaurant;
  const trend = guestTrend(state);

  const activeRaw: MarketingCampaign[] = (r?.marketing.campaigns ?? []).filter(
    (c) => c.endedWeek == null,
  );
  const activeCampaigns: AdvisorCampaign[] = activeRaw.map((c) => ({
    channelId: c.channelId,
    channelName: MARKETING_CHANNELS_MAP[c.channelId]?.name ?? c.channelId,
    weeklyBudget: c.weeklyBudget,
    remainingWeeks: Math.max(0, c.startWeek + c.durationWeeks - state.week),
  }));
  const weeklySpend = activeCampaigns.reduce((s, c) => s + c.weeklyBudget, 0);

  const pnl = state.weekResult?.pnl;
  const budgetShare = pnl && pnl.revenue > 0 ? pnl.marketing / pnl.revenue : null;

  const coreSegmentId = coreSegmentOf(state);
  const coreSegmentName = coreSegmentId ? (SEGMENTS[coreSegmentId]?.name ?? '') : '';
  let bestChannelId: string | null = null;
  if (coreSegmentId) {
    let bestAff = -1;
    for (const ch of MARKETING_CHANNELS) {
      const aff = ch.affinity[coreSegmentId] ?? 0;
      if (aff > bestAff) {
        bestAff = aff;
        bestChannelId = ch.id;
      }
    }
  }
  const bestChannelName = bestChannelId
    ? (MARKETING_CHANNELS_MAP[bestChannelId]?.name ?? '')
    : '';

  // Совет (§ задачи): тренд < −3% без кампаний → запускать; доля бюджета > 6%
  // → сокращать (канал с минимальным остатком «выдыхается»); иначе — тест.
  let advice: string;
  if (trend < -0.03 && activeCampaigns.length === 0) {
    advice = bestChannelName
      ? `Трафик падает без продвижения. Запустите кампанию: лучший канал под ваш ядро-сегмент («${coreSegmentName}») — ${bestChannelName}.`
      : 'Трафик падает без продвижения — запустите кампанию на вкладке «Маркетинг».';
  } else if (budgetShare !== null && budgetShare > 0.06) {
    const dying = [...activeCampaigns].sort((a, b) => a.remainingWeeks - b.remainingWeeks)[0];
    advice = dying
      ? `Бюджет велик (${(budgetShare * 100).toFixed(1)}% выручки при норме 2–5%): канал «${dying.channelName}» выдыхается (остаток ${dying.remainingWeeks} нед) — не продлевайте его вслепую.`
      : `Бюджет велик (${(budgetShare * 100).toFixed(1)}% выручки при норме 2–5%) — сократите кампании и клининг.`;
  } else {
    advice = 'Спрос стабилен, время для теста нового канала: распределите бюджет между двумя каналами.';
  }

  return {
    trend,
    activeCampaigns,
    weeklySpend,
    budgetShare,
    coreSegmentId,
    coreSegmentName,
    bestChannelId,
    bestChannelName,
    advice,
  };
}

/* ───────────────────────── Андрей — банкир ───────────────────────── */

export interface BankerBrief {
  /** Остаток основного долга, ₽ (Σ loans.remaining). */
  debtRemaining: number;
  /** Аннуитетные платежи ближайших 4 нед, ₽ (Σ loans.payment). */
  payments4w: number;
  /** Прибыль последних 4 нед, ₽ (Σ weekStats.netProfit; null при < 2 нед). */
  profit4w: number | null;
  /** DSCR = прибыль 4 нед ÷ платежи 4 нед (null — данных < 2 нед или кредитов нет). */
  dscr: number | null;
  /** Кредитное плечо NetDebt/активы (leverageOf движка). */
  leverage: number;
  /** Кассовая «взлётная полоса», нед (runwayWeeks). */
  runwayWeeks: number;
  /** Сколько недель на балансе держится долг (для «2 нед подряд»). */
  debtWeeks: number;
  /** Есть ли хотя бы одна закрытая неделя (иначе runway/DSCR — прочерк). */
  hasWeeks: boolean;
  advice: string;
}

export function bankerBrief(state: GameState): BankerBrief {
  const r = state.restaurant;
  const loans = r?.finance.loans ?? [];
  const debtRemaining = loans.reduce((s, l) => s + l.remaining, 0);
  const payments4w = loans.reduce((s, l) => s + (l.remaining > 0 ? l.payment : 0), 0);

  const last4 = state.history.weekStats.slice(-4);
  const profit4w =
    state.history.weekStats.length >= 2 ? last4.reduce((s, w) => s + w.netProfit, 0) : null;
  const dscr = profit4w !== null && payments4w > 0 ? profit4w / payments4w : null;

  const leverage = r ? leverageOf(r) : 0;
  const runway = runwayWeeks(state);
  // Долг «2 нед подряд»: самый ранний из действующих кредитов выдан ≥ 2 нед назад
  // (исторического плеча в WeekStat нет — состояние на сейчас + стаж долга).
  const debtWeeks = loans.length
    ? Math.max(0, state.week - Math.min(...loans.map((l) => l.disbursementWeek)))
    : 0;

  let advice: string;
  if (loans.length === 0) {
    advice = 'Идеальная позиция: долгов нет — кредитная подушка на рост всегда под рукой.';
  } else if (dscr !== null && dscr < 1.1) {
    advice =
      'Платежи съедают прибыль — досрочно гасите или реструктурируйте: DSCR ниже 1.1 не оставляет запаса на плохую неделю.';
  } else if (leverage > 1 && debtWeeks >= 2) {
    advice =
      'Банк видит нагрузку: чистый долг выше активов вторую неделю — новые деньги будут дороже.';
  } else {
    advice = 'Дисциплина в норме: платежи по графику, долговая нагрузка посильная.';
  }

  return {
    debtRemaining,
    payments4w,
    profit4w,
    dscr,
    leverage,
    runwayWeeks: runway,
    debtWeeks,
    hasWeeks: state.history.weekStats.length > 0,
    advice,
  };
}

/* ───────────────────────── Игорь — владелец ───────────────────────── */

export interface OwnerGoal {
  id: 'rating' | 'profit' | 'cash' | 'bsc' | 'streak';
  /** Короткое имя для совета («рейтинг», «прибыль»…). */
  label: string;
  /** Полное имя для подписи. */
  title: string;
  /** Текущее значение (для подписи). */
  value: string;
  /** Целевое значение (для подписи). */
  target: string;
  /** Прогресс 0..∞ (value/target, без капа). */
  progress: number;
  /** В графике: progress >= max(0.15, week/52). */
  onTrack: boolean;
}

export interface OwnerBrief {
  /** Пять целей сложности с прогрессом. */
  goals: OwnerGoal[];
  onTrackCount: number;
  laggingCount: number;
  /** Имена отстающих целей, самые отстающие первыми. */
  laggingLabels: string[];
  /** BSC последней закрытой недели. */
  bscLastWeek: number;
  /** Дивиденды, выплаченные за год, ₽. */
  dividendsPaid: number;
  /** Недель до конца года (52 − week). */
  weeksLeft: number;
  advice: string;
}

/** Дивиденды за год: журнал дивидендов (переживает обрезку транзакций до
 *  ~200) с fallback на Σ транзакций типа 'dividend' (старые сейвы). */
export function dividendsPaidTotal(state: GameState): number {
  const hist = state.restaurant?.finance.dividends?.history ?? [];
  if (hist.length > 0) return hist.reduce((s, h) => s + h.paid, 0);
  return (state.restaurant?.finance.transactions ?? [])
    .filter((t) => t.type === 'dividend')
    .reduce((s, t) => s + t.amount, 0);
}

export function ownerBrief(state: GameState): OwnerBrief {
  const r = state.restaurant;
  const win = difficultyWin(state.difficultyId);
  // Порог «в графике»: цель × (пройденная доля года, минимум 15%) — как в
  // characters.ts goalsLagging (§9).
  const expected = Math.max(0.15, state.week / 52);

  const lastQuarter = state.history.weekStats.slice(-12);
  const bscAvg = lastQuarter.length
    ? lastQuarter.reduce((s, w) => s + w.bsc, 0) / lastQuarter.length
    : 0;
  // Серия положительных недель подряд с конца (как GoalsPanel — живая серия).
  let streak = 0;
  for (let i = state.history.weekStats.length - 1; i >= 0; i--) {
    if (state.history.weekStats[i].netProfit > 0) streak++;
    else break;
  }

  const mk = (v: number, target: number): { progress: number; onTrack: boolean } => ({
    progress: target > 0 ? v / target : 1,
    onTrack: target > 0 ? v / target >= expected : true,
  });

  const short = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} млн` : `${Math.round(v / 1000)} тыс`;
  const rating = r?.reputation.rating ?? 0;
  const cumProfit = state.history.cumulativeNetProfit;
  const cash = r?.finance.cash ?? 0;

  const goals: OwnerGoal[] = [
    {
      id: 'rating',
      label: 'рейтинг',
      title: 'Рейтинг',
      value: rating.toFixed(2),
      target: `≥ ${win.minRating}`,
      ...mk(rating, win.minRating),
    },
    {
      id: 'profit',
      label: 'прибыль',
      title: 'Накопленная прибыль',
      value: short(cumProfit),
      target: `≥ ${short(win.minCumulativeProfit)}`,
      ...mk(cumProfit, win.minCumulativeProfit),
    },
    {
      id: 'cash',
      label: 'касса',
      title: 'Касса',
      value: short(cash),
      target: `≥ ${short(win.minCash)}`,
      ...mk(cash, win.minCash),
    },
    {
      id: 'bsc',
      label: 'BSC',
      title: 'BSC квартала',
      value: bscAvg ? bscAvg.toFixed(0) : '—',
      target: `≥ ${win.minBscAvgQuarter}`,
      ...mk(bscAvg, win.minBscAvgQuarter),
    },
    {
      id: 'streak',
      label: 'позитивные недели',
      title: 'Положит. недель подряд',
      value: `${streak}`,
      target: `≥ ${win.minPositiveOpWeeks}`,
      ...mk(streak, win.minPositiveOpWeeks),
    },
  ];

  const onTrackCount = goals.filter((g) => g.onTrack).length;
  const lagging = goals
    .filter((g) => !g.onTrack)
    .sort((a, b) => a.progress - b.progress);
  const laggingLabels = lagging.map((g) => g.label);

  const bscLastWeek = state.weekResult?.bsc.total ?? state.history.weekStats.at(-1)?.bsc ?? 0;
  const dividendsPaid = dividendsPaidTotal(state);
  const weeksLeft = Math.max(0, 52 - state.week);

  let advice: string;
  if (lagging.length >= 3) {
    advice = `Владелец ждёт план исправления: приоритеты — ${laggingLabels
      .slice(0, 3)
      .join(', ')}.`;
  } else if (lagging.length === 0) {
    advice = 'Владелец доволен: все цели в графике — готовьте разговор о дивидендах.';
  } else {
    const n = lagging.length;
    advice = `Держите темп: ${n === 1 ? 'одна цель под вопросом' : `${n} цели под вопросом`} (${laggingLabels.join(', ')}).`;
  }

  return { goals, onTrackCount, laggingCount: lagging.length, laggingLabels, bscLastWeek, dividendsPaid, weeksLeft, advice };
}
