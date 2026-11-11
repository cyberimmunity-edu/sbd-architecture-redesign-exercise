/**
 * Тесты автоматических размеров доменов — v0.01.08. Фактор растёт
 * монотонно по стоимости, внешние системы остаются базовыми,
 * режимы cost и block берут разные значения.
 */

import { describe, expect, it } from 'vitest';
import { domainSizeFactors, sizeForFactor, SIZE_BASE_HEIGHT, SIZE_BASE_WIDTH, SIZE_MAX_FACTOR } from '../../src/engine/sizing';
import { recalcCosts } from '../../src/engine/cost';
import type { Project } from '../../src/engine/types';

function projectWithCosts(): Project {
  return {
    architecture: {
      blocks: [
        { id: 'd-small', name: 'Малый', cost: 10 },
        { id: 'd-big', name: 'Большой', cost: 10 },
        { id: 'ext-x', name: 'Внешняя', cost: 0, external: true },
      ],
      edges: [],
    },
    security: { goals: [], functions: [] },
    assignments: [],
    meta: {},
  };
}

describe('Автоматические размеры доменов (v0.01.08)', () => {
  it('режим off — все факторы базовые', () => {
    const project = projectWithCosts();
    const { costs } = recalcCosts(project);
    const factors = domainSizeFactors(project, costs, 'off');
    expect(factors.get('d-small')).toBe(1);
    expect(factors.get('d-big')).toBe(1);
    expect(factors.get('ext-x')).toBe(1);
  });

  it('режим cost: фактор растёт монотонно, внешний домен не растёт', () => {
    // НДБ-домены без функций: C_домена = ceil(C_блока × 0.1).
    const project: Project = {
      ...projectWithCosts(),
      architecture: {
        blocks: [
          { id: 'd-small', name: 'Малый', cost: 10 },
          { id: 'd-big', name: 'Большой', cost: 90 },
          { id: 'ext-x', name: 'Внешняя', cost: 0, external: true },
        ],
        edges: [],
      },
    };
    const { costs } = recalcCosts(project);
    const factors = domainSizeFactors(project, costs, 'cost');
    const small = factors.get('d-small')!;
    const big = factors.get('d-big')!;
    expect(big).toBeCloseTo(SIZE_MAX_FACTOR); // максимум — верхняя граница
    expect(small).toBe(1); // минимум — базовый размер
    expect(big).toBeGreaterThan(small);
    expect(factors.get('ext-x')).toBe(1);
  });

  it('режим block: значения по C_блока, без пересчёта стоимости', () => {
    const project = projectWithCosts();
    const { costs } = recalcCosts(project);
    const factors = domainSizeFactors(project, costs, 'block');
    // C_блока: 10 и 10 — значения равны → рост не имеет смысла.
    expect(factors.get('d-small')).toBe(1);
    expect(factors.get('d-big')).toBe(1);
  });

  it('режим block различает блоки разной базовой стоимости', () => {
    const project: Project = {
      ...projectWithCosts(),
      architecture: {
        blocks: [
          { id: 'd-small', name: 'Малый', cost: 5 },
          { id: 'd-big', name: 'Большой', cost: 50 },
          { id: 'ext-x', name: 'Внешняя', cost: 0, external: true },
        ],
        edges: [],
      },
    };
    const { costs } = recalcCosts(project);
    const factors = domainSizeFactors(project, costs, 'block');
    expect(factors.get('d-big')!).toBeCloseTo(SIZE_MAX_FACTOR);
    expect(factors.get('d-small')).toBe(1);
  });

  it('равные стоимости дают базовые размеры во всех режимах', () => {
    const project = projectWithCosts();
    const { costs } = recalcCosts(project);
    for (const mode of ['cost', 'block'] as const) {
      const factors = domainSizeFactors(project, costs, mode);
      // d-small и d-big при C_блока 10/10 в НДБ одинаковы по C_домена.
      expect(factors.get('d-small')).toBe(1);
      expect(factors.get('d-big')).toBe(1);
    }
  });

  it('габариты по фактору: базовые при 1, верхняя граница при максимуме', () => {
    expect(sizeForFactor(1)).toEqual({ width: SIZE_BASE_WIDTH, height: SIZE_BASE_HEIGHT });
    expect(sizeForFactor(SIZE_MAX_FACTOR)).toEqual({
      width: Math.round(SIZE_BASE_WIDTH * SIZE_MAX_FACTOR),
      height: Math.round(SIZE_BASE_HEIGHT * SIZE_MAX_FACTOR),
    });
    // Зажим за пределами диапазона.
    expect(sizeForFactor(0.5)).toEqual({ width: SIZE_BASE_WIDTH, height: SIZE_BASE_HEIGHT });
    expect(sizeForFactor(3)).toEqual({
      width: Math.round(SIZE_BASE_WIDTH * SIZE_MAX_FACTOR),
      height: Math.round(SIZE_BASE_HEIGHT * SIZE_MAX_FACTOR),
    });
  });
});
