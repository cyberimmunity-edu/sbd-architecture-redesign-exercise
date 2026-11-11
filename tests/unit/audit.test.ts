/**
 * Тесты семантической проверки диаграммы — v0.01.08. Трассировка
 * «цель → функция → домен»: E-501 (обязательные функции цели не размещены),
 * E-502 (ПЛО-цель), W-006 (функция с целями без размещения).
 */

import { describe, expect, it } from 'vitest';
import { validateProject } from '../../src/engine/audit';
import type { Assignment, Block, Edge, Goal, Project, SecurityFunction } from '../../src/engine/types';

function makeProject(options: {
  goals: Goal[];
  functions: SecurityFunction[];
  assignments?: Assignment[];
  blocks?: Block[];
  edges?: Edge[];
}): Project {
  return {
    architecture: {
      blocks: options.blocks ?? [{ id: 'd-a', name: 'Домен', cost: 1 }],
      edges: options.edges ?? [],
    },
    security: { goals: options.goals, functions: options.functions },
    assignments: options.assignments ?? [],
    meta: {},
  };
}

describe('Проверка диаграммы — трассировка целей (v0.01.08)', () => {
  it('обязательные функции цели не размещены — E-501', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель один' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
    });
    const messages = validateProject(project);
    expect(messages).toHaveLength(2); // E-501 и W-006 об одном пробеле
    expect(messages.map((message) => message.code).sort()).toEqual(['E-501', 'W-006']);
    expect(messages.find((message) => message.code === 'E-501')?.message).toContain('t-1');
  });

  it('цель ПЛО с неполным размещением — E-502', () => {
    const project = makeProject({
      goals: [{ id: 't-plo', name: 'Безусловная цель', unconditional: true }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-plo', weight: 'mandatory' }] },
      ],
    });
    const messages = validateProject(project);
    // Обязательная функция не размещена: E-502 для безусловной цели
    // и W-006 на саму функцию.
    expect(messages.map((message) => message.code).sort()).toEqual(['E-502', 'W-006']);
    expect(messages.find((message) => message.code === 'E-502')!.message).toContain('безусловно');
  });

  it('размещённая обязательная функция — проверка чиста', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
      assignments: [{ function: 'f-1', block: 'd-a' }],
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('цель без функций — зона W-003, E-501 не возникает', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [{ id: 'f-1', name: 'Функция', cost: 1 }],
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('optional-функции не требуются к размещению (E-501/E-502 не возникают)', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'optional' }] },
      ],
    });
    // Цель без обязательных функций не попадает в E-501/E-502; единственное
    // сообщение — W-006 на саму неразмещённую функцию.
    expect(validateProject(project).map((message) => message.code)).toEqual(['W-006']);
  });
});
