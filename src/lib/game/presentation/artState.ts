/**
 * ============================================================================
 * РЕАКТИВНОЕ СОСТОЯНИЕ АРТ-ПАКА (client)
 * ============================================================================
 * zustand-стор поверх IndexedDB (artStore.ts): object URL на каждую
 * пользовательскую картинку (создаётся один раз, revoke при замене).
 * Все экраны читают отсюда — загрузка на одном экране мгновенно видна
 * на остальных.
 */

'use client';

import { create } from 'zustand';
import {
  putImage,
  deleteImage,
  listImages,
  exportArtPack,
  importArtPack,
  clearAllImages,
  type ArtPackExport,
} from '@/lib/game/presentation/artStore';
import { ART_SLOT_MAP, getBuiltinPath } from '@/lib/game/presentation/registry';
import type { ArtSource } from '@/lib/game/presentation/types';

interface ArtState {
  ready: boolean;
  /** key → object URL пользовательской картинки. */
  urls: Record<string, string>;
  /** key → размер (КБ, для подписей менеджера). */
  sizes: Record<string, number>;
  error: string | null;
  init(): Promise<void>;
  upload(key: string, file: File): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  importPack(pack: unknown): Promise<number>;
  clearAll(): Promise<boolean>;
  exportPack(): Promise<ArtPackExport>;
  refresh(): Promise<void>;
}

function revokeAll(urls: Record<string, string>) {
  for (const url of Object.values(urls)) URL.revokeObjectURL(url);
}

export const useArtStore = create<ArtState>((set, get) => ({
  ready: false,
  urls: {},
  sizes: {},
  error: null,

  init: async () => {
    if (get().ready) return;
    try {
      const all = await listImages();
      const urls: Record<string, string> = {};
      const sizes: Record<string, number> = {};
      for (const img of all) {
        urls[img.key] = URL.createObjectURL(img.blob);
        sizes[img.key] = img.blob.size / 1024;
      }
      set({ ready: true, urls, sizes, error: null });
    } catch (e) {
      set({ ready: true, error: (e as Error).message });
    }
  },

  refresh: async () => {
    try {
      const all = await listImages();
      const next: Record<string, string> = {};
      const sizes: Record<string, number> = {};
      for (const img of all) {
        next[img.key] = URL.createObjectURL(img.blob);
        sizes[img.key] = img.blob.size / 1024;
      }
      // Полная перевалка: замена картинки по ключу тоже должна давать новый URL.
      revokeAll(get().urls);
      set({ urls: next, sizes, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  upload: async (key, file) => {
    try {
      await putImage(key, file);
      await get().refresh();
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  remove: async (key) => {
    try {
      await deleteImage(key);
      await get().refresh();
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  importPack: async (pack) => {
    const n = await importArtPack(pack);
    await get().refresh();
    return n;
  },

  clearAll: async () => {
    try {
      await clearAllImages();
      revokeAll(get().urls);
      set({ urls: {}, sizes: {} });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  exportPack: () => exportArtPack(),
}));

/** Резолюция слота арта: пользовательская → встроенная → плейсхолдер. */
export function resolveArt(
  key: string,
  urls: Record<string, string>,
  builtinEnabled: boolean,
): { src: string | null; source: ArtSource } {
  const custom = urls[key];
  if (custom) return { src: custom, source: 'custom' };
  if (builtinEnabled) {
    const builtin = getBuiltinPath(key);
    if (builtin) return { src: builtin, source: 'builtin' };
  }
  return { src: null, source: 'placeholder' };
}

/** Есть ли слот с таким ключом (защита от опечаток в компонентах). */
export function slotExists(key: string): boolean {
  return key in ART_SLOT_MAP;
}
