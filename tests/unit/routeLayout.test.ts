/**
 * Регрессионный тест трассировки на раскладке пользователя — v0.01.09.
 * Фикстура tests/fixtures/vessel-user-state.yaml — пример 2 «Безэкипажное
 * судно-доставщик» с фактической раскладкой доменов пользователя (22 блока,
 * 33 стрелки), на которой стрелки v0.01.08 шли «лесенкой» с 7–13 углами.
 * Требования к форме: концы у портов, чужие домены не пересекаются,
 * стрелки не наложены друг на друга, поворотов мало (максимум длины прямых
 * отрезков при минимуме углов), форма детерминирована и рисуется
 * скруглёнными кривыми.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStateYaml } from '../../src/io/index';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../../src/engine/trust';
import {
  polylineToRoundedPath,
  routeEdges,
  segmentIntersectsRect,
} from '../../src/engine/edgeRouting';
import type { RoutePoint, RouteRect } from '../../src/engine/edgeRouting';

const fixture = readFileSync(
  new URL('../fixtures/vessel-user-state.yaml', import.meta.url),
  'utf8',
);
const parsed = parseStateYaml(fixture);
const project = parsed.model!;

/** Реальные повороты ломаной: смены оси отрезка (h/v/d) — коллинеарные
 *  вершины (например, «усики» портов) углами не считаются. */
function cornerCount(path: RoutePoint[]): number {
  let count = 0;
  let prevAxis: string | null = null;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx < 0.5 && dy < 0.5) continue;
    const axis = dx < 0.5 ? 'v' : dy < 0.5 ? 'h' : 'd';
    if (prevAxis && axis !== prevAxis) count += 1;
    prevAxis = axis;
  }
  return count;
}

/** Длина наложения двух ломаных (общие коллинеарные участки). */
function overlapLength(a: RoutePoint[], b: RoutePoint[]): number {
  let total = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const s1 = a[i];
      const e1 = a[i + 1];
      const s2 = b[j];
      const e2 = b[j + 1];
      const h1 = Math.abs(s1.y - e1.y) < 0.5;
      const h2 = Math.abs(s2.y - e2.y) < 0.5;
      const v1 = Math.abs(s1.x - e1.x) < 0.5;
      const v2 = Math.abs(s2.x - e2.x) < 0.5;
      if (h1 && h2 && Math.abs(s1.y - s2.y) < 1.5) {
        const lo = Math.max(Math.min(s1.x, e1.x), Math.min(s2.x, e2.x));
        const hi = Math.min(Math.max(s1.x, e1.x), Math.max(s2.x, e2.x));
        if (hi > lo) total += hi - lo;
      } else if (v1 && v2 && Math.abs(s1.x - s2.x) < 1.5) {
        const lo = Math.max(Math.min(s1.y, e1.y), Math.min(s2.y, e2.y));
        const hi = Math.min(Math.max(s1.y, e1.y), Math.max(s2.y, e2.y));
        if (hi > lo) total += hi - lo;
      }
    }
  }
  return total;
}

