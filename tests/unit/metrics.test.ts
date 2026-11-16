/**
 * Тесты метрик системы — v0.03.01 (интеграция с ИИ-агентами).
 * Метрики агрегируют чистые функции движка; проверяются на фикстурах,
 * на примерах репозитория (robot 486, vessel 943) и инварианты.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeMetrics } from '../../src/engine/metrics';
import { recalcCosts } from '../../src/engine/cost';
import { parseStateYaml } from '../../src/io/stateFile';
import { emptyProject } from '../../src/engine/types';
import type { Assignment, Block, Edge, Goal, Project, SecurityFunction } from '../../src/engine/types';

function loadSample(name: string): Project {
  const text = readFileSync(new URL(`../../src/samples/${name}/state.yaml`, import.meta.url), 'utf8');
  const parsed = parseStateYaml(text);
  expect(parsed.errors).toEqual([]);
  return parsed.model!;
}

describe('Метрики — базовые сценарии (v0.03.01)', () => {
  it('пустой проект: нулевые метрики без ДП и ЛГ', () => {
    const m = computeMetrics(emptyProject());
    expect(m.systemCost).toBe(0);
    expect(m.dvb.size).toBe(0);
    expect(m.dvb.boundaryEdges).toBe(0);
    expect(m.composition.domains.total).toBe(0);
    expect(m.goals.total).toBe(0);
    expect(m.sequences).toBeNull();
    expect(m.groups).toEqual({ count: 0, maxDepth: 0 });
    expect(m.advice.count).toBe(0);
  });

  it('robot: метрики демо-состояния стабильны', () => {
    const project = loadSample('robot');
    const m = computeMetrics(project);
    // Контрольное число примера (14.4 ТЗ) не меняется.
    expect(m.systemCost).toBe(486);
    // ДВБ: blk-plan, blk-link (ДДБПЦД) + blk-drive (ДДБ) = 3 домена.
    expect(m.dvb.size).toBe(3);
    expect(m.composition.domains.byTrust).toEqual({ ndb: 1, ddb: 1, ddbpcd: 2 });
    expect(m.composition.domains.external).toBe(2);
    // Функции: 7 функций, 5 размещено (fn-charge-guard и fn-log в пуле).
    expect(m.composition.functions.total).toBe(7);
    expect(m.composition.functions.placed).toBe(5);
    expect(m.composition.functions.unplaced).toBe(2);
    // ЛГ из демо: одна группа «Контур управления движением», глубина 0.
    expect(m.groups).toEqual({ count: 1, maxDepth: 0 });
    // Граница ДВБ: красные стрелки входят в ДДБПЦД — граница есть.
    expect(m.dvb.boundaryEdges).toBeGreaterThan(0);
    // Доля ДВБ в стоимости: ДДБПЦД доминируют.
    expect(m.dvb.costPercent).toBeGreaterThan(50);
  });

  it('vessel: метрики демо-состояния стабильны', () => {
    const project = loadSample('vessel');
    const m = computeMetrics(project);
    // Контрольное число примера не меняется.
    expect(m.systemCost).toBe(943);
    expect(m.dvb.size).toBeGreaterThan(0);
    expect(m.composition.functions.total).toBe(m.composition.functions.placed + m.composition.functions.unplaced);
  });

  it('robot: одинаковый проект — одинаковые метрики (детерминизм)', () => {
    const project = loadSample('robot');
    expect(computeMetrics(project)).toEqual(computeMetrics(project));
  });
});

describe('Метрики — инварианты (v0.03.01)', () => {
  it('стоимость ДВБ не превышает C_системы, проценты в диапазоне 0…100', () => {
    for (const sample of ['robot', 'vessel']) {
      const m = computeMetrics(loadSample(sample));
      expect(m.dvb.cost).toBeLessThanOrEqual(m.systemCost);
      expect(m.dvb.costPercent).toBeGreaterThanOrEqual(0);
      expect(m.dvb.costPercent).toBeLessThanOrEqual(100);
      // Вариантный перебор (v0.03.01b): сумма экономий независимых
      // кандидатов может превышать C_системы, поэтому диапазон 0…100
      // гарантирует только лучший одиночный совет.
      expect(m.advice.bestSaving).toBeLessThanOrEqual(m.systemCost);
      expect(m.advice.bestSavingPercent).toBeGreaterThanOrEqual(0);
      expect(m.advice.bestSavingPercent).toBeLessThanOrEqual(100);
      expect(m.advice.bestSaving).toBeLessThanOrEqual(m.advice.totalSaving);
      expect(m.advice.totalSavingPercent).toBe(
        Math.round((m.advice.totalSaving / m.systemCost) * 100),
      );
      // Состав доменов сходится.
      expect(m.composition.domains.byTrust.ndb + m.composition.domains.byTrust.ddb + m.composition.domains.byTrust.ddbpcd)
        .toBe(m.composition.domains.internal);
    }
  });

  it('граница ДВБ: ребро доверенный ↔ недоверенный считается один раз', () => {
    const blocks: Block[] = [
      { id: 'ext-sensor', name: 'Датчик', cost: 0, external: true },
      { id: 'd-iface', name: 'Интерфейс', cost: 2 },
      { id: 'd-core', name: 'Ядро', cost: 3 },
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'ext-sensor', to: 'd-iface' },
      { id: 'e2', from: 'd-iface', to: 'd-core' },
    ];
    const goals: Goal[] = [{ id: 'g1', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-a', name: 'Приём', cost: 1, implements: [{ goal: 'g1', weight: 'mandatory' }] },
      { id: 'f-b', name: 'Обработка', cost: 2, implements: [{ goal: 'g1', weight: 'mandatory' }] },
    ];
    const assignments: Assignment[] = [
      { function: 'f-a', block: 'd-iface' },
      { function: 'f-b', block: 'd-core' },
    ];
    const project: Project = { architecture: { blocks, edges }, security: { goals, functions }, assignments, meta: {} };
    const m = computeMetrics(project);
    // d-iface — ДДБПЦД (красный вход), d-core — ДДБ: граница — только e1.
    expect(m.dvb.size).toBe(2);
    expect(m.dvb.boundaryEdges).toBe(1);
    expect(m.dvb.trustTransitions).toBe(1); // ДДБПЦД → ДДБ
    expect(m.composition.edges.red).toBe(1);
    // Сходится с пересчётом стоимости.
    expect(m.systemCost).toBe(recalcCosts(project).systemCost);
  });
});
