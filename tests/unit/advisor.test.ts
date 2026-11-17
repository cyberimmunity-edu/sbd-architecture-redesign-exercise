/**
 * Тесты советчика — v0.03.01b. Советы обязаны быть детерминированными,
 * оценка экономии — точной (кандидат пересчитывается recalcCosts),
 * каталог — покрывать С1–С7 из обсуждения v0.01.08 плюс вариантный
 * перебор разбиений v0.03.01b.
 *
 * v0.03.01 (отзыв тестирования): совет ddbpcd-split больше не предлагается
 * интерфейсному домену, состоящему только из критичных функций (домен уже
 * минимальный); переносимым набором являются некритичные функции. Блок
 * «Экономика рекомендаций» проверяет на примерах репозитория (robot 486,
 * vessel 943), что deltaC каждого совета равна разности пересчётов текущей
 * и кандидатной моделей, а кандидаты корректны и не зацикливают каталог.
 *
 * v0.03.01b (сверка с независимой моделью анализатора): для каждого
 * доверенного домена перебираются варианты разбиения на две части
 * («валидатор + исполнитель» — trusted-split, «шлюз с функциями» —
 * gateway-split, вынос некритичных — С1/С2), каждому домену выдаётся
 * до трёх лучших по точной deltaC; честная модель примера пользователя
 * (лидар — интерфейсный ДБ без forceTrusted, C_блока 3) даёт C = 335.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adviceCandidate,
  computeAdvice,
  partitionCandidate,
  splitCandidate,
  splitVariants,
  MAX_VARIANTS_PER_DOMAIN,
  type Advice,
} from '../../src/engine/advisor';
import { recalcCosts } from '../../src/engine/cost';
import { computeTrust } from '../../src/engine/trust';
import { parseStateYaml } from '../../src/io/stateFile';
import type { Assignment, Block, Edge, Goal, Project, SecurityFunction } from '../../src/engine/types';

/** Сценарий 1: ДДБПЦД с критичной и некритичной функциями, недоверенная внешняя система. */
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
    { id: 'f-b', name: 'Обработка', cost: 7 },
  ];
  const assignments: Assignment[] = [
    { function: 'f-a', block: 'd-main' },
    { function: 'f-b', block: 'd-main' },
  ];
  return { architecture: { blocks, edges }, security: { goals, functions }, assignments, meta: {} };
}

/** Сценарий 2: ДДБПЦД из одних критичных функций — интерфейсный домен минимальный. */
function ddbpcdMinimalProject(): Project {
  const project = ddbpcdProject();
  const functions: SecurityFunction[] = project.security.functions.map((fn) => ({
    ...fn,
    implements: [{ goal: 't-main', weight: 'mandatory' }],
  }));
  return { ...project, security: { ...project.security, functions } };
}

function loadSample(name: string): Project {
  const text = readFileSync(new URL(`../../src/samples/${name}/state.yaml`, import.meta.url), 'utf8');
  const parsed = parseStateYaml(text);
  expect(parsed.errors).toEqual([]);
  return parsed.model!;
}

