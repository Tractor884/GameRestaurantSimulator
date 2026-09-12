/**
 * ФИНАЛЬНЫЙ УРОВЕНЬ (БАЛ-v2 §20 + запрос пользователя v9): ЕДИНАЯ шкала
 * 0–1000 баллов и 10 уровней D−…A+ (полосы по 100 очков). Счёт 0–1000 —
 * те же 6 направлений (финансы/клиенты/операционка/персонал/рост/риски),
 * уровень — полоса счёта. Прежний «скор 0..100 из 4 осей» и параллельная
 * категория статуса («сильный/устойчивый ресторан») убраны как путаница:
 * ОДНА цифра, ОДИН уровень, статусы — только фактическая строка итога.
 *
 * БЕЗ новых бросков ГСЧ (детерминизм не затрагивается): функция чистая,
 * зависит только от состояния — одинаково работает в движковых тестах
 * и в GameOverDialog. Оси (рейтинг/маржа/BSC/текучесть) остаются ДИАГНОСТИКОЙ
 * слабых мест (советы «куда расти»), но не вторым счётом.
 *
 * Калибровка полос: пассив (счёт ~480–520) → C+/C («пассив = середина»);
 * сильный игрок-победитель → A/A+ (800+).
 */
import type { GameState } from '../types';
import { LOSE_CONDITIONS } from '../config/difficulty.config';
import { computeFinalScore } from './bsc';

export type FinalRankId = 'D-' | 'D' | 'D+' | 'C-' | 'C' | 'C+' | 'B' | 'B+' | 'A' | 'A+';

/** 10 уровней единой шкалы: полосы по 100 очков из 1000. */
const SCORE_BANDS: readonly { rank: FinalRankId; min: number; max: number }[] = [
  { rank: 'A+', min: 900, max: 1000 },
  { rank: 'A', min: 800, max: 899 },
  { rank: 'B+', min: 700, max: 799 },
  { rank: 'B', min: 600, max: 699 },
  { rank: 'C+', min: 500, max: 599 },
  { rank: 'C', min: 400, max: 499 },
  { rank: 'C-', min: 300, max: 399 },
  { rank: 'D+', min: 200, max: 299 },
  { rank: 'D', min: 100, max: 199 },
  { rank: 'D-', min: 0, max: 99 },
];

/** Уровень единой шкалы 0–1000 (запрос пользователя: одна оценка, 10 уровней). */
export function scoreLevel(total: number): FinalRankId {
  const t = Math.max(0, Math.min(1000, Math.round(total)));
  return SCORE_BANDS.find((b) => t >= b.min && t <= b.max)!.rank;
}

/** Границы полосы уровня (для подписи «700–799 из 1000»). */
export function scoreBandRange(rank: FinalRankId): { min: number; max: number } {
  const b = SCORE_BANDS.find((x) => x.rank === rank)!;
  return { min: b.min, max: b.max };
}

/** Оси скора: веса §20 «рейтинг × маржа × BSC × текучесть». */
export const GRADE_AXIS_WEIGHTS = { rating: 0.3, margin: 0.25, bsc: 0.3, turnover: 0.15 } as const;

/** Калибровка осей (анкеры: 0 → 0, anchor → 1, выше — кап). */
const AXIS_ANCHORS = {
  ratingLow: 3.2,
  ratingHigh: 4.8,
  marginFull: 0.14,
  bscLow: 35,
  bscHigh: 85,
  turnoverFull: 0.15,
  turnoverZero: 0.55,
} as const;

export interface FinalGradeSpecial {
  /** §20 «Кухня со звёздами»: рейтинг ≥ 4,8 + BSC ≥ 85 + победа. */
  starsKitchen: boolean;
  /** Ресторан переехал по ультиматуму арендодателя (v8). */
  relocated: boolean;
  bankrupt: boolean;
  /** Причина банкротства (первая сработавшая из weekclose). */
  bankruptReason: 'cash' | 'loans' | 'rating' | null;
  ownerReplaced: boolean;
  /** Победа (sustainable/excellent) на 52-й неделе. */
  win: boolean;
}

