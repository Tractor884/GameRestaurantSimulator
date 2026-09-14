/**
 * Экран «Настройки и сейвы» (ТЗ §32): 3 слота сохранений, экспорт/импорт
 * JSON, настройки геймплея (пауза экстренных решений §8.4), новая игра, справка.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { useGame, type SaveMeta } from '@/lib/game/store/gameStore';
import { useUiPrefs } from '@/lib/game/store/uiPrefs';
import { SectionCard, money, moneyShort } from '../widgets';
import { LeaderboardTable } from '../LeaderboardTable';
import { computeFinalGrade } from '@/lib/game/engine';
import { difficultyWin as winOf, difficultyOf as diffOf } from '@/lib/game/config/difficulty.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  Save,
  FolderOpen,
  Download,
  Upload,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Siren,
  Trophy,
  Gauge,
} from 'lucide-react';

export function SettingsScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const saveSlot = useGame((s) => s.saveSlot);
  const loadSlot = useGame((s) => s.loadSlot);
  const listSaves = useGame((s) => s.listSaves);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const resetGame = useGame((s) => s.resetGame);
  const setOption = useGame((s) => s.setOption);
  const middayPause = state.options?.middayPause ?? true;
  const density = useUiPrefs((s) => s.density);
  const setDensity = useUiPrefs((s) => s.setDensity);

  const [refresh, setRefresh] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Task 28: диалог рейтинга игроков (сравниться с друзьями до конца года).
  const [ratingOpen, setRatingOpen] = useState(false);

  const saves: (SaveMeta | null)[] = useMemo(() => listSaves(), [listSaves, refresh]);

  // Task 28: подсветка своей строки в рейтинге — если партия уже финишировала
  // (финальный экран считает ранг/очки тем же computeFinalGrade).
  const meOfCurrentGame = useMemo(() => {
    if (state.phase !== 'gameover') return null;
    const nick = state.playerNick?.trim();
    if (!nick) return null;
    const grade = computeFinalGrade(state);
    return { nick, score: Math.round(grade.score1000) };
  }, [state]);

  const handleExport = () => {
    const json = exportSave();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rest-sim-${restaurant.name.replace(/\s+/g, '-').toLowerCase()}-week${state.week}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const ok = importSave(text);
      setImportError(ok ? null : 'Файл не похож на сохранение игры');
    } catch {
      setImportError('Не удалось прочитать файл');
    }
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      {/* Интерфейс: плотность информации (UI/UX-рекомендация №5) */}
      <SectionCard title="Интерфейс" icon={Gauge}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800">Плотность информации</p>
            <p className="text-xs text-stone-500 mt-0.5 max-w-xl">
              «Новичок» — только ключевые показатели (деньги, рейтинг, Food Cost, Labor Cost).
              «Эксперт» — все метрики, мини-графики динамики и тренды. Настройка не влияет
              на игру и сохраняется отдельно от сейвов.
            </p>
          </div>
          <div
            className="flex rounded-lg border border-stone-200 bg-stone-50 p-1 shrink-0"
            role="radiogroup"
            aria-label="Режим плотности интерфейса"
          >
            {(
              [
                { id: 'novice', label: 'Новичок', hint: '4 ключевых KPI' },
                { id: 'expert', label: 'Эксперт', hint: 'все метрики + графики' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={density === mode.id}
                title={mode.hint}
                onClick={() => setDensity(mode.id)}
                className={cn(
                  'min-h-9 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                  density === mode.id
                    ? 'bg-amber-100 text-amber-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-800',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Сохранения */}
      <SectionCard title="Сохранения" icon={Save}>
        <div className="grid md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <SaveSlotCard
              key={i}
              slot={i + 1}
              meta={saves[i] ?? null}
              onSave={(name) => {
                saveSlot(i + 1, name);
                setRefresh((r) => r + 1);
              }}
              onLoad={() => loadSlot(i + 1)}
            />
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-3">
          Игра также автоматически сохраняется после каждого дня (автосейв восстанавливается при
          загрузке страницы). Слоты — для контрольных точек.
        </p>
      </SectionCard>

      {/* Перенос данных */}
      <SectionCard title="Экспорт и импорт" icon={Download}>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="h-11 border-stone-300" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" aria-hidden />
            Экспорт JSON
          </Button>
          <Button
            variant="outline"
            className="h-11 border-stone-300"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1.5" aria-hidden />
            Импорт JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Файл сохранения"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
          <span className="text-xs text-stone-400">
            Переносите прогресс между браузерами и устройствами
          </span>
        </div>
        {importError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {importError}
          </div>
        )}
      </SectionCard>

      {/* Геймплей */}
      <SectionCard title="Геймплей" icon={Siren}>
        <div className="flex items-start justify-between gap-4 py-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800">Пауза «экстренных решений» (ТЗ §8.4)</p>
            <p className="text-xs text-stone-500 mt-0.5">
              После обеденного пика (15:00) день встаёт на паузу, если движок нашёл проблемы:
              очередь, перегруз кухни, стоп-листы, грязь, поломка. Выбираете экстренные меры —
              вызов персонала, скидка, срочная закупка… — и день доигрывается.
              Здоровый ресторан не прерывается.
            </p>
          </div>
          <Switch
            checked={middayPause}
            onCheckedChange={(v) => setOption('middayPause', v)}
            aria-label="Пауза экстренных решений после обеда"
            className="data-[state=checked]:bg-amber-600"
          />
        </div>
      </SectionCard>

      {/* Рейтинг игроков (Task 28) */}
      <SectionCard title="Рейтинг игроков" icon={Trophy}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-stone-600 flex-1 min-w-[240px]">
            Общий зачёт среди друзей: топ-50 финалов года — ник, ресторан, уровень
            (A+…D−) и очки 0–1000. Сравниться можно и до конца года: играете под
            своим ником, результат отправляется автоматически на финальном экране.
            {state.playerNick ? (
              <>
                {' '}Ваш ник в этой партии — <b className="text-stone-800">{state.playerNick}</b>.
              </>
            ) : null}
          </p>
          <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-11 border-stone-300">
                <Trophy className="h-4 w-4 mr-1.5 text-amber-500" aria-hidden />
                Рейтинг игроков
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg p-0 gap-0">
              <DialogHeader className="px-5 pt-5 pb-3">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
                  Рейтинг игроков
                </DialogTitle>
                <DialogDescription>
                  Топ-50 финалов: ник, ресторан, уровень и очки. Обновите, чтобы
                  увидеть результаты друзей.
                </DialogDescription>
              </DialogHeader>
              <div className="px-5 pb-5">
                <LeaderboardTable me={meOfCurrentGame} title="Топ финалов" />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </SectionCard>

      {/* Новая игра */}
      <SectionCard title="Новая игра" icon={RotateCcw}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-stone-600 flex-1 min-w-[240px]">
            Удаляет автосейв и возвращает к визарду открытия ресторана: локация, помещение, кредит.
            Слоты сохранений при этом остаются.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="h-11">
                <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden />
                Начать заново
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Начать новую игру?</AlertDialogTitle>
                <AlertDialogDescription>
                  Текущий ресторан «{restaurant.name}» (неделя {state.week}) будет сброшен.
                  Автосохранение удалится, ручные слоты останутся нетронутыми.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  className="h-11 bg-red-600 hover:bg-red-700"
                  onClick={() => resetGame()}
                >
                  Да, сбросить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SectionCard>

      {/* Об игре */}
      <SectionCard title="Об игре" icon={BookOpen}>
        <div className="space-y-3 text-sm text-stone-600">
          <p>
            <b className="text-stone-800">Экономический симулятор ресторана.</b> Игра длится{' '}
            <b className="text-stone-800">52 недели</b>: управляйте меню, складом, персоналом и
            деньгами, реагируйте на события. Текущая сложность —{' '}
            <b className="text-stone-800">{diffOf(state.difficultyId).name}</b>; победа: BSC ≥{' '}
            {winOf(state.difficultyId).minBscAvgQuarter}, рейтинг ≥ {winOf(state.difficultyId).minRating}, накопленная
            прибыль ≥ {moneyShort(winOf(state.difficultyId).minCumulativeProfit)}, касса ≥{' '}
            {moneyShort(winOf(state.difficultyId).minCash)}.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-700">Food Cost</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700">30–34%</p>
              <p className="text-xs text-stone-500 mt-0.5">
                себестоимость еды к выручке; держите стоп-лист под контролем
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-700">Labor Cost</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700">25–32%</p>
              <p className="text-xs text-stone-500 mt-0.5">
                ФОТ с соц. взносами; график смен = 8 часов на смену
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-700">EBITDA</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700">10–20%</p>
              <p className="text-xs text-stone-500 mt-0.5">
                операционная рентабельность до налогов и процентов
              </p>
            </div>
          </div>
          <p className="text-xs text-stone-400">
            Прибыль ≠ деньги на счёте: аренда и налоги платятся раз в 4 недели, закупки — сразу.
            Следите за Cash Flow, чтобы не попасть в кассовый разрыв.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

/** Карточка слота сохранения. */
function SaveSlotCard({
  slot,
  meta,
  onSave,
  onLoad,
}: {
  slot: number;
  meta: SaveMeta | null;
  onSave: (name: string) => void;
  onLoad: () => void;
}) {
  const [name, setName] = useState('');

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3',
        meta ? 'border-stone-200 bg-white' : 'border-dashed border-stone-300 bg-stone-50/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-800">Слот {slot}</p>
        {meta ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden />
            занят
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-stone-100 text-stone-500">
            пусто
          </Badge>
        )}
      </div>

      {meta ? (
        <div className="text-sm space-y-1">
          <p className="font-medium text-stone-800 truncate" title={meta.name}>
            {meta.name}
          </p>
          <p className="text-xs text-stone-500">
            «{meta.restaurantName}» · неделя {meta.week}, день {meta.day + 1}
          </p>
          <p className="text-xs text-stone-500 tabular-nums">касса: {money(meta.cash)}</p>
        </div>
      ) : (
        <p className="text-xs text-stone-400">Сохраните текущее состояние игры в этот слот</p>
      )}

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название сохранения"
        className="h-11"
        aria-label={`Название сохранения для слота ${slot}`}
        maxLength={60}
      />

      <div className="flex items-center gap-2">
        <Button
          className="h-11 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => onSave(name.trim() || `Сейв ${slot}`)}
        >
          <Save className="h-4 w-4 mr-1.5" aria-hidden />
          Сохранить
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 border-stone-300"
          disabled={!meta}
          onClick={onLoad}
        >
          <FolderOpen className="h-4 w-4 mr-1.5" aria-hidden />
          Загрузить
        </Button>
      </div>
    </div>
  );
}
