/**
 * Тесты декомпозиции — кейсы T-D-01…T-D-04 раздела 11.2 ТЗ (алгоритм 7.3).
 * T-D-04 (undo) выполняется на уровне хранилища (см. store.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { decompose } from '@/engine/decompose';
import { recalcCosts } from '@/engine/cost';
import { emptyProject } from '@/engine/types';

function baseProject() {
  return {
    ...emptyProject(),
    architecture: {
      blocks: [
        { id: 'blk-a', name: 'Домен А', cost: 3, position: { x: 0, y: 0 } },
        { id: 'blk-b', name: 'Домен Б', cost: 2 },
      ],
      edges: [
        { id: 'e-in', from: 'blk-b', to: 'blk-a', label: 'вход' },
        { id: 'e-out', from: 'blk-a', to: 'blk-b', label: 'выход' },
      ],
    },
    security: {
      goals: [{ id: 'g1', name: 'Цель' }],
      functions: [
        { id: 'f1', name: 'Функция 1', cost: 2, implements: [{ goal: 'g1', weight: 'mandatory' as const }] },
        { id: 'f2', name: 'Функция 2', cost: 1 },
      ],
    },
    assignments: [
      { function: 'f1', block: 'blk-a' },
      { function: 'f2', block: 'blk-a' },
    ],
    meta: {},
  };
}

describe('Декомпозиция (раздел 7.3, решение D5)', () => {
  it('T-D-01: отказ по параметрам — модель не изменена (транзакционность)', () => {
    const project = baseProject();
    const before = JSON.stringify(project);

    const tooFew = decompose(project, {
      blockId: 'blk-a',
      children: [{ name: 'А.1', cost: 1 }],
      edgeAssignments: [],
    });
    expect(tooFew.ok).toBe(false);
    if (!tooFew.ok) expect(tooFew.errors.some((e) => e.includes('от 2 до 6'))).toBe(true);

    const tooMany = decompose(project, {
      blockId: 'blk-a',
      children: Array.from({ length: 7 }, (_, i) => ({ name: `А.${i + 1}`, cost: 1 })),
      edgeAssignments: [],
    });
    expect(tooMany.ok).toBe(false);

    const emptyName = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: '', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [{ edgeId: 'e-in', childIndex: 0 }, { edgeId: 'e-out', childIndex: 0 }],
    });
    expect(emptyName.ok).toBe(false);

    const duplicateName = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'Домен Б', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [{ edgeId: 'e-in', childIndex: 0 }, { edgeId: 'e-out', childIndex: 0 }],
    });
    expect(duplicateName.ok).toBe(false);

    const negativeCost = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: -1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [{ edgeId: 'e-in', childIndex: 0 }, { edgeId: 'e-out', childIndex: 0 }],
    });
    expect(negativeCost.ok).toBe(false);

    const unassignedEdge = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [{ edgeId: 'e-in', childIndex: 0 }],
    });
    expect(unassignedEdge.ok).toBe(false);
    if (!unassignedEdge.ok) {
      expect(unassignedEdge.errors.some((e) => e.includes('e-out'))).toBe(true);
    }

    const unknownBlock = decompose(project, {
      blockId: 'blk-ghost',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [],
    });
    expect(unknownBlock.ok).toBe(false);

    expect(JSON.stringify(project)).toBe(before);
  });

  it('T-D-02: распределение стрелок по потомкам — направления и подписи сохранены', () => {
    const project = baseProject();
    const result = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 3 },
        { name: 'А.2', cost: 3 },
      ],
      edgeAssignments: [
        { edgeId: 'e-in', childIndex: 0 },
        { edgeId: 'e-out', childIndex: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const edges = result.project.architecture.edges;
    expect(edges).toHaveLength(2);
    const eIn = edges.find((e) => e.id === 'e-in')!;
    const eOut = edges.find((e) => e.id === 'e-out')!;
    expect(eIn.to).toBe('blk-a-1');
    expect(eIn.from).toBe('blk-b');
    expect(eIn.label).toBe('вход');
    expect(eOut.from).toBe('blk-a-2');
    expect(eOut.to).toBe('blk-b');
    expect(eOut.label).toBe('выход');
    // Исходный домен удалён, потомки на том же уровне (плоская модель).
    expect(result.project.architecture.blocks.some((b) => b.id === 'blk-a')).toBe(false);
    expect(result.project.architecture.blocks.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Домен Б', 'А.1', 'А.2']),
    );
  });

  it('T-D-03: функции декомпозированного домена вернулись в пул', () => {
    const project = baseProject();
    const result = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [
        { edgeId: 'e-in', childIndex: 0 },
        { edgeId: 'e-out', childIndex: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.assignments).toHaveLength(0);
  });

  it('Идентификаторы потомков уникальны и соответствуют шаблону', () => {
    const project = baseProject();
    const result = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
        { name: 'А.3', cost: 1 },
      ],
      edgeAssignments: [
        { edgeId: 'e-in', childIndex: 0 },
        { edgeId: 'e-out', childIndex: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.project.architecture.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
    }
  });

  it('Повторная декомпозиция полученных доменов разрешена (7.3)', () => {
    const project = baseProject();
    const first = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [
        { edgeId: 'e-in', childIndex: 0 },
        { edgeId: 'e-out', childIndex: 0 },
      ],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = decompose(first.project, {
      blockId: 'blk-a-1',
      children: [
        { name: 'А.1.1', cost: 1 },
        { name: 'А.1.2', cost: 1 },
      ],
      edgeAssignments: [
        { edgeId: 'e-in', childIndex: 0 },
        { edgeId: 'e-out', childIndex: 1 },
      ],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.project.architecture.blocks).toHaveLength(4); // blk-b, А.1.1, А.1.2, А.2
  });

  it('Стоимость потомков считается по формуле 7.1 v0.01.01 без компенсации', () => {
    const project = baseProject();
    const result = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 30 },
        { name: 'А.2', cost: 30 },
      ],
      edgeAssignments: [
        { edgeId: 'e-in', childIndex: 0 },
        { edgeId: 'e-out', childIndex: 1 },
      ],
    });
    if (!result.ok) return;
    const withFunctions = {
      ...result.project,
      assignments: [
        { function: 'f1', block: 'blk-a-1' },
        { function: 'f2', block: 'blk-a-2' },
      ],
    };
    const { costs, systemCost } = recalcCosts(withFunctions);
    // А.1: критичная функция f1 → ДВБ; вход e-in от НДБ (blk-б) красный → ДДБПЦД:
    // 30 × 2 × M(E=1 → 1) × 10 = 600.
    // А.2: f2 без связей → НДБ: ceil(30 × 1 × 1 × 0.1) = 3. Б: ceil(2 × 0.1) = 1.
    expect(costs.get('blk-a-1')!.domainCost).toBe(600);
    expect(costs.get('blk-a-1')!.trustCoefficient).toBe(10);
    expect(costs.get('blk-a-2')!.domainCost).toBe(3);
    expect(systemCost).toBe(604);
  });

  it('3.5 v0.01.01: декомпозиция внешней системы отклоняется', () => {
    const project = {
      ...emptyProject(),
      architecture: {
        blocks: [
          { id: 'blk-a', name: 'Внутренний', cost: 1 },
          { id: 'ext-1', name: 'Внешняя', cost: 0, external: true },
        ],
        edges: [],
      },
      security: { goals: [{ id: 'g1', name: 'Цель' }], functions: [] },
      assignments: [],
      meta: {},
    };
    const result = decompose(project, {
      blockId: 'ext-1',
      children: [
        { name: 'Часть 1', cost: 1 },
        { name: 'Часть 2', cost: 1 },
      ],
      edgeAssignments: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('только внутренние домены');
    }
  });
});
