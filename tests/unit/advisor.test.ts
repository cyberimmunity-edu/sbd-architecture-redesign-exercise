/**
 * Тесты советчика — v0.01.08. Советы обязаны быть детерминированными,
 * оценка экономии — точной (кандидат пересчитывается recalcCosts),
 * каталог — покрывать С1–С7 из обсуждения v0.01.08.
 */

import { describe, expect, it } from 'vitest';
import { computeAdvice, type Advice } from '../../src/engine/advisor';
import { recalcCosts } from '../../src/engine/cost';
import type { Assignment, Block, Edge, Goal, Project, SecurityFunction } from '../../src/engine/types';

/** Сценарий 1: ДДБПЦД с двумя функциями и недоверенной внешней системой. */
function ddbpcdProject(): Project {
  const blocks: Block[] = [
    { id: 'ext-sensor', name: 'Внешний датчик', cost: 0, external: true, position: { x: 0, y: 0 } },
    { id: 'd-main', name: 'Основной домен', cost: 10, position: { x: 400, y: 0 } },
    { id: 'd-sink', name: 'Приёмник', cost: 1, position: { x: 800, y: 0 } },
  ];
  const edges: Edge[] = [
    { id: 'e-in', from: 'ext-sensor', to: 'd-main' },
    { id: 'e-out', from: 'd-main', to: 'd-sink' },
  ];
  const goals: Goal[] = [{ id: 't-main', name: 'Достоверные данные' }];
  const functions: SecurityFunction[] = [
    { id: 'f-a', name: 'Фильтрация', cost: 3, implements: [{ goal: 't-main', weight: 'mandatory' }] },
    { id: 'f-b', name: 'Обработка', cost: 7, implements: [{ goal: 't-main', weight: 'mandatory' }] },
  ];
  const assignments: Assignment[] = [
    { function: 'f-a', block: 'd-main' },
    { function: 'f-b', block: 'd-main' },
  ];
  return { architecture: { blocks, edges }, security: { goals, functions }, assignments, meta: {} };
}

describe('Советчик — С1 декомпозиция ДДБПЦД (v0.01.08)', () => {
  it('предлагает декомпозицию с точной экономией кандидата', () => {
    const project = ddbpcdProject();
    const advices = computeAdvice(project);
    const split = advices.find((advice) => advice.kind === 'ddbpcd-split');
    expect(split).toBeDefined();
    expect(split!.blocks).toEqual(['d-main']);
    expect(split!.functions).toEqual(['f-b']); // f-a остаётся принимать поток
    // Экономия: было 1001 (1000 + 1); стало 135 (ceil(3×3×1.5×10)) +
    // 245 (7×7×1×5) + 1 → 1001 − 381 = 620 (C_блока делится между частями).
    expect(split!.deltaC).toBe(620);
  });

  it('предлагает дешёвого посредника для низкоцелостного входа (С3)', () => {
    const advices = computeAdvice(ddbpcdProject());
    const filter = advices.find((advice) => advice.kind === 'filter-domain');
    expect(filter).toBeDefined();
    expect(filter!.params.redIncoming).toBe(1);
    // Было 1001; стало 500 (10×10×1×5) + 10 (1×1×1×10) + 1 → 490.
    expect(filter!.deltaC).toBe(490);
  });

  it('домен-лидер стоимости подсвечен навигационным советом (С7)', () => {
    const advices = computeAdvice(ddbpcdProject());
    const leader = advices.find((advice) => advice.kind === 'cost-leader');
    expect(leader).toBeDefined();
    expect(leader!.blocks).toEqual(['d-main']);
    expect(leader!.params.percent).toBe(100);
  });

  it('советы отсортированы по экономии по убыванию, детерминированы', () => {
    const first = computeAdvice(ddbpcdProject());
    const second = computeAdvice(ddbpcdProject());
    expect(first).toEqual(second);
    const savings = first
      .map((advice) => advice.deltaC ?? -1)
      .filter((value) => value >= 0);
    for (let i = 1; i < savings.length; i += 1) {
      expect(savings[i - 1]).toBeGreaterThanOrEqual(savings[i]);
    }
    // Посредник даёт 490, декомпозиция — 620: декомпозиция выгоднее — она первая.
    expect(first[0].kind).toBe('ddbpcd-split');
    expect(first[1].kind).toBe('filter-domain');
  });
});

describe('Советчик — С2 некритичные функции в ДДБ (v0.01.08)', () => {
  it('вынос некритичных функций даёт экономию K: 5 → 0.1', () => {
    const blocks: Block[] = [
      { id: 'd-core', name: 'Ядро', cost: 10 },
      { id: 'd-sink', name: 'Приёмник', cost: 1 },
    ];
    const edges: Edge[] = [{ id: 'e-out', from: 'd-core', to: 'd-sink' }];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-crit', name: 'Критичная', cost: 5, implements: [{ goal: 't-main', weight: 'mandatory' }] },
      { id: 'f-extra', name: 'Лишняя', cost: 5 },
    ];
    const assignments: Assignment[] = [
      { function: 'f-crit', block: 'd-core' },
      { function: 'f-extra', block: 'd-core' },
    ];
    const project: Project = {
      architecture: { blocks, edges },
      security: { goals, functions },
      assignments,
      meta: {},
    };
    const advices = computeAdvice(project);
    const regroup = advices.find((advice) => advice.kind === 'ddb-regroup');
    expect(regroup).toBeDefined();
    expect(regroup!.functions).toEqual(['f-extra']);
    // Было 500 (10×10×1×5) + 1; стало 125 (5×5×1×5) + 3 (ceil(5×5×0.1)) + 1
    // → 501 − 129 = 372.
    expect(regroup!.deltaC).toBe(372);
  });
});