export interface FinalGrade {
  rank: FinalRankId;
  /** ЕДИНЫЙ счёт 0..1000 (запрос пользователя): уровень = его полоса. */
  score1000: number;
  /** Ось 0..1 по каждой компоненте (только диагностика «куда расти»). */
  axes: { rating: number; margin: number; bsc: number; turnover: number };
  /** Сырые метрики финала (для отображения). */
  metrics: {
    rating: number;
    marginPct: number; // годовая чистая маржа, %
    bscAvg: number; // средний BSC последнего квартала
    turnoverPct: number; // оценка текучести, %
    weeksLived: number;
  };
  special: FinalGradeSpecial;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Годовая чистая маржа из недельной статистики (0, если выручки не было). */
function annualMarginPct(state: GameState): number {
  const ws = state.history.weekStats;
  const rev = ws.reduce((s, w) => s + w.revenue, 0);
  if (rev <= 0) return 0;
  const net = ws.reduce((s, w) => s + w.netProfit, 0);
  return (net / rev) * 100;
}

/** Средний BSC последнего квартала (та же база, что у условий победы §37.3). */
function lastQuarterBsc(state: GameState): number {
  const last12 = state.history.weekStats.slice(-12);
  if (last12.length === 0) return 0;
  return last12.reduce((s, w) => s + w.bsc, 0) / last12.length;
}

/** Оценка текучести из кадрового риска (модель BSC движка). */
function turnoverOf(state: GameState): number {
  const r = state.restaurant;
  if (!r) return 0;
  return Math.min(0.6, Math.max(0.05, r.risks.staff / 160));
}

/** Чистый расчёт финального уровня и спец-финалов из состояния.
 *  Счёт 0–1000 — финальный счёт движка (6 направлений; на gameover уже
 *  вычислен в weekResult), уровень — полоса счёта. */
export function computeFinalGrade(state: GameState): FinalGrade {
  const r = state.restaurant;
  const rating = r?.reputation.rating ?? 0;
  const marginPct = annualMarginPct(state);
  const bscAvg = lastQuarterBsc(state);
  const turnover = turnoverOf(state);

  const axes = {
    rating: clamp01((rating - AXIS_ANCHORS.ratingLow) / (AXIS_ANCHORS.ratingHigh - AXIS_ANCHORS.ratingLow)),
    margin: clamp01(marginPct / 100 / AXIS_ANCHORS.marginFull),
    bsc: clamp01((bscAvg - AXIS_ANCHORS.bscLow) / (AXIS_ANCHORS.bscHigh - AXIS_ANCHORS.bscLow)),
    turnover: clamp01((AXIS_ANCHORS.turnoverZero - turnover) / (AXIS_ANCHORS.turnoverZero - AXIS_ANCHORS.turnoverFull)),
  };

  // ЕДИНЫЙ счёт: считаем финальный счёт движка (в weekResult он уже есть —
  // берём готовый; иначе пересчитываем из BSC последней недели).
  const wr = state.weekResult;
  const score1000 =
    wr?.finalScore?.total ??
    (wr?.bsc ? computeFinalScore(state, wr.bsc).total : 0);

  const rank = scoreLevel(score1000);

  const win = state.status === 'sustainable' || state.status === 'excellent';
  const bankrupt = state.status === 'bankrupt';
  const ownerReplaced = state.status === 'owner_replaced';
  // Причина банкротства — те же условия, что в weekclose (первая сработавшая).
  let bankruptReason: FinalGrade['special']['bankruptReason'] = null;
  if (bankrupt) {
    if ((r?.finance.cash ?? 0) < LOSE_CONDITIONS.bankruptCash) bankruptReason = 'cash';
    else if (r?.finance.loans.some((l) => l.overduePayments >= 8)) bankruptReason = 'loans';
    else if (state.history.lowRatingWeeks >= LOSE_CONDITIONS.lowRatingWeeks) bankruptReason = 'rating';
  }

  return {
    rank,
    score1000,
    axes,
    metrics: {
      rating,
      marginPct,
      bscAvg,
      turnoverPct: turnover * 100,
      weeksLived: state.history.weekStats.length,
    },
    special: {
      starsKitchen: win && rating >= 4.8 && bscAvg >= 85,
      relocated: (state.history.relocations ?? 0) > 0,
      bankrupt,
      bankruptReason,
      ownerReplaced,
      win,
    },
  };
}

/* ============================ ТЕКСТЫ РАНГОВ ============================ */

export interface RankPresentation {
  label: string;
  title: string;
  text: string;
  advice: string;
  /** Tailwind-классы фона шапки финала. */
  headCls: string;
  /** Цвет цифры ранга. */
  rankCls: string;
}

export const RANK_PRESENTATION: Record<FinalRankId, RankPresentation> = {
  'A+': {
    label: 'A+',
    title: 'Эталон индустрии',
    text:
      'Ресторан, по которому сверяют других: рейтинг, деньги, команда и процессы — всё на уровне, до ' +
      'которого дотягиваются единицы. Такой год управляющий вспоминает всю карьеру.',
    advice:
      'Ранги выше не существует. Можно рискнуть: снизить цены для очереди, поднять — для маржи, ' +
      'или принять один из дорогих вызовов и посмотреть, удержится ли A+ под нагрузкой.',
    headCls: 'from-amber-500 to-amber-700',
    rankCls: 'text-amber-400',
  },
  A: {
    label: 'A',
    title: 'Сильный ресторан',
    text:
      'Профессиональный год: маржа уровня «сильного» ресторана, рейтинг, которому доверяют гости, ' +
      'и управляемая команда. С таким активом говорят о цене бизнеса, а не о выживании.',
    advice:
      'До A+ обычно не хватает одной оси — посмотрите бары ниже: чаще всего это рейтинг ≥ 4,8 ' +
      '(свежие отзывы, ответы на негатив) или текучесть ≤ 15% (график и морали).',
    headCls: 'from-emerald-600 to-emerald-800',
    rankCls: 'text-emerald-400',
  },
  'B+': {
    label: 'B+',
    title: 'Уверенно выше рынка',
    text:
      'Хороший управленческий год: ресторан зарабатывает, гости возвращаются, команда стабильна. ' +
      'Московский рынок в среднем работает хуже — вы выше середины.',
    advice:
      'Ищите «потерянные проценты»: ревизию стоп-листов и списаний (Food Cost), равномерность ' +
      'графика (переработки) и дисциплину закупки. Каждая ось здесь стоит 1–2 п.п. маржи.',
    headCls: 'from-emerald-600 to-teal-800',
    rankCls: 'text-emerald-300',
  },
  B: {
    label: 'B',
    title: 'Крепкий середняк+',
    text:
      'Ресторан работает как положено: платит по счетам, кормит гостей, не сыплется. Это уровень ' +
      '«нормального управляющего» — и одновременно трамплин к сильному.',
    advice:
      'Пройдитесь по 6 компонентам счёта: подсветка покажет, где балл ниже трети максимума. ' +
      'Улучшайте по одному направлению за квартал — B+ собирается именно так.',
    headCls: 'from-teal-600 to-stone-800',
    rankCls: 'text-teal-300',
  },
  'C+': {
    label: 'C+',
    title: 'Рабочая лошадка',
    text:
      'Выживание обеспечено, но запаса прочности нет: одна плохая неделя или инспектор — и минус ' +
      'уходит глубже. Гости приходят, но не приводят друзей.',
    advice:
      'Начните с оси «клиенты»: неотвеченные отзывы копят юридический риск и режут приток новых ' +
      'гостей. Дешёвый ход с самым высоким рычагом.',
    headCls: 'from-amber-600 to-stone-800',
    rankCls: 'text-amber-300',
  },
  C: {
    label: 'C',
    title: 'Средний ресторан',
    text:
      'Классический «середняк»: выручка есть, маржа тонкая, команда дышит на ладан. В Москве так ' +
      'работает половина рынка — и столько же закрывается за два года.',
    advice:
      'Разверните P&L по кварталам (экран «Финансы») и найдите, где маржа утекает: списания, ' +
      'переработки, пустые часы. Обычно 2–3 решения возвращают 3–5 п.п.',
    headCls: 'from-stone-500 to-stone-800',
    rankCls: 'text-stone-200',
  },
  'C-': {
    label: 'C−',
    title: 'На грани',
    text:
      'Пассивный год: ресторан сам себя не убил, но и не поднял. Рейтинг стоит, деньги ' +
      'перетираются в операционке, команда не развивается. Владелец уже задаёт вопросы.',
    advice:
      'Минимальная программа: платите дивиденды по предложению (доверие), закрывайте вакансии ' +
      'и обновляйте меню раз в 8 недель. Три привычки, которые двигают ранг на ступень.',
    headCls: 'from-stone-500 to-stone-800',
    rankCls: 'text-stone-300',
  },
  'D+': {
    label: 'D+',
    title: 'Проблемный',
    text:
      'Год прошёл в режиме «тушения пожаров»: то касса, то персонал, то рейтинг. Каждая ось ' +
      'просела — ресторан держится на выручке, а не на управлении.',
    advice:
      'Не распыляйтесь: выберите ОДНУ ось на квартал (маржа или рейтинг) и не трогайте ' +
      'остальное. Параллельные проекты при слабом фундаменте добивают кассу.',
    headCls: 'from-orange-700 to-stone-900',
    rankCls: 'text-orange-300',
  },
  D: {
    label: 'D',
    title: 'Глубокий кризис',
    text:
      'Управление не состоялось: маржа отрицательная или близко, рейтинг ниже нормы, люди ' +
      'убегают. До смены статуса — один-два неудачных квартала.',
    advice:
      'Экстренный план: стоп-листы под контроль (FC), график под покрытие смен (переработки), ' +
      'ответы на все 1★. Цель — не победа, а остановка падения к 20-й неделе.',
    headCls: 'from-red-800 to-stone-900',
    rankCls: 'text-red-300',
  },
  'D-': {
    label: 'D−',
    title: 'Предбанкротное состояние',
    text:
      'Ресторан дожил до финала на остатках: долги, текучесть, репутация — всё в красном. ' +
      'Каждая неделя такого года стоила денег владельца.',
    advice:
      'При новом старте: не берите кредит 15 млн, не экономьте на персонале и следите за ' +
      'кассой раз в неделю. Кризис — это почти всегда каскад решений, а не невезение.',
    headCls: 'from-red-900 to-stone-950',
    rankCls: 'text-red-300',
  },
};

/* ======================= ТЕКСТЫ СПЕЦ-ФИНАЛОВ ======================= */

export interface SpecialPresentation {
  title: string;
  text: string;
  advice: string;
}

/** «Кухня со звёздами» (§20): рейтинг ≥ 4,8 + BSC ≥ 85 + победа. */
export const STARS_FINAL: SpecialPresentation = {
  title: 'Кухня со звёздами',
  text:
    'Гид пишет: «сюда стоит ехать через город». Рейтинг 4,8+, сбалансированная система ' +
    'управления (BSC 85+) и победа по всем условиям — этот год ресторан прожил на уровне ' +
    'материала для кулинарной книги.',
  advice:
    'Защищать репутацию сложнее, чем построить: держите идеальную чистоту (санриск), ' +
    'не пропускайте инспекции и продолжайте отвечать на отзывы — звёзды отбирают быстрее, чем выдают.',
};

/** «Управленца сменили» (§13.2): доверие владельца < 15. */
export const OWNER_REPLACED_FINAL: SpecialPresentation = {
  title: 'Управленца сменили',
  text:
    'Доверие владельца иссякло: неплаченные дивиденды, споры о развитии и молчание кассы сделали ' +
    'своё дело. Управляющего пригласили на разговор, из которого не возвращаются — ресторан ' +
    'передают другому человеку.',
  advice:
    'Дивиденды — не потеря, а страховка должности: платить по предложению дешевле, чем ' +
    'компенсировать недоверие. Следите за шкалой доверия на экране «Финансы» каждый квартал.',
};

/** «Переезд» (§20): ультиматум арендодателя, ресторан сменил адрес. */
export const RELOCATION_FINAL: SpecialPresentation = {
  title: 'Путь через переезд',
  text:
    'Год отметила фраза «ищите другое помещение»: дважды отказав арендодателю, вы переехали ' +
    'на новый адрес — с ремонтом, лицензиями и гостями, которых пришлось искать заново. ' +
    'Три недели простоя и 2 млн ₽ — цена принципа.',
  advice:
    'Переезд бьёт по кассе и спросу сильнее, чем кажется: новый адрес = новая воронка гостей. ' +
    'На новом месте первое, что стоит делать — маркетинг-сплэш и работу с отзывами, ' +
    'а не экономию на ремонте.',
};

/** Причины банкротства (§37): по первой сработавшей из условий weekclose. */
export const BANKRUPT_REASONS: Record<NonNullable<FinalGrade['special']['bankruptReason']>, SpecialPresentation> = {
  cash: {
    title: 'Касса ушла в минус',
    text:
      'Овердрафт пробит: денег на счету меньше, чем допускал банк. Кассовые разрывы ' +
      'складывались неделями — закупки, ФОТ и аренда съедали выручку раньше, чем она приходила.',
    advice:
      'Считайте P&L ≠ Cash Flow: прибыльная неделя может заканчиваться минусом по кассе. ' +
      'Держите буфер 2–3 недельных ФОТ и не берите кредит, который нельзя обслужить.',
  },
  loans: {
    title: 'Долги задушили',
    text:
      'Просрочки копились слишком долго: банк перестал ждать. Обслуживание кредита ' +
      'съедало операционную прибыль целиком.',
    advice:
      'Следите за платежами (экран «Кредиты»): реструктуризация дешевле дефолта — но только ' +
      'до 8-й просрочки.',
  },
  rating: {
    title: 'Гости отвернулись',
    text:
      'Рейтинг неделю за неделей держался ниже 2,0: поток новых гостей высох, возвратные ' +
      'разочаровались. Ресторан закрывается от пустоты, а не от долгов.',
    advice:
      'Рейтинг падает быстрее, чем поднимается. Не копите неотвеченные отзывы, ' +
      'чините причину жалоб в первую же неделю — и не поднимайте цены, пока сервис хромает.',
  },
};

/** Динамические советы по слабым осям (§20): ранг + конкретика. */
export function axisHints(grade: FinalGrade): { axis: string; hint: string }[] {
  const out: { axis: string; hint: string }[] = [];
  if (grade.axes.rating < 0.4)
    out.push({
      axis: 'Рейтинг',
      hint: 'работа с отзывами и стоп-листами: каждый 0,1 рейтинга ≈ ±3–5% трафика',
    });
  if (grade.axes.margin < 0.4)
    out.push({
      axis: 'Маржа',
      hint: 'Food Cost/труд/списания: найдите главную дыру в P&L квартала',
    });
  if (grade.axes.bsc < 0.4)
    out.push({
      axis: 'BSC',
      hint: 'система управления: закройте самые дешёвые направления счётной карты',
    });
  if (grade.axes.turnover < 0.4)
    out.push({
      axis: 'Текучесть',
      hint: 'график, морали и найм замены: увольнения бьют по сервису и переработкам',
    });
  return out;
}
