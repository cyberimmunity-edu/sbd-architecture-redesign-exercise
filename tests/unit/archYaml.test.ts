/**
 * Тесты architecture.yaml — кейсы T-Y-01…T-Y-05, T-Y-09, T-Y-10 раздела 11.2 ТЗ.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseArchitectureYaml,
  serializeArchitectureYaml,
} from '@/io/archYaml';
import { parseStateYaml, serializeStateYaml } from '@/io/stateFile';

const FIXTURES = resolve(__dirname, '../fixtures');

function equivalentArch(
  a: NonNullable<ReturnType<typeof parseArchitectureYaml>['model']> | undefined,
  b: NonNullable<ReturnType<typeof parseArchitectureYaml>['model']>,
): boolean {
  if (!a) return false;
  const norm = (model: NonNullable<ReturnType<typeof parseArchitectureYaml>['model']>) => ({
    blocks: [...model.blocks]
      .map((bl) => ({ id: bl.id, name: bl.name, cost: bl.cost }))
      .sort((x, y) => x.id.localeCompare(y.id)),
    edges: [...model.edges]
      .map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label ?? null }))
      .sort((x, y) => x.id.localeCompare(y.id)),
  });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

describe('architecture.yaml (раздел 6.1)', () => {
  it('T-Y-01: валидный файл разбирается в модель по схеме (включая внешние системы)', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/architecture.yaml'), 'utf8');
    const result = parseArchitectureYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.model).toBeDefined();
    expect(result.model!.blocks).toHaveLength(6);
    expect(result.model!.edges).toHaveLength(6);
    expect(result.model!.blocks[0]).toMatchObject({
      id: 'blk-perc',
      // v0.02.01 (Ф-36): домены примеров носят префиксы автонумерации.
      name: '01. Подсистема восприятия',
      cost: 3,
      position: { x: 530, y: 314 },
    });
    const external = result.model!.blocks.find((b) => b.id === 'ext-ctrl')!;
    expect(external.external).toBe(true);
    expect(external.trusted).toBe(true);
    const untrusted = result.model!.blocks.find((b) => b.id === 'ext-charge')!;
    expect(untrusted.external).toBe(true);
    expect(untrusted.trusted).toBeFalsy();
  });

  it('T-Y-02: файл не является YAML — E-001 с номером строки', () => {
    const result = parseArchitectureYaml('version: 1\nblocks: [1,\n');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E-001');
    expect(result.errors[0].line).toBeGreaterThan(0);
  });

  it('T-Y-03: дубликат id блока — E-101', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e101-duplicate-block-id.yaml'), 'utf8');
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-101')).toBe(true);
  });

  it('T-Y-04: отрицательная стоимость блока — E-102', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e102-negative-cost.yaml'), 'utf8');
    const result = parseArchitectureYaml(text);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E-102');
    expect(result.errors[0].message).toContain('blk-core');
  });

  it('T-Y-05: стрелка на несуществующий блок — E-103', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e103-edge-unknown-block.yaml'), 'utf8');
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-103' && e.message.includes('blk-ghost'))).toBe(true);
  });

  it('E-104: петля from = to — E-104', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e104-self-loop.yaml'), 'utf8');
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-104')).toBe(true);
  });

  it('E-106: id вне шаблона — E-106', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e106-bad-id.yaml'), 'utf8');
    const result = parseArchitectureYaml(text);
    expect(result.errors.some((e) => e.code === 'E-106')).toBe(true);
  });

  it('E-105: пустой список blocks — E-105', () => {
    const result = parseArchitectureYaml('version: 1\nblocks: []\nedges: []\n');
    expect(result.errors.some((e) => e.code === 'E-105')).toBe(true);
  });

  it('T-Y-09: неизвестные поля игнорируются с предупреждением W-001', () => {
    const text = [
      'version: 1',
      'blocks:',
      '  - id: blk-a',
      '    name: "Блок"',
      '    cost: 1',
      '    color: red',
      'edges: []',
      'extra: 42',
    ].join('\n');
    const result = parseArchitectureYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.model).toBeDefined();
    expect(result.warnings.some((w) => w.code === 'W-001' && w.path === 'blocks[0].color')).toBe(true);
    expect(result.warnings.some((w) => w.code === 'W-001' && w.path === 'extra')).toBe(true);
  });

  it('T-Y-10: round-trip сериализация → разбор даёт структурную эквивалентность (6.6)', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/architecture.yaml'), 'utf8');
    const first = parseArchitectureYaml(text);
    expect(first.errors).toEqual([]);
    const exported = serializeArchitectureYaml(first.model!, { name: 'Автономный коммунальный робот' });
    const second = parseArchitectureYaml(exported);
    expect(second.errors).toEqual([]);
    expect(equivalentArch(first.model, second.model!)).toBe(true);
    // Координаты сохраняются в architecture.yaml.
    expect(second.model!.blocks[0].position).toEqual({ x: 530, y: 314 });
    // Внешние системы сохраняют признаки external/trusted.
    expect(second.model!.blocks.find((b) => b.id === 'ext-ctrl')).toMatchObject({ external: true, trusted: true });
  });

  it('v0.01.06: forceTrusted сохраняется в architecture.yaml и state.yaml (round-trip)', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/architecture.yaml'), 'utf8');
    const first = parseArchitectureYaml(text);
    expect(first.errors).toEqual([]);
    // Принудительно вводим blk-perc в ДВБ и выгружаем обратно.
    const withForced = {
      ...first.model!,
      blocks: first.model!.blocks.map((b) =>
        b.id === 'blk-perc' ? { ...b, forceTrusted: true } : b,
      ),
    };
    const exported = serializeArchitectureYaml(withForced);
    expect(exported).toContain('forceTrusted: true');
    const second = parseArchitectureYaml(exported);
    expect(second.errors).toEqual([]);
    expect(second.warnings.some((w) => w.code === 'W-001')).toBe(false);
    expect(second.model!.blocks.find((b) => b.id === 'blk-perc')!.forceTrusted).toBe(true);
    // У внешних систем признак не пишется.
    expect(exported).not.toMatch(/external: true\n\s+trusted: true\n\s+forceTrusted/);
    // state.yaml: сериализация → разбор тоже сохраняет признак.
    const stateText = serializeStateYaml({
      architecture: withForced,
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [{ id: 'f1', name: 'Функция', cost: 1 }],
      },
      assignments: [],
      meta: {},
    });
    const stateParsed = parseStateYaml(stateText);
    expect(stateParsed.errors).toEqual([]);
    expect(stateParsed.model!.architecture.blocks.find((b) => b.id === 'blk-perc')!.forceTrusted).toBe(true);
    // Признак отсутствует — поле не выводится вовсе (обратная совместимость).
    const plain = serializeArchitectureYaml(first.model!);
    expect(plain).not.toContain('forceTrusted');
  });
});