describe('Советчик — С1 вынос некритичных функций из ДДБПЦД (v0.03.01)', () => {
  it('предлагает вынос некритичных функций с точной экономией кандидата', () => {
    const project = ddbpcdProject();
    const advices = computeAdvice(project);
    const split = advices.find((advice) => advice.kind === 'ddbpcd-split');
    expect(split).toBeDefined();
    expect(split!.blocks).toEqual(['d-main']);
    expect(split!.functions).toEqual(['f-b']); // критичная f-a остаётся принимать поток
    // Кандидат: d-main (C_блока 3, f-a, E=3, M=1.5, K=10) = ceil(3×3×1.5×10) = 135;
    // d-main-split (C_блока 7, f-b, НДБ K=0.1) = ceil(7×7×0.1) = 5; d-sink = 1.
    // Было 1001 → стало 141, экономия 860.
    expect(split!.deltaC).toBe(860);
    expect(split!.params.moved).toBe(1);
  });

  it('интерфейсный домен из одних критичных функций уже минимальный — декомпозиция не предлагается', () => {
    // Отзыв тестирования v0.03.01: совет «декомпозировать» давался всегда,
    // даже когда состав домена минимален (только функции повышения целостности).
    const project = ddbpcdMinimalProject();
    const advices = computeAdvice(project);
    expect(advices.find((advice) => advice.kind === 'ddbpcd-split')).toBeUndefined();
    // Посредник по-прежнему предлагается — это другой совет (С3).
    expect(advices.find((advice) => advice.kind === 'filter-domain')).toBeDefined();
  });

  it('в минимум не попадает и домен из одной функции', () => {
    const project = ddbpcdMinimalProject();
    const alone: Project = {
      ...project,
      assignments: [{ function: 'f-a', block: 'd-main' }],
    };
    expect(computeAdvice(alone).find((advice) => advice.kind === 'ddbpcd-split')).toBeUndefined();
  });

  it('идентификаторы кандидата не конфликтуют с существующими (уникальные суффиксы)', () => {
    const project = ddbpcdProject();
    const occupied: Project = {
      ...project,
      architecture: {
        ...project.architecture,
        blocks: [
          ...project.architecture.blocks,
          { id: 'd-main-split', name: 'Занято', cost: 1 },
        ],
        edges: [...project.architecture.edges, { id: 'd-main-split-link', from: 'd-main', to: 'd-sink' }],
      },
    };
    const candidate = splitCandidate(occupied, 'd-main');
    expect(candidate).not.toBeNull();
    const ids = candidate!.project.architecture.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length); // дубликатов нет
    expect(candidate!.project.architecture.blocks.find((b) => b.id === 'd-main-split-2')).toBeDefined();
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
    // Посредник даёт 490, вынос некритичных — 860, шлюз с функциями — 905:
    // советы отсортированы по экономии — шлюз первый.
    expect(first[0].kind).toBe('gateway-split');
    expect(first[0].deltaC).toBe(905);
    expect(first[1].kind).toBe('ddbpcd-split');
    expect(first[1].deltaC).toBe(860);
    expect(first[2].kind).toBe('filter-domain');
  });
});

