'use client';

/**
 * Обёртка боковой панели с автоскрытием — v0.02.02.
 *
 * Настройка «Автоскрытие панелей» (тулбар «Настройки»): панель сворачивается
 * в узкую рейку у края окна (collapsedSize 1.5 %), при наведении рейка
 * разворачивает панель до прежней ширины, после ухода курсора панель
 * сворачивается снова (с задержкой 350 мс — чтобы курсор успел дойти
 * до разделителя). Настройка выключена — панель закреплена (фиксированное
 * отображение, как в 5.1); свёртку при выключенной настройке можно сделать
 * перетаскиванием разделителя до упора, рейка возвращает панель наведением.
 * Состояние рейки приходит из колбэков onCollapse/onExpand панели
 * (react-resizable-panels, ImperativePanelHandle).
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useAppearanceStore } from '../store/appearanceStore';
import { ru } from '../i18n/ru';
import type { ImperativePanelHandle } from 'react-resizable-panels';

/** Задержка сворачивания после ухода курсора, мс. */
const COLLAPSE_DELAY_MS = 350;

export function AutoHidePanel({ side, panelRef, collapsed, onCollapsedChange, children }: {
  side: 'left' | 'right';
  panelRef: RefObject<ImperativePanelHandle | null>;
  /** Свернута ли панель (из onCollapse/onExpand панели). */
  collapsed: boolean;
  /** Синхронизация состояния рейки (v0.02.02): вызывается при монтировании
   *  и смене настройки — expand() на уже развёрнутой панели не вызывает
   *  onExpand, без синхронизации рейка оставалась бы навсегда. */
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}) {
  const autoHide = useAppearanceStore((s) => s.autoHidePanels);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelLeave = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  // Включение настройки сворачивает панели сразу; выключение разворачивает.
  // Эффект также выполняется при монтаже (смена режимов ДАП/ДП перемонтирует
  // панели) — свернутое состояние не теряется. Отложенное сворачивание
  // отменяется: таймер не должен переживать выключение настройки.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    cancelLeave();
    if (autoHide) panel.collapse();
    else panel.expand();
    onCollapsedChange?.(panel.isCollapsed());
  }, [autoHide, panelRef, onCollapsedChange]);

  /** Наведение: развернуть панель (рейка или содержимое). */
  const handleEnter = () => {
    cancelLeave();
    panelRef.current?.expand();
  };

  /** Уход курсора: свернуть снова — только при включённом автоскрытии. */
  const handleLeave = () => {
    if (!autoHide) return;
    cancelLeave();
    leaveTimer.current = setTimeout(() => {
      // Настройку могли выключить, пока таймер был отложен, — сверруем
      // только если автоскрытие ещё включено.
      if (useAppearanceStore.getState().autoHidePanels) {
        panelRef.current?.collapse();
      }
    }, COLLAPSE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const RailIcon = side === 'left' ? PanelLeft : PanelRight;
  const railLabel = side === 'left' ? ru.canvas.panelRailLeft : ru.canvas.panelRailRight;

  return (
    <div className="h-full w-full" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {collapsed ? (
        <button
          type="button"
          className="flex h-full w-full cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60"
          data-testid={`panel-rail-${side}`}
          aria-label={`${railLabel} — ${ru.canvas.panelRailTitle}`}
          title={ru.canvas.panelRailTitle}
        >
          <RailIcon className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        children
      )}
    </div>
  );
}
