/**
 * ============================================================================
 * ЭКРАН «АКАДЕМИЯ УПРАВЛЯЮЩЕГО» (бэклог: обучающие фичи)
 * ============================================================================
 * Три вкладки:
 *  - «Показатели»: KPI-глоссарий с живыми значениями из игры, нормами
 *    индустрии и советом «как улучшить» (каждая метрика = мини-урок).
 *  - «Уроки»: 14 коротких уроков для молодых руководителей ресторана
 *    (prime cost, кэшфлоу, графики, удержание гостей, дивиденды…)
 *    и мини-квиз «Проверь себя» после каждого урока (3 вопроса
 *    с пояснениями; лучший результат хранится в localStorage).
 *  - «Разбор недели»: приоритезированные цепочки «причина → следствие →
 *    что делать» по текущему состоянию ресторана.
 * Экран только читает состояние (presentation-слой) — экономику не трогает.
 */
'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { useGame, type ScreenId } from '@/lib/game/store/gameStore';
import { buildKpis, buildDebrief, type KpiCardData, type KpiStatus, type DebriefIssue } from '@/lib/game/presentation/academy';
import { LESSONS, LESSON_TRACKS, type Lesson, type LessonTrack } from '@/lib/game/content/lessons';
import { QUIZ, QUIZ_OPTION_LABELS, quizLength } from '@/lib/game/content/quizContent';
import { SectionCard, EmptyState } from '../widgets';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  GraduationCap,
  Gauge,
  BookOpen,
  ExternalLink,
  Lightbulb,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  Clock,
  Sigma,
  Briefcase,
  Store,
  Calculator,
  FileText,
  HelpCircle,
  XCircle,
  RotateCcw,
  Award,
} from 'lucide-react';

const READ_KEY = 'rest-sim-academy-read-v1';
const QUIZ_KEY = 'rest-sim-academy-quiz-v1';

/** Лучший результат мини-квиза урока (прогресс в localStorage). */
interface QuizProgressEntry {
  score: number;
  bestAt: number;
}
type QuizProgress = Record<string, QuizProgressEntry>;

/** Санитизация прочитанного из localStorage — доверять нельзя ничему. */
const parseQuizProgress = (raw: unknown): QuizProgress => {
  if (!raw || typeof raw !== 'object') return {};
  const out: QuizProgress = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const { score, bestAt } = val as { score?: unknown; bestAt?: unknown };
    if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && typeof bestAt === 'number' && Number.isFinite(bestAt)) {
      out[key] = { score, bestAt };
    }
  }
  return out;
};

/** Урок «закреплён»: лучший результат квиза — максимум из 3. */
const isQuizPerfect = (lessonId: string, progress: QuizProgress): boolean => {
  const total = quizLength(lessonId);
  return total > 0 && (progress[lessonId]?.score ?? -1) >= total;
};

