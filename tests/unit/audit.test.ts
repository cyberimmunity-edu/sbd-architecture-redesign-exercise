/**
 * Тесты семантической проверки диаграммы — v0.01.08, W-013 — v0.03.01b.
 * Трассировка «цель → функция → домен»: E-501 (обязательные функции цели
 * не размещены), E-502 (ПЛО-цель), W-006 (функция с целями без размещения),
 * W-013 (forceTrusted при красном входе — обоснование признака).
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

describe('Проверка диаграммы — обоснование forceTrusted (W-013, v0.03.01b)', () => {
  it('forceTrusted-домен с красным входом — W-013 с указанием места', () => {
    // Ситуация примера пользователя: интерфейсный ДБ (лидар) объявлен
    // доверенным по флагу и принимает красный поток из внешней среды —
    // исходящие потоки «зелёные по флагу», обоснование должно быть явным.
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [],
      blocks: [
        { id: 'ext-env', name: 'Среда', cost: 0, external: true },
        { id: 'd-lidar', name: 'Лидар', cost: 2, forceTrusted: true },
      ],
      edges: [{ id: 'e-env-lidar', from: 'ext-env', to: 'd-lidar' }],
    });
    const messages = validateProject(project);
    const w013 = messages.find((message) => message.code === 'W-013');
    expect(w013).toBeDefined();
    expect(w013!.message).toContain('d-lidar');
    expect(w013!.message).toContain('forceTrusted');
    expect(w013!.path).toBe('architecture.blocks[1]');
  });

  it('forceTrusted без красного входа — предупреждения нет (легитимный ввод в ДВБ)', () => {
    // Доверенный датчик в составе системы: флаг обоснован, красных входов нет.
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [],
      blocks: [
        { id: 'd-sensor', name: 'Датчик', cost: 2, forceTrusted: true },
      ],
      edges: [],
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('красный вход без forceTrusted — обычная картина ДДБПЦД, W-013 нет', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
      blocks: [
        { id: 'ext-env', name: 'Среда', cost: 0, external: true },
        { id: 'd-iface', name: 'Интерфейс', cost: 2 },
      ],
      edges: [{ id: 'e-env-iface', from: 'ext-env', to: 'd-iface' }],
      assignments: [{ function: 'f-1', block: 'd-iface' }],
    });
    expect(validateProject(project)).toEqual([]);
  });
});