describe('Трассировка раскладки пользователя (v0.01.09, судно-доставщик)', () => {
  const rects = new Map<string, RouteRect>();
  for (const block of project.architecture.blocks) {
    rects.set(block.id, {
      x: block.position?.x ?? 0,
      y: block.position?.y ?? 0,
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    });
  }
  const edges = project.architecture.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
  }));
  const output = routeEdges({ rects, edges });

  it('фикстура разбирается без ошибок: 22 блока, 33 стрелки', () => {
    expect(parsed.errors).toHaveLength(0);
    expect(project.architecture.blocks).toHaveLength(22);
    expect(edges).toHaveLength(33);
  });

  it('все стрелки протрассированы, стороны портов назначены', () => {
    expect(output.paths.size).toBe(edges.length);
    expect(output.sides.size).toBe(edges.length);
    for (const edge of edges) {
      const path = output.paths.get(edge.id)!;
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(output.sides.get(edge.id)).toBeDefined();
    }
  });

  it('стрелки начинаются и заканчиваются у портов своих доменов', () => {
    for (const edge of edges) {
      const path = output.paths.get(edge.id)!;
      const sourceRect = rects.get(edge.from)!;
      const targetRect = rects.get(edge.to)!;
      const side = output.sides.get(edge.id)!;
      const sourcePortX = side.source === 'left' ? sourceRect.x : sourceRect.x + sourceRect.width;
      const targetPortX = side.target === 'left' ? targetRect.x : targetRect.x + targetRect.width;
      // Якорь порта: X совпадает с портом (веер/сдвиг пары — по перпендикуляру
      // оси, для горизонтальных стрелок это доли пикселя, для вертикальных —
      // до 4 px), Y зажат внутри своего домена с допуском веера.
      expect(Math.abs(path[0].x - sourcePortX)).toBeLessThanOrEqual(6);
      expect(path[0].y).toBeGreaterThanOrEqual(sourceRect.y - 32);
      expect(path[0].y).toBeLessThanOrEqual(sourceRect.y + sourceRect.height + 32);
      const targetPortXR =
        side.target === 'left' ? targetRect.x : targetRect.x + targetRect.width;
      expect(Math.abs(path[path.length - 1].x - targetPortXR)).toBeLessThanOrEqual(6);
      expect(path[path.length - 1].y).toBeGreaterThanOrEqual(targetRect.y - 32);
      expect(path[path.length - 1].y).toBeLessThanOrEqual(targetRect.y + targetRect.height + 32);
    }
  });

  it('чужие домены не пересекаются', () => {
    for (const edge of edges) {
      const path = output.paths.get(edge.id)!;
      for (let i = 0; i < path.length - 1; i += 1) {
        for (const [id, rect] of rects) {
          if (id === edge.from || id === edge.to) continue;
          expect(segmentIntersectsRect(path[i], path[i + 1], rect)).toBe(false);
        }
      }
    }
  });

  it('максимум прямых отрезков: у стрелки не больше трёх поворотов (было до 13)', () => {
    let total = 0;
    let max = 0;
    for (const path of output.paths.values()) {
      const corners = cornerCount(path);
      total += corners;
      max = Math.max(max, corners);
    }
    expect(max).toBeLessThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(30); // факт v0.01.09: 27 (в v0.01.08 — 84)
  });

  it('стрелки не наложены друг на друга (нет общих участков длиннее 4 px)', () => {
    const list = [...output.paths.entries()];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        expect(overlapLength(list[i][1], list[j][1])).toBeLessThanOrEqual(4);
      }
    }
  });

  it('форма детерминирована: повторная трассировка даёт те же ломаные', () => {
    const again = routeEdges({ rects, edges });
    for (const [id, path] of output.paths) {
      expect(again.paths.get(id)).toEqual(path);
    }
  });

  it('ломаные рисуются кривыми: у каждой стрелки с поворотами — скругление', () => {
    for (const path of output.paths.values()) {
      if (cornerCount(path) === 0) continue;
      const d = polylineToRoundedPath(path);
      expect(d.startsWith('M ')).toBe(true);
      expect(d).toContain('C');
    }
  });

  it('стороны портов: стрелки «туда-обратно» одной пары — по разные стороны оси', () => {
    const pair = new Map<string, RouteRect>([
      ['a', { x: 0, y: 0, width: 200, height: 120 }],
      ['b', { x: 600, y: 40, width: 200, height: 120 }],
    ]);
    const pairOutput = routeEdges({
      rects: pair,
      edges: [
        { id: 'f', from: 'a', to: 'b' },
        { id: 'r', from: 'b', to: 'a' },
      ],
    });
    const forward = pairOutput.paths.get('f')!;
    const reverse = pairOutput.paths.get('r')!;
    // Оба конца — на одних и тех же портах; каноническая ось пары разводит
    // стрелки по разные стороны (наложений нет).
    expect(overlapLength(forward, reverse)).toBeLessThanOrEqual(4);
  });
});

describe('Скругление углов на формах трассировки (v0.01.09)', () => {
  it('скругление оставляет длинные прямые участки линиями «L»', () => {
    // Г-образный ход с коленами 300 и 200 px: путь состоит из «M», двух
    // «L»-участков и одной «C»-дуги — прямые не разбиваются на куски.
    const d = polylineToRoundedPath([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 200 },
    ]);
    const commands = d.match(/[MLC]/g) ?? [];
    expect(commands.filter((c) => c === 'C')).toHaveLength(1);
    expect(commands.filter((c) => c === 'L')).toHaveLength(2);
    expect(d.endsWith('L 300 200')).toBe(true);
  });
});