describe('Советчик — С4–С6 структурные советы (v0.01.08)', () => {
  it('пустой домен, изолированный домен и несвязанная функция', () => {
    const blocks: Block[] = [
      { id: 'd-empty', name: 'Пустой', cost: 2 },
      { id: 'd-island', name: 'Остров', cost: 3 },
    ];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-lonely', name: 'Одинокая', cost: 1 },
    ];
    const assignments: Assignment[] = [{ function: 'f-lonely', block: 'd-island' }];
    const project: Project = {
      architecture: { blocks, edges: [] },
      security: { goals, functions },
      assignments,
      meta: {},
    };
    const advices = computeAdvice(project);
    const kinds = advices.map((advice) => advice.kind);
    expect(kinds).toContain('empty-domain');
    expect(kinds).toContain('isolated-domain');
    expect(kinds).toContain('unlinked-function');
    const empty = advices.find((advice) => advice.kind === 'empty-domain');
    expect(empty!.blocks).toEqual(['d-empty']);
    const isolated = advices.find((advice) => advice.kind === 'isolated-domain');
    expect(isolated!.blocks).toEqual(['d-island']);
  });

  it('непокрытая цель — совет с адресатами её доменов (С6)', () => {
    const blocks: Block[] = [
      { id: 'd-host', name: 'Хост', cost: 5 },
    ];
    const goals: Goal[] = [
      { id: 't-quiet', name: 'Цель' },
      { id: 't-soft', name: 'Мягкая цель' },
    ];
    const functions: SecurityFunction[] = [
      { id: 'f-placed', name: 'Размещённая', cost: 2, implements: [{ goal: 't-soft', weight: 'mandatory' }] },
      { id: 'f-second', name: 'Вторая для жёлтой', cost: 3, implements: [{ goal: 't-soft', weight: 'mandatory' }] },
      { id: 'f-pool', name: 'В пуле', cost: 4, implements: [{ goal: 't-quiet', weight: 'mandatory' }] },
    ];
    const assignments: Assignment[] = [{ function: 'f-placed', block: 'd-host' }];
    const project: Project = {
      architecture: { blocks, edges: [] },
      security: { goals, functions },
      assignments,
      meta: {},
    };
    const advices = computeAdvice(project);
    const red = advices.find((advice) => advice.kind === 'goal-coverage' && advice.severity === 'red');
    const yellow = advices.find((advice) => advice.kind === 'goal-coverage' && advice.severity === 'yellow');
    expect(red).toBeDefined();
    expect(red!.goals).toEqual(['t-quiet']);
    expect(red!.functions).toEqual(['f-pool']);
    expect(yellow).toBeDefined();
    expect(yellow!.goals).toEqual(['t-soft']);
    expect(yellow!.functions).toEqual(['f-second']);
    expect(yellow!.blocks).toEqual(['d-host']);
  });

  it('чистая модель без проблем не даёт структурных советов', () => {
    const blocks: Block[] = [
      { id: 'd-a', name: 'А', cost: 2 },
      { id: 'd-b', name: 'Б', cost: 2 },
    ];
    const edges: Edge[] = [{ id: 'e1', from: 'd-a', to: 'd-b' }];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-1', name: 'Ф', cost: 1, implements: [{ goal: 't-main', weight: 'mandatory' }] },
    ];
    const assignments: Assignment[] = [{ function: 'f-1', block: 'd-a' }];
    const project: Project = {
      architecture: { blocks, edges },
      security: { goals, functions },
      assignments,
      meta: {},
    };
    const advices: Advice[] = computeAdvice(project);
    // Структурных проблем нет: пустых/изолированных доменов, несвязанных
    // функций, непокрытых целей. Единственный совет — навигационный
    // cost-leader: домен с функцией даёт наибольшую долю C_системы.
    expect(advices.map((advice) => advice.kind)).toEqual(['cost-leader']);
  });
});

describe('Советчик — согласованность с recalcCosts (v0.01.08)', () => {
  it('экономия совета равна разности пересчётов текущей и кандидатной моделей', () => {
    const project = ddbpcdProject();
    const { systemCost } = recalcCosts(project);
    const split = computeAdvice(project).find((advice) => advice.kind === 'ddbpcd-split')!;
    expect(systemCost).toBe(1001);
    // Кандидат воспроизводится тестом независимо: d-main без f-b, блок
    // d-main-split с f-b и C_блока 7, связь между частями.
    const candidate = recalcCosts({
      architecture: {
        blocks: [
          { id: 'ext-sensor', name: 'Внешний датчик', cost: 0, external: true },
          { id: 'd-main', name: 'Основной домен', cost: 3 },
          { id: 'd-main-split', name: 'Основной домен', cost: 7 },
          { id: 'd-sink', name: 'Приёмник', cost: 1 },
        ],
        edges: [
          { id: 'e-in', from: 'ext-sensor', to: 'd-main' },
          { id: 'e-out', from: 'd-main', to: 'd-sink' },
          { id: 'e-link', from: 'd-main', to: 'd-main-split' },
        ],
      },
      security: project.security,
      assignments: [
        { function: 'f-a', block: 'd-main' },
        { function: 'f-b', block: 'd-main-split' },
      ],
      meta: {},
    });
    expect(split.deltaC).toBe(systemCost - candidate.systemCost);
    expect(candidate.systemCost).toBe(381);
  });
});
