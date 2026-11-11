/**
 * Тесты security.yaml — кейсы T-Y-06…T-Y-08 и коды E-201…E-207, W-003, W-004
 * раздела 11.2 ТЗ.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSecurityYaml, serializeSecurityYaml } from '@/io/securityYaml';
import { parseArchitectureYaml } from '@/io/archYaml';
import { parseStateYaml, serializeStateYaml } from '@/io/stateFile';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('security.yaml (раздел 6.2)', () => {
  it('Валидный пример 14.4 разбирается (связи many-to-many)', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/security.yaml'), 'utf8');
    const result = parseSecurityYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.model!.goals).toHaveLength(5);
    expect(result.model!.functions).toHaveLength(7);
    const sanitize = result.model!.functions.find((fn) => fn.id === 'fn-sanitize')!;
    expect(sanitize.implements).toEqual([
      { goal: 'g-cmd', weight: 'optional' },
      { goal: 'g-telem', weight: 'mandatory' },
    ]);
  });

  it('T-Y-06: пустой список goals — E-203', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e203-empty-goals.yaml'), 'utf8');
    const result = parseSecurityYaml(text);
    expect(result.errors.some((e) => e.code === 'E-203')).toBe(true);
  });

  it('E-204: пустой список functions — E-204', () => {
    const result = parseSecurityYaml('version: 1\ngoals:\n  - id: g1\n    name: "Цель"\nfunctions: []\n');
    expect(result.errors.some((e) => e.code === 'E-204')).toBe(true);
  });

  it('T-Y-07: implements на несуществующую цель — E-205', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e205-unknown-goal.yaml'), 'utf8');
    const result = parseSecurityYaml(text);
    expect(result.errors.some((e) => e.code === 'E-205' && e.message.includes('goal-ghost'))).toBe(true);
  });

  it('T-Y-08: вес связи вне перечня — E-206', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e206-bad-weight.yaml'), 'utf8');
    const result = parseSecurityYaml(text);
    expect(result.errors.some((e) => e.code === 'E-206')).toBe(true);
  });

  it('E-201/E-202: дубликаты id цели и функции', () => {
    const text = [
      'version: 1',
      'goals:',
      '  - id: g1',
      '    name: "Цель"',
      '  - id: g1',
      '    name: "Цель снова"',
      'functions:',
      '  - id: f1',
      '    name: "Функция"',
      '    cost: 1',
      '  - id: f1',
      '    name: "Функция снова"',
      '    cost: 2',
    ].join('\n');
    const result = parseSecurityYaml(text);
    expect(result.errors.some((e) => e.code === 'E-201')).toBe(true);
    expect(result.errors.some((e) => e.code === 'E-202')).toBe(true);
  });

  it('E-207: отрицательная стоимость функции — E-207', () => {
    const text = [
      'version: 1',
      'goals:',
      '  - id: g1',
      '    name: "Цель"',
      'functions:',
      '  - id: f1',
      '    name: "Функция"',
      '    cost: -1',
    ].join('\n');
    const result = parseSecurityYaml(text);
    expect(result.errors.some((e) => e.code === 'E-207')).toBe(true);
  });

  it('W-003: цель без реализующих функций; W-004: функция без связей', () => {
    const text = [
      'version: 1',
      'goals:',
      '  - id: g1',
      '    name: "Одинокая цель"',
      'functions:',
      '  - id: f1',
      '    name: "Свободная функция"',
      '    cost: 1',
    ].join('\n');
    const result = parseSecurityYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'W-003')).toBe(true);
    expect(result.warnings.some((w) => w.code === 'W-004')).toBe(true);
  });

  it('E-001: файл не является YAML', () => {
    const result = parseSecurityYaml('goals: [1,\n');
    expect(result.errors[0].code).toBe('E-001');
    expect(result.errors[0].line).toBeGreaterThan(0);
  });

  it('Сериализация и повторный разбор эквивалентны', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/security.yaml'), 'utf8');
    const first = parseSecurityYaml(text);
    const second = parseSecurityYaml(serializeSecurityYaml(first.model!));
    expect(second.errors).toEqual([]);
    expect(second.model!.functions).toEqual(first.model!.functions);
    expect(second.model!.goals).toEqual(first.model!.goals);
  });
});

describe('state.yaml (раздел 6.4)', () => {
  it('T-S-01: round-trip полного проекта — эквивалентность (6.6)', () => {
    const archText = readFileSync(resolve(FIXTURES, 'robot/architecture.yaml'), 'utf8');
    const securityText = readFileSync(resolve(FIXTURES, 'robot/security.yaml'), 'utf8');
    const arch = parseArchitectureYaml(archText);
    const security = parseSecurityYaml(securityText);
    const project = {
      architecture: arch.model!,
      security: security.model!,
      assignments: [
        { function: 'fn-auth', block: 'blk-link' },
        { function: 'fn-sign', block: 'blk-link' },
        { function: 'fn-sanitize', block: 'blk-plan' },
        { function: 'fn-geofence', block: 'blk-plan' },
        { function: 'fn-estop', block: 'blk-drive' },
      ],
      meta: { savedAt: '2026-11-09T12:00:00Z', source: 'architecture.yaml + security.yaml' },
    };
    const exported = serializeStateYaml(project);
    const reparsed = parseStateYaml(exported);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.model!.architecture.blocks).toEqual(project.architecture.blocks);
    expect(reparsed.model!.architecture.edges).toEqual(project.architecture.edges);
    expect(reparsed.model!.security).toEqual(project.security);
    expect(reparsed.model!.assignments).toEqual(project.assignments);
    expect(reparsed.model!.meta.savedAt).toBe('2026-11-09T12:00:00Z');
  });

  it('Пример 14.4 (робот) разбирается и даёт C_системы = 486', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/state.yaml'), 'utf8');
    const result = parseStateYaml(text);
    expect(result.errors).toEqual([]);
    expect(result.model!.assignments).toHaveLength(5);
  });

  it('T-S-02: version = 2 — E-401', () => {
    const text = readFileSync(resolve(FIXTURES, 'invalid/e401-bad-state-version.yaml'), 'utf8');
    const result = parseStateYaml(text);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E-401');
  });

  it('T-S-03: размещение на отсутствующую функцию — E-402', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/state.yaml'), 'utf8');
    const patched = text.replace(
      '  - { function: fn-auth, block: blk-link }',
      '  - { function: fn-ghost, block: blk-link }',
    );
    const result = parseStateYaml(patched);
    expect(result.errors.some((e) => e.code === 'E-402' && e.message.includes('fn-ghost'))).toBe(true);
  });

  it('E-402: размещение на отсутствующий блок и повторное размещение функции', () => {
    const text = readFileSync(resolve(FIXTURES, 'robot/state.yaml'), 'utf8');
    const patched = text.replace(
      '  - { function: fn-auth, block: blk-link }',
      '  - { function: fn-auth, block: blk-ghost }',
    );
    const result = parseStateYaml(patched);
    expect(result.errors.some((e) => e.code === 'E-402' && e.message.includes('blk-ghost'))).toBe(true);

    const duplicated = readFileSync(resolve(FIXTURES, 'robot/state.yaml'), 'utf8').replace(
      '  - { function: fn-sign, block: blk-link }',
      '  - { function: fn-auth, block: blk-link }',
    );
    const result2 = parseStateYaml(duplicated);
    expect(result2.errors.some((e) => e.code === 'E-402' && e.message.includes('повторное размещение'))).toBe(true);
  });

  it('E-403: отсутствует обязательный раздел', () => {
    const result = parseStateYaml('version: 1\nassignments: []\n');
    expect(result.errors.some((e) => e.code === 'E-403' && e.message.includes('architecture'))).toBe(true);
  });
});
