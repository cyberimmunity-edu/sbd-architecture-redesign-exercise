/**
 * Генератор большой модели для тестов производительности (v0.03.01j):
 * 50 внутренних ДБ, 20 ЛГ (часть вложенных), 200 связей, 5 внешних систем.
 *
 * Детерминированный (без случайности): раскладка — регулярная сетка,
 * ЛГ занимают смежные клетки, связи — смесью внутренних и внешних.
 * Используется:
 *   - unit-тестом производительности (tests/unit/perfScale.test.ts);
 *   - скриптом генерации фикстуры (scripts/make-perf-fixture.mjs)
 *     для E2E-теста производительности (tests/e2e/perf.spec.ts).
 *
 * Ограничения формата не нарушаются: ≤200 доменов, ≤500 стрелок,
 * лимит числа ЛГ и глубина вложенности ≤ MAX_LG_DEPTH соблюдены.
 */

import type { Project } from '../../src/engine/types';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../../src/engine/trust';

/** Параметры большой модели (сверены с запросом: 50 ДБ, 20 ЛГ, 200 связей, 5 внешних). */
export const PERF_INTERNAL_COUNT = 50;
export const PERF_GROUP_COUNT = 20;
export const PERF_EDGE_COUNT = 200;
export const PERF_EXTERNAL_COUNT = 5;

/** Сетка размещения: столбцов и шаг (шаг больше габаритов ДБ — без наложений). */
const COLUMNS = 7;
const CELL_WIDTH = NODE_ESTIMATED_WIDTH + 160;
const CELL_HEIGHT = NODE_ESTIMATED_HEIGHT + 110;
/** Отступ внешних систем справа от сетки внутренних ДБ. */
const EXTERNAL_GAP = 260;

/** Спецификация одной ЛГ большой модели. */
export interface PerfGroupSpec {
  id: string;
  name: string;
  color: string;
  parentId?: string;
}

/**
 * Спецификация 20 ЛГ: 14 верхнего уровня, 6 вложенных (глубина 2 —
 * как у типичных моделей; глубина 3 покрывается юнит-тестами движка).
 */
export function perfGroupSpecs(): PerfGroupSpec[] {
  const parents = ['lg-01', 'lg-04', 'lg-07', 'lg-10', 'lg-13'];
  const specs: PerfGroupSpec[] = [];
  for (let i = 1; i <= PERF_GROUP_COUNT; i += 1) {
    const id = `lg-${String(i).padStart(2, '0')}`;
    const isNested = i > PERF_GROUP_COUNT - 6;
    specs.push({
      id,
      name: `ЛГ ${String(i).padStart(2, '0')} (производительность)`,
      color: '#1E88E5',
      ...(isNested ? { parentId: parents[(i - 15) % parents.length] } : {}),
    });
  }
  return specs;
}

/**
 * Члены каждой ЛГ по номерам ДБ: ДБ идут подряд (blk-01…blk-50),
 * разбиение — почти равномерное, без пропусков; часть ДБ (3 шт.)
 * остаётся несгруппированной — как в реальных моделях.
 */
export function perfGroupMembers(): Map<string, string[]> {
  const members = new Map<string, string[]>();
  const specs = perfGroupSpecs();
  for (const spec of specs) members.set(spec.id, []);
  // Несгруппированные: blk-17, blk-33, blk-49 (проверка смешанной канвы).
  const loose = new Set([17, 33, 49]);
  let cursor = 0;
  for (let i = 1; i <= PERF_INTERNAL_COUNT; i += 1) {
    if (loose.has(i)) continue;
    // Ищем следующую ЛГ, у которой членов меньше нормы (~2-3).
    for (let step = 0; step < specs.length; step += 1) {
      const spec = specs[cursor % specs.length];
      cursor += 1;
      if (members.get(spec.id)!.length < 3) {
        members.get(spec.id)!.push(`blk-${String(i).padStart(2, '0')}`);
        break;
      }
    }
  }
  return members;
}

/** Позиция ДБ в сетке раскладки большой модели. */
function perfBlockPosition(index: number): { x: number; y: number } {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return { x: 100 + col * CELL_WIDTH, y: 100 + row * CELL_HEIGHT };
}

