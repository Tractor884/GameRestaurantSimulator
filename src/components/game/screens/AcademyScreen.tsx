/**
 * ============================================================================
 * ЭКРАН «АКАДЕМИЯ УПРАВЛЯЮЩЕГО» (бэклог: обучающие фичи)
 * ============================================================================
 * Три вкладки:
 *  - «Показатели»: KPI-глоссарий с живыми значениями из игры, нормами
 *    индустрии и советом «как улучшить» (каждая метрика = мини-урок).
 *  - «Уроки»: 13 коротких уроков для молодых руководителей ресторана
 *    (prime cost, кэшфлоу, графики, удержание гостей, дивиденды…).
 *  - «Разбор недели»: приоритезированные цепочки «причина → следствие →
 *    что делать» по текущему состоянию ресторана.
 * Экран только читает состояние (presentation-слой) — экономику не трогает.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame, type ScreenId } from '@/lib/game/store/gameStore';
import { buildKpis, buildDebrief, type KpiCardData, type KpiStatus, type DebriefIssue } from '@/lib/game/presentation/academy';
import { LESSONS, LESSON_TRACKS, type Lesson, type LessonTrack } from '@/lib/game/content/lessons';
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
} from 'lucide-react';

const READ_KEY = 'rest-sim-academy-read-v1';

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
  value,
  onValueChange,
}: {
  readLessons: string[];
  onRead: (id: string) => void;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const [track, setTrack] = useState<LessonTrack | 'all'>('all');
  const filtered = track === 'all' ? LESSONS : LESSONS.filter((l) => l.track === track);

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
          прочитано {readLessons.length} из {LESSONS.length}
        </span>
      </div>

      <Accordion type="single" collapsible value={value} onValueChange={onValueChange} className="space-y-2">
        {filtered.map((lesson, i) => {
          const isRead = readLessons.includes(lesson.id);
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
