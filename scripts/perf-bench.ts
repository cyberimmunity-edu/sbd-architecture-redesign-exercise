/**
 * Бенчмарк операций ДАП на большой модели (v0.03.01j): 50 ДБ, 20 ЛГ,
 * 200 связей, 5 внешних систем. Замеряет полный цикл канвы:
 * импорт (parseStateYaml), экспорт (serializeStateYaml), видимость и
 * геометрию ЛГ, трассировку стрелок (routeEdges) и стоимость элементов
 * (recalcCosts/recalcCoverage). Запуск: bun run scripts/perf-bench.ts
 */

import { parseStateYaml, serializeStateYaml } from '../src/io/index';
import { buildLargeProject } from '../tests/perf/largeModel';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '../src/engine/trust';
import { routeEdges } from '../src/engine/edgeRouting';
import { computeGroupVisibility, computeGroupGeometry } from '../src/engine/groups';
import { recalcCosts } from '../src/engine/cost';
import { recalcCoverage } from '../src/engine/coverage';
import type { RouteRect } from '../src/engine/edgeRouting';

function ms(label: string, runs: number, fn: () => void): number {
  // Прогрев не требуется: замеряем холодный запуск (как в браузере) и лучший.
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`${label}: мин ${min.toFixed(1)} мс, макс ${max.toFixed(1)} мс (${runs} прогонов)`);
  return min;
}

const project = buildLargeProject();
const counts = {
  блоки: project.architecture.blocks.length,
  внутренние: project.architecture.blocks.filter((b) => !b.external).length,
  внешние: project.architecture.blocks.filter((b) => b.external).length,
  связи: project.architecture.edges.length,
  ЛГ: (project.architecture.groups ?? []).length,
};
console.log('=== Бенчмарк большой модели ===');
console.log(counts);

// Экспорт.
const yamlText = serializeStateYaml(project);
ms('экспорт serializeStateYaml', 5, () => {
  const text = serializeStateYaml(project);
  if (text.length < 1000) throw new Error('экспорт дал слишком короткий файл');
});
const yaml = yamlText;

// Импорт.
const parsed = parseStateYaml(yaml);
if (parsed.errors.length > 0 || !parsed.model) {
  console.error('Ошибки импорта:', parsed.errors.slice(0, 5));
  process.exit(1);
}
ms('импорт parseStateYaml', 5, () => {
  const result = parseStateYaml(yaml);
  if (result.errors.length > 0) throw new Error('импорт с ошибками');
});

// Расчёты стоимости и покрытия (запускаются на каждое изменение проекта).
ms('recalcCosts', 5, () => recalcCosts(parsed.model!));
ms('recalcCoverage', 5, () => recalcCoverage(parsed.model!));

// Видимость и геометрия ЛГ.
ms('computeGroupVisibility', 5, () => computeGroupVisibility(parsed.model!.architecture));
const visibility = computeGroupVisibility(parsed.model!.architecture);
ms('computeGroupGeometry (оценки)', 5, () =>
  computeGroupGeometry(parsed.model!.architecture, null, visibility),
);

// Трассировка стрелок — основной кандидат на оптимизацию.
const rects = new Map<string, RouteRect>();
for (const block of parsed.model!.architecture.blocks) {
  rects.set(block.id, {
    x: block.position?.x ?? 0,
    y: block.position?.y ?? 0,
    width: NODE_ESTIMATED_WIDTH,
    height: NODE_ESTIMATED_HEIGHT,
  });
}
const edgeSpecs = parsed.model!.architecture.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));
const routingTime = ms('routeEdges (полный проход, 200 стрелок)', 5, () => {
  const output = routeEdges({ rects, edges: edgeSpecs });
  if (output.paths.size !== edgeSpecs.length) throw new Error('трассировка неполная');
});

// Свёртывание половины ЛГ: перенос связей + трассировка после свёртывания.
const collapsed = {
  ...parsed.model!,
  architecture: {
    ...parsed.model!.architecture,
    groups: (parsed.model!.architecture.groups ?? []).map((g, i) =>
      i % 2 === 0 ? { ...g, collapsed: true } : g,
    ),
  },
};
const visibility2 = computeGroupVisibility(collapsed.architecture);
ms('routeEdges после свёртывания половины ЛГ', 5, () => {
  const geometry = computeGroupGeometry(collapsed.architecture, null, visibility2);
  const rects2 = new Map<string, RouteRect>();
  for (const block of collapsed.architecture.blocks) {
    if (visibility2.hiddenBlocks.has(block.id)) continue;
    rects2.set(block.id, {
      x: block.position?.x ?? 0,
      y: block.position?.y ?? 0,
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    });
  }
  for (const [groupId, geo] of geometry) {
    if (geo.collapsed) rects2.set(groupId, geo.rect);
  }
  const remapped = collapsed.architecture.edges
    .map((edge) => {
      const from = visibility2.hiddenBlocks.has(edge.from)
        ? (visibility2.collapsedTarget.get(edge.from) ?? null)
        : edge.from;
      const to = visibility2.hiddenBlocks.has(edge.to)
        ? (visibility2.collapsedTarget.get(edge.to) ?? null)
        : edge.to;
      return { id: edge.id, from, to };
    })
    .filter((edge): edge is { id: string; from: string; to: string } =>
      edge.from !== null && edge.to !== null && edge.from !== edge.to,
    );
  const output = routeEdges({
    rects: rects2,
    edges: remapped.map((e) => ({ id: e.id, from: e.from, to: e.to })),
  });
  if (output.paths.size !== remapped.length) throw new Error('трассировка неполная');
});

console.log(`\nБюджеты запроса: импорт+первичная отрисовка ≤ 2000 мс, экспорт ≤ 1000 мс,`);
console.log(`сворачивание/разворачивание ЛГ ≤ 1000 мс (в браузере добавляется рендер React Flow).`);
console.log(`Полный проход трассировки: ${routingTime.toFixed(1)} мс — доля бюджета свёртывания.`);