describe('Советчик — вариантный перебор разбиений (v0.03.01b)', () => {
  it('trusted-split: исполнитель выходит из-под красного входа в отдельный ДДБ', () => {
    const project = loadSample('robot');
    const { systemCost } = recalcCosts(project);
    expect(systemCost).toBe(486);
    // blk-plan: fn-sanitize + fn-geofence — оба варианта разбиения дают 140.
    const planVariants = splitVariants(project, 'blk-plan');
    expect(planVariants.map((v) => [v.kind, v.deltaC])).toEqual([
      ['trusted-split', 140],
      ['trusted-split', 140],
    ]);
    expect(planVariants[0].functions).toEqual(['fn-geofence']);
    expect(planVariants[1].functions).toEqual(['fn-sanitize']);
    // Кандидат: валидатор остаётся ДДБПЦД и принимает красную стрелку,
    // исполнитель — новый ДДБ с зелёным входом от валидатора.
    const candidate = partitionCandidate(project, 'blk-plan', ['fn-geofence'], 'downstream')!;
    const recalc = recalcCosts(candidate.project);
    expect(recalc.systemCost).toBe(346);
    expect(recalc.trust.internal.get('blk-plan')).toBe('ddbpcd');
    expect(recalc.trust.internal.get('blk-plan-exec')).toBe('ddb');
    // Красная стрелка осталась у валидатора; между частями — новый поток.
    const redEdge = candidate.project.architecture.edges.find((e) => e.id === 'e-perc-plan')!;
    expect(redEdge.to).toBe('blk-plan');
    expect(candidate.project.architecture.edges.some((e) => e.from === 'blk-plan' && e.to === 'blk-plan-exec')).toBe(true);
    // Кандидат совпадает с оценкой совета.
    const advice = computeAdvice(project).find(
      (a) => a.kind === 'trusted-split' && a.blocks[0] === 'blk-plan' && a.functions[0] === 'fn-geofence',
    )!;
    expect(advice.deltaC).toBe(systemCost - recalc.systemCost);
  });

  it('gateway-split: валидатор выносится в шлюз, красные стрелки перенаправляются', () => {
    const project = ddbpcdProject();
    const candidate = partitionCandidate(project, 'd-main', ['f-a'], 'gateway')!;
    expect(candidate.newId).toBe('d-main-gw');
    const recalc = recalcCosts(candidate.project);
    // Было 1001; стало: шлюз ДДБПЦД 90 (3×3×1×10) + исходная часть НДБ 5
    // (ceil(7×7×0.1)) + приёмник 1 → экономия 905.
    expect(recalc.systemCost).toBe(96);
    expect(recalc.trust.internal.get('d-main-gw')).toBe('ddbpcd');
    expect(recalc.trust.internal.get('d-main')).toBe('ndb');
    // Красная стрелка перенаправлена шлюзу; шлюз отдаёт зелёный поток.
    expect(candidate.project.architecture.edges.find((e) => e.id === 'e-in')!.to).toBe('d-main-gw');
    expect(candidate.project.architecture.edges.some((e) => e.from === 'd-main-gw' && e.to === 'd-main')).toBe(true);
    // Совет и кандидат — одна модель.
    const advice = computeAdvice(project).find((a) => a.kind === 'gateway-split')!;
    expect(advice.functions).toEqual(['f-a']);
    expect(advice.deltaC).toBe(905);
    expect(recalcCosts(adviceCandidate(project, advice)!.project).systemCost).toBe(96);
  });

  it('forceTrusted не наследуется вынесенной частью, но остаётся у исходной', () => {
    const blocks: Block[] = [
      { id: 'ext-src', name: 'Среда', cost: 0, external: true },
      { id: 'd-forced', name: 'Принудительно доверенный', cost: 10, forceTrusted: true },
    ];
    const edges: Edge[] = [{ id: 'e-in', from: 'ext-src', to: 'd-forced' }];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-1', name: 'Ф-1', cost: 3, implements: [{ goal: 't-main', weight: 'mandatory' }] },
      { id: 'f-2', name: 'Ф-2', cost: 2, implements: [{ goal: 't-main', weight: 'mandatory' }] },
    ];
    const project: Project = {
      architecture: { blocks, edges },
      security: { goals, functions },
      assignments: [
        { function: 'f-1', block: 'd-forced' },
        { function: 'f-2', block: 'd-forced' },
      ],
      meta: {},
    };
    const candidate = partitionCandidate(project, 'd-forced', ['f-2'], 'downstream')!;
    const original = candidate.project.architecture.blocks.find((b) => b.id === 'd-forced')!;
    const moved = candidate.project.architecture.blocks.find((b) => b.id === 'd-forced-exec')!;
    expect(original.forceTrusted).toBe(true);
    expect(moved.forceTrusted).toBeUndefined();
  });

  it('forceTrusted-домен без функций: разбиений нет, посредник — точная экономия', () => {
    // Уточнённая семантика (v0.03.01d): интерфейсный ДБ с forceTrusted
    // принудительно в ДВБ, но при красном входе он ДДБПЦД (K = 10), а не
    // «зелёный». Добавление ФБ в ДБ — достаточное, но не необходимое
    // условие ДВБ: forceTrusted-ДБ — «квази-ФБ» сам по себе, поэтому
    // советчик не предлагает ему разбиения (функций нет) и не требует
    // добавления ФБ, но вправе предложить дешёвого посредника (С3).
    const blocks: Block[] = [
      { id: 'ndb-src', name: 'Источник', cost: 1 },
      { id: 'iface', name: 'Интерфейсный ДБ', cost: 10, forceTrusted: true },
    ];
    const edges: Edge[] = [{ id: 'e-red', from: 'ndb-src', to: 'iface' }];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-1', name: 'Ф-1', cost: 2, implements: [{ goal: 't-main', weight: 'mandatory' }] },
    ];
    const project: Project = {
      architecture: { blocks, edges },
      security: { goals, functions },
      // Источник без размещённых критичных функций — НДБ, поток красный.
      assignments: [],
      meta: {},
    };
    // Инвариант: интерфейсный ДБ forceTrusted при красном входе — ДДБПЦД.
    expect(computeTrust(project).internal.get('iface')).toBe('ddbpcd');
    // Разбиение неприменимо: в домене нет функций («квази-ФБ» сам по себе).
    expect(splitVariants(project, 'iface')).toEqual([]);
    expect(computeAdvice(project).find((a) => a.kind === 'ddbpcd-split')).toBeUndefined();
    expect(computeAdvice(project).find((a) => a.kind === 'ddb-regroup')).toBeUndefined();
    // Посредник (С3): iface-filter (forceTrusted, C_блока 1) принимает красный
    // поток; iface получает только зелёный вход и возвращается в ДДБ.
    // Было: iface = ceil(10 × 10) = 100, src = ceil(1 × 0.1) = 1 → C = 101.
    // Стало: фильтр = ceil(1 × 10) = 10, iface = ceil(10 × 5) = 50,
    // src = ceil(1 × 0.1) = 1 → C = 61; экономия 40.
    const filter = computeAdvice(project).find((a) => a.kind === 'filter-domain')!;
    expect(filter).toBeDefined();
    expect(filter.blocks).toEqual(['iface']);
    expect(filter.deltaC).toBe(40);
    expect(filter.params.mediatorForceTrusted).toBe(1);
    expect(filter.params.redIncoming).toBe(1);
    // Кандидат воспроизводится adviceCandidate и пересчёт подтверждает deltaC.
    const candidate = adviceCandidate(project, filter)!;
    expect(recalcCosts(candidate.project).systemCost).toBe(61);
    // Инвариант и в кандидатной модели: iface не «зелёный» при красном входе.
    expect(computeTrust(candidate.project).internal.get('iface')).toBe('ddb');
    expect(computeTrust(candidate.project).internal.get('iface-filter')).toBe('ddbpcd');
  });

  it('на домен выдаётся не более трёх лучших вариантов, наборы не повторяются', () => {
    const blocks: Block[] = [
      { id: 'ext-src', name: 'Среда', cost: 0, external: true },
      { id: 'd-big', name: 'Большой домен', cost: 10 },
    ];
    const edges: Edge[] = [{ id: 'e-in', from: 'ext-src', to: 'd-big' }];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = [
      { id: 'f-1', name: 'Ф-1', cost: 3, implements: [{ goal: 't-main', weight: 'mandatory' }] },
      { id: 'f-2', name: 'Ф-2', cost: 5, implements: [{ goal: 't-main', weight: 'mandatory' }] },
      { id: 'f-3', name: 'Ф-3', cost: 7, implements: [{ goal: 't-main', weight: 'mandatory' }] },
      { id: 'f-4', name: 'Ф-4', cost: 2 },
    ];
    const project: Project = {
      architecture: { blocks, edges },
      security: { goals, functions },
      assignments: functions.map((fn) => ({ function: fn.id, block: 'd-big' })),
      meta: {},
    };
    // 4 функции → 14 непустых собственных подмножеств; выдача — не более 3.
    const variants = splitVariants(project, 'd-big');
    expect(variants.length).toBeLessThanOrEqual(MAX_VARIANTS_PER_DOMAIN);
    expect(variants.length).toBe(MAX_VARIANTS_PER_DOMAIN);
    const keys = variants.map((v) => v.functions.join(','));
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < variants.length; i += 1) {
      expect(variants[i - 1].deltaC!).toBeGreaterThanOrEqual(variants[i].deltaC!);
    }
    // Советы-разбиения домена согласованы с общим списком советов
    // (в проекте также есть посредник и структурные советы).
    const splitKinds = new Set(['ddbpcd-split', 'ddb-regroup', 'trusted-split', 'gateway-split']);
    const fromProject = computeAdvice(project).filter(
      (a) => a.blocks[0] === 'd-big' && splitKinds.has(a.kind),
    );
    expect(fromProject).toEqual(variants);
  });

  it('домены с числом функций выше порога перебора используют эвристическое семейство', () => {
    const blocks: Block[] = [
      { id: 'ext-src', name: 'Среда', cost: 0, external: true },
      { id: 'd-huge', name: 'Большой домен', cost: 10 },
    ];
    const edges: Edge[] = [{ id: 'e-in', from: 'ext-src', to: 'd-huge' }];
    const goals: Goal[] = [{ id: 't-main', name: 'Цель' }];
    const functions: SecurityFunction[] = Array.from({ length: 12 }, (_, i) => ({
      id: `f-${String(i + 1).padStart(2, '0')}`,
      name: `Ф-${i + 1}`,
      cost: i + 1,
      implements: i % 2 === 0 ? [{ goal: 't-main', weight: 'mandatory' }] : [],
    }));
    const project: Project = {
      architecture: { blocks, edges },
      security: { goals, functions },
      assignments: functions.map((fn) => ({ function: fn.id, block: 'd-huge' })),
      meta: {},
    };
    const first = splitVariants(project, 'd-huge');
    const second = splitVariants(project, 'd-huge');
    expect(first).toEqual(second); // детерминизм
    expect(first.length).toBeLessThanOrEqual(MAX_VARIANTS_PER_DOMAIN);
    for (const variant of first) {
      const candidate = adviceCandidate(project, variant)!;
      expect(candidate).not.toBeNull();
      expect(recalcCosts(candidate.project).systemCost).toBeLessThan(recalcCosts(project).systemCost);
    }
  });

  it('перебор не предлагается доменам из одной функции и внешним системам', () => {
    const project = loadSample('robot');
    expect(splitVariants(project, 'blk-perc')).toEqual([]); // НДБ без функций
    expect(splitVariants(project, 'ext-ctrl')).toEqual([]); // внешняя система
    const single: Project = {
      ...ddbpcdMinimalProject(),
      assignments: [{ function: 'f-a', block: 'd-main' }],
    };
    expect(splitVariants(single, 'd-main')).toEqual([]);
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
    // Кандидат по построению совпадает с оценкой совета.
    const candidate = adviceCandidate(project, regroup!)!;
    expect(recalcCosts(candidate.project).systemCost).toBe(129);
    // Вынесенные функции не наследуют forceTrusted — новый домен НДБ.
    expect(candidate.project.architecture.blocks.find((b) => b.id === 'd-core-ndb')!.forceTrusted).toBeUndefined();
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

describe('Советчик — согласованность с recalcCosts (v0.03.01)', () => {
  it('экономия совета равна разности пересчётов текущей и кандидатной моделей', () => {
    const project = ddbpcdProject();
    const { systemCost } = recalcCosts(project);
    const split = computeAdvice(project).find((advice) => advice.kind === 'ddbpcd-split')!;
    expect(systemCost).toBe(1001);
    // Кандидат строится тем же кодом, что и оценка совета (adviceCandidate).
    const candidate = adviceCandidate(project, split)!;
    const candidateCost = recalcCosts(candidate.project).systemCost;
    expect(split.deltaC).toBe(systemCost - candidateCost);
    expect(candidateCost).toBe(141);
    // Перенесённые функции находятся в новом домене-кандидате.
    expect(candidate.project.assignments.find((a) => a.function === 'f-b')!.block).toBe('d-main-split');
    // Новый домен недоверенный: некритичная функция не вводит в ДВБ.
    expect(computeTrust(candidate.project).internal.get('d-main-split')).toBe('ndb');
  });
});

describe('Экономика рекомендаций на примерах репозитория (v0.03.01)', () => {
  const samples = ['robot', 'vessel'] as const;
  const controls: Record<string, number> = { robot: 486, vessel: 943 };

  for (const sample of samples) {
    const project = loadSample(sample);
    const { systemCost, trust } = recalcCosts(project);
    const advices = computeAdvice(project);

    it(`${sample}: контрольное число примера не изменилось (C_системы = ${controls[sample]})`, () => {
      expect(systemCost).toBe(controls[sample]);
    });

    it(`${sample}: deltaC каждого совета равна разности пересчётов кандидата`, () => {
      const withSaving = advices.filter((advice) => advice.deltaC !== null && advice.deltaC > 0);
      expect(withSaving.length).toBeGreaterThan(0);
      for (const advice of withSaving) {
        const candidate = adviceCandidate(project, advice);
        expect(candidate, `кандидат для ${advice.kind}`).not.toBeNull();
        const candidateCost = recalcCosts(candidate!.project).systemCost;
        expect(systemCost - candidateCost).toBe(advice.deltaC);
        // Экономика советов: кандидат дешевле текущей модели.
        expect(candidateCost).toBeLessThan(systemCost);
      }
    });

    it(`${sample}: переносимым набором ddbpcd-split являются некритичные функции`, () => {
      const byFnId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
      for (const block of project.architecture.blocks) {
        if (block.external) continue;
        if (trust.internal.get(block.id) !== 'ddbpcd') continue;
        const placed = project.assignments
          .filter((a) => a.block === block.id)
          .map((a) => byFnId.get(a.function)!)
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id));
        const nonCritical = placed.filter((fn) => (fn.implements ?? []).length === 0);
        const advice = advices.find((a) => a.kind === 'ddbpcd-split' && a.blocks[0] === block.id);
        if (nonCritical.length === 0 || placed.length < 2) {
          // Интерфейсный домен уже минимальный — декомпозиция не предлагается.
          expect(advice, `${block.id}: некритичных нет — совета быть не должно`).toBeUndefined();
        } else {
          expect(advice, `${block.id}: должен быть совет выноса некритичных`).toBeDefined();
          expect(advice!.functions).toEqual(nonCritical.map((fn) => fn.id));
        }
      }
    });

    it(`${sample}: повторное применение кандидата ddbpcd-split не порождает новый совет для того же домена`, () => {
      for (const advice of advices.filter((a) => a.kind === 'ddbpcd-split')) {
        const candidate = adviceCandidate(project, advice)!;
        const again = computeAdvice(candidate.project).filter(
          (a) => a.kind === 'ddbpcd-split' && a.blocks[0] === advice.blocks[0],
        );
        expect(again, `повторный совет для ${advice.blocks[0]}`).toHaveLength(0);
      }
    });

    it(`${sample}: список советов детерминирован`, () => {
      expect(computeAdvice(project)).toEqual(advices);
    });
  }

  it('robot: интерфейсные домены (blk-plan, blk-link) не получают совет декомпозиции', () => {
    const project = loadSample('robot');
    const targets = computeAdvice(project)
      .filter((advice) => advice.kind === 'ddbpcd-split')
      .map((advice) => advice.blocks[0]);
    expect(targets).not.toContain('blk-plan');
    expect(targets).not.toContain('blk-link');
  });
});

