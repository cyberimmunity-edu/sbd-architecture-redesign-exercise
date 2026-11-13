/**
 * Тесты хранилища настроек оформления — v0.02.02: раскладка тулбаров
 * (порядок, скрытие), «Только значки», автоскрытие тулбаров и боковых
 * панелей; сохранение в localStorage (skib-appearance-v1) и гидратация
 * с защитой от повреждённых данных и неизвестных идентификаторов тулбаров.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppearanceStore, DEFAULT_TOOLBAR_ORDER, type ToolbarId } from '@/store/appearanceStore';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const KEY = 'skib-appearance-v1';

function installWindow(storage: MemoryStorage | null) {
  (globalThis as unknown as { window: unknown }).window = storage
    ? { localStorage: storage }
    : undefined;
}

function resetStore() {
  useAppearanceStore.setState({
    toolbarOrder: [...DEFAULT_TOOLBAR_ORDER],
    toolbarHidden: [],
    iconOnly: false,
    autoHideToolbars: false,
    autoHidePanels: false,
    hydrated: false,
  });
}

describe('Хранилище настроек оформления (v0.02.02)', () => {
  beforeEach(() => {
    resetStore();
    installWindow(new MemoryStorage());
  });

  afterEach(() => {
    installWindow(null);
  });

  it('Порядок тулбаров: перетаскивание задаёт новый порядок; неполный порядок дополняется', () => {
    const order: ToolbarId[] = ['validate', 'settings', 'io', 'mode', 'edit'];
    useAppearanceStore.getState().setToolbarOrder(order);
    expect(useAppearanceStore.getState().toolbarOrder).toEqual(order);
    // Частичный порядок (потеря группы при сбое перетаскивания) дополняется.
    useAppearanceStore.getState().setToolbarOrder(['mode', 'edit']);
    const after = useAppearanceStore.getState().toolbarOrder;
    expect(after.slice(0, 2)).toEqual(['mode', 'edit']);
    expect(after).toHaveLength(DEFAULT_TOOLBAR_ORDER.length);
    expect(new Set(after)).toEqual(new Set(DEFAULT_TOOLBAR_ORDER));
  });

  it('Скрытие тулбаров: toggle, «Показать все», «Сбросить раскладку»', () => {
    useAppearanceStore.getState().toggleToolbar('io');
    expect(useAppearanceStore.getState().toolbarHidden).toEqual(['io']);
    useAppearanceStore.getState().toggleToolbar('io');
    expect(useAppearanceStore.getState().toolbarHidden).toEqual([]);
    useAppearanceStore.getState().toggleToolbar('edit');
    useAppearanceStore.getState().toggleToolbar('settings');
    useAppearanceStore.getState().showAllToolbars();
    expect(useAppearanceStore.getState().toolbarHidden).toEqual([]);
    useAppearanceStore.getState().setToolbarOrder(['settings', 'io', 'mode', 'edit', 'validate']);
    useAppearanceStore.getState().toggleToolbar('mode');
    useAppearanceStore.getState().resetLayout();
    expect(useAppearanceStore.getState().toolbarOrder).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(useAppearanceStore.getState().toolbarHidden).toEqual([]);
  });

  it('Переключатели оформления: значки, автоскрытие тулбаров и панелей', () => {
    expect(useAppearanceStore.getState().iconOnly).toBe(false);
    useAppearanceStore.getState().toggleIconOnly();
    expect(useAppearanceStore.getState().iconOnly).toBe(true);
    useAppearanceStore.getState().toggleAutoHideToolbars();
    expect(useAppearanceStore.getState().autoHideToolbars).toBe(true);
    useAppearanceStore.getState().toggleAutoHidePanels();
    expect(useAppearanceStore.getState().autoHidePanels).toBe(true);
    // Всё сохранено в localStorage.
    const stored = JSON.parse(
      (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.getItem(KEY)!,
    );
    expect(stored).toMatchObject({ iconOnly: true, autoHideToolbars: true, autoHidePanels: true });
  });

  it('Гидратация: настройки восстанавливаются из localStorage', () => {
    const storage = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage;
    storage.setItem(
      KEY,
      JSON.stringify({
        toolbarOrder: ['validate', 'io', 'mode', 'edit', 'settings'],
        toolbarHidden: ['io'],
        iconOnly: true,
        autoHideToolbars: true,
        autoHidePanels: true,
      }),
    );
    useAppearanceStore.getState().hydrate();
    const state = useAppearanceStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.toolbarOrder[0]).toBe('validate');
    expect(state.toolbarHidden).toEqual(['io']);
    expect(state.iconOnly).toBe(true);
    expect(state.autoHideToolbars).toBe(true);
    expect(state.autoHidePanels).toBe(true);
  });

  it('Гидратация: повреждённые данные и неизвестные тулбары отбрасываются', () => {
    const storage = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage;
    // Не-JSON — настройки по умолчанию.
    storage.setItem(KEY, '{broken json');
    useAppearanceStore.getState().hydrate();
    expect(useAppearanceStore.getState().toolbarOrder).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(useAppearanceStore.getState().iconOnly).toBe(false);
    // Неизвестные идентификаторы и не-булевы значения отфильтровываются.
    resetStore();
    storage.setItem(
      KEY,
      JSON.stringify({
        toolbarOrder: ['io', 'hacker', 42],
        toolbarHidden: ['mode', 'nope'],
        iconOnly: 'yes',
        autoHidePanels: 1,
      }),
    );
    useAppearanceStore.getState().hydrate();
    const state = useAppearanceStore.getState();
    expect(state.toolbarOrder).toEqual(['io']);
    expect(state.toolbarHidden).toEqual(['mode']);
    expect(state.iconOnly).toBe(false);
    expect(state.autoHidePanels).toBe(false);
  });

  it('Без window (SSR/тестовая среда): хранилище не падает и отдаёт умолчания', () => {
    installWindow(null);
    expect(() => useAppearanceStore.getState().hydrate()).not.toThrow();
    expect(useAppearanceStore.getState().toolbarOrder).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(() => useAppearanceStore.getState().toggleIconOnly()).not.toThrow();
    expect(useAppearanceStore.getState().iconOnly).toBe(true);
  });
});
