/**
 * Тесты операций ЛГ в хранилище — v0.02.03, Ф-70…Ф-76: создание/правка/
 * удаление групп (одна операция истории), включение/исключение ДБ,
 * свёртывание всех, раскрытие при подсветке (без истории), каскады.
 * Используется минимальный собственный проект — независимо от примеров.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSkibStore } from '@/store/projectStore';
import { LG_DEFAULT_COLOR, MAX_DOMAIN_GROUPS, MAX_LG_DEPTH } from '@/engine/types';
import type { Block } from '@/engine/types';

const B = (id: string, x: number, y: number): Block => ({
  id,
  name: id.toUpperCase(),
  cost: 1,
  position: { x, y },
});

function project() {
  return useSkibStore.getState().project;
}

describe('Операции ЛГ (v0.02.03)', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
    useSkibStore.getState().loadState({
      architecture: {
        blocks: [B('dom-a', 60, 60), B('dom-b', 400, 60), B('dom-c', 760, 60)],
        edges: [],
      },
      security: {
        goals: [{ id: 'g-1', name: 'Цель' }],
        functions: [{ id: 'fn-1', name: 'Функция', cost: 1 }],
      },
      assignments: [],
      meta: {},
    });
    useSkibStore.setState({ past: [], future: [] });
  });

  it('создание ЛГ из выделенных ДБ: члены, имя, цвет, выбор — один шаг истории', () => {
    const store = useSkibStore.getState();
    const before = JSON.stringify(project().architecture.blocks.map((b) => [b.id, b.name]));
    const id = store.createGroup({ name: 'Контур', color: '#1E88E5', memberIds: ['dom-a', 'dom-b'] });
    expect(id).toBe('lg-1');
    const groups = project().architecture.groups ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'lg-1', name: 'Контур', color: '#1E88E5' });
    expect(project().architecture.blocks.find((b) => b.id === 'dom-a')?.groupId).toBe('lg-1');
    expect(project().architecture.blocks.find((b) => b.id === 'dom-b')?.groupId).toBe('lg-1');
    expect(project().architecture.blocks.find((b) => b.id === 'dom-c')?.groupId).toBeUndefined();
    expect(useSkibStore.getState().selection).toEqual({ kind: 'group', id: 'lg-1' });
    // Одна операция истории: Ctrl+Z снимает группу и членство.
    expect(useSkibStore.getState().past).toHaveLength(1);
    useSkibStore.getState().undo();
    expect((project().architecture.groups ?? [])).toHaveLength(0);
    expect(project().architecture.blocks.find((b) => b.id === 'dom-a')?.groupId).toBeUndefined();
    // Имена блоков не пострадали.
    expect(JSON.stringify(project().architecture.blocks.map((b) => [b.id, b.name]))).toBe(before);
    useSkibStore.getState().redo();
    expect((project().architecture.groups ?? [])[0]?.name).toBe('Контур');
  });

  it('создание без имени — «Новая ЛГ»; повтор — с суффиксом (2)', () => {
    const store = useSkibStore.getState();
    const id1 = store.createGroup({ memberIds: ['dom-a'] });
    const id2 = store.createGroup({ memberIds: ['dom-b'] });
    const groups = project().architecture.groups ?? [];
    expect(groups.find((g) => g.id === id1)?.name).toBe('Новая ЛГ');
    expect(groups.find((g) => g.id === id2)?.name).toBe('Новая ЛГ (2)');
    expect(groups.find((g) => g.id === id1)?.color).toBe(LG_DEFAULT_COLOR);
  });

  it('вложенность: 3 уровня разрешены, четвёртый запрещён (П-71)', () => {
    const store = useSkibStore.getState();
    const parent = store.createGroup({ name: 'Родитель', memberIds: ['dom-a'] });
    expect(parent).not.toBeNull();
    const child = useSkibStore.getState().createGroup({ name: 'Потомок', memberIds: ['dom-b'], parentId: parent! });
    expect(child).not.toBeNull();
    expect((project().architecture.groups ?? []).find((g) => g.id === child)?.parentId).toBe(parent);
    // Третий уровень разрешён (MAX_LG_DEPTH = 3: уровни 0..2).
    const grand = useSkibStore.getState().createGroup({ name: 'Внук', memberIds: ['dom-c'], parentId: child! });
    expect(grand).not.toBeNull();
    // Четвёртый уровень запрещён.
    expect(useSkibStore.getState().createGroup({ name: 'Правнук', parentId: grand! })).toBeNull();
    expect(MAX_LG_DEPTH).toBe(3);
  });

  it('лимит числа ЛГ (20)', () => {
    const store = useSkibStore.getState();
    for (let i = 0; i < MAX_DOMAIN_GROUPS; i++) {
      expect(store.createGroup({ name: `ЛГ ${i + 1}` })).not.toBeNull();
    }
    expect(useSkibStore.getState().createGroup({ name: 'ещё' })).toBeNull();
  });

  it('переименование и цвет: одна операция истории', () => {
    const store = useSkibStore.getState();
    const id = store.createGroup({ memberIds: ['dom-a'] });
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().updateGroup(id!, { name: 'Движение', color: '#8E24AA' });
    const group = (project().architecture.groups ?? []).find((g) => g.id === id)!;
    expect(group.name).toBe('Движение');
    expect(group.color).toBe('#8E24AA');
    expect(useSkibStore.getState().past).toHaveLength(1);
    useSkibStore.getState().undo();
    expect((project().architecture.groups ?? []).find((g) => g.id === id)?.name).toBe('Новая ЛГ');
  });

  it('свёртывание/развёртывание — операция истории; «все» — один шаг', () => {
    const store = useSkibStore.getState();
    const id = store.createGroup({ memberIds: ['dom-a', 'dom-b'] });
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().updateGroup(id!, { collapsed: true });
    expect((project().architecture.groups ?? []).find((g) => g.id === id)?.collapsed).toBe(true);
    useSkibStore.getState().undo();
    expect((project().architecture.groups ?? []).find((g) => g.id === id)?.collapsed).toBe(false);

    useSkibStore.getState().createGroup({ name: 'Вторая', memberIds: ['dom-c'] });
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().setAllGroupsCollapsed(true);
    expect((project().architecture.groups ?? []).every((g) => g.collapsed)).toBe(true);
    expect(useSkibStore.getState().past).toHaveLength(1);
    useSkibStore.getState().setAllGroupsCollapsed(false);
    expect((project().architecture.groups ?? []).every((g) => !g.collapsed)).toBe(true);
  });

  it('включение/исключение ДБ (Ф-74): пакет, один шаг истории, якорь опустевания', () => {
    const store = useSkibStore.getState();
    const id = store.createGroup({ memberIds: ['dom-a'] });
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().setDomainsGroup(['dom-b', 'dom-c'], id!);
    expect(project().architecture.blocks.find((b) => b.id === 'dom-b')?.groupId).toBe(id);
    expect(useSkibStore.getState().past).toHaveLength(1);
    // Исключение всех — группа остаётся с якорем position.
    useSkibStore.getState().setDomainsGroup(['dom-a', 'dom-b', 'dom-c'], null);
    expect((project().architecture.groups ?? []).find((g) => g.id === id)?.position).toBeDefined();
    expect(project().architecture.blocks.find((b) => b.id === 'dom-a')?.groupId).toBeUndefined();
    useSkibStore.getState().undo();
    expect(project().architecture.blocks.find((b) => b.id === 'dom-b')?.groupId).toBe(id);
  });

  it('удаление ЛГ (Ф-73): ДБ несгруппированы, вложенные ЛГ удаляются', () => {
    const store = useSkibStore.getState();
    const parent = store.createGroup({ name: 'Родитель', memberIds: ['dom-a'] })!;
    const child = useSkibStore.getState().createGroup({ name: 'Потомок', memberIds: ['dom-b'], parentId: parent })!;
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().deleteGroup(parent);
    expect(project().architecture.groups ?? []).toHaveLength(0);
    expect(project().architecture.blocks.find((b) => b.id === 'dom-a')?.groupId).toBeUndefined();
    expect(project().architecture.blocks.find((b) => b.id === 'dom-b')?.groupId).toBeUndefined();
    expect(useSkibStore.getState().selection).toBeNull();
    expect(useSkibStore.getState().past).toHaveLength(1);
    useSkibStore.getState().undo();
    expect((project().architecture.groups ?? []).find((g) => g.id === child)).toBeDefined();
    expect(project().architecture.blocks.find((b) => b.id === 'dom-b')?.groupId).toBe(child);
  });

  it('удаление домена: опустевшая ЛГ остаётся с якорем (v0.02.03)', () => {
    const store = useSkibStore.getState();
    const id = store.createGroup({ memberIds: ['dom-a'] })!;
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().deleteDomain('dom-a');
    const group = (project().architecture.groups ?? []).find((g) => g.id === id);
    expect(group).toBeDefined();
    expect(group?.position).toBeDefined();
    expect(project().architecture.blocks.find((b) => b.id === 'dom-a')).toBeUndefined();
  });

  it('раскрытие при подсветке (Ф-76): без истории, свёрнутые предки раскрываются', () => {
    const store = useSkibStore.getState();
    const parent = store.createGroup({ name: 'Родитель', memberIds: ['dom-a'] })!;
    const child = useSkibStore.getState().createGroup({ name: 'Потомок', memberIds: ['dom-b'], parentId: parent })!;
    useSkibStore.getState().updateGroup(parent, { collapsed: true });
    useSkibStore.getState().updateGroup(child, { collapsed: true });
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().revealDomains(['dom-b']);
    const groups = project().architecture.groups ?? [];
    expect(groups.find((g) => g.id === parent)?.collapsed).toBe(false);
    expect(groups.find((g) => g.id === child)?.collapsed).toBe(false);
    // Подсветка не является операцией правки — истории нет.
    expect(useSkibStore.getState().past).toHaveLength(0);
  });

  it('декомпозиция: потомки наследуют ЛГ, группы сохраняются', () => {
    const store = useSkibStore.getState();
    const id = store.createGroup({ memberIds: ['dom-a'] })!;
    useSkibStore.setState({ past: [], future: [] });
    const result = useSkibStore.getState().decomposeBlock({
      blockId: 'dom-a',
      children: [
        { name: 'A.1', cost: 2 },
        { name: 'A.2', cost: 2 },
      ],
      edgeAssignments: [],
    });
    expect(result.ok).toBe(true);
    const groups = project().architecture.groups ?? [];
    expect(groups.find((g) => g.id === id)).toBeDefined();
    // Идентификаторы потомков: <id родителя>-<n> (dom-a-1, dom-a-2).
    const children = project().architecture.blocks.filter((b) => b.id.startsWith('dom-a-'));
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.groupId).toBe(id);
    }
  });
});
