/**
 * Тесты покрытия целей — кейсы T-P-01…T-P-09 раздела 11.2 ТЗ (алгоритм 7.2).
 */

import { describe, expect, it } from 'vitest';
import { recalcCoverage, goalStatus, goalDistribution, aggregateStatus } from '@/engine/coverage';
import { emptyProject, type Project } from '@/engine/types';

function fn(
  id: string,
  links?: Array<{ goal: string; weight: 'mandatory' | 'optional' }>,
  cost = 1,
) {
  return { id, name: `Функция ${id}`, cost, implements: links };
}

function goal(id: string) {
  return { id, name: `Цель ${id}` };
}

function block(id: string) {
  return { id, name: `Блок ${id}`, cost: 1 };
}

function build(overrides: Partial<Project>): Project {
  const base = emptyProject();
  return {
    ...base,
    ...overrides,
    architecture: overrides.architecture ?? base.architecture,
    security: overrides.security ?? base.security,
    assignments: overrides.assignments ?? [],
  };
}

describe('Правила покрытия (раздел 3.4, алгоритм 7.2)', () => {
  const security = {
    goals: [goal('g1'), goal('g2'), goal('g3')],
    functions: [
      fn('fm1', [{ goal: 'g1', weight: 'mandatory' as const }]),
      fn('fm2', [{ goal: 'g1', weight: 'mandatory' as const }]),
      fn('fmo', [{ goal: 'g1', weight: 'optional' as const }]),
      fn('fo1', [{ goal: 'g2', weight: 'optional' as const }]),
      fn('fo2', [{ goal: 'g2', weight: 'optional' as const }]),
      fn('fm3', [{ goal: 'g3', weight: 'mandatory' as const }]),
    ],
  };

  it('T-P-01: все mandatory размещены — цель зелёная', () => {
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [
        { function: 'fm1', block: 'b' },
        { function: 'fm2', block: 'b' },
      ],
    });
    expect(recalcCoverage(project).goalStatuses.get('g1')).toBe('green');
  });

  it('T-P-02: размещена часть mandatory — цель жёлтая', () => {
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [{ function: 'fm1', block: 'b' }],
    });
    expect(recalcCoverage(project).goalStatuses.get('g1')).toBe('yellow');
  });

  it('T-P-03: ничего не размещено — цель красная', () => {
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
    });
    expect(recalcCoverage(project).goalStatuses.get('g1')).toBe('red');
  });

  it('T-P-04: только optional при незавершённых mandatory — жёлтая, не зелёная', () => {
    // fm1, fm2 (mandatory для g1) не размещены; fmo (optional для g1) размещён.
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [{ function: 'fmo', block: 'b' }],
    });
    expect(recalcCoverage(project).goalStatuses.get('g1')).toBe('yellow');
    expect(recalcCoverage(project).goalStatuses.get('g1')).not.toBe('green');
  });

  it('T-P-05: цель только с optional: все / часть / ноль → зелёная / жёлтая / красная', () => {
    const none = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
    });
    expect(recalcCoverage(none).goalStatuses.get('g2')).toBe('red');
    const part = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [{ function: 'fo1', block: 'b' }],
    });
    expect(recalcCoverage(part).goalStatuses.get('g2')).toBe('yellow');
    const all = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [
        { function: 'fo1', block: 'b' },
        { function: 'fo2', block: 'b' },
      ],
    });
    expect(recalcCoverage(all).goalStatuses.get('g2')).toBe('green');
  });

  it('T-P-06: цель без связей — красная', () => {
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security: { goals: [goal('g-empty')], functions: security.functions },
    });
    expect(recalcCoverage(project).goalStatuses.get('g-empty')).toBe('red');
    // W-003 фиксируется при валидации security.yaml (см. securityYaml.test.ts).
  });

  it('T-P-07: агрегат системы — по правилу худшего статуса', () => {
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [{ function: 'fm1', block: 'b' }],
    });
    // g1 жёлтая, g2 жёлтая, g3 красная → система красная.
    expect(recalcCoverage(project).systemStatus).toBe('red');
    const better = build({
      architecture: { blocks: [block('b')], edges: [] },
      security,
      assignments: [
        { function: 'fm1', block: 'b' },
        { function: 'fm2', block: 'b' },
        { function: 'fo1', block: 'b' },
        { function: 'fo2', block: 'b' },
      ],
    });
    // g1 зелёная, g2 зелёная, g3 красная → красная.
    expect(recalcCoverage(better).systemStatus).toBe('red');
    const full = build({
      architecture: { blocks: [block('b')], edges: [] },
      security: { goals: [goal('g1')], functions: [fn('fm1', [{ goal: 'g1', weight: 'mandatory' }])] },
      assignments: [{ function: 'fm1', block: 'b' }],
    });
    expect(recalcCoverage(full).systemStatus).toBe('green');
    expect(aggregateStatus(['yellow', 'yellow'])).toBe('yellow');
    expect(aggregateStatus(['green', 'yellow'])).toBe('yellow');
  });

  it('T-P-08: агрегат домена — по правилам 3.4; без функций нейтральный', () => {
    const project = build({
      architecture: { blocks: [block('b1'), block('b2')], edges: [] },
      security,
      assignments: [{ function: 'fm1', block: 'b1' }],
    });
    const coverage = recalcCoverage(project);
    // b1: цель g1 жёлтая (часть mandatory) → жёлтый.
    expect(coverage.domainStatuses.get('b1')).toBe('yellow');
    // b2: без функций → нейтральный.
    expect(coverage.domainStatuses.get('b2')).toBe('neutral');
    const green = build({
      architecture: { blocks: [block('b1')], edges: [] },
      security,
      assignments: [
        { function: 'fm1', block: 'b1' },
        { function: 'fm2', block: 'b1' },
      ],
    });
    expect(recalcCoverage(green).domainStatuses.get('b1')).toBe('green');
    const withYellow = build({
      architecture: { blocks: [block('b1')], edges: [] },
      security,
      assignments: [{ function: "fm1", block: "b1" }],
    });
    // Цели размещённых функций: g1 жёлтая → домен жёлтый.
    // Примечание к алгоритму 7.2: красный агрегат домена недостижим — цель красна,
    // только когда ни одна её функция не размещена, и тогда она не входит в агрегат.
    expect(recalcCoverage(withYellow).domainStatuses.get('b1')).toBe('yellow');
  });

  it('T-P-09: перемещение карточки — статусы целей не меняются, агрегаты доменов меняются', () => {
    const before = build({
      architecture: { blocks: [block('b1'), block('b2')], edges: [] },
      security,
      assignments: [{ function: 'fm1', block: 'b1' }],
    });
    const after: Project = {
      ...before,
      assignments: [{ function: 'fm1', block: 'b2' }],
    };
    const coverageBefore = recalcCoverage(before);
    const coverageAfter = recalcCoverage(after);
    // Цель g1 жёлтая в обоих состояниях (размещена одна из двух mandatory).
    expect(coverageAfter.goalStatuses.get('g1')).toBe(coverageBefore.goalStatuses.get('g1'));
    expect(coverageBefore.goalStatuses.get('g1')).toBe('yellow');
    // Агрегаты доменов меняются: жёлтый переехал из b1 в b2.
    expect(coverageBefore.domainStatuses.get('b1')).toBe('yellow');
    expect(coverageBefore.domainStatuses.get('b2')).toBe('neutral');
    expect(coverageAfter.domainStatuses.get('b1')).toBe('neutral');
    expect(coverageAfter.domainStatuses.get('b2')).toBe('yellow');
  });

  it('goalStatus: цель без связей и aggregateStatus для пустого списка', () => {
    const project = build({
      architecture: { blocks: [block('b')], edges: [] },
      security: { goals: [goal('gx')], functions: [] },
    });
    expect(goalStatus(project, 'gx')).toBe('red');
    expect(aggregateStatus([])).toBe('green');
  });
});

