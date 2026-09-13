/**
 * ============================================================================
 * ЭКРАН «ИЛЛЮСТРАЦИИ» — менеджер арт-пака
 * ============================================================================
 * Управление изображениями игры: загрузка своих картинок в любой слот
 * реестра (IndexedDB), сброс, экспорт/импорт пака, переключатель
 * встроенных иллюстраций P0a. Пользовательские картинки ВСЕГДА
 * приоритетнее встроенных; отсутствие картинок не ломает экраны.
 */

'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useGame } from '@/lib/game/store/gameStore';
import { useArtStore, resolveArt } from '@/lib/game/presentation/artState';
import { ART_GROUPS, artSlotsOfGroup, type ArtSlot } from '@/lib/game/presentation/registry';
import { SectionCard, EmptyState } from '../widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  ImageIcon,
  Upload,
  Trash2,
  Download,
  FolderOpen,
  Info,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';

export function ArtManagerScreen() {
  const state = useGame((s) => s.state)!;
  const setOption = useGame((s) => s.setOption);
  const builtin = state.options?.builtinIllustrations ?? false;

  const art = useArtStore();
  const upload = useArtStore((s) => s.upload);
  const remove = useArtStore((s) => s.remove);
  const clearAll = useArtStore((s) => s.clearAll);
  const exportPack = useArtStore((s) => s.exportPack);
  const importPack = useArtStore((s) => s.importPack);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ characters: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const packRef = useRef<HTMLInputElement>(null);

  const totalSlots = useMemo(() => ART_GROUPS.reduce((s, g) => s + artSlotsOfGroup(g.id).length, 0), []);
  const customCount = Object.keys(art.urls).length;

  const handleFile = async (file: File, key: string) => {
    const ok = await upload(key, file);
    if (ok) toast.success(`Картинка загружена: ${key}`);
    else toast.error(art.error ?? 'Не удалось загрузить картинку');
  };

  const handleExport = async () => {
    const pack = await exportPack();
    if (pack.images.length === 0) {
      toast.info('Нет загруженных картинок — экспортировать нечего');
      return;
    }
    const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restsim-art-pack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Экспортировано картинок: ${pack.images.length}`);
  };

  const handleImportPack = async (file: File) => {
    try {
      const text = await file.text();
      const n = await importPack(JSON.parse(text));
      toast.success(`Импортировано картинок: ${n}`);
      setOpenGroups((g) => ({ ...g, characters: true }));
    } catch (e) {
      toast.error((e as Error).message || 'Файл не является арт-паком игры');
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeKey) void handleFile(file, activeKey);
          e.target.value = '';
        }}
      />
      <input
        ref={packRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportPack(file);
          e.target.value = '';
        }}
      />

      {/* Шапка: объяснение + статистика + встроенный арт */}
      <SectionCard
        title="Иллюстрации"
        icon={ImageIcon}
        right={
          <Badge variant="secondary" className="tabular-nums">
            {customCount}/{totalSlots} своих
          </Badge>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <p className="text-xs leading-relaxed text-stone-600">
              Загрузите собственные изображения для персонажей, сцен и слоёв. Картинки хранятся локально в
              браузере (IndexedDB) и имеют приоритет над встроенными. Экраны игры работают и совсем без
              картинок — вместо них показываются аккуратные плейсхолдеры.{' '}
              <span className="text-stone-500">
                Формат: JPG/PNG/WebP до 8 МБ, автоматически сжимается до 1600 px и конвертируется в WebP.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <Switch checked={builtin} onCheckedChange={(v) => setOption('builtinIllustrations', v)} aria-label="Встроенные иллюстрации" />
              <span className="text-sm text-stone-700">
                Встроенные иллюстрации
                <span className="block text-[11px] text-stone-400">
                  17 картинок стиля P0a (Анна, Ирина, Сергей, Николай, зал). Свои загрузки важнее.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleExport()}>
                <Download className="h-4 w-4" aria-hidden />
                Экспорт пака
              </Button>
              <Button variant="outline" size="sm" onClick={() => packRef.current?.click()}>
                <FolderOpen className="h-4 w-4" aria-hidden />
                Импорт пака
              </Button>
              {customCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    void clearAll().then((ok) =>
                      ok
                        ? toast.success('Все свои картинки удалены')
                        : toast.error(art.error ?? 'Не удалось очистить'),
                    );
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Удалить все свои
                </Button>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Группы слотов */}
      {ART_GROUPS.map((group) => {
        const slots = artSlotsOfGroup(group.id);
        const customInGroup = slots.filter((s) => art.urls[s.key]).length;
        const open = openGroups[group.id] ?? false;
        return (
          <Collapsible
            key={group.id}
            open={open}
            onOpenChange={(o) => setOpenGroups((g) => ({ ...g, [group.id]: o }))}
          >
            <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
              <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl p-4 text-left hover:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-800">{group.label}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{group.description}</p>
                </div>
                <Badge variant="secondary" className="tabular-nums shrink-0">
                  {customInGroup}/{slots.length}
                </Badge>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-stone-400 transition-transform', open && 'rotate-180')}
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid gap-3 border-t border-stone-100 p-4 pt-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {slots.map((slot) => (
                    <SlotCard
                      key={slot.key}
                      slot={slot}
                      urls={art.urls}
                      sizes={art.sizes}
                      builtin={builtin}
                      onPick={() => {
                        setActiveKey(slot.key);
                        fileRef.current?.click();
                      }}
                      onRemove={() => {
                        void remove(slot.key).then((ok) => {
                          if (ok) toast.success(`Убрана своя картинка: ${slot.label}`);
                          else toast.error(art.error ?? 'Не удалось удалить');
                        });
                      }}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {totalSlots === 0 && <EmptyState text="Реестр арта пуст" />}
    </div>
  );
}

/* ── Карточка слота ── */

function SlotCard({
  slot,
  urls,
  sizes,
  builtin,
  onPick,
  onRemove,
}: {
  slot: ArtSlot;
  urls: Record<string, string>;
  sizes: Record<string, number>;
  builtin: boolean;
  onPick(): void;
  onRemove(): void;
}) {
  const { src, source } = useMemo(() => resolveArt(slot.key, urls, builtin), [slot.key, urls, builtin]);
  const isScene = slot.kind === 'scene';

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
      {/* Превью */}
      <div
        className={cn(
          'relative w-full bg-stone-100',
          isScene ? 'aspect-[7/4]' : 'aspect-square',
        )}
        title={slot.hint}
      >
        {src ? (
           
          <img src={src} alt={slot.label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center">
            <ImageIcon className="h-6 w-6 text-stone-300" aria-hidden />
            <p className="text-[10px] leading-tight text-stone-400 line-clamp-3">{slot.hint}</p>
          </div>
        )}
        {source === 'custom' && (
          <Badge className="absolute left-1.5 top-1.5 bg-emerald-600 text-white hover:bg-emerald-600">своя</Badge>
        )}
        {source === 'builtin' && (
          <Badge className="absolute left-1.5 top-1.5 bg-stone-700 text-white hover:bg-stone-700" title="Встроенная иллюстрация P0a">
            встроенная
          </Badge>
        )}
      </div>
      {/* Подпись + действия */}
      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-stone-700" title={slot.label}>
            {slot.label}
          </p>
          <p className="text-[10px] text-stone-400">
            {slot.width}×{slot.height}
            {source === 'custom' && sizes[slot.key] ? ` · ${Math.round(sizes[slot.key])} КБ` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" className="h-8 w-8 bg-amber-600 hover:bg-amber-700 text-white" onClick={onPick} title="Загрузить свою картинку" aria-label={`Загрузить картинку: ${slot.label}`}>
            <Upload className="h-3.5 w-3.5" aria-hidden />
          </Button>
          {source === 'custom' && (
            <Button size="icon" variant="outline" className="h-8 w-8 border-red-200 text-red-700 hover:bg-red-50" onClick={onRemove} title="Убрать свою картинку" aria-label={`Убрать картинку: ${slot.label}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
