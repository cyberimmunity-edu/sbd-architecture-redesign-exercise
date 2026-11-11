/**
 * Тесты модели доверия — кейсы T-T-01…T-T-10 раздела 11.2 ТЗ v0.01.01
 * (алгоритм раскраски доменов и стрелок, разделы 3.5 и 5.3).
 */

import { describe, expect, it } from 'vitest';
import {
  computeTrust,
  frameBounds,
  isInsideFrame,
  snapExternalsOutside,
  trustedBlockIds,
  TRUST_COST_COEFFICIENT,
} from '@/engine/trust';
import { recalcCosts } from '@/engine/cost';
import { recalcCoverage } from '@/engine/coverage';
import { emptyProject, type Block, type Project } from '@/engine/types';

function block(id: string, overrides: Partial<Block> = {}): Block {
  return { id, name: `Домен ${id}`, cost: 1, ...overrides };
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

/** Стандартная связка: функция с обязательной связью с целью. */
const linkedFn = (id: string) => ({
  id,
  name: `Функция ${id}`,
  cost: 1,
  implements: [{ goal: 'g1', weight: 'mandatory' as const }],
});
const freeFn = (id: string) => ({ id, name: `Функция ${id}`, cost: 1 });

describe('Модель доверия (раздел 3.5 v0.01.01)', () => {
  it('T-T-01: стартовая архитектура — все домены НДБ, все стрелки красные', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('b')],
        edges: [{ id: 'e-1', from: 'a', to: 'b' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
    });
    const trust = computeTrust(project);
    expect(trust.internal.get('a')).toBe('ndb');
    expect(trust.internal.get('b')).toBe('ndb');
    expect(trust.edges.get('e-1')).toBe('red');
  });

  it('T-T-02: критичная функция вводит домен в ДВБ; функция без связей — нет', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('b')],
        edges: [],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1'), freeFn('f2')],
      },
      assignments: [
        { function: 'f2', block: 'a' }, // без связей — домен остаётся НДБ
        { function: 'f1', block: 'b' }, // критичная — ДВБ
      ],
    });
    const trust = computeTrust(project);
    expect(trustedBlockIds(project)).toEqual(new Set(['b']));
    expect(trust.internal.get('a')).toBe('ndb');
    expect(trust.internal.get('b')).toBe('ddb'); // нет входящих стрелок — зелёный
  });

  it('T-T-03: исходящие из доверенного домена стрелки — зелёные (высокоцелостные)', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('b'), block('c')],
        edges: [
          { id: 'e-ab', from: 'a', to: 'b' },
          { id: 'e-ac', from: 'a', to: 'c' },
        ],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
      assignments: [{ function: 'f1', block: 'a' }],
    });
    const trust = computeTrust(project);
    expect(trust.edges.get('e-ab')).toBe('green');
    expect(trust.edges.get('e-ac')).toBe('green');
  });

  it('T-T-04: доверенный домен с входящей красной стрелкой — ДДБПЦД (жёлтый)', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('b')],
        edges: [{ id: 'e-ab', from: 'a', to: 'b' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
      assignments: [{ function: 'f1', block: 'b' }],
    });
    const trust = computeTrust(project);
    // a — НДБ, его стрелка красная; b доверенный с красным входом — ДДБПЦД.
    expect(trust.internal.get('a')).toBe('ndb');
    expect(trust.internal.get('b')).toBe('ddbpcd');
  });

  it('T-T-05: доверенный домен только с зелёными входами — ДДБ (зелёный)', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('b')],
        edges: [{ id: 'e-ab', from: 'a', to: 'b' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1'), linkedFn('f2')],
      },
      assignments: [
        { function: 'f1', block: 'a' }, // a доверенный → e-ab зелёная
        { function: 'f2', block: 'b' }, // b доверенный, вход зелёный → ДДБ
      ],
    });
    const trust = computeTrust(project);
    expect(trust.internal.get('a')).toBe('ddb');
    expect(trust.internal.get('b')).toBe('ddb');
    expect(trust.edges.get('e-ab')).toBe('green');
  });

  it('T-T-06: недоверенная внешняя система — красная, её потоки красные (по умолчанию)', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('ext-1', { external: true })],
        edges: [{ id: 'e-x', from: 'ext-1', to: 'a' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
      assignments: [{ function: 'f1', block: 'a' }],
    });
    const trust = computeTrust(project);
    expect(trust.external.get('ext-1')).toBe('red');
    // a доверенный, но вход от недоверенной внешней красный → ДДБПЦД.
    expect(trust.internal.get('a')).toBe('ddbpcd');
    expect(trust.edges.get('e-x')).toBe('red');
  });

  it('T-T-07: доверенная внешняя система — зелёная, её потоки зелёные', () => {
    const project = build({
      architecture: {
        blocks: [block('a'), block('ext-1', { external: true, trusted: true })],
        edges: [{ id: 'e-x', from: 'ext-1', to: 'a' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
      assignments: [{ function: 'f1', block: 'a' }],
    });
    const trust = computeTrust(project);
    expect(trust.external.get('ext-1')).toBe('green');
    expect(trust.edges.get('e-x')).toBe('green');
    // Все входы a зелёные → ДДБ.
    expect(trust.internal.get('a')).toBe('ddb');
  });

  it('T-T-08: коэффициенты доверия применимы к классам (3.3 v0.01.01)', () => {
    // НДБ дешевле, ДДБПЦД дороже ДДБ: 0.1 < 5 < 10.
    expect(TRUST_COST_COEFFICIENT.ndb).toBeLessThan(TRUST_COST_COEFFICIENT.ddb);
    expect(TRUST_COST_COEFFICIENT.ddb).toBeLessThan(TRUST_COST_COEFFICIENT.ddbpcd);
  });

  it('T-T-09: рамка периметра охватывает только внутренние домены', () => {
    const project = build({
      architecture: {
        blocks: [
          block('a', { position: { x: 100, y: 100 } }),
          block('b', { position: { x: 500, y: 300 } }),
          block('ext-1', { external: true, position: { x: 2000, y: 0 } }),
        ],
        edges: [],
      },
    });
    const frame = frameBounds(project.architecture);
    expect(frame).not.toBeNull();
    if (!frame) return;
    // Рамка строится по a и b; внешняя система на неё не влияет.
    expect(frame.x).toBeLessThanOrEqual(100);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(500);
    expect(frame.x + frame.width).toBeLessThan(2000);
    expect(isInsideFrame({ x: 2000, y: 0 }, frame)).toBe(false);
    expect(isInsideFrame({ x: 200, y: 150 }, frame)).toBe(true);
  });

  it('T-T-10: внешние системы с позиции внутри рамки выносятся за периметр', () => {
    const project = build({
      architecture: {
        blocks: [
          block('a', { position: { x: 100, y: 100 } }),
          block('b', { position: { x: 500, y: 100 } }),
          block('ext-1', { external: true, position: { x: 300, y: 150 } }),
        ],
        edges: [],
      },
    });
    const snapped = { ...project, architecture: snapExternalsOutside(project.architecture) };
    const moved = snapped.architecture.blocks.find((b) => b.id === 'ext-1');
    const frame = frameBounds(project.architecture);
    expect(frame).not.toBeNull();
    expect(moved!.position!.x).toBeGreaterThanOrEqual(frame!.x + frame!.width);
    // Внутренние домены не изменились.
    expect(snapped.architecture.blocks.find((b) => b.id === 'a')!.position).toEqual({ x: 100, y: 100 });
  });
});

describe('Принудительный ввод в ДВБ — forceTrusted (v0.01.06)', () => {
  it('Домен без критичной функции с forceTrusted — ДДБ; его исходящие потоки зелёные', () => {
    const project = build({
      architecture: {
        blocks: [block('a', { forceTrusted: true }), block('b')],
        edges: [{ id: 'e-ab', from: 'a', to: 'b' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
    });
    const trust = computeTrust(project);
    expect(trust.internal.get('a')).toBe('ddb');
    expect(trust.internal.get('b')).toBe('ndb');
    expect(trust.edges.get('e-ab')).toBe('green');
    expect(trustedBlockIds(project)).toContain('a');
  });

  it('Принудительно доверенный домен с входящей красной стрелкой — ДДБПЦД', () => {
    const project = build({
      architecture: {
        blocks: [block('a', { forceTrusted: true }), block('b')],
        edges: [{ id: 'e-ba', from: 'b', to: 'a' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
    });
    const trust = computeTrust(project);
    expect(trust.internal.get('a')).toBe('ddbpcd');
  });

  it('forceTrusted у внешней системы игнорируется — доверенность только по trusted', () => {
    const project = build({
      architecture: {
        blocks: [block('ext-1', { external: true, forceTrusted: true })],
        edges: [],
      },
    });
    const trust = computeTrust(project);
    expect(trust.external.get('ext-1')).toBe('red');
    expect(trustedBlockIds(project)).not.toContain('ext-1');
  });

  it('Стоимость принудительно доверенного домена — C_блока × 5 (K ДДБ), цели не меняются', () => {
    const project = build({
      architecture: { blocks: [block('a', { cost: 4, forceTrusted: true })], edges: [] },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
    });
    const { costs } = recalcCosts(project);
    expect(costs.get('a')!.trustCoefficient).toBe(5);
    expect(costs.get('a')!.domainCost).toBe(20); // ceil(4 × 1 × 5)
    // forceTrusted не добавляет функций: покрытие целей не меняется.
    const { goalStatuses } = recalcCoverage(project);
    expect(goalStatuses.get('g1')).toBe('red');
  });

  it('forceTrusted не влияет на домен с критичной функцией — доверенность и так выведена', () => {
    const project = build({
      architecture: { blocks: [block('a', { forceTrusted: true })], edges: [] },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [linkedFn('f1')],
      },
      assignments: [{ function: 'f1', block: 'a' }],
    });
    const trust = computeTrust(project);
    expect(trust.internal.get('a')).toBe('ddb');
    expect(trustedBlockIds(project)).toEqual(new Set(['a']));
  });
});
