/**
 * Тесты автоматической раскладки — v0.01.03: слои по направлению связей
 * внутри периметра, внешние системы за рамкой, детерминированность,
 * устойчивость к циклам и пустой архитектуре.
 */

import { describe, expect, it } from 'vitest';
import { computeAutoLayout } from '../../src/engine/layout';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../../src/engine/trust';
import type { Architecture, Block, Edge } from '../../src/engine/types';

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

  it('внешние системы размещаются правее рамки периметра', () => {
    const result = computeAutoLayout(
      arch(
        [block('a'), block('b'), block('ext-1', true), block('ext-2', true)],
        [
          { id: 'e1', from: 'ext-1', to: 'a' },
          { id: 'e2', from: 'b', to: 'ext-2' },
        ],
      ),
    );
    const rightInternal = Math.max(result.get('a')!.x, result.get('b')!.x) + NODE_ESTIMATED_WIDTH;
    expect(result.get('ext-1')!.x).toBeGreaterThan(rightInternal);
    expect(result.get('ext-2')!.x).toBe(result.get('ext-1')!.x);
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
