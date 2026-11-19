/**
 * ВИЗУАЛЬНАЯ ТЕМА интерфейса: «Строгий» (аналитический дашборд) или
 * «Мультяшный» (игровой, cartoon — скруглённые карточки-«подушки», тёплый
 * фон, жирный шрифт, персонажи в шапке).
 *
 * Настройка чисто презентационная: НЕ влияет на движок и сейвы игры.
 * Хранение: localStorage 'rest-sim-theme-v1' (переживает перезагрузку).
 *
 * Мультяшный режим включается:
 *  - классом `cartoon` на <html> (см. globals.css — CSS-переопределения
 *    карточек/таблиц/кнопок через @layer components);
 *  - флагом useThemeStore.getState().cartoon для точечных JSX-решений
 *    (персонаж-талисман в топбаре, «звериные» подписи KPI и т.п.).
 */
'use client';

import { create } from 'zustand';

export type ThemeMode = 'clean' | 'cartoon';

const KEY = 'rest-sim-theme-v1';

interface ThemeState {
  theme: ThemeMode;
  /** Удобный геттер для компонентов: true = мультяшное оформление. */
  cartoon: boolean;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
}

function applyClass(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('cartoon', theme === 'cartoon');
}

function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'clean';
  let theme: ThemeMode = 'clean';
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: unknown };
      if (parsed.theme === 'cartoon') theme = 'cartoon';
    }
  } catch {
    // повреждённый JSON — дефолт
  }
  // Класс навешиваем сразу при инициализации стора (до первого render),
  // чтобы не было вспышки строгого стиля при перезагрузке страницы.
  applyClass(theme);
  return theme;
}

function persistTheme(t: ThemeMode) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ theme: t }));
  } catch {
    // приватный режим — настройка просто не переживёт сессию
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initial = loadTheme();
  return {
    theme: initial,
    cartoon: initial === 'cartoon',
    setTheme: (theme) => {
      persistTheme(theme);
      applyClass(theme);
      set({ theme, cartoon: theme === 'cartoon' });
    },
    toggleTheme: () => get().setTheme(get().theme === 'cartoon' ? 'clean' : 'cartoon'),
  };
});
