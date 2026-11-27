/**
 * Микро-профилирование routeEdges: доля этапов (веера, кандидаты, A*,
 * упрощение/выпрямление) на большой модели. Запуск: bun run scripts/perf-profile.ts
 */

import { parseStateYaml } from '../src/io/index';
import { readFileSync } from 'node:fs';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../src/engine/trust';
import { routeEdges, computeRoutePath, createRoutePenalty, accumulateRoutePenalty, computeEdgeFans, edgeRelationGroups } from '../src/engine/edgeRouting';
import type { RouteRect, RoutePoint } from '../src/engine/edgeRouting';

const project = buildModel();
function buildModel() {
  // Та же модель, что и в perf-bench: через фикстуру из tests/perf/largeModel.
  // Здесь — отдельная копия, чтобы профиль был независим.
  const yaml = readFileSync(new URL('../tests/fixtures/perf/large-state.yaml', import.meta.url), 'utf8');
  const parsed = parseStateYaml(yaml);
  if (!parsed.model) throw new Error(parsed.errors[0]?.message ?? 'нет модели');
  return parsed.model;
}

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

// Полный проход — база.
const t0 = performance.now();
routeEdges({ rects, edges });
const full = performance.now() - t0;

// Только веера/стороны/группы — без индивидуальной трассировки.
const t1 = performance.now();
const positionsMap: Record<string, { x: number; y: number }> = {};
for (const [id, rect] of rects) positionsMap[id] = { x: rect.x, y: rect.y };
const sides = new Map<string, { source: 'left' | 'right'; target: 'left' | 'right' }>();
const centerX = (id: string): number => rects.get(id)!.x + rects.get(id)!.width / 2;
for (const edge of edges) {
  sides.set(edge.id, centerX(edge.to) < centerX(edge.from) - 40
    ? { source: 'left', target: 'right' }
    : { source: 'right', target: 'left' });
}
const fanEdges = edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, sourceSide: sides.get(edge.id)?.source, targetSide: sides.get(edge.id)?.target }));
computeEdgeFans(fanEdges, positionsMap);
edgeRelationGroups(edges);
const pre = performance.now() - t1;

// Индивидуальная трассировка с накоплением — остальное.
const t2 = performance.now();
const ordered = [...edges].sort((a, b) => a.id.localeCompare(b.id));
const portPoints: RoutePoint[] = [];
for (const rect of rects.values()) {
  portPoints.push({ x: rect.x, y: rect.y + rect.height / 2 });
  portPoints.push({ x: rect.x + rect.width, y: rect.y + rect.height / 2 });
}
const penalties = new Map<number, ReturnType<typeof createRoutePenalty>>();
let aStarTime = 0;
let straightenTime = 0;
for (const edge of ordered) {
  const side = sides.get(edge.id)!;
  const sourceRect = rects.get(edge.from)!;
  const targetRect = rects.get(edge.to)!;
  const from: RoutePoint = {
    x: side.source === 'left' ? sourceRect.x : sourceRect.x + sourceRect.width,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const to: RoutePoint = {
    x: side.target === 'left' ? targetRect.x : targetRect.x + targetRect.width,
    y: targetRect.y + targetRect.height / 2,
  };
  const obstacles: RouteRect[] = [];
  const selfRects: RouteRect[] = [];
  for (const [id, rect] of rects) {
    if (id === edge.from || id === edge.to) selfRects.push(rect);
    else obstacles.push(rect);
  }
  let grid = penalties.get(0);
  if (!grid) {
    grid = createRoutePenalty([...rects.values()], portPoints);
    penalties.set(0, grid);
  }
  const ta = performance.now();
  const points = computeRoutePath(from, to, obstacles, {
    sourceExit: side.source === 'left' ? { x: -16, y: 0 } : { x: 16, y: 0 },
    targetEntry: side.target === 'left' ? { x: -16, y: 0 } : { x: 16, y: 0 },
    selfRects,
    penalty: grid,
  });
  aStarTime += performance.now() - ta;
  accumulateRoutePenalty(grid, points);
}
const routingLoop = performance.now() - t2;

console.log(`полный routeEdges: ${full.toFixed(1)} мс`);
console.log(`веера/стороны/группы: ${pre.toFixed(1)} мс`);
console.log(`цикл трассировки (computeRoutePath+накопление): ${routingLoop.toFixed(1)} мс`);
console.log(`  в нём computeRoutePath: ${aStarTime.toFixed(1)} мс`);
console.log(`прочее (раскладка пар, sort): ${(full - pre - routingLoop).toFixed(1)} мс`);
