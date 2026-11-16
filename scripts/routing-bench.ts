/**
 * Бенчмарк трассировки стрелок на раскладке пользователя (судно-доставщик).
 * Запуск: bun run scripts/routing-bench.ts
 * Считает: число углов по каждой стрелке, суммарные углы, время трассировки,
 * проверяет недопустимость пересечений чужих доменов.
 */

import { readFileSync } from 'node:fs';
import { parseStateYaml } from '../src/io/index';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../src/engine/trust';
import { routeEdges, segmentIntersectsRect } from '../src/engine/edgeRouting';
import type { RoutePoint, RouteRect } from '../src/engine/edgeRouting';

const yaml = readFileSync(new URL('../tests/fixtures/vessel-user-state.yaml', import.meta.url), 'utf8');
const result = parseStateYaml(yaml);
if (result.errors.length > 0 || !result.model) {
  console.error('Ошибки разбора фикстуры:', result.errors);
  process.exit(1);
}
const project = result.model;

const rects = new Map<string, RouteRect>();
for (const block of project.architecture.blocks) {
  rects.set(block.id, {
    x: block.position?.x ?? 0,
    y: block.position?.y ?? 0,
    width: NODE_ESTIMATED_WIDTH,
    height: NODE_ESTIMATED_HEIGHT,
  });
}

const started = performance.now();
let output = routeEdges({ rects, edges: project.architecture.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })) });
const elapsed = performance.now() - started;

// Повторный прогон — детерминизм.
const output2 = routeEdges({ rects, edges: project.architecture.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })) });
let deterministic = true;
for (const [id, path] of output.paths) {
  const other = output2.paths.get(id);
  if (!other || JSON.stringify(path) !== JSON.stringify(other)) deterministic = false;
}

// Качество формы.
const corners: Array<{ id: string; corners: number; segments: number }> = [];
let totalCorners = 0;
let crossings = 0;
const crossingIds: string[] = [];
/** Реальные повороты: смены оси отрезка (h/v/d), без коллинеарных вершин. */
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
for (const edge of project.architecture.edges) {
  const path = output.paths.get(edge.id);
  if (!path) continue;
  corners.push({ id: edge.id, corners: cornerCount(path), segments: path.length - 1 });
  totalCorners += cornerCount(path);
  // Пересечения с чужими доменами (внутренние точки отрезков).
  for (let i = 0; i < path.length - 1; i += 1) {
    for (const [id, rect] of rects) {
      if (id === edge.from || id === edge.to) continue;
      if (segmentIntersectsRect(path[i], path[i + 1], rect)) {
        crossings += 1;
        crossingIds.push(`${edge.id} x ${id}`);
      }
    }
  }
}

const max = corners.reduce((acc, c) => (c.corners > acc.corners ? c : acc), { id: '', corners: -1, segments: 0 });
const histogram = new Map<number, number>();
for (const c of corners) histogram.set(c.corners, (histogram.get(c.corners) ?? 0) + 1);

// Наложение стрелок: длина общих коллинеарных участков разных стрелок.
function overlapLength(a: RoutePoint[], b: RoutePoint[]): number {
  let total = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const s1 = a[i];
      const e1 = a[i + 1];
      const s2 = b[j];
      const e2 = b[j + 1];
      // Оба горизонтальны на одной высоте (±1 px) — пересечение проекций.
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

const overlaps: string[] = [];
const edgeList = project.architecture.edges;
for (let i = 0; i < edgeList.length; i += 1) {
  const pa = output.paths.get(edgeList[i].id);
  if (!pa) continue;
  for (let j = i + 1; j < edgeList.length; j += 1) {
    const pb = output.paths.get(edgeList[j].id);
    if (!pb) continue;
    const overlap = overlapLength(pa, pb);
    if (overlap > 4) overlaps.push(`${edgeList[i].id}+${edgeList[j].id}: ${overlap.toFixed(0)} px`);
  }
}

console.log('=== Бенчмарк трассировки (раскладка пользователя, судно) ===');
console.log(`стрелок: ${corners.length}, блоков: ${rects.size}`);
console.log(`время трассировки: ${elapsed.toFixed(1)} мс, детерминизм: ${deterministic ? 'да' : 'НЕТ'}`);
console.log(`суммарно углов: ${totalCorners}, в среднем ${(totalCorners / corners.length).toFixed(2)} на стрелку`);
console.log(`максимум углов: ${max.corners} (${max.id})`);
console.log('гистограмма углов:', [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} угл.: ${k}`).join(', '));
console.log(`пересечений чужих доменов: ${crossings}${crossings > 0 ? ` (${crossingIds.slice(0, 10).join('; ')})` : ''}`);
console.log(`наложений стрелок (>4 px): ${overlaps.length}${overlaps.length ? ` — ${overlaps.slice(0, 10).join('; ')}` : ''}`);
console.log('худшие стрелки:');
[...corners].sort((a, b) => b.corners - a.corners).slice(0, 8).forEach((c) => console.log(`  ${c.id}: ${c.corners} углов`));

