/**
 * Тесты стоимости — кейсы T-C-01…T-C-12 раздела 11.2 ТЗ (алгоритм 7.1 v0.01.01
 * с коэффициентами доверия: НДБ 0.1, ДДБ 5, ДДБПЦД 10).
 */

import { describe, expect, it } from 'vitest';
import {
  connectivityMultiplier,
  domainCost,
  recalcCosts,
} from '@/engine/cost';
import { decompose } from '@/engine/decompose';
import { emptyProject, type Project } from '@/engine/types';
import { TRUST_COST_COEFFICIENT } from '@/engine/trust';

function block(id: string, cost: number) {
  return { id, name: `Блок ${id}`, cost };
}
function fn(id: string, cost: number) {
  return { id, name: `Функция ${id}`, cost };
}

function project(partial: Partial<Project>): Project {
  const base = emptyProject();
  return {
    ...base,
    ...partial,
    architecture: partial.architecture ?? base.architecture,
    security: partial.security ?? base.security,
    assignments: partial.assignments ?? [],
  };
}

describe('Модель стоимости (раздел 3.3, алгоритм 7.1 v0.01.01)', () => {
  it('T-C-01: коэффициенты доверия — НДБ 0.1, ДДБ 5, ДДБПЦД 10', () => {
    expect(TRUST_COST_COEFFICIENT.ndb).toBe(0.1);
    expect(TRUST_COST_COEFFICIENT.ddb).toBe(5);
    expect(TRUST_COST_COEFFICIENT.ddbpcd).toBe(10);
  });

  it('T-C-02: домен без функций (S = 0) стоит C_блока × K при любых стрелках', () => {
    const ndb = domainCost(block('b', 7), [], 0, 0, 'ndb');
    const ddb = domainCost(block('b', 7), [], 3, 4, 'ddb');
    expect(ndb.domainCost).toBe(1); // ceil(7 × 0.1)
    expect(ndb.trustCoefficient).toBe(0.1);
    expect(ddb.domainCost).toBe(35); // ceil(7 × 5)
  });

  it('T-C-03: E = 1 — множитель M = 1, НДБ с функцией — ×0.1', () => {
    expect(connectivityMultiplier(1, 0)).toBe(1);
    expect(connectivityMultiplier(0, 1)).toBe(1);
    const result = domainCost(block('b', 50), [fn('f', 2)], 1, 0, 'ndb');
    expect(result.multiplier).toBe(1);
    expect(result.domainCost).toBe(10); // ceil(50 × 2 × 1 × 0.1)
  });

  it('T-C-04: ДДБ — блок 4, функции 3+4, E = 3 → M = 1.5, C_домена = 210', () => {
    const result = domainCost(block('b', 4), [fn('f1', 3), fn('f2', 4)], 1, 2, 'ddb');
    expect(result.functionsCost).toBe(7);
    expect(result.multiplier).toBe(1.5);
    expect(result.domainCost).toBe(210); // ceil(4 × 7 × 1.5 × 5)
  });

  it('T-C-05: ДДБПЦД — блок 3, функция 3, E = 3 → 135 округляется вниз по формуле (целое)', () => {
    const result = domainCost(block('b', 3), [fn('f1', 3)], 1, 2, 'ddbpcd');
    expect(result.domainCost).toBe(135); // 3 × 3 × 1.5 × 10 = 135
  });

  it('T-C-06: округление вверх выполняется один раз на итоговом произведении', () => {
    // 3 × 3 × 1.5 × 0.1 = 1.35 → ceil = 2.
    const result = domainCost(block('b', 3), [fn('f1', 3)], 1, 2, 'ndb');
    expect(result.domainCost).toBe(2);
  });

  it('T-C-07: E = 0 при наличии функций — M = 1 (изолированный домен не бесплатный)', () => {
    const result = domainCost(block('b', 2), [fn('f', 5)], 0, 0, 'ddb');
    expect(result.multiplier).toBe(1);
    expect(result.domainCost).toBe(50); // 2 × 5 × 1 × 5
  });

  it('T-C-08: внешний домен — domainCost = 0 и не входит в C_системы', () => {
    const projectModel = project({
      architecture: {
        blocks: [
          { id: 'blk-in', name: 'Внутренний', cost: 4 },
          { id: 'ext-1', name: 'Внешняя', cost: 0, external: true },
        ],
        edges: [{ id: 'e-1', from: 'blk-in', to: 'ext-1' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [{ id: 'f1', name: 'Ф', cost: 2, implements: [{ goal: 'g1', weight: 'mandatory' }] }],
      },
      assignments: [{ function: 'f1', block: 'blk-in' }],
    });
    const { costs, systemCost } = recalcCosts(projectModel);
    expect(costs.get('ext-1')!.domainCost).toBe(0);
    expect(costs.get('ext-1')!.external).toBe(true);
    expect(systemCost).toBe(40); // только внутренний: ДДБ, ceil(4 × 2 × 1 × 5)
  });

  it('T-C-09: контрольный пример 14.4 (робот) — C_системы = 486', () => {
    const control: Project = {
      architecture: {
        blocks: [
          { id: 'blk-perc', name: 'Подсистема восприятия', cost: 3, position: { x: 60, y: 200 } },
          { id: 'blk-plan', name: 'Планировщик маршрута', cost: 4, position: { x: 420, y: 120 } },
          { id: 'blk-drive', name: 'Привод движения', cost: 3, position: { x: 780, y: 200 } },
          { id: 'blk-link', name: 'Модуль связи', cost: 2, position: { x: 420, y: 340 } },
          { id: 'ext-ctrl', name: 'Диспетчерский пункт', cost: 0, external: true, trusted: true, position: { x: 1180, y: 120 } },
          { id: 'ext-charge', name: 'Зарядная станция', cost: 0, external: true, position: { x: 1180, y: 340 } },
        ],
        edges: [
          { id: 'e-disp-link', from: 'ext-ctrl', to: 'blk-link', label: 'команды диспетчера' },
          { id: 'e-charge-link', from: 'ext-charge', to: 'blk-link', label: 'статус зарядки' },
          { id: 'e-link-plan', from: 'blk-link', to: 'blk-plan', label: 'очищенные команды' },
          { id: 'e-perc-plan', from: 'blk-perc', to: 'blk-plan', label: 'данные среды' },
          { id: 'e-plan-drive', from: 'blk-plan', to: 'blk-drive', label: 'маршрут' },
          { id: 'e-link-ctrl', from: 'blk-link', to: 'ext-ctrl', label: 'телеметрия' },
        ],
      },
      security: {
        goals: [
          { id: 'g-safe', name: 'Безопасность пешеходов' },
          { id: 'g-cmd', name: 'Достоверность команд' },
          { id: 'g-telem', name: 'Достоверность телеметрии' },
          { id: 'g-route', name: 'Сохранность маршрута' },
          { id: 'g-charge', name: 'Безопасность зарядки' },
        ],
        functions: [
          { id: 'fn-auth', name: 'Аутентификация команд диспетчера', cost: 3, implements: [{ goal: 'g-cmd', weight: 'mandatory' }] },
          { id: 'fn-sanitize', name: 'Контроль целостности входных данных', cost: 2, implements: [{ goal: 'g-cmd', weight: 'optional' }, { goal: 'g-telem', weight: 'mandatory' }] },
          { id: 'fn-estop', name: 'Аварийный останов', cost: 3, implements: [{ goal: 'g-safe', weight: 'mandatory' }] },
          { id: 'fn-geofence', name: 'Геоограничение', cost: 2, implements: [{ goal: 'g-safe', weight: 'optional' }, { goal: 'g-route', weight: 'mandatory' }] },
          { id: 'fn-sign', name: 'Подписывание телеметрии', cost: 2, implements: [{ goal: 'g-telem', weight: 'mandatory' }] },
          { id: 'fn-charge-guard', name: 'Контроль параметров зарядки', cost: 2, implements: [{ goal: 'g-charge', weight: 'mandatory' }] },
          { id: 'fn-log', name: 'Журналирование событий', cost: 1, implements: [{ goal: 'g-telem', weight: 'optional' }] },
        ],
      },
      assignments: [
        { function: 'fn-auth', block: 'blk-link' },
        { function: 'fn-sign', block: 'blk-link' },
        { function: 'fn-sanitize', block: 'blk-plan' },
        { function: 'fn-geofence', block: 'blk-plan' },
        { function: 'fn-estop', block: 'blk-drive' },
      ],
      meta: {},
    };
    const { costs, systemCost, trust } = recalcCosts(control);
    // perc: НДБ S=0 → 1; plan: ДДБПЦД 4×4×1.5×10 = 240; drive: ДДБ 3×3×5 = 45;
    // link: ДДБПЦД 2×5×2×10 = 200.
    expect(costs.get('blk-perc')!.domainCost).toBe(1);
    expect(costs.get('blk-plan')!.domainCost).toBe(240);
    expect(costs.get('blk-drive')!.domainCost).toBe(45);
    expect(costs.get('blk-link')!.domainCost).toBe(200);
    expect(trust.internal.get('blk-perc')).toBe('ndb');
    expect(trust.internal.get('blk-plan')).toBe('ddbpcd');
    expect(trust.internal.get('blk-drive')).toBe('ddb');
    expect(trust.internal.get('blk-link')).toBe('ddbpcd');
    expect(systemCost).toBe(486);
    const sum = [...costs.values()].reduce((acc, c) => acc + c.domainCost, 0);
    expect(systemCost).toBe(sum);
  });

  it('T-C-10: пересчёт после декомпозиции — потомки по формуле 7.1, компенсации нет', () => {
    const base = project({
      architecture: {
        blocks: [
          block('blk-a', 30),
          block('blk-b', 20),
        ],
        edges: [{ id: 'e-a-b', from: 'blk-a', to: 'blk-b', label: 'поток' }],
      },
      security: {
        goals: [{ id: 'g1', name: 'Цель' }],
        functions: [fn('f1', 2)],
      },
      assignments: [{ function: 'f1', block: 'blk-a' }],
    });
    // До декомпозиции НДБ: 30 × 2 × 1 × 0.1 = 6.
    expect(recalcCosts(base).costs.get('blk-a')!.domainCost).toBe(6);
    const result = decompose(base, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 30 },
        { name: 'А.2', cost: 30 },
      ],
      edgeAssignments: [{ edgeId: 'e-a-b', childIndex: 0 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Функция без связей с целями — домен остаётся НДБ.
    const withPlacement: Project = {
      ...result.project,
      assignments: [{ function: 'f1', block: 'blk-a-1' }],
    };
    const { costs, systemCost } = recalcCosts(withPlacement);
    expect(costs.get('blk-a-1')!.domainCost).toBe(6); // 30 × 2 × 1 × 0.1
    expect(costs.get('blk-a-2')!.domainCost).toBe(3); // ceil(30 × 0.1)
    expect(costs.get('blk-b')!.domainCost).toBe(2); // ceil(20 × 0.1)
    expect(systemCost).toBe(11); // компенсации нет: 11 ≠ 8 (исходная система 6 + 2)
  });

  it('T-C-11: C_блока = 0 при наличии функций — C_домена = 0', () => {
    const result = domainCost(block('b', 0), [fn('f', 5)], 2, 2, 'ddb');
    expect(result.domainCost).toBe(0);
  });

  it('T-C-12: крупные значения до 10^9 — целое число без потери точности', () => {
    const big = 1_000_000_000;
    const result = domainCost(block('b', big), [fn('f', 1)], 0, 0, 'ddb');
    expect(Number.isInteger(result.domainCost)).toBe(true);
    expect(result.domainCost).toBe(5_000_000_000); // 10^9 × 5
    const result2 = domainCost(block('b', big), [fn('f', 3)], 3, 0, 'ddb');
    expect(Number.isInteger(result2.domainCost)).toBe(true);
    expect(result2.domainCost).toBe(22_500_000_000); // 10^9 × 3 × 1.5 × 5
  });

  it('Множитель связности по таблице 3.3', () => {
    expect(connectivityMultiplier(0, 0)).toBe(1);
    expect(connectivityMultiplier(1, 1)).toBe(1); // E = 2
    expect(connectivityMultiplier(2, 1)).toBe(1.5); // E = 3
    expect(connectivityMultiplier(2, 2)).toBe(2); // E = 4
    expect(connectivityMultiplier(3, 5)).toBe(4); // E = 8
  });

  it('S = 0 из функций нулевой стоимости: домен стоит C_блока × K', () => {
    const result = domainCost(block('b', 50), [fn('f', 0)], 4, 4, 'ndb');
    expect(result.domainCost).toBe(5); // ceil(50 × 0.1)
  });
});