/** Модель-эталон производительности: проект целиком (архитектура + минимум ББП). */
export function buildLargeProject(): Project {
  const groups = perfGroupSpecs();
  const members = perfGroupMembers();
  const groupIdOf = new Map<string, string>();
  for (const [groupId, list] of members) {
    for (const id of list) groupIdOf.set(id, groupId);
  }

  const blocks: Project['architecture']['blocks'] = [];
  for (let i = 1; i <= PERF_INTERNAL_COUNT; i += 1) {
    const id = `blk-${String(i).padStart(2, '0')}`;
    blocks.push({
      id,
      name: `Домен ${String(i).padStart(2, '0')} (производительность)`,
      cost: 1 + (i % 5),
      position: perfBlockPosition(i - 1),
      ...(groupIdOf.has(id) ? { groupId: groupIdOf.get(id) } : {}),
    });
  }
  for (let i = 1; i <= PERF_EXTERNAL_COUNT; i += 1) {
    blocks.push({
      id: `ext-${String(i).padStart(2, '0')}`,
      name: `Внешняя ${String(i).padStart(2, '0')}`,
      cost: 0,
      external: true,
      position: {
        x: 100 + COLUMNS * CELL_WIDTH + EXTERNAL_GAP,
        y: 100 + (i - 1) * (NODE_ESTIMATED_HEIGHT + 140),
      },
    });
  }

  // 200 связей: внутренние (шагами по 3 и 7) + по 4 на каждую внешнюю систему.
  const edges: Project['architecture']['edges'] = [];
  const internal = blocks.filter((b) => !b.external).map((b) => b.id);
  const external = blocks.filter((b) => b.external).map((b) => b.id);
  let e = 0;
  const internalBudget = PERF_EDGE_COUNT - PERF_EXTERNAL_COUNT * 4;
  for (let i = 0; i < internal.length && e < internalBudget; i += 1) {
    for (const step of [3, 7]) {
      if (e >= internalBudget) break;
      const to = internal[(i + step) % internal.length];
      if (to === internal[i]) continue;
      edges.push({
        id: `e-int-${String(e + 1).padStart(3, '0')}`,
        from: internal[i],
        to,
        label: step === 3 ? 'поток данных (замер)' : 'управляющий поток (замер)',
      });
      e += 1;
    }
  }
  let extIndex = 0;
  while (e < PERF_EDGE_COUNT) {
    const ext = external[extIndex % external.length];
    const target = internal[(extIndex * 11) % internal.length];
    edges.push({
      id: `e-ext-${String(e + 1).padStart(3, '0')}`,
      from: extIndex % 2 === 0 ? ext : target,
      to: extIndex % 2 === 0 ? target : ext,
      label: extIndex % 2 === 0 ? 'запрос сведений' : 'ответ о допуске',
    });
    extIndex += 1;
    e += 1;
  }

  return {
    architecture: {
      blocks,
      edges,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        ...(g.parentId ? { parentId: g.parentId } : {}),
      })),
    },
    security: {
      assumptions: [{ id: 'asm-1', text: 'Допущение для замера производительности' }],
      goals: [
        { id: 'g-1', name: 'Цель 1 (замер)', description: 'Цель для замера производительности', unconditional: true },
        { id: 'g-2', name: 'Цель 2 (замер)', description: 'Цель для замера производительности' },
        { id: 'g-3', name: 'Цель 3 (замер)', description: 'Цель для замера производительности' },
      ],
      functions: [
        {
          id: 'fn-1',
          name: 'Функция 1 (замер)',
          cost: 2,
          implements: [{ goal: 'g-1', weight: 'mandatory' }],
        },
        {
          id: 'fn-2',
          name: 'Функция 2 (замер)',
          cost: 3,
          implements: [{ goal: 'g-2', weight: 'mandatory' }],
        },
      ],
    },
    assignments: [
      { function: 'fn-1', block: 'blk-01' },
      { function: 'fn-2', block: 'blk-12' },
    ],
    sequences: [],
    meta: {
      savedAt: '2026-11-26T00:00:00.000Z',
      source: 'Замер производительности: 50 ДБ, 20 ЛГ, 200 связей, 5 внешних систем',
    },
  };
}