const STATUS_META: Record<KpiStatus, { label: string; cls: string; row: string }> = {
  good: { label: 'норма', cls: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100', row: 'border-emerald-200' },
  warn: { label: 'внимание', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100', row: 'border-amber-300' },
  bad: { label: 'критично', cls: 'bg-red-100 text-red-800 hover:bg-red-100', row: 'border-red-300' },
  idle: { label: 'индикатор', cls: 'bg-stone-100 text-stone-600 hover:bg-stone-100', row: 'border-stone-200' },
};

const TRACK_META: Record<LessonTrack, { label: string; icon: typeof Gauge; cls: string }> = {
  finance: { label: 'Деньги', icon: Calculator, cls: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' },
  operations: { label: 'Операционка', icon: Store, cls: 'bg-stone-100 text-stone-700 hover:bg-stone-100' },
  guests: { label: 'Гости', icon: Sparkles, cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  team: { label: 'Команда', icon: Briefcase, cls: 'bg-orange-100 text-orange-800 hover:bg-orange-100' },
  strategy: { label: 'Стратегия', icon: FileText, cls: 'bg-teal-100 text-teal-800 hover:bg-teal-100' },
};

export function AcademyScreen() {
  const state = useGame((s) => s.state)!;
  const setScreen = useGame((s) => s.setScreen);

  const kpis = useMemo(() => buildKpis(state), [state]);
  const debrief = useMemo(() => buildDebrief(state), [state]);
  const lastWeek = state.history.weekStats.at(-1);

  // Управляемые вкладки/урок (кнопка «Урок» у KPI открывает связанный урок).
  const [tab, setTab] = useState('kpi');
  const [openLesson, setOpenLesson] = useState<string>('');

  // Прочитанные уроки (локальный прогресс, переживает сессию). Экран монтируется
  // только на клиенте после загрузки сейва — ленивый инициализатор безопасен.
  const [readLessons, setReadLessons] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const markRead = (id: string) => {
    setReadLessons((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        /* приватный режим — просто не сохраняем */
      }
      return next;
    });
  };

  // Прогресс мини-квизов: лучший результат по каждому уроку (localStorage,
  // тот же ленивый инициализатор, что и у прогресса чтения — экран
  // монтируется только на клиенте после загрузки сейва).
  const [quizProgress, setQuizProgress] = useState<QuizProgress>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return parseQuizProgress(JSON.parse(localStorage.getItem(QUIZ_KEY) ?? '{}'));
    } catch {
      return {};
    }
  });
  const saveQuizResult = (lessonId: string, score: number) => {
    setQuizProgress((prev) => {
      // Храним ЛУЧШИЙ результат: пересдача хуже лучшего ничего не затирает.
      if ((prev[lessonId]?.score ?? -1) >= score) return prev;
      const next = { ...prev, [lessonId]: { score, bestAt: Date.now() } };
      try {
        localStorage.setItem(QUIZ_KEY, JSON.stringify(next));
      } catch {
        /* приватный режим — просто не сохраняем */
      }
      return next;
    });
  };

  const quizDone = useMemo(
    () => LESSONS.filter((l) => isQuizPerfect(l.id, quizProgress)).length,
    [quizProgress],
  );
  const openLessonAt = (id: string) => {
    setTab('lessons');
    setOpenLesson(id);
    markRead(id);
  };

  const criticalCount = kpis.filter((k) => k.status === 'bad').length;
  const warnCount = kpis.filter((k) => k.status === 'warn').length;

  return (
    <div className="space-y-4">
      {/* Шапка */}
      <SectionCard
        title="Академия управляющего"
        icon={GraduationCap}
        right={
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">критично: {criticalCount}</Badge>}
            {warnCount > 0 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">внимание: {warnCount}</Badge>}
            {criticalCount + warnCount === 0 && kpis.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">все метрики в норме</Badge>
            )}
          </div>
        }
      >
        <p className="text-sm text-stone-600">
          Обучающий центр: живые показатели вашего ресторана против норм индустрии, уроки для
          руководителей и разбор недели «почему это происходит».{' '}
          {lastWeek ? (
            <span className="text-stone-400">Данные: неделя {lastWeek.week}.</span>
          ) : (
            <span className="text-stone-400">Показатели появятся после первой закрытой недели.</span>
          )}
        </p>
      </SectionCard>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-stone-100">
          <TabsTrigger value="kpi">Показатели</TabsTrigger>
          <TabsTrigger value="lessons">
            Уроки {readLessons.length}/{LESSONS.length}
            <span className="hidden sm:inline text-stone-400"> · квизы {quizDone}/{LESSONS.length}</span>
          </TabsTrigger>
          <TabsTrigger value="debrief">
            Разбор недели
            {debrief.issues.length > 0 && (
              <Badge className="ml-2 bg-red-500 text-white text-[10px] px-1.5 min-w-5 justify-center">
                {debrief.issues.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ ПОКАЗАТЕЛИ ------------------------------ */}
        <TabsContent value="kpi" className="mt-4 space-y-4">
          {kpis.length === 0 ? (
            <SectionCard title="Показатели" icon={Gauge}>
              <EmptyState text="Закройте первую неделю — показатели посчитаются по вашим реальным данным." />
            </SectionCard>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {kpis.map((k) => (
                <KpiTile key={k.id} kpi={k} onOpen={(s) => setScreen(s)} onOpenLesson={openLessonAt} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------ УРОКИ ------------------------------ */}
        <TabsContent value="lessons" className="mt-4 space-y-4">
          <LessonsBlock
            readLessons={readLessons}
            onRead={markRead}
            quizProgress={quizProgress}
            onSaveQuiz={saveQuizResult}
            value={openLesson}
            onValueChange={setOpenLesson}
          />
        </TabsContent>

        {/* --------------------------- РАЗБОР НЕДЕЛИ --------------------------- */}
        <TabsContent value="debrief" className="mt-4 space-y-4">
          {debrief.issues.length === 0 ? (
            <SectionCard title="Разбор недели" icon={Sparkles}>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                <div className="text-sm text-stone-700 space-y-1">
                  <p className="font-semibold text-emerald-800">Тревожных цепочек не найдено</p>
                  {kpis.length > 0 ? (
                    <p>
                      Касса, команда, кухня, гости и склад вне красных зон. Хорошая неделя, чтобы
                      работать на опережение: уроки выше и{' '}
                      <button
                        className="text-amber-700 underline underline-offset-2 hover:text-amber-800"
                        onClick={() => setScreen('quarterly')}
                      >
                        квартальные цели
                      </button>
                      .
                    </p>
                  ) : (
                    <p>Разбор появится после первой закрытой недели.</p>
                  )}
                </div>
              </div>
            </SectionCard>
          ) : (
            <div className="space-y-3">
              {debrief.issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} onOpen={(s) => setScreen(s)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------- КАРТОЧКА KPI --------------------------- */

function KpiTile({
  kpi,
  onOpen,
  onOpenLesson,
}: {
  kpi: KpiCardData;
  onOpen: (screen: ScreenId) => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  const meta = STATUS_META[kpi.status];
  const track = TRACK_META[kpi.track];
  const [showFormula, setShowFormula] = useState(false);
  const related = (kpi.lessons ?? [])
    .map((id) => LESSONS.find((l) => l.id === id))
    .filter(Boolean) as Lesson[];

  return (
    <div className={cn('rounded-xl border bg-white p-4 flex flex-col gap-3 shadow-sm transition-shadow hover:shadow-md', meta.row)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-stone-900 truncate">{kpi.label}</span>
            <Badge className={cn('text-[10px] uppercase tracking-wide shrink-0', meta.cls)}>{meta.label}</Badge>
          </div>
          {kpi.sub && <p className="text-xs text-stone-500 mt-0.5 truncate">{kpi.sub}</p>}
        </div>
        <p
          className={cn(
            'text-2xl font-bold tabular-nums shrink-0',
            kpi.status === 'bad' ? 'text-red-700' : kpi.status === 'warn' ? 'text-amber-700' : kpi.status === 'good' ? 'text-emerald-700' : 'text-stone-800',
          )}
        >
          {kpi.value}
        </p>
      </div>

      <p className="text-xs text-stone-600 leading-relaxed">{kpi.definition}</p>

      <div className="rounded-lg bg-stone-50 border border-stone-100 px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 min-w-0">
            <Gauge className="h-3.5 w-3.5 text-stone-400 shrink-0" aria-hidden />
            <span className="truncate">{kpi.norm}</span>
          </div>
          <button
            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 shrink-0"
            onClick={() => setShowFormula(!showFormula)}
            aria-expanded={showFormula}
          >
            <Sigma className="h-3.5 w-3.5" aria-hidden />
            {showFormula ? 'скрыть' : 'формула'}
          </button>
        </div>
        {showFormula && (
          <p className="text-xs text-stone-600 font-mono bg-white border border-stone-200 rounded px-2 py-1.5">{kpi.formula}</p>
        )}
      </div>

      <div
        className={cn(
          'rounded-lg p-2.5 text-xs leading-relaxed',
          kpi.status === 'bad' ? 'bg-red-50 text-red-900' : kpi.status === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900',
        )}
      >
        <span className="font-semibold">Совет. </span>
        {kpi.advice}
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <Badge className={cn('text-[10px] shrink-0', track.cls)}>
            <track.icon className="h-3 w-3 mr-1" aria-hidden />
            {track.label}
          </Badge>
          {related.length > 0 && <span className="text-[11px] text-stone-400 truncate">«{related[0].title}»</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {related.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenLesson(related[0].id)}>
              <BookOpen className="h-3.5 w-3.5 mr-1 text-stone-400" aria-hidden />
              Урок
            </Button>
          )}
          {kpi.screen && (
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onOpen(kpi.screen!)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" aria-hidden />
              Экран
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ УРОКИ ------------------------------ */

function LessonsBlock({
  readLessons,
  onRead,
  quizProgress,
  onSaveQuiz,
  value,
  onValueChange,
}: {
  readLessons: string[];
  onRead: (id: string) => void;
  quizProgress: QuizProgress;
  onSaveQuiz: (lessonId: string, score: number) => void;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const [track, setTrack] = useState<LessonTrack | 'all'>('all');
  const filtered = track === 'all' ? LESSONS : LESSONS.filter((l) => l.track === track);
  const quizDone = LESSONS.filter((l) => isQuizPerfect(l.id, quizProgress)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <TrackChip active={track === 'all'} label="Все" icon={BookOpen} onClick={() => setTrack('all')} />
        {(Object.keys(LESSON_TRACKS) as LessonTrack[]).map((t) => (
          <TrackChip
            key={t}
            active={track === t}
            label={LESSON_TRACKS[t].label}
            title={LESSON_TRACKS[t].hint}
            icon={TRACK_META[t].icon}
            onClick={() => setTrack(t)}
          />
        ))}
        <span className="text-xs text-stone-400 ml-auto">
          прочитано {readLessons.length} из {LESSONS.length} · квизы {quizDone}/{LESSONS.length}
        </span>
      </div>

      <Accordion type="single" collapsible value={value} onValueChange={onValueChange} className="space-y-2">
        {filtered.map((lesson, i) => {
          const isRead = readLessons.includes(lesson.id);
          const isQuizDone = isQuizPerfect(lesson.id, quizProgress);
          const meta = TRACK_META[lesson.track];
          return (
            <AccordionItem
              key={lesson.id}
              value={lesson.id}
              className={cn(
                'rounded-xl border bg-white px-4',
                isRead ? 'border-stone-200' : 'border-stone-200 hover:border-stone-300',
                'data-[state=open]:border-amber-300 data-[state=open]:bg-amber-50/40',
              )}
            >
              <AccordionTrigger className="py-3.5 hover:no-underline">
                <div className="flex items-center gap-2.5 text-left min-w-0">
                  {isRead ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-label="Прочитано" />
                  ) : (
                    <Circle className="h-4 w-4 text-stone-300 shrink-0" aria-hidden />
                  )}
                  <span className="font-medium text-stone-800 truncate">
                    {i + 1}. {lesson.title}
                  </span>
                  {isQuizDone && (
                    <Badge
                      className="text-[10px] shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                      title="Мини-квиз сдан на 3 из 3"
                    >
                      <Award className="h-3 w-3 mr-1" aria-hidden />✓ тест
                    </Badge>
                  )}
                  <Badge className="text-[10px] shrink-0 hidden sm:inline-flex items-center gap-1 bg-stone-100 text-stone-600 hover:bg-stone-100">
                    <Clock className="h-3 w-3" aria-hidden />
                    {lesson.minutes} мин
                  </Badge>
                  <Badge className={cn('text-[10px] shrink-0 hidden md:inline-flex', meta.cls)}>{meta.label}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-3" onClick={() => onRead(lesson.id)}>
                  <p className="text-sm font-medium text-stone-700 leading-relaxed">{lesson.essence}</p>

                  {lesson.formula && (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{lesson.formula.label}</p>
                      <p className="font-mono text-sm text-stone-800 mt-1">{lesson.formula.expr}</p>
                      <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">{lesson.formula.explain}</p>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {lesson.body.map((p, j) => (
                      <p key={j} className="text-sm text-stone-700 leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Правила
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {lesson.rules.map((r, j) => (
                        <li key={j} className="text-xs text-stone-700 flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid md:grid-cols-2 gap-2.5">
                    <div className="rounded-lg border border-stone-200 bg-white p-3">
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">В этой игре</p>
                      <p className="text-xs text-stone-700 mt-1 leading-relaxed">{lesson.inGame}</p>
                    </div>
                    <div className="rounded-lg border border-stone-200 bg-white p-3">
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">В реальном ресторане</p>
                      <p className="text-xs text-stone-700 mt-1 leading-relaxed">{lesson.inRealLife}</p>
                    </div>
                  </div>
                </div>

                {/* Мини-квиз: проверка знаний после урока */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:p-4 space-y-3">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" aria-hidden /> Проверь себя
                  </p>
                  <LessonQuiz lessonId={lesson.id} best={quizProgress[lesson.id]} onSave={onSaveQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function TrackChip({
  active,
  label,
  title,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  title?: string;
  icon: typeof BookOpen;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-amber-400 bg-amber-100 text-amber-900 font-semibold'
          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50',
      )}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

/* ------------------------------ МИНИ-КВИЗ ------------------------------ */

/**
 * Мини-квиз урока: 3 вопроса с вариантами (радиогруппы, доступность:
 * role=radiogroup / role=radio / aria-checked, выбор кликом/Enter и
 * стрелками). После «Проверить ответы» — подсветка правильных
 * (emerald) и неверных (red) выборов + пояснение к каждому вопросу
 * и итог «N из 3». Лучший результат уходит наверх в localStorage.
 */
function LessonQuiz({
  lessonId,
  best,
  onSave,
}: {
  lessonId: string;
  best?: QuizProgressEntry;
  onSave: (lessonId: string, score: number) => void;
}) {
  const questions = QUIZ[lessonId] ?? [];
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [checked, setChecked] = useState(false);

  if (questions.length === 0) return null;

  const start = () => {
    setAnswers(questions.map(() => null));
    setChecked(false);
    setOpen(true);
  };
  const reset = () => {
    setAnswers(questions.map(() => null));
    setChecked(false);
  };
  const pick = (qi: number, oi: number) => {
    if (checked) return;
    setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)));
  };
  // Клавиатурная навигация радиогруппы: стрелки выбирают соседний вариант.
  const onGroupKeyDown = (e: KeyboardEvent<HTMLDivElement>, qi: number) => {
    if (checked) return;
    const total = questions[qi].options.length;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const cur = answers[qi] ?? (dir > 0 ? -1 : total);
    pick(qi, (cur + dir + total) % total);
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
          onClick={start}
        >
          <HelpCircle className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Пройти мини-квиз ({questions.length} вопроса)
        </Button>
        {best && (
          <Badge
            className={cn(
              'text-[10px]',
              best.score >= questions.length
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-100',
            )}
            title="Лучший результат мини-квиза по этому уроку"
          >
            лучший: {best.score}/{questions.length}
          </Badge>
        )}
      </div>
    );
  }

  const allAnswered = answers.every((a) => a !== null);
  const score = answers.reduce<number>((acc, a, i) => acc + (a === questions[i].correctIndex ? 1 : 0), 0);
  const perfect = score === questions.length;

  const check = () => {
    if (!allAnswered || checked) return;
    setChecked(true);
    onSave(lessonId, score);
  };

  return (
    <div className="space-y-3">
      {questions.map((qq, qi) => {
        const chosen = answers[qi];
        return (
          <div key={qi} className="rounded-lg border border-stone-200 bg-white p-3 space-y-2.5">
            <p className="text-sm font-semibold text-stone-800 leading-snug">
              <span className="text-amber-700 tabular-nums">{qi + 1}. </span>
              {qq.question}
            </p>
            <div
              role="radiogroup"
              aria-label={`Вопрос ${qi + 1} из ${questions.length}`}
              className="space-y-1.5"
              onKeyDown={(e) => onGroupKeyDown(e, qi)}
            >
              {qq.options.map((opt, oi) => {
                const selected = chosen === oi;
                const isCorrect = oi === qq.correctIndex;
                let box = 'border-stone-200 bg-white text-stone-700 hover:border-amber-300 hover:bg-amber-50';
                let letter = 'bg-stone-100 text-stone-500';
                if (checked) {
                  if (isCorrect) {
                    box = 'border-emerald-400 bg-emerald-50 text-emerald-900';
                    letter = 'bg-emerald-200 text-emerald-800';
                  } else if (selected) {
                    box = 'border-red-400 bg-red-50 text-red-900';
                    letter = 'bg-red-200 text-red-800';
                  } else {
                    box = 'border-stone-100 bg-white text-stone-400';
                    letter = 'bg-stone-100 text-stone-400';
                  }
                } else if (selected) {
                  box = 'border-amber-400 bg-amber-50 text-amber-900';
                  letter = 'bg-amber-200 text-amber-800';
                }
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={checked}
                    disabled={checked}
                    onClick={() => pick(qi, oi)}
                    className={cn(
                      'flex items-start gap-2.5 w-full min-h-11 rounded-lg border px-3 py-2 text-left text-sm leading-snug transition-colors',
                      checked ? 'cursor-default' : 'cursor-pointer',
                      box,
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5',
                        letter,
                      )}
                      aria-hidden
                    >
                      {QUIZ_OPTION_LABELS[oi] ?? String(oi + 1)}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {checked && isCorrect && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-label="Правильный ответ" />
                    )}
                    {checked && !isCorrect && selected && (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" aria-label="Неправильный ответ" />
                    )}
                  </button>
                );
              })}
            </div>
            {checked && (
              <div
                className={cn(
                  'rounded-md p-2.5 text-xs leading-relaxed flex items-start gap-2',
                  chosen === qq.correctIndex ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900',
                )}
              >
                {chosen === qq.correctIndex ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" aria-hidden />
                )}
                <span>
                  <span className="font-semibold">{chosen === qq.correctIndex ? 'Верно. ' : 'Неверно. '}</span>
                  {qq.explanation}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {checked ? (
        <div
          className={cn(
            'rounded-lg border p-3 flex flex-wrap items-center gap-x-3 gap-y-2',
            perfect ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50',
          )}
        >
          <Award className={cn('h-5 w-5 shrink-0', perfect ? 'text-emerald-600' : 'text-amber-600')} aria-hidden />
          <p className="text-sm font-semibold text-stone-800 tabular-nums">
            Результат: {score} из {questions.length}
          </p>
          <p className={cn('text-xs flex-1 min-w-[12rem]', perfect ? 'text-emerald-800' : 'text-amber-800')}>
            {perfect ? 'Урок закреплён — все ответы верные!' : 'Перечитайте правила урока и пройдите квиз ещё раз — до 3 из 3.'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={reset}
              aria-label="Пройти мини-квиз ещё раз"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
              Пройти ещё раз
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setOpen(false)}>
              Свернуть
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-9 px-3 text-xs bg-amber-600 text-white hover:bg-amber-700"
            onClick={check}
            disabled={!allAnswered}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Проверить ответы
          </Button>
          <Button variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={() => setOpen(false)}>
            Свернуть
          </Button>
          {!allAnswered && (
            <p className="text-xs text-stone-500" role="status">
              Выберите ответ на каждый вопрос
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- ЦЕПОЧКА ПРОБЛЕМЫ --------------------------- */

function IssueCard({ issue, onOpen }: { issue: DebriefIssue; onOpen: (screen: ScreenId) => void }) {
  const critical = issue.severity === 'critical';
  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-sm', critical ? 'border-red-300' : 'border-amber-300')}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={cn('h-5 w-5 shrink-0 mt-0.5', critical ? 'text-red-600' : 'text-amber-600')} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-stone-900">{issue.title}</p>
            <Badge
              className={cn(
                'text-[10px] uppercase tracking-wide',
                critical ? 'bg-red-100 text-red-800 hover:bg-red-100' : 'bg-amber-100 text-amber-800 hover:bg-amber-100',
              )}
            >
              {critical ? 'критично' : 'внимание'}
            </Badge>
          </div>

          {/* Цепочка причина → следствие */}
          <ol className="mt-3 border-l-2 border-stone-200 pl-4 space-y-1.5">
            {issue.chain.map((step, i) => (
              <li
                key={i}
                className={cn('relative text-xs leading-relaxed', i === issue.chain.length - 1 ? 'text-stone-800 font-medium' : 'text-stone-600')}
              >
                <span
                  className={cn(
                    'absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-white',
                    i === issue.chain.length - 1 ? (critical ? 'bg-red-500' : 'bg-amber-500') : 'bg-stone-300',
                  )}
                  aria-hidden
                />
                {step}
              </li>
            ))}
          </ol>

          <div
            className={cn(
              'mt-3 rounded-lg p-2.5 text-xs leading-relaxed flex items-start gap-2',
              critical ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900',
            )}
          >
            <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <span className="flex-1">
              <span className="font-semibold">Что делать: </span>
              {issue.action}
            </span>
          </div>

          {issue.screen && (
            <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={() => onOpen(issue.screen!)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" aria-hidden />
              Перейти к экрану
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
