/**
 * Экран «Настройки и сейвы» (ТЗ §32): 3 слота сохранений, экспорт/импорт
 * JSON, настройки геймплея (пауза экстренных решений §8.4), новая игра, справка.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { useGame, type SaveMeta } from '@/lib/game/store/gameStore';
import { SectionCard, money, moneyShort } from '../widgets';
import { InfoHint } from '../hints';
import { difficultyWin as winOf, difficultyOf as diffOf } from '@/lib/game/config/difficulty.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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

  const [refresh, setRefresh] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saves: (SaveMeta | null)[] = useMemo(() => listSaves(), [listSaves, refresh]);

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
      {/* v2 §15: перманентные эффекты дилемм */}
      <PermanentDecisionsCard effects={restaurant.permanentEffects ?? {}} week={state.week} />

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

/* ================= v2 §15: «Долгосрочные решения» ================= */

/** Отображение перманентных эффектов дилемм (docs/BALANCING-V2.md §15):
 *  ветки «навсегда», принятые в критических событиях-дилеммах. */
function PermanentDecisionsCard({
  effects,
  week,
}: {
  effects: NonNullable<import('@/lib/game/types').Restaurant['permanentEffects']>;
  week: number;
}) {
  const rows: { label: string; value: string; tone: 'good' | 'bad' | 'neutral'; note: string }[] = [];
  if (effects.chefMenuCut) {
    rows.push({
      label: 'Меню сокращено (шеф)',
      value: 'FC −1 п.п. · чек −3%',
      tone: 'neutral',
      note: 'Стандартизация порций после сокращения карты на 20% — навсегда.',
    });
  }
  if (effects.chefQuitRisk) {
    const weeksLeft = Math.max(0, effects.chefQuitRisk.untilWeek - week);
    rows.push({
      label: 'Шеф обижен',
      value: `увольнения ×${effects.chefQuitRisk.mult} · ещё ${weeksLeft} нед`,
      tone: 'bad',
      note: `После окна шеф уйдёт с шансом 40%. Поддерживайте усталость/мораль.`,
    });
  }
  if (effects.bribeFlag) {
    rows.push({
      label: 'Взятка инспектору',
      value: 'риск скандала 5%/год',
      tone: 'bad',
      note: 'Факт взятки останется с вами: скандал = штраф 300–500 тыс и удар по репутации.',
    });
  }
  if (effects.hardInspections) {
    rows.push({
      label: 'Жёсткие проверки',
      value: 'штрафы ×1,6',
      tone: 'bad',
      note: 'Отказ инспектору: официальные протоколы оформляют по максимуму — навсегда.',
    });
  }
  if (effects.creditLimitShare != null) {
    rows.push({
      label: 'Кредитный лимит урезан',
      value: `×${effects.creditLimitShare}`,
      tone: 'bad',
      note: 'Отказ от реструктуризации: банк запомнил — новые деньги дороже и меньше.',
    });
  }
  if (effects.franchiseDemand != null || effects.franchiseOwnerShare != null) {
    rows.push({
      label: 'Франшиза сети',
      value: `спрос +${Math.round(((effects.franchiseDemand ?? 1) - 1) * 100)}% · роялти ${Math.round((effects.franchiseOwnerShare ?? 0) * 100)}%`,
      tone: 'neutral',
      note: 'Бренд работает на вас, но доля выручки уходит сети — каждую неделю.',
    });
  }
  if (effects.wageRaise != null) {
    rows.push({
      label: 'Оклады повышены',
      value: `ФОТ ×${effects.wageRaise}`,
      tone: 'neutral',
      note: 'Решение кадрового кризиса: текучесть в норме, фонд вырос навсегда.',
    });
  }
  if (effects.staffCrisis) {
    const weeksLeft = Math.max(0, effects.staffCrisis.untilWeek - week);
    rows.push({
      label: 'Кадровый кризис держится',
      value: `qFatigue ×${effects.staffCrisis.qFatigueMult} · найм ×${effects.staffCrisis.hireMult} · ${weeksLeft} нед`,
      tone: 'bad',
      note: 'Решение «переждать»: люди уходят быстрее, подбор дороже.',
    });
  }
  if (effects.prestigeBonus != null) {
    rows.push({
      label: 'Престиж независимости',
      value: `BSC «Клиенты» +${effects.prestigeBonus}`,
      tone: 'good',
      note: 'Отказ сети: имя шефа работает на репутацию.',
    });
  }
  if (effects.alcoholEveningRestrict) {
    rows.push({
      label: 'Крепкое — до 18:00',
      value: 'алкоголь ограничен',
      tone: 'neutral',
      note: 'Инциденты прекращены, вечерняя выручка бара ниже.',
    });
  }

  if (rows.length === 0) {
    return (
      <SectionCard title="Долгосрочные решения" icon={BookOpen} right={<InfoHint hint="dilemmas" />}>
        <p className="text-sm text-stone-500">
          Пока пусто: тяжёлые дилеммы (шеф, инспектор, банк, франшиза, кадры) ещё не встретились.
          Они приходят от состояния — усталости, рисков, долга и рейтинга.
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Долгосрочные решения" icon={BookOpen} right={<InfoHint hint="dilemmas" />}>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
          >
            <span className="text-sm font-medium text-stone-800">{r.label}</span>
            <span
              className={cn(
                'text-sm tabular-nums font-semibold',
                r.tone === 'good' && 'text-emerald-700',
                r.tone === 'bad' && 'text-red-700',
                r.tone === 'neutral' && 'text-stone-600',
              )}
            >
              {r.value}
            </span>
            <span className="w-full text-xs text-stone-500">{r.note}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
