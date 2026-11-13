/**
 * Хранилище настроек оформления — v0.02.02.
 *
 * Четыре переключателя и раскладка тулбаров:
 * - раскладка тулбаров: порядок групп (перетаскивание за рукоятку) и скрытие
 *   отдельных групп (кнопка ≡ или правый клик по зоне тулбаров);
 * - «Только значки»: подписи кнопок тулбаров скрыты, название кнопки
 *   показывается во всплывающей подсказке при наведении;
 * - «Скрывать тулбары автоматически»: верхняя зона сворачивается в тонкую
 *   полоску и разворачивается при наведении — поле редактирования крупнее;
 * - «Автоскрытие боковых панелей»: левая и правая панели сворачиваются
 *   в узкие рейки и разворачиваются при наведении; выключенное состояние —
 *   фиксированное отображение, как раньше.
 *
 * Настройки не входят в модель проекта (как настройки вида в viewStore):
 * они не влияют на расчёты и не пишутся в историю операций (Ф-21). В отличие
 * от настроек вида они сохраняются в localStorage (ключ skib-appearance-v1) —
 * это рабочее место пользователя, как и ширины панелей (autoSaveId v0.01.05)
 * и тема (skib-theme).
 */

import { create } from 'zustand';

/** Идентификаторы тулбаров верхней зоны (v0.02.02). */
export type ToolbarId = 'edit' | 'mode' | 'io' | 'validate' | 'settings';

/** Порядок тулбаров по умолчанию. */
export const DEFAULT_TOOLBAR_ORDER: ToolbarId[] = ['edit', 'mode', 'io', 'validate', 'settings'];

const STORAGE_KEY = 'skib-appearance-v1';

function isToolbarId(value: unknown): value is ToolbarId {
  return (
    value === 'edit' || value === 'mode' || value === 'io' || value === 'validate' || value === 'settings'
  );
}

function readStored(): Partial<{
  toolbarOrder: ToolbarId[];
  toolbarHidden: ToolbarId[];
  iconOnly: boolean;
  autoHideToolbars: boolean;
  autoHidePanels: boolean;
}> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const order = Array.isArray(parsed.toolbarOrder)
      ? parsed.toolbarOrder.filter(isToolbarId)
      : undefined;
    const hidden = Array.isArray(parsed.toolbarHidden)
      ? parsed.toolbarHidden.filter(isToolbarId)
      : undefined;
    return {
      ...(order ? { toolbarOrder: order } : {}),
      ...(hidden ? { toolbarHidden: hidden } : {}),
      ...(typeof parsed.iconOnly === 'boolean' ? { iconOnly: parsed.iconOnly } : {}),
      ...(typeof parsed.autoHideToolbars === 'boolean' ? { autoHideToolbars: parsed.autoHideToolbars } : {}),
      ...(typeof parsed.autoHidePanels === 'boolean' ? { autoHidePanels: parsed.autoHidePanels } : {}),
    };
  } catch {
    // Хранилище недоступно или данные повреждены — настройки по умолчанию.
    return null;
  }
}

function writeStored(state: {
  toolbarOrder: ToolbarId[];
  toolbarHidden: ToolbarId[];
  iconOnly: boolean;
  autoHideToolbars: boolean;
  autoHidePanels: boolean;
}): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        toolbarOrder: state.toolbarOrder,
        toolbarHidden: state.toolbarHidden,
        iconOnly: state.iconOnly,
        autoHideToolbars: state.autoHideToolbars,
        autoHidePanels: state.autoHidePanels,
      }),
    );
  } catch {
    // Хранилище недоступно — настройки действуют до перезагрузки.
  }
}

export interface AppearanceState {
  /** Порядок тулбаров (перетаскивание за рукоятку, v0.02.02). */
  toolbarOrder: ToolbarId[];
  /** Скрытые тулбары (меню ≡ или правый клик, v0.02.02). */
  toolbarHidden: ToolbarId[];
  /** «Только значки»: подписи кнопок скрыты, название — в подсказке. */
  iconOnly: boolean;
  /** Автоскрытие тулбаров: верхняя зона сворачивается без наведения. */
  autoHideToolbars: boolean;
  /** Автоскрытие боковых панелей: рейки вместо фиксированных панелей. */
  autoHidePanels: boolean;
  /** Гидратация из localStorage выполнена (защита от сброса первым set). */
  hydrated: boolean;
  hydrate: () => void;
  setToolbarOrder: (order: ToolbarId[]) => void;
  toggleToolbar: (id: ToolbarId) => void;
  showAllToolbars: () => void;
  resetLayout: () => void;
  toggleIconOnly: () => void;
  toggleAutoHideToolbars: () => void;
  toggleAutoHidePanels: () => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  toolbarOrder: DEFAULT_TOOLBAR_ORDER,
  toolbarHidden: [],
  iconOnly: false,
  autoHideToolbars: false,
  autoHidePanels: false,
  hydrated: false,
  hydrate: () => {
    const stored = readStored();
    set({ hydrated: true, ...(stored ?? {}) });
  },
  setToolbarOrder: (order) => {
    // Полный порядок всегда покрывает все тулбары: неизвестные идентификаторы
    // и дубликаты отбрасываются, потерянные группы дописываются в конец
    // в порядке умолчания (защита от сбоя перетаскивания).
    const known: ToolbarId[] = [];
    for (const id of order) {
      if (DEFAULT_TOOLBAR_ORDER.includes(id) && !known.includes(id)) known.push(id);
    }
    const complete = [...known, ...DEFAULT_TOOLBAR_ORDER.filter((id) => !known.includes(id))];
    set({ toolbarOrder: complete });
    writeStored(get());
  },
  toggleToolbar: (id) => {
    const hidden = get().toolbarHidden;
    set({
      toolbarHidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id],
    });
    writeStored(get());
  },
  showAllToolbars: () => {
    set({ toolbarHidden: [] });
    writeStored(get());
  },
  resetLayout: () => {
    set({ toolbarOrder: DEFAULT_TOOLBAR_ORDER, toolbarHidden: [] });
    writeStored(get());
  },
  toggleIconOnly: () => {
    set({ iconOnly: !get().iconOnly });
    writeStored(get());
  },
  toggleAutoHideToolbars: () => {
    set({ autoHideToolbars: !get().autoHideToolbars });
    writeStored(get());
  },
  toggleAutoHidePanels: () => {
    set({ autoHidePanels: !get().autoHidePanels });
    writeStored(get());
  },
}));
