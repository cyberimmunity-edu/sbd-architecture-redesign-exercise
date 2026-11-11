'use client';

/**
 * Переключение темы интерфейса — раздел 5.1 ТЗ v0.01.01: светлый/тёмный
 * режим, по умолчанию тёмный. Тема применяется классом `dark` на <html>
 * (Tailwind-переменные из globals.css), выбор сохраняется в localStorage
 * (ключ skib-theme) и подписывается событием для канвы React Flow.
 */

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'skib-theme';
const THEME_EVENT = 'skib-theme-change';

/** Тема по умолчанию — тёмная (5.1 v0.01.01). */
export const DEFAULT_THEME: Theme = 'dark';

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return DEFAULT_THEME;
  }
}

/** Применение темы к документу без записи в хранилище. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Установка и сохранение темы, уведомление подписчиков. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Хранилище недоступно — тема действует до перезагрузки.
    }
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
  }
}

/** Подписка на изменения темы (событие инструмента и cross-tab storage). */
function subscribeTheme(listener: () => void): () => void {
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Реактивная тема для компонентов (канва, переключатель) — 5.1 v0.01.01. */
export function useSkibTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme, () => DEFAULT_THEME);
  return [theme, setTheme];
}

/** Цвет точки сетки канвы по теме (фон React Flow). */
export function canvasGridColor(theme: Theme): string {
  return theme === 'dark' ? '#3F3F46' : '#D8D8D8';
}

/** Цвет фона канвы по теме. */
export function canvasBackgroundColor(theme: Theme): string {
  return theme === 'dark' ? '#18181B' : '#FAFAFA';
}

/** Цвет подписей стрелок по теме. */
export function edgeLabelColor(theme: Theme): string {
  return theme === 'dark' ? '#A1A1AA' : '#475569';
}
