/**
 * Тесты автоматической раскладки — v0.01.03 (слои, детерминизм, устойчивость
 * к циклам), v0.01.07: минимизация пересечений проходами барицентров,
 * выравнивание вертикалей по связям (метод Брандеса–Кёпфа), внешние системы
 * по сторонам рамки (источники слева, приёмники справа) и нормировка границ;
 * v0.03.01i: серпантинная упаковка слоёв в полосы — ширина длинной ленты
 * становится сопоставима с высотой, нечётные полосы зеркальны;
 * v0.03.01k: геометрия логических групп — ЛГ-смежность в колонках,
 * уплотнение членов ЛГ, отсутствие пересечений рамок (кроме полной
 * вложенности) и наездов рамок на несгруппированные ДБ.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeAutoLayout,
  resolveGroupOverlaps,
  ROW_GAP,
  type LayoutPosition,
} from '../../src/engine/layout';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../../src/engine/trust';
import {
  computeGroupGeometry,
  computeGroupVisibility,
  groupSubtree,
  LG_FRAME_PADDING,
  type LgRect,
} from '../../src/engine/groups';
import type { Architecture, Block, DomainGroup, Edge } from '../../src/engine/types';
import { parseStateYaml } from '../../src/io/stateFile';
import {
  buildLargeProject,
  PERF_EXTERNAL_COUNT,
  PERF_GROUP_COUNT,
  PERF_INTERNAL_COUNT,
} from '../../tests/perf/largeModel';

function block(id: string, external = false): Block {
  return { id, name: id, cost: external ? 0 : 1, ...(external ? { external: true } : {}) };
}

function arch(blocks: Block[], edges: Edge[]): Architecture {
  return { blocks, edges };
}

describe('Автоматическая раскладка (v0.01.03)', () => {
  it('пустая архитектура даёт пустой словарь позиций', () => {
    expect(computeAutoLayout(arch([], [])).size).toBe(0);
  });

  it('архитектура без внутренних доменов не меняет позиции внешних систем', () => {
    const result = computeAutoLayout(arch([block('ext-1', true)], []));
    expect(result.size).toBe(0);
  });

  it('линейная цепочка раскладывается слоями слева направо', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('b'), block('c')],
        [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e2', from: 'b', to: 'c' },
        ],
      ),
    );
    expect(result.size).toBe(3);
    expect(result.get('a')!.x).toBeLessThan(result.get('b')!.x);
    expect(result.get('b')!.x).toBeLessThan(result.get('c')!.x);
    // Слой = длина самого длинного пути: a → 0, b → 1, c → 2.
    expect(result.get('a')!.y).toBe(result.get('b')!.y);
    expect(result.get('b')!.y).toBe(result.get('c')!.y);
  });

  it('независимые домены одного слоя встают в колонку друг под другом', () => {
    const result = computeAutoLayout(arch([block('a'), block('b')], []));
    expect(result.get('a')!.x).toBe(result.get('b')!.x);
    expect(result.get('a')!.y).toBeLessThan(result.get('b')!.y);
    expect(result.get('b')!.y - result.get('a')!.y).toBeGreaterThanOrEqual(NODE_ESTIMATED_HEIGHT);
  });

  it('ромб: приёмник в слое дальше источников, средние — в одном слое', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('b'), block('c'), block('d')],
        [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e2', from: 'a', to: 'c' },
          { id: 'e3', from: 'b', to: 'd' },
          { id: 'e4', from: 'c', to: 'd' },
        ],
      ),
    );
    expect(result.get('a')!.x).toBeLessThan(result.get('b')!.x);
    expect(result.get('b')!.x).toBe(result.get('c')!.x);
    expect(result.get('b')!.y).toBeLessThan(result.get('c')!.y);
    expect(result.get('d')!.x).toBeGreaterThan(result.get('b')!.x);
    // Barycenter: b и c стоят по строкам предшественника a.
    expect(result.get('b')!.y).toBe(result.get('a')!.y);
  });

  it('цикл не ломает раскладку — все домены размещены детерминированно', () => {
    const edges: Edge[] = [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'a' },
    ];
    const first = computeAutoLayout(arch([block('a'), block('b')], edges));
    const second = computeAutoLayout(arch([block('a'), block('b')], edges));
    expect(first.size).toBe(2);
    expect([...first.entries()]).toEqual([...second.entries()]);
    // Оба домена стоят в области раскладки, слои не превышают числа доменов.
    const xs = [...first.values()].map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(80);
    expect(Math.max(...xs)).toBeLessThanOrEqual(80 + 2 * (NODE_ESTIMATED_WIDTH + 110));
  });

  it('внешние системы по сторонам рамки: источник — слева, приёмник — справа', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('b'), block('ext-src', true), block('ext-sink', true)],
        [
          { id: 'e1', from: 'ext-src', to: 'a' },
          { id: 'e2', from: 'b', to: 'ext-sink' },
        ],
      ),
    );
    // Источник стрелок встаёт слева от внутренних доменов, приёмник — справа.
    const leftInternal = Math.min(result.get('a')!.x, result.get('b')!.x);
    const rightInternal = Math.max(result.get('a')!.x, result.get('b')!.x) + NODE_ESTIMATED_WIDTH;
    expect(result.get('ext-src')!.x + NODE_ESTIMATED_WIDTH).toBeLessThan(leftInternal);
    expect(result.get('ext-sink')!.x).toBeGreaterThan(rightInternal);
    // Вся диаграмма остаётся в области раскладки: левый край — не левее ORIGIN.
    const minX = Math.min(...[...result.values()].map((p) => p.x));
    expect(minX).toBeGreaterThanOrEqual(80);
  });

  it('внешняя система-источник слева выравнивается по вертикали связанного домена', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('ext-src', true)],
        [{ id: 'e1', from: 'ext-src', to: 'a' }],
      ),
    );
    const ext = result.get('ext-src')!;
    expect(ext.x + NODE_ESTIMATED_WIDTH).toBeLessThan(result.get('a')!.x);
    expect(ext.y + NODE_ESTIMATED_HEIGHT / 2).toBeCloseTo(result.get('a')!.y + NODE_ESTIMATED_HEIGHT / 2, 0);
  });

  it('при равенстве потоков доверенная внешняя система слева, недоверенная — справа', () => {
    const result = computeAutoLayout(
      arch(
        [
          block('a'),
          { id: 'ext-trusted', name: 'ext-trusted', cost: 0, external: true, trusted: true },
          block('ext-untrusted', true),
        ],
        [
          { id: 'e1', from: 'ext-trusted', to: 'a' },
          { id: 'e2', from: 'a', to: 'ext-untrusted' },
        ],
      ),
    );
    expect(result.get('ext-trusted')!.x).toBeLessThan(result.get('a')!.x);
    expect(result.get('ext-untrusted')!.x).toBeGreaterThan(result.get('a')!.x);
  });

  it('внешняя система выравнивается по вертикали связанного домена; совпадающие сдвигаются вниз', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('ext-1', true), block('ext-2', true)],
        [
          { id: 'e1', from: 'ext-1', to: 'a' },
          { id: 'e2', from: 'ext-2', to: 'a' },
        ],
      ),
    );
    const ext1 = result.get('ext-1')!;
    const ext2 = result.get('ext-2')!;
    expect(ext2.y).toBeGreaterThan(ext1.y);
    // Первая внешняя — по центру домена a.
    expect(ext1.y + NODE_ESTIMATED_HEIGHT / 2).toBeCloseTo(result.get('a')!.y + NODE_ESTIMATED_HEIGHT / 2, 0);
  });

  it('внешние системы без связей встают в стек от начала координат', () => {
    const result = computeAutoLayout(
      arch([block('a'), block('ext-1', true), block('ext-2', true)], []),
    );
    expect(result.get('ext-1')!.x).toBeGreaterThan(result.get('a')!.x);
    expect(result.get('ext-2')!.y).toBeGreaterThan(result.get('ext-1')!.y);
  });

  it('раскладка детерминирована и не зависит от порядка блоков', () => {
    const blocks = [block('a'), block('b'), block('c')];
    const edges: Edge[] = [
      { id: 'e1', from: 'a', to: 'c' },
      { id: 'e2', from: 'b', to: 'c' },
    ];
    const first = computeAutoLayout(arch(blocks, edges));
    const second = computeAutoLayout(arch([blocks[2], blocks[1], blocks[0]], edges));
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it('стрелки между внешними системами не создают слоёв и не связывают позиции', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('ext-1', true), block('ext-2', true)],
        [{ id: 'e1', from: 'ext-1', to: 'ext-2' }],
      ),
    );
    // Обе внешние — без внутренних соседей: стек, домен a не сдвинут.
    expect(result.get('a')!.x).toBe(80);
    expect(result.get('ext-2')!.y).toBeGreaterThan(result.get('ext-1')!.y);
  });
});

describe('Серпантинная упаковка слоёв в полосы (v0.03.01i)', () => {
  /** Цепочка из n доменов a0 → a1 → … — лента из n слоёв по одному домену. */
  function chain(n: number): { blocks: Block[]; edges: Edge[] } {
    return {
      blocks: Array.from({ length: n }, (_, i) => block(`a${i}`)),
      edges: Array.from({ length: n - 1 }, (_, i) => ({
        id: `e${i}`,
        from: `a${i}`,
        to: `a${i + 1}`,
      })),
    };
  }

  function bbox(positions: Map<string, { x: number; y: number }>): { w: number; h: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { w: maxX - minX, h: maxY - minY };
  }

  it('длинная лента заворачивается: ширина сопоставима с высотой', () => {
    const { blocks, edges } = chain(9);
    const result = computeAutoLayout(arch(blocks, edges));
    expect(result.size).toBe(9);
    const { w, h } = bbox(result);
    // Без упаковки лента 9 слоёв тянулась на ~3200×170 (пропорция ~19);
    // после заворота в полосы пропорция близка к целевой.
    expect(w / h).toBeGreaterThan(0.8);
    expect(w / h).toBeLessThan(2.2);
    // Полосы сложены по вертикали: вторая полоса ниже первой.
    expect(result.get('a3')!.y).toBeGreaterThan(result.get('a0')!.y);
    expect(result.get('a6')!.y).toBeGreaterThan(result.get('a3')!.y);
  });

  it('полосы идут змейкой: нечётная полоса зеркальна, стык — у края', () => {
    const { blocks, edges } = chain(9);
    const result = computeAutoLayout(arch(blocks, edges));
    // Полоса 0: слои идут слева направо.
    expect(result.get('a0')!.x).toBeLessThan(result.get('a1')!.x);
    expect(result.get('a1')!.x).toBeLessThan(result.get('a2')!.x);
    // Полоса 1 зеркальна: слои идут справа налево.
    expect(result.get('a3')!.x).toBeGreaterThan(result.get('a4')!.x);
    expect(result.get('a4')!.x).toBeGreaterThan(result.get('a5')!.x);
    // Связь-стык a2 → a3 короткая: оба у правого края (поворот змейки).
    expect(result.get('a3')!.x).toBe(result.get('a2')!.x);
    // Полоса 2 снова слева направо.
    expect(result.get('a6')!.x).toBeLessThan(result.get('a7')!.x);
    // Домены разных полос не совпадают по позиции.
    expect(result.get('a5')!.y).toBeLessThan(result.get('a6')!.y);
  });

  it('упаковка детерминирована и не зависит от порядка блоков', () => {
    const { blocks, edges } = chain(9);
    const first = computeAutoLayout(arch(blocks, edges));
    const second = computeAutoLayout(arch([...blocks].reverse(), edges));
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it('лента из четырёх слоёв заворачивается, из трёх — нет', () => {
    const c4 = chain(4);
    const four = computeAutoLayout(arch(c4.blocks, c4.edges));
    // 4 слоя — упаковка уже включается: полоса 2 ниже полосы 1.
    expect(four.get('a2')!.y).toBeGreaterThan(four.get('a0')!.y);
    const c3 = chain(3);
    const three = computeAutoLayout(arch(c3.blocks, c3.edges));
    // 3 слоя — прежнее поведение: одна лента, домены в одну строку.
    expect(three.get('a0')!.y).toBe(three.get('a1')!.y);
    expect(three.get('a1')!.y).toBe(three.get('a2')!.y);
  });

  it('внешние системы при упаковке: источник слева, приёмник справа, выравнивание сохранено', () => {
    const { blocks, edges } = chain(9);
    blocks.push(block('src', true), block('sink', true));
    edges.push(
      { id: 'es', from: 'src', to: 'a0' },
      { id: 'ek', from: 'a8', to: 'sink' },
    );
    const result = computeAutoLayout(arch(blocks, edges));
    const internalX = [...result.entries()]
      .filter(([id]) => id.startsWith('a'))
      .map(([, p]) => p.x);
    const leftInternal = Math.min(...internalX);
    const rightInternal = Math.max(...internalX) + NODE_ESTIMATED_WIDTH;
    expect(result.get('src')!.x + NODE_ESTIMATED_WIDTH).toBeLessThan(leftInternal);
    expect(result.get('sink')!.x).toBeGreaterThan(rightInternal);
    // Источник выровнен по вертикали первого домена ленты.
    expect(result.get('src')!.y + NODE_ESTIMATED_HEIGHT / 2).toBeCloseTo(
      result.get('a0')!.y + NODE_ESTIMATED_HEIGHT / 2,
      0,
    );
    // Диаграмма не выходит из области раскладки.
    const minX = Math.min(...[...result.values()].map((p) => p.x));
    expect(minX).toBeGreaterThanOrEqual(80);
  });
});

