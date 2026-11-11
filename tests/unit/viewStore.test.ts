/**
 * Тесты хранилища вида канвы — v0.01.02–v0.01.04: показ стрелок-связей,
 * фокус на внутреннем периметре, свёрнутые порты стрелок и подсветка
 * домена из таблиц правой панели. Настройки вида независимы от модели
 * проекта: переключение не создаёт записей в истории операций и не меняет
 * расчёты.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useViewStore } from '../../src/store/viewStore';

describe('Настройки вида канвы (v0.01.02–v0.01.04)', () => {
  beforeEach(() => {
    useViewStore.setState({
      showEdges: true,
      focusInternal: false,
      collapsedPorts: {},
      highlightedDomainId: null,
    });
  });

  it('по умолчанию стрелки показаны, фокус на периметре выключен, порты развёрнуты', () => {
    expect(useViewStore.getState().showEdges).toBe(true);
    expect(useViewStore.getState().focusInternal).toBe(false);
    expect(useViewStore.getState().collapsedPorts).toEqual({});
  });

  it('toggleShowEdges скрывает и снова показывает стрелки', () => {
    useViewStore.getState().toggleShowEdges();
    expect(useViewStore.getState().showEdges).toBe(false);
    useViewStore.getState().toggleShowEdges();
    expect(useViewStore.getState().showEdges).toBe(true);
  });

  it('toggleFocusInternal включает и выключает фокус на периметре', () => {
    useViewStore.getState().toggleFocusInternal();
    expect(useViewStore.getState().focusInternal).toBe(true);
    useViewStore.getState().toggleFocusInternal();
    expect(useViewStore.getState().focusInternal).toBe(false);
  });

  it('переключатели вида независимы друг от друга', () => {
    useViewStore.getState().toggleShowEdges();
    expect(useViewStore.getState().focusInternal).toBe(false);
    useViewStore.getState().toggleFocusInternal();
    expect(useViewStore.getState().showEdges).toBe(false);
    expect(useViewStore.getState().focusInternal).toBe(true);
  });

  it('togglePort сворачивает и разворачивает стрелки порта (v0.01.03)', () => {
    useViewStore.getState().togglePort('dom-1:in');
    expect(useViewStore.getState().collapsedPorts['dom-1:in']).toBe(true);
    // Другой порт не затронут.
    expect(useViewStore.getState().collapsedPorts['dom-1:out']).toBeUndefined();
    useViewStore.getState().togglePort('dom-1:in');
    expect(useViewStore.getState().collapsedPorts['dom-1:in']).toBe(false);
  });

  it('togglePort работает с разными портами независимо (v0.01.03)', () => {
    useViewStore.getState().togglePort('dom-1:in');
    useViewStore.getState().togglePort('dom-2:out');
    const collapsed = useViewStore.getState().collapsedPorts;
    expect(collapsed['dom-1:in']).toBe(true);
    expect(collapsed['dom-2:out']).toBe(true);
  });

  it('expandAllPorts разворачивает все свёрнутые порты (v0.01.03)', () => {
    useViewStore.getState().togglePort('dom-1:in');
    useViewStore.getState().togglePort('dom-2:out');
    useViewStore.getState().expandAllPorts();
    expect(useViewStore.getState().collapsedPorts).toEqual({});
  });

  it('смена режима вида («Стрелки») возвращает свёрнутые стрелки (v0.01.03)', () => {
    useViewStore.getState().togglePort('dom-1:in');
    useViewStore.getState().toggleShowEdges();
    expect(useViewStore.getState().collapsedPorts).toEqual({});
  });

  it('смена режима вида («Периметр») возвращает свёрнутые стрелки (v0.01.03)', () => {
    useViewStore.getState().togglePort('dom-1:out');
    useViewStore.getState().toggleFocusInternal();
    expect(useViewStore.getState().collapsedPorts).toEqual({});
  });

  it('setHighlightedDomain устанавливает и снимает подсветку домена (v0.01.04)', () => {
    expect(useViewStore.getState().highlightedDomainId).toBeNull();
    useViewStore.getState().setHighlightedDomain('blk-link');
    expect(useViewStore.getState().highlightedDomainId).toBe('blk-link');
    // Наведение на другую строку заменяет подсветку.
    useViewStore.getState().setHighlightedDomain('blk-plan');
    expect(useViewStore.getState().highlightedDomainId).toBe('blk-plan');
    // Уход курсора с таблицы снимает подсветку.
    useViewStore.getState().setHighlightedDomain(null);
    expect(useViewStore.getState().highlightedDomainId).toBeNull();
  });

  it('подсветка домена не зависит от остальных настроек вида (v0.01.04)', () => {
    useViewStore.getState().setHighlightedDomain('blk-drive');
    useViewStore.getState().toggleShowEdges();
    expect(useViewStore.getState().highlightedDomainId).toBe('blk-drive');
    useViewStore.getState().setHighlightedDomain(null);
    expect(useViewStore.getState().showEdges).toBe(false);
  });

  it('настройки вида не входят в модель проекта projectStore', () => {
    // Вид — отдельное хранилище: скрытие стрелок не попадает в undo/redo
    // и в автосохранение (Ф-21, Ф-22 остаются про модель).
    const state = useViewStore.getState();
    expect(Object.keys(state).sort()).toEqual([
      'collapsedPorts',
      'expandAllPorts',
      'focusInternal',
      'highlightedDomainId',
      'setHighlightedDomain',
      'showEdges',
      'toggleFocusInternal',
      'togglePort',
      'toggleShowEdges',
    ]);
  });
});
