'use client';

/**
 * Контекстное меню канвы (v0.02.03): команды логических групп для домена
 * (создание ЛГ из выделенных, включение в ЛГ, исключение), для рамки ЛГ
 * (свёртывание, переименование, цвет, вложенная ЛГ, удаление) и для
 * свободного места канвы. Позиционируется по координатам события; закрытие
 * — клик по подложке, Escape или выбор пункта.
 */

import { useEffect } from 'react';
import { ru } from '../i18n/ru';

export interface ContextMenuItem {
  kind?: 'item';
  label: string;
  /** Выбор пункта; пункты без onSelect рисуются отключёнными. */
  onSelect?: () => void;
  disabled?: boolean;
  testId?: string;
  /** Цветная точка перед подписью (цвет ЛГ). */
  dot?: string;
  hint?: string;
}

export interface ContextMenuSwatches {
  kind: 'swatches';
  label: string;
  colors: readonly string[];
  current: string;
  onPick: (color: string) => void;
  testId?: string;
}

export interface ContextMenuSeparator {
  kind: 'separator';
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSwatches | ContextMenuSeparator;

export function CanvasContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  onClose: () => void;
}) {
  // Закрытие: Escape, клик по подложке; меню не выходит за окно.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 300);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
        aria-hidden
      />
      <div
        className="fixed z-50 min-w-[230px] rounded-md border border-border bg-popover p-1 shadow-md"
        style={{ left, top }}
        role="menu"
        data-testid="canvas-context-menu"
      >
        {entries.map((entry, index) => {
          if (entry.kind === 'separator') {
            return <div key={index} className="my-1 h-px bg-border" aria-hidden />;
          }
          if (entry.kind === 'swatches') {
            return (
              <div key={index} className="px-2 py-1.5">
                <div className="mb-1 text-xs text-muted-foreground">{entry.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-5 w-5 rounded-full border ${
                        entry.current === color ? 'ring-2 ring-primary ring-offset-1' : 'border-black/20'
                      }`}
                      style={{ background: color }}
                      title={ru.lg.colorSwatchTitle}
                      aria-label={ru.lg.colorSwatchTitle}
                      aria-pressed={entry.current === color}
                      data-testid={entry.testId ? `${entry.testId}-${color.slice(1).toLowerCase()}` : undefined}
                      onClick={() => {
                        entry.onPick(color);
                        onClose();
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          }
          return (
            <button
              key={index}
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={entry.disabled || !entry.onSelect}
              data-testid={entry.testId}
              title={entry.hint}
              onClick={() => {
                entry.onSelect?.();
                onClose();
              }}
            >
              {entry.dot && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ background: entry.dot }}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