/* ------------------------------------------------------------------ */
/* Геометрия логических групп (v0.03.01k)                              */
/* ------------------------------------------------------------------ */

/** Проверка и возврат прямоугольника рамки ЛГ. */
function expectRect(rect: LgRect, label: string): LgRect {
  expect(rect.width, label).toBeGreaterThan(0);
  expect(rect.height, label).toBeGreaterThan(0);
  expect(Number.isFinite(rect.x), `${label}: x`).toBe(true);
  expect(Number.isFinite(rect.y), `${label}: y`).toBe(true);
  return rect;
}

/** Наложение прямоугольников (касание — не наложение). */
function overlap(a: LgRect, b: LgRect, gap = 0): boolean {
  return (
    a.x - gap < b.x + b.width &&
    a.x + a.width + gap > b.x &&
    a.y - gap < b.y + b.height &&
    a.y + a.height + gap > b.y
  );
}

/** Прямоугольник ДБ по позиции раскладки (оценочные габариты узла). */
function rectOf(positions: Map<string, LayoutPosition>, id: string): LgRect {
  return {
    x: positions.get(id)!.x,
    y: positions.get(id)!.y,
    width: NODE_ESTIMATED_WIDTH,
    height: NODE_ESTIMATED_HEIGHT,
  };
}

