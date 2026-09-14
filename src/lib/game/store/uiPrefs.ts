/**
 * UI-настройки игрока (UI/UX-рекомендация №5 «плотность информации»).
 * Отдельный от gameStore zustand-стор: НЕ касается движка и сейвов игры.
 *
 * Режимы:
 *  - novice: только ключевые KPI (деньги, рейтинг, Food Cost, Labor Cost)
 *            — минимум цифр для первого знакомства;
 *  - expert: все метрики, спарклайны и тренды — полная приборная панель.
 *
 * Хранение: localStorage 'rest-sim-ui-prefs-v1' (переживает перезагрузку,
 * не мешает автосейвам игры rest-sim-autosave-v1).
 */
'use client';

import { create } from 'zustand';

export type Density = 'novice' | 'expert';

const KEY = 'rest-sim-ui-prefs-v1';

interface UiPrefsState {
  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
}

function loadDensity(): Density {
  if (typeof window === 'undefined') return 'novice';
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { density?: unknown };
      if (parsed.density === 'novice' || parsed.density === 'expert') return parsed.density;
    }
  } catch {
    // повреждённый JSON — молча используем дефолт
  }
  return 'novice';
}

function persistDensity(d: Density) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ density: d }));
  } catch {
    // приватный режим/переполнение — настройка просто не переживёт сессию
  }
}

export const useUiPrefs = create<UiPrefsState>((set, get) => ({
  density: loadDensity(),
  setDensity: (density) => {
    persistDensity(density);
    set({ density });
  },
  toggleDensity: () => get().setDensity(get().density === 'novice' ? 'expert' : 'novice'),
}));

/** Хелпер для подписки на «показывать ли продвинутые метрики». */
export const selectExpert = (s: UiPrefsState) => s.density === 'expert';
