/**
 * Оценка доли A* в computeRoutePath (v0.03.01j): сравнение стоимости стрелки
 * на «свободной» раскладке (прямые линии — без A*) и на плотной сетке
 * большой модели (обходы — A*). Запуск: bun run scripts/perf-astar-share.ts
 */

import { parseStateYaml } from '../src/io/index';
import { readFileSync } from 'node:fs';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../src/engine/trust';
import { routeEdges, computeRoutePath } from '../src/engine/edgeRouting';
import type { RouteRect, RoutePoint } from '../src/engine/edgeRouting';

const yaml = readFileSync(new URL('../tests/fixtures/perf/large-state.yaml', import.meta.url), 'utf8');
const parsed = parseStateYaml(yaml);
if (!parsed.model) throw new Error('нет модели');
const project = parsed.model;

const rects = new Map<string, RouteRect>();
for (const block of project.architecture.blocks) {
  rects.set(block.id, {
    x: block.position?.x ?? 0,
    y: block.position?.y ?? 0,
    width: NODE_ESTIMATED_WIDTH,
    height: NODE_ESTIMATED_HEIGHT,
  });
}
const edges = project.architecture.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));

const t0 = performance.now();
routeEdges({ rects, edges });
const dense = performance.now() - t0;

// «Свободная» раскладка: те же стрелки, но каждый прямоугольник — в своей
// широкой ячейке: прямая линия между портами не пересекает чужие домены.
const sparse = new Map<string, RouteRect>();
let i = 0;
for (const id of rects.keys()) {
  const col = i % 10;
  const row = Math.floor(i / 10);
  sparse.set(id, {
    x: col * (NODE_ESTIMATED_WIDTH + 600),
    y: row * (NODE_ESTIMATED_HEIGHT + 600),
    width: NODE_ESTIMATED_WIDTH,
    height: NODE_ESTIMATED_HEIGHT,
  });
  i += 1;
}
const t1 = performance.now();
routeEdges({ rects: sparse, edges });
const sparseTime = performance.now() - t1;

// Чистый A* без постобработки: короткая трасса через плотную зону.
// Меряем среднее на 200 прямых запросах с препятствием посередине.
const from: RoutePoint = { x: 0, y: 85 };
const to: RoutePoint = { x: 1200, y: 85 };
const wall: RouteRect[] = [
  { x: 550, y: -50, width: 40, height: 270 },
  { x: 550, y: 320, width: 40, height: 300 },
];
const t2 = performance.now();
for (let k = 0; k < 200; k += 1) {
  const points = computeRoutePath(from, to, wall, { penalty: undefined });
  if (points.length < 2) throw new Error('нет трассы');
}
const pureAStar = performance.now() - t2;

console.log(`плотная модель (200 стрелок, обходы): ${dense.toFixed(1)} мс (${(dense / edges.length).toFixed(2)} мс/стрелку)`);
console.log(`разреженная модель (прямые линии): ${sparseTime.toFixed(1)} мс (${(sparseTime / edges.length).toFixed(2)} мс/стрелку)`);
console.log(`чистый A* со стеной (200 прогонов): ${pureAStar.toFixed(1)} мс (${(pureAStar / 200).toFixed(2)} мс/трассу)`);