describe('Геометрия ЛГ в автараскладке (v0.03.01k)', () => {
  /** Архитектура с ЛГ. */
  function groupedArch(
    blocks: Block[],
    edges: Edge[],
    groups: Array<Pick<DomainGroup, 'id'> & Partial<DomainGroup>>,
  ): Architecture {
    return {
      blocks,
      edges,
      groups: groups.map((g) => ({ name: g.id, color: '#607D8B', ...g }) as DomainGroup),
    };
  }

  /** Рамки ЛГ по результату раскладки (развёрнутое состояние, оценочные габариты). */
  function expandedFrames(
    architecture: Pick<Architecture, 'blocks' | 'groups'>,
    positions: Map<string, LayoutPosition>,
  ): Map<string, LgRect> {
    const positioned: Pick<Architecture, 'blocks' | 'groups'> = {
      ...architecture,
      blocks: architecture.blocks.map((b) => {
        const p = positions.get(b.id);
        return p ? { ...b, position: p } : b;
      }),
    };
    const visibility = computeGroupVisibility(positioned);
    const geometry = computeGroupGeometry(positioned, null, visibility);
    const rects = new Map<string, LgRect>();
    for (const [id, geo] of geometry) rects.set(id, expectRect(geo.rect, id));
    return rects;
  }

  it('ЛГ-смежность: члены одной ЛГ стоят в колонке подряд, чужие ДБ — вне прогона', () => {
    const blocks = [
      { ...block('m1'), groupId: 'lg-m' },
      { ...block('m2'), groupId: 'lg-m' },
      block('u1'),
      block('u2'),
    ];
    const result = computeAutoLayout(groupedArch(blocks, [], [{ id: 'lg-m' }]));
    // Одна колонка (нет связей — один слой): одинаковый x у всех.
    const xs = [...result.values()].map((p) => p.x);
    expect(new Set(xs).size).toBe(1);
    // Члены ЛГ — соседние строки, между ними нет чужих ДБ.
    const byY = [...result.entries()].sort((a, b) => a[1].y - b[1].y).map(([id]) => id);
    expect(Math.abs(byY.indexOf('m1') - byY.indexOf('m2'))).toBe(1);
    // Уплотнение: зазор между членами — ровно ROW_GAP (медианы не растягивают рамку).
    const gap = result.get('m2')!.y - (result.get('m1')!.y + NODE_ESTIMATED_HEIGHT);
    expect(Math.abs(gap)).toBe(ROW_GAP);
    // Рамка ЛГ минимальна: охват двух членов с отступом.
    const frames = expandedFrames(groupedArch(blocks, [], [{ id: 'lg-m' }]), result);
    const frame = frames.get('lg-m')!;
    expect(frame.height).toBe(2 * NODE_ESTIMATED_HEIGHT + ROW_GAP + 2 * LG_FRAME_PADDING);
    // Несгруппированные ДБ вне рамки.
    for (const id of ['u1', 'u2']) {
      expect(overlap(frame, expectRect({
        x: result.get(id)!.x,
        y: result.get(id)!.y,
        width: NODE_ESTIMATED_WIDTH,
        height: NODE_ESTIMATED_HEIGHT,
      }, id))).toBe(false);
    }
  });

  it('уплотнение: тяга медиан соседних колонок не раздвигает члены ЛГ', () => {
    // m2 имеет четырёх преемников в следующей колонке — медианы тянут его
    // вниз; члены lg-m обязаны остаться вплотную (зазор ROW_GAP).
    const blocks = [
      { ...block('m1'), groupId: 'lg-m' },
      { ...block('m2'), groupId: 'lg-m' },
      block('s1'),
      block('s2'),
      block('s3'),
      block('s4'),
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'm2', to: 's1' },
      { id: 'e2', from: 'm2', to: 's2' },
      { id: 'e3', from: 'm2', to: 's3' },
      { id: 'e4', from: 'm2', to: 's4' },
    ];
    const result = computeAutoLayout(groupedArch(blocks, edges, [{ id: 'lg-m' }]));
    expect(result.get('m1')!.x).toBe(result.get('m2')!.x);
    const gap = result.get('m2')!.y - (result.get('m1')!.y + NODE_ESTIMATED_HEIGHT);
    expect(gap).toBe(ROW_GAP);
    // Площадь рамки — минимальная для двух членов одной колонки.
    const frames = expandedFrames(groupedArch(blocks, edges, [{ id: 'lg-m' }]), result);
    expect(frames.get('lg-m')!.height).toBe(
      2 * NODE_ESTIMATED_HEIGHT + ROW_GAP + 2 * LG_FRAME_PADDING,
    );
  });

  it('рамки двух ЛГ не пересекаются; члены внутри своих рамок', () => {
    const blocks = [
      { ...block('a1'), groupId: 'lg-a' },
      { ...block('a2'), groupId: 'lg-a' },
      { ...block('b1'), groupId: 'lg-b' },
      { ...block('b2'), groupId: 'lg-b' },
      block('f1'),
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'a1', to: 'a2' },
      { id: 'e2', from: 'b1', to: 'b2' },
      { id: 'e3', from: 'a1', to: 'b2' },
      { id: 'e4', from: 'b1', to: 'a2' },
      { id: 'e5', from: 'f1', to: 'a1' },
    ];
    const model = groupedArch(blocks, edges, [{ id: 'lg-a' }, { id: 'lg-b' }]);
    const result = computeAutoLayout(model);
    const frames = expandedFrames(model, result);
    const fa = frames.get('lg-a')!;
    const fb = frames.get('lg-b')!;
    expect(overlap(fa, fb)).toBe(false);
    // Члены внутри своих рамок.
    const rectOf = (id: string): LgRect => ({
      x: result.get(id)!.x,
      y: result.get(id)!.y,
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    });
    for (const id of ['a1', 'a2']) expect(overlap(fa, rectOf(id))).toBe(true);
    for (const id of ['b1', 'b2']) expect(overlap(fb, rectOf(id))).toBe(true);
  });

  it('рамка ЛГ не накрывает несгруппированный ДБ; поддерево сдвигается целиком', () => {
    const blocks = [
      { ...block('a1'), groupId: 'lg-a' },
      { ...block('a2'), groupId: 'lg-a' },
      block('u'),
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'a1', to: 'u' },
      { id: 'e2', from: 'u', to: 'a2' },
    ];
    const model = groupedArch(blocks, edges, [{ id: 'lg-a' }]);
    const result = computeAutoLayout(model);
    // Слои: a1 → u → a2 (колонки 0, 1, 2); до разрешения рамка охватывала u.
    const frames = expandedFrames(model, result);
    const frame = frames.get('lg-a')!;
    const uRect: LgRect = {
      x: result.get('u')!.x,
      y: result.get('u')!.y,
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    };
    expect(overlap(frame, uRect)).toBe(false);
    // Поддерево сдвинуто одним жёстким сдвигом: члены на одной вертикали,
    // внутри рамки.
    expect(result.get('a1')!.y).toBe(result.get('a2')!.y);
    expect(result.get('a1')!.y).toBeGreaterThan(uRect.y);
    expect(overlap(frame, {
      x: result.get('a1')!.x,
      y: result.get('a1')!.y,
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    })).toBe(true);
  });

  it('полная вложенность разрешена: рамка потомка внутри рамки предка', () => {
    const blocks = [
      { ...block('p1'), groupId: 'lg-p' },
      { ...block('p2'), groupId: 'lg-p' },
      { ...block('c1'), groupId: 'lg-c' },
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'p1', to: 'c1' },
      { id: 'e2', from: 'c1', to: 'p2' },
    ];
    const model = groupedArch(blocks, edges, [
      { id: 'lg-p' },
      { id: 'lg-c', parentId: 'lg-p' },
    ]);
    const result = computeAutoLayout(model);
    const frames = expandedFrames(model, result);
    const parent = frames.get('lg-p')!;
    const child = frames.get('lg-c')!;
    expect(parent.x).toBeLessThanOrEqual(child.x);
    expect(parent.y).toBeLessThanOrEqual(child.y);
    expect(parent.x + parent.width).toBeGreaterThanOrEqual(child.x + child.width);
    expect(parent.y + parent.height).toBeGreaterThanOrEqual(child.y + child.height);
  });

  it('resolveGroupOverlaps: пересекающиеся рамки разводятся сдвигом вниз с зазором', () => {
    const blocks = [
      { ...block('a1'), groupId: 'lg-a' },
      { ...block('a2'), groupId: 'lg-a' },
      { ...block('b1'), groupId: 'lg-b' },
      { ...block('b2'), groupId: 'lg-b' },
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'a1', to: 'a2' },
      { id: 'e2', from: 'b1', to: 'b2' },
    ];
    const model = groupedArch(blocks, edges, [{ id: 'lg-a' }, { id: 'lg-b' }]);
    // Искусственно перемешанные позиции: рамки обеих ЛГ пересекаются.
    const positions = new Map<string, LayoutPosition>([
      ['a1', { x: 80, y: 80 }],
      ['a2', { x: 500, y: 334 }],
      ['b1', { x: 500, y: 80 }],
      ['b2', { x: 80, y: 334 }],
    ]);
    resolveGroupOverlaps(model, positions, () => ({
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    }));
    const frames = expandedFrames(model, positions);
    const fa = frames.get('lg-a')!;
    const fb = frames.get('lg-b')!;
    expect(overlap(fa, fb)).toBe(false);
    // Зазор не меньше ROW_GAP/2: развод не впритык к наложению «до пикселя».
    const verticalGap = fb.y >= fa.y
      ? fb.y - (fa.y + fa.height)
      : fa.y - (fb.y + fb.height);
    expect(verticalGap).toBeGreaterThanOrEqual(0);
    // Поддеревья не разорваны: члены каждой ЛГ — на своих исходных x.
    expect(positions.get('a1')!.x).toBe(80);
    expect(positions.get('a2')!.x).toBe(500);
    expect(positions.get('b1')!.x).toBe(500);
    expect(positions.get('b2')!.x).toBe(80);
  });

  it('большая модель (50 ДБ, 20 ЛГ): ни одна рамка не пересекается с чужой', () => {
    const project = buildLargeProject();
    const result = computeAutoLayout(project.architecture);
    expect(result.size).toBe(PERF_INTERNAL_COUNT + PERF_EXTERNAL_COUNT);
    const frames = expandedFrames(project.architecture, result);
    expect(frames.size).toBe(PERF_GROUP_COUNT);
    const ids = [...frames.keys()];
    const subtreeOf = (id: string): Set<string> =>
      new Set(groupSubtree(project.architecture.groups ?? [], id));
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = frames.get(ids[i])!;
        const b = frames.get(ids[j])!;
        const nested =
          subtreeOf(ids[i]).has(ids[j]) || subtreeOf(ids[j]).has(ids[i]);
        if (nested) continue; // полная вложенность разрешена
        expect(overlap(a, b), `${ids[i]} × ${ids[j]}`).toBe(false);
      }
    }
    // Несгруппированные ДБ не накрыты рамками.
    for (const id of ['blk-17', 'blk-33', 'blk-49']) {
      const loose: LgRect = {
        x: result.get(id)!.x,
        y: result.get(id)!.y,
        width: NODE_ESTIMATED_WIDTH,
        height: NODE_ESTIMATED_HEIGHT,
      };
      for (const [groupId, frame] of frames) {
        expect(overlap(frame, loose), `${groupId} накрывает ${id}`).toBe(false);
      }
    }
  });

  it('файл пользователя (state_reg_00.yaml, регламент): рамки без пересечений и наездов', () => {
    // Проверка ЛГ-раскладки на реальном файле (v0.03.01l): 14 внутренних ДБ,
    // 8 внешних систем, 6 ЛГ — lg-key ⊂ lg-decide, lg-exec ⊂ lg-tests
    // (полная вложенность), несгруппированный blk-journal.
    const text = readFileSync(
      resolve(__dirname, '../fixtures/seq-colors/state_reg_00.yaml'),
      'utf8',
    );
    const parsed = parseStateYaml(text);
    expect(parsed.errors).toEqual([]);
    const model = parsed.model!.architecture;
    expect(model.groups).toHaveLength(6);
    const result = computeAutoLayout(model);
    expect(result.size).toBe(22); // 14 внутренних + 8 внешних систем

    const frames = expandedFrames(model, result);
    expect(frames.size).toBe(6);
    const ids = [...frames.keys()].sort();
    const groups = model.groups ?? [];
    // ДБ поддерева ЛГ (прямые члены + члены вложенных потомков).
    const subtreeBlocksOf = (id: string): Set<string> => {
      const tree = new Set(groupSubtree(groups, id));
      tree.add(id);
      return new Set(
        model.blocks.filter((b) => b.groupId && tree.has(b.groupId)).map((b) => b.id),
      );
    };
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = frames.get(ids[i])!;
        const b = frames.get(ids[j])!;
        // Полная вложенность: одна ЛГ в поддереве групп другой.
        const nested =
          new Set(groupSubtree(groups, ids[i])).has(ids[j]) ||
          new Set(groupSubtree(groups, ids[j])).has(ids[i]);
        if (nested) continue;
        expect(overlap(a, b), `${ids[i]} × ${ids[j]}`).toBe(false);
      }
    }
    // Уплотнение: рамка накрывает только членов своего поддерева.
    for (const [groupId, frame] of frames) {
      const own = subtreeBlocksOf(groupId);
      for (const b of model.blocks) {
        if (b.external || !result.has(b.id) || own.has(b.id)) continue;
        expect(
          overlap(frame, expectRect(rectOf(result, b.id), `${groupId} × ${b.id}`)),
          `${groupId} накрывает ${b.id} (${b.groupId ?? 'несгруппированный'})`,
        ).toBe(false);
      }
    }
    // Несгруппированный blk-journal вне всех рамок.
    for (const [groupId, frame] of frames) {
      expect(overlap(frame, rectOf(result, 'blk-journal')), `${groupId} × blk-journal`).toBe(
        false,
      );
    }
  });

  it('детерминизм: раскладка с ЛГ не зависит от порядка блоков', () => {
    const blocks = [
      { ...block('a1'), groupId: 'lg-a' },
      { ...block('a2'), groupId: 'lg-a' },
      { ...block('b1'), groupId: 'lg-b' },
      { ...block('b2'), groupId: 'lg-b' },
      block('u'),
    ];
    const edges: Edge[] = [
      { id: 'e1', from: 'a1', to: 'a2' },
      { id: 'e2', from: 'b1', to: 'b2' },
      { id: 'e3', from: 'u', to: 'b1' },
    ];
    const first = computeAutoLayout(groupedArch(blocks, edges, [{ id: 'lg-a' }, { id: 'lg-b' }]));
    const second = computeAutoLayout(
      groupedArch([...blocks].reverse(), edges, [{ id: 'lg-a' }, { id: 'lg-b' }]),
    );
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});