describe('Честная модель примера пользователя (v0.03.01b, сверка с анализатором)', () => {
  /**
   * Фикстура tests/fixtures/vessel-user-state.yaml — модель «Безэкипажное
   * судно-доставщик». В v0.03.01b лидар (интерфейсный ДБ) моделируется
   * честно: forceTrusted снят, C_блока повышен 2 → 3. Модель совпадает
   * с базой независимого отчёта анализатора: C_системы = 335.
   */
  function loadUserFixture(): Project {
    const text = readFileSync(
      new URL('../fixtures/vessel-user-state.yaml', import.meta.url),
      'utf8',
    );
    const parsed = parseStateYaml(text);
    expect(parsed.errors).toEqual([]);
    return parsed.model!;
  }

  it('лидар — интерфейсный ДБ без forceTrusted: C_системы = 335, как в отчёте анализатора', () => {
    const project = loadUserFixture();
    const lidar = project.architecture.blocks.find((b) => b.id === 'blk-lidar')!;
    expect(lidar.forceTrusted).toBeUndefined();
    expect(lidar.cost).toBe(3);
    const { systemCost, costs, trust } = recalcCosts(project);
    expect(systemCost).toBe(335);
    expect(trust.internal.get('blk-lidar')).toBe('ndb'); // НДБ: ceil(3×1×0.1) = 1
    expect(costs.get('blk-lidar')!.domainCost).toBe(1);
    // dom-4 «Аварийный уход от столкновения» вернулся в ДДБПЦД (K = 10):
    // единственный красный вход — от недоверенного лидара.
    expect(trust.internal.get('dom-4')).toBe('ddbpcd');
    expect(costs.get('dom-4')!.domainCost).toBe(105);
  });

  it('советчик воспроизводит «бонус» отчёта: посредник перед dom-4 даёт −42', () => {
    const project = loadUserFixture();
    const advices = computeAdvice(project);
    // Шлюз dom-4-gw из отчёта анализатора: −42 у.е., домен понижается до ДДБ.
    const filter = advices.find((a) => a.kind === 'filter-domain' && a.blocks[0] === 'dom-4')!;
    expect(filter).toBeDefined();
    expect(filter.deltaC).toBe(42);
    expect(filter.params.mediatorCost).toBe(1);
    expect(filter.params.mediatorForceTrusted).toBe(1);
    const candidate = adviceCandidate(project, filter)!;
    const recalc = recalcCosts(candidate.project);
    expect(recalc.trust.internal.get('dom-4')).toBe('ddb');
    expect(recalc.trust.internal.get('dom-4-filter')).toBe('ddbpcd');
    // Вариантный перебор для dom-4 и dom-6: варианты «валидатор + исполнитель».
    const splits = advices.filter(
      (a) => (a.blocks[0] === 'dom-4' || a.blocks[0] === 'dom-6') && a.kind === 'trusted-split',
    );
    expect(splits.length).toBeGreaterThan(0);
    for (const advice of splits) {
      const splitCandidate = adviceCandidate(project, advice)!;
      expect(recalcCosts(splitCandidate.project).systemCost).toBe(335 - advice.deltaC!);
    }
  });
});
