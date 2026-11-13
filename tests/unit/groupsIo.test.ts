/**
 * Тесты сериализации ЛГ в файлах данных — v0.02.03, Ф-70…Ф-76:
 * round-trip architecture.yaml и state.yaml с секцией groups и полем group
 * у блоков; обратная совместимость (файлы без ЛГ читаются без изменений);
 * предупреждения W-010…W-012 и валидация (E-101/E-106/E-002).
 */

import { describe, expect, it } from 'vitest';
import { parseArchitectureYaml, serializeArchitectureYaml } from '@/io/archYaml';
import { parseStateYaml, serializeStateYaml } from '@/io/stateFile';
import { LG_DEFAULT_COLOR } from '@/engine/types';
import type { Project } from '@/engine/types';

const WITH_GROUPS = `version: 1
system:
  name: "Тест ЛГ"
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
    group: lg-1
    position: { x: 100, y: 100 }
  - id: blk-b
    name: "02. Второй"
    cost: 1
    group: lg-2
    position: { x: 500, y: 100 }
  - id: blk-c
    name: "03. Третий"
    cost: 1
    position: { x: 900, y: 100 }
edges:
  - id: e-a-b
    from: blk-a
    to: blk-b
groups:
  - id: lg-1
    name: "Родитель"
    color: "#1E88E5"
  - id: lg-2
    name: "Потомок"
    color: "#00897B"
    parent: lg-1
  - id: lg-3
    name: "Свёрнутая"
    collapsed: true
`;

describe('Файлы данных с ЛГ (v0.02.03)', () => {
  it('architecture.yaml: round-trip групп, членов, свёрнутости и вложенности', () => {
    const result = parseArchitectureYaml(WITH_GROUPS);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    const model = result.model!;
    expect(model.groups).toHaveLength(3);
    const parent = model.groups!.find((g) => g.id === 'lg-1')!;
    const child = model.groups!.find((g) => g.id === 'lg-2')!;
    const collapsed = model.groups!.find((g) => g.id === 'lg-3')!;
    expect(parent).toMatchObject({ name: 'Родитель', color: '#1E88E5' });
    expect(child.parentId).toBe('lg-1');
    expect(collapsed.collapsed).toBe(true);
    expect(collapsed.color).toBe(LG_DEFAULT_COLOR);
    expect(model.blocks.find((b) => b.id === 'blk-a')?.groupId).toBe('lg-1');
    expect(model.blocks.find((b) => b.id === 'blk-c')?.groupId).toBeUndefined();

    const text = serializeArchitectureYaml(model, { name: 'Тест ЛГ' });
    const round = parseArchitectureYaml(text);
    expect(round.errors).toEqual([]);
    expect(round.model!.groups).toEqual(model.groups);
    expect(round.model!.blocks.map((b) => b.groupId)).toEqual(model.blocks.map((b) => b.groupId));
  });

  it('state.yaml: round-trip ЛГ в составе полного состояния', () => {
    const archResult = parseArchitectureYaml(WITH_GROUPS);
    const project: Project = {
      architecture: archResult.model!,
      security: {
        goals: [{ id: 'g-1', name: 'Цель' }],
        functions: [{ id: 'fn-1', name: 'Функция', cost: 1 }],
      },
      assignments: [],
      meta: {},
    };
    const text = serializeStateYaml(project);
    const parsed = parseStateYaml(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.model!.architecture.groups).toEqual(archResult.model!.groups);
    expect(parsed.model!.architecture.blocks.find((b) => b.id === 'blk-b')?.groupId).toBe('lg-2');
  });

  it('файл без ЛГ читается без изменений (обратная совместимость)', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
edges: []
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.model!.groups).toBeUndefined();
  });

  it('W-010: ссылка блока на несуществующую группу игнорируется', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
    group: no-such
edges: []
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'W-010')).toBe(true);
    expect(result.model!.blocks[0].groupId).toBeUndefined();
    expect(result.model!.groups).toBeUndefined();
  });

  it('W-011: цвет вне палитры (красный/жёлтый/зелёный) заменяется серым', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
edges: []
groups:
  - id: lg-1
    name: "Группа"
    color: "#43A047"
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'W-011')).toBe(true);
    expect(result.model!.groups![0].color).toBe(LG_DEFAULT_COLOR);
  });

  it('W-012: цикл вложенности разрывается с предупреждением', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
edges: []
groups:
  - id: lg-1
    name: "Первая"
    parent: lg-2
  - id: lg-2
    name: "Вторая"
    parent: lg-1
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'W-012')).toBe(true);
    const groups = result.model!.groups!;
    // Цикл разорван: хотя бы одна ссылка на родителя удалена.
    const broken = groups.every((g) => g.parentId === undefined) ||
      (groups.find((g) => g.id === 'lg-1')!.parentId === undefined ||
        groups.find((g) => g.id === 'lg-2')!.parentId === undefined);
    expect(broken).toBe(true);
  });

  it('E-101: дубликат id группы блокирует файл', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
edges: []
groups:
  - id: lg-1
    name: "Первая"
  - id: lg-1
    name: "Повтор"
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-101')).toBe(true);
    expect(result.model).toBeUndefined();
  });

  it('E-106: id группы вне шаблона блокирует файл', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
edges: []
groups:
  - id: Bad_Id
    name: "Плохой"
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-106')).toBe(true);
  });

  it('E-002: пустое имя группы блокирует файл', () => {
    const text = `version: 1
blocks:
  - id: blk-a
    name: "01. Первый"
    cost: 1
edges: []
groups:
  - id: lg-1
    name: ""
`;
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-002')).toBe(true);
  });
});
