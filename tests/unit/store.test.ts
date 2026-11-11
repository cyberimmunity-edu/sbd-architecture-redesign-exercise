/**
 * Тесты хранилища — история операций (Ф-21), размещения (3.2), лимиты (Ф-17),
 * загрузка security.yaml с сохранением совместимых размещений (Ф-2),
 * отмена декомпозиции (T-D-04), ограничения внешних систем (3.5 v0.01.01).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSkibStore } from '@/store/projectStore';
import { MAX_DOMAINS } from '@/engine/types';
import { parseArchitectureYaml } from '@/io/archYaml';
import { parseSecurityYaml } from '@/io/securityYaml';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(__dirname, '../fixtures');

function loadRobot() {
  const arch = parseArchitectureYaml(readFileSync(resolve(FIXTURES, 'robot/architecture.yaml'), 'utf8'));
  const security = parseSecurityYaml(readFileSync(resolve(FIXTURES, 'robot/security.yaml'), 'utf8'));
  return { arch: arch.model!, security: security.model! };
}

describe('Хранилище проекта', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
  });

  it('Размещение, перемещение и возврат карточки (правило 3.2)', () => {
    const store = useSkibStore.getState();
    const { arch, security } = loadRobot();
    store.loadState({
      architecture: arch,
      security,
      assignments: [],
      meta: {},
    });
    useSkibStore.getState().placeFunction('fn-auth', 'blk-link');
    expect(useSkibStore.getState().project.assignments).toEqual([
      { function: 'fn-auth', block: 'blk-link' },
    ]);
    // Повторное размещение в другой домен — перемещение, а не копирование.
    useSkibStore.getState().placeFunction('fn-auth', 'blk-plan');
    expect(useSkibStore.getState().project.assignments).toEqual([
      { function: 'fn-auth', block: 'blk-plan' },
    ]);
    useSkibStore.getState().unplaceFunction('fn-auth');
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
    // Неизвестные функция/блок игнорируются.
    useSkibStore.getState().placeFunction('fn-ghost', 'blk-link');
    useSkibStore.getState().placeFunction('fn-auth', 'blk-ghost');
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
  });

  it('3.5 v0.01.01: функции размещаются только во внутренние домены', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    // Внешние системы (ext-ctrl, ext-charge) не принимают размещения.
    useSkibStore.getState().placeFunction('fn-auth', 'ext-ctrl');
    useSkibStore.getState().placeFunction('fn-auth', 'ext-charge');
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
    // Внутренний домен принимает.
    useSkibStore.getState().placeFunction('fn-auth', 'blk-link');
    expect(useSkibStore.getState().project.assignments).toHaveLength(1);
  });

  it('3.5 v0.01.01: «+ Внешняя система» создаёт недоверенную систему без стоимости', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    const id = useSkibStore.getState().addExternalDomain({ x: 2000, y: 100 });
    expect(id).toBe('ext-1');
    const created = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === id)!;
    expect(created.external).toBe(true);
    expect(created.trusted).toBe(false);
    expect(created.cost).toBe(0);
    // Доверенность переключается через updateDomain.
    if (id === null) throw new Error('внешняя система не создана');
    useSkibStore.getState().updateDomain(id, { trusted: true });
    expect(useSkibStore.getState().project.architecture.blocks.find((b) => b.id === id)!.trusted).toBe(true);
  });

  it('3.5 v0.01.01: внешняя система не декомпозируется', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    const result = useSkibStore.getState().decomposeBlock({
      blockId: 'ext-ctrl',
      children: [
        { name: 'Часть 1', cost: 1 },
        { name: 'Часть 2', cost: 1 },
      ],
      edgeAssignments: [],
    });
    expect(result.ok).toBe(false);
    // Модель не изменилась.
    expect(useSkibStore.getState().project.architecture.blocks.some((b) => b.id === 'ext-ctrl')).toBe(true);
  });

  it('3.5 v0.01.01: загрузка выносит внешние системы из рамки периметра', () => {
    const { arch, security } = loadRobot();
    // Вручную ставим внешнюю систему внутрь периметра.
    const patched = {
      ...arch,
      blocks: arch.blocks.map((b) =>
        b.id === 'ext-charge' ? { ...b, position: { x: 400, y: 200 } } : b,
      ),
    };
    useSkibStore.getState().loadState({ architecture: patched, security, assignments: [], meta: {} });
    const moved = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'ext-charge')!;
    // ext-charge вынесена вправо за рамку.
    expect(moved.position!.x).toBeGreaterThan(1000);
  });

  it('Undo/Redo размещений (Ф-21)', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    useSkibStore.getState().placeFunction('fn-auth', 'blk-link');
    expect(useSkibStore.getState().project.assignments).toHaveLength(1);
    useSkibStore.getState().undo();
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
    useSkibStore.getState().redo();
    expect(useSkibStore.getState().project.assignments).toHaveLength(1);
    // В истории две операции: загрузка state (loadState) и размещение.
    expect(useSkibStore.getState().past.length).toBe(2);
    expect(useSkibStore.getState().future.length).toBe(0);
  });

  it('T-D-04: отмена декомпозиции — модель идентична исходной', () => {
    const { arch, security } = loadRobot();
    const before = JSON.stringify({
      architecture: arch,
      security,
      assignments: [],
    });
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    useSkibStore.getState().placeFunction('fn-auth', 'blk-link');
    const result = useSkibStore.getState().decomposeBlock({
      blockId: 'blk-link',
      children: [
        { name: 'Связь.1', cost: 2 },
        { name: 'Связь.2', cost: 2 },
      ],
      edgeAssignments: [
        { edgeId: 'e-disp-link', childIndex: 0 },
        { edgeId: 'e-charge-link', childIndex: 0 },
        { edgeId: 'e-link-plan', childIndex: 1 },
        { edgeId: 'e-link-ctrl', childIndex: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(useSkibStore.getState().project.architecture.blocks).toHaveLength(7);
    useSkibStore.getState().undo(); // отменить декомпозицию
    expect(useSkibStore.getState().project.architecture.blocks).toHaveLength(6);
    useSkibStore.getState().undo(); // отменить размещение
    const restored = useSkibStore.getState().project;
    expect(
      JSON.stringify({ architecture: restored.architecture, security: restored.security, assignments: restored.assignments }),
    ).toBe(before);
  });

  it('Глубина истории не менее 100 шагов (Ф-21)', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    for (let i = 0; i < 120; i++) {
      useSkibStore.getState().placeFunction('fn-auth', i % 2 === 0 ? 'blk-link' : 'blk-plan');
    }
    // История ограничена 100 снимками: после загрузки проекта и 120 размещений
    // доступны последние 100 шагов отмены.
    expect(useSkibStore.getState().past.length).toBe(100);
    for (let i = 0; i < 120; i++) useSkibStore.getState().undo();
    expect(useSkibStore.getState().past.length).toBe(0);
    // Отменены все 100 доступных шагов: осталось размещение №20 (первое за пределами истории).
    expect(useSkibStore.getState().project.assignments).toEqual([
      { function: 'fn-auth', block: 'blk-plan' },
    ]);
  });

  it('Ф-2: загрузка security.yaml сохраняет совместимые размещения', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    useSkibStore.getState().placeFunction('fn-auth', 'blk-link');
    useSkibStore.getState().loadSecurity(security, 'security.yaml');
    expect(useSkibStore.getState().project.assignments).toEqual([
      { function: 'fn-auth', block: 'blk-link' },
    ]);
    // Функция, отсутствующая в новом списке, удаляется из размещений.
    const reduced = {
      ...security,
      functions: security.functions.filter((fn) => fn.id !== 'fn-auth'),
    };
    useSkibStore.getState().loadSecurity(reduced, 'security.yaml');
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
  });

  it('Ф-1: загрузка архитектуры сбрасывает размещения в пул', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    useSkibStore.getState().placeFunction('fn-auth', 'blk-link');
    useSkibStore.getState().loadArchitecture(arch, 'architecture.yaml');
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
    expect(useSkibStore.getState().project.architecture.blocks).toHaveLength(6);
  });

  it('Ф-13/Ф-15: добавление домена и удаление домена с возвратом функций', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    const id = useSkibStore.getState().addDomain({ x: 10, y: 10 });
    expect(id).toBe('dom-1');
    const created = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === id)!;
    expect(created.name).toBe('Новый домен');
    expect(created.cost).toBe(1);
    expect(created.external).toBeFalsy();
    expect(id).not.toBeNull();
    useSkibStore.getState().placeFunction('fn-auth', id!);
    useSkibStore.getState().deleteDomain(id!);
    expect(useSkibStore.getState().project.architecture.blocks.some((b) => b.id === id)).toBe(false);
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
  });

  it('Ф-14: стрелки создаются без петель и дубликатов', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    expect(useSkibStore.getState().addEdge('blk-link', 'blk-link')).toBeNull(); // петля
    expect(useSkibStore.getState().addEdge('blk-perc', 'blk-plan')).toBeNull(); // дубликат
    const id = useSkibStore.getState().addEdge('blk-perc', 'ext-ctrl');
    expect(id).toBeTruthy();
    useSkibStore.getState().deleteEdge(id!);
    expect(useSkibStore.getState().project.architecture.edges.some((e) => e.id === id)).toBe(false);
  });

  it('Ф-17: лимиты модели', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    // Заполняем до лимита доменов.
    const blocks = Array.from({ length: MAX_DOMAINS }, (_, i) => ({
      id: `blk-${i + 1}`,
      name: `Домен ${i + 1}`,
      cost: 1,
    }));
    useSkibStore.setState({
      project: { ...useSkibStore.getState().project, architecture: { blocks, edges: [] } },
    });
    expect(useSkibStore.getState().addDomain()).toBeNull();
  });

  it('Ф-23: сброс возвращает пустой проект', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    useSkibStore.getState().resetProject();
    expect(useSkibStore.getState().project.architecture.blocks).toHaveLength(0);
    expect(useSkibStore.getState().past).toHaveLength(0);
  });

  it('v0.01.03: applyAutoLayout меняет позиции с записью в историю и отменяется', () => {
    const { arch, security } = loadRobot();
    useSkibStore.getState().loadState({ architecture: arch, security, assignments: [], meta: {} });
    const before = useSkibStore.getState().project.architecture.blocks.find(
      (b) => b.id === 'blk-perc',
    )!.position;
    expect(before).toEqual({ x: 60, y: 200 });

    const positions: Record<string, { x: number; y: number }> = {};
    for (const block of useSkibStore.getState().project.architecture.blocks) {
      positions[block.id] = { x: 80 + block.id.length, y: 80 };
    }
    useSkibStore.getState().applyAutoLayout(positions);

    const after = useSkibStore.getState().project.architecture.blocks.map((b) => b.position);
    expect(after.every((p) => p && p.y === 80)).toBe(true);
    // Операция в истории: Ctrl+Z возвращает ручную раскладку (Ф-21).
    expect(useSkibStore.getState().past).toHaveLength(2); // loadState + раскладка
    useSkibStore.getState().undo();
    const restored = useSkibStore.getState().project.architecture.blocks.find(
      (b) => b.id === 'blk-perc',
    )!.position;
    expect(restored).toEqual({ x: 60, y: 200 });
    // Позиции блоков, не указанных в словаре, не меняются: applyAutoLayout
    // на пустой архитектуре ничего не ломает.
    useSkibStore.getState().resetProject();
    useSkibStore.getState().applyAutoLayout({ 'dom-1': { x: 5, y: 5 } });
    expect(useSkibStore.getState().project.architecture.blocks).toHaveLength(0);
  });
});