describe('goalDistribution — карточка ЦБ (v0.01.09)', () => {
  const security = {
    goals: [goal('g1'), goal('g2')],
    functions: [
      fn('fm1', [{ goal: 'g1', weight: 'mandatory' as const }], 3),
      fn('fo1', [{ goal: 'g1', weight: 'optional' as const }], 2),
      fn('fm2', [{ goal: 'g1', weight: 'mandatory' as const }], 4),
      fn('fx', [{ goal: 'g2', weight: 'mandatory' as const }]),
    ],
  };
  const architecture = { blocks: [block('b1'), block('b2')], edges: [] };

  it('обеспечивающие механизмы с весом и размещением; критичные домены — только mandatory', () => {
    const project = build({
      architecture,
      security,
      assignments: [
        { function: 'fm1', block: 'b1' },
        { function: 'fo1', block: 'b1' },
      ],
    });
    const dist = goalDistribution(project, 'g1');
    expect(dist.goalId).toBe('g1');
    // Статус распределения по таблице 3.4: одна из двух mandatory — жёлтый.
    expect(dist.status).toBe('yellow');
    expect(dist.functions.map((row) => row.id)).toEqual(['fm1', 'fo1', 'fm2']);
    expect(dist.functions[0]).toEqual({
      id: 'fm1',
      name: 'Функция fm1',
      cost: 3,
      weight: 'mandatory',
      blockId: 'b1',
    });
    // fo1 — optional: её домен не делает домен критичным для цели.
    expect(dist.functions[1].blockId).toBe('b1');
    expect(dist.functions[1].weight).toBe('optional');
    expect(dist.functions[2].blockId).toBeNull();
    // Критичный домен — b1 (обязательный fm1); без повторов.
    expect(dist.criticalDomains.map((row) => row.id)).toEqual(['b1']);
  });

  it('критичные домены без повторов и в порядке следования функций модели', () => {
    const project = build({
      architecture,
      security,
      assignments: [
        { function: 'fm1', block: 'b1' },
        { function: 'fm2', block: 'b2' },
      ],
    });
    const dist = goalDistribution(project, 'g1');
    expect(dist.status).toBe('green');
    expect(dist.criticalDomains.map((row) => row.id)).toEqual(['b1', 'b2']);
    expect(dist.criticalDomains[0].name).toBe('Блок b1');
    expect(dist.criticalDomains[1].name).toBe('Блок b2');
  });

  it('цель без функций: пустые списки, статус красный', () => {
    const project = build({
      architecture,
      security: { goals: [goal('g2')], functions: [] },
    });
    const dist = goalDistribution(project, 'g2');
    expect(dist.status).toBe('red');
    expect(dist.functions).toEqual([]);
    expect(dist.criticalDomains).toEqual([]);
  });

  it('функции цели не размещены: критичных доменов нет, статус красный', () => {
    const project = build({ architecture, security, assignments: [] });
    const dist = goalDistribution(project, 'g1');
    expect(dist.status).toBe('red');
    expect(dist.functions).toHaveLength(3);
    expect(dist.criticalDomains).toEqual([]);
  });
});
