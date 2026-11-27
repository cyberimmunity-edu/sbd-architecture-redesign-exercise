/**
 * Тест производительности движка на большой модели (v0.03.01j): 50 ДБ,
 * 20 ЛГ, 200 связей, 5 внешних систем. Бюджеты запроса:
 *   - экспорт ≤ 1 с;
 *   - импорт ≤ 1,5 с (бюджет пользователя 2 с — с первичной отрисовкой);
 *   - полная трассировка ≤ 1,5 с (входит в импорт и первичный рендер);
 *   - свёртывание ЛГ (движок: геометрия + перенос связей + частичная
 *     трассировка затронутых стрелок) ≤ 1 с;
 *   - видимость и геометрия ЛГ ≤ 100 мс.
 * Частичная трассировка (кэш routeEdges) — ключ к бюджету свёртывания:
 * полный проход на 200 стрелках заведомо больше 1 с.
 */

import { describe, expect, it } from 'vitest';
import { parseStateYaml, serializeStateYaml } from '@/io';
import { routeEdges, accumulateRoutePenalty, createRoutePenalty, type RoutePoint, type RouteRect } from '@/engine/edgeRouting';
import { computeGroupVisibility, computeGroupGeometry } from '@/engine/groups';
import { NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from '@/engine/trust';
import {
  buildLargeProject,
  PERF_EDGE_COUNT,
  PERF_EXTERNAL_COUNT,
  PERF_GROUP_COUNT,
  PERF_INTERNAL_COUNT,
} from '../perf/largeModel';

const model = buildLargeProject();

function rectsOf(model: ReturnType<typeof buildLargeProject>): Map<string, RouteRect> {
  const rects = new Map<string, RouteRect>();
  for (const block of model.architecture.blocks) {
    rects.set(block.id, {
      x: block.position?.x ?? 0,
      y: block.position?.y ?? 0,
      width: NODE_ESTIMATED_WIDTH,
      height: NODE_ESTIMATED_HEIGHT,
    });
  }
  return rects;
}

describe('Производительность движка: 50 ДБ, 20 ЛГ, 200 связей, 5 внешних (v0.03.01j)', () => {
  it('модель соответствует масштабу запроса и читается/пишется без потерь', () => {
    expect(model.architecture.blocks.filter((b) => !b.external)).toHaveLength(PERF_INTERNAL_COUNT);
    expect(model.architecture.blocks.filter((b) => b.external)).toHaveLength(PERF_EXTERNAL_COUNT);
    expect(model.architecture.edges).toHaveLength(PERF_EDGE_COUNT);
    expect(model.architecture.groups).toHaveLength(PERF_GROUP_COUNT);
    const yaml = serializeStateYaml(model);
    const parsed = parseStateYaml(yaml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.model!.architecture.blocks).toHaveLength(model.architecture.blocks.length);
    expect(parsed.model!.architecture.edges).toHaveLength(PERF_EDGE_COUNT);
    expect(parsed.model!.architecture.groups).toHaveLength(PERF_GROUP_COUNT);
  });

  it('экспорт state.yaml — не более 1 секунды', () => {
    const t0 = performance.now();
    const yaml = serializeStateYaml(model);
    const elapsed = performance.now() - t0;
    expect(yaml.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThanOrEqual(1000);
  });

  it('импорт state.yaml — не более 1,5 секунд (бюджет пользователя 2 с — с отрисовкой)', () => {
    const yaml = serializeStateYaml(model);
    const t0 = performance.now();
    const parsed = parseStateYaml(yaml);
    const elapsed = performance.now() - t0;
    expect(parsed.errors).toEqual([]);
    expect(elapsed).toBeLessThanOrEqual(1500);
  });

  it('полная трассировка 200 стрелок — не более 1,5 секунд (входит в первичный рендер)', () => {
    const rects = rectsOf(model);
    const edges = model.architecture.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));
    const t0 = performance.now();
    const output = routeEdges({ rects, edges });
    const elapsed = performance.now() - t0;
    expect(output.paths.size).toBe(PERF_EDGE_COUNT);
    expect(elapsed).toBeLessThanOrEqual(1500);
  });

  it('свёртывание половины ЛГ (движок: геометрия, перенос связей, частичная трассировка) — не более 1 секунды', () => {
    const rects = rectsOf(model);
    const edges = model.architecture.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));
    // Тёплый кэш: полный проход перед свёртыванием (как на канве после импорта).
    const warm = routeEdges({ rects, edges });

    // Свёртывание каждой второй ЛГ.
    const collapsedModel = {
      ...model,
      architecture: {
        ...model.architecture,
        groups: (model.architecture.groups ?? []).map((g, i) =>
          i % 2 === 0 ? { ...g, collapsed: true } : g,
        ),
      },
    };
    const t0 = performance.now();
    // 1. Видимость и геометрия рамок.
    const visibility = computeGroupVisibility(collapsedModel.architecture);
    const geometry = computeGroupGeometry(collapsedModel.architecture, null, visibility);
    // 2. Прямоугольники канвы после свёртывания: скрытые ДБ уходят,
    //    свёрнутые блоки ЛГ добавляются.
    const collapsedRects = new Map<string, RouteRect>();
    for (const [id, rect] of rects) {
      if (!visibility.hiddenBlocks.has(id)) collapsedRects.set(id, rect);
    }
    for (const [groupId, item] of geometry) {
      if (item.collapsed) collapsedRects.set(groupId, item.rect);
    }
    // 3. Затронутые стрелки: перенесённые концы + концы в изменившихся
    //    прямоугольниках + пути через изменившиеся прямоугольники (канва).
    const changedIds = new Set<string>();
    for (const id of visibility.hiddenBlocks) changedIds.add(id);
    for (const [groupId, item] of geometry) if (item.collapsed) changedIds.add(groupId);
    const rerouteIds = new Set<string>();
    for (const edge of collapsedModel.architecture.edges) {
      const from = visibility.hiddenBlocks.has(edge.from)
        ? (visibility.collapsedTarget.get(edge.from) ?? null)
        : edge.from;
      const to = visibility.hiddenBlocks.has(edge.to)
        ? (visibility.collapsedTarget.get(edge.to) ?? null)
        : edge.to;
      if (from === null || to === null || from === to) continue;
      if (from !== edge.from || to !== edge.to || changedIds.has(from) || changedIds.has(to)) {
        rerouteIds.add(edge.id);
        continue;
      }
      const path = warm.paths.get(edge.id);
      if (!path) continue;
      for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const crosses = [...changedIds].some((id) => {
          const rect = collapsedRects.get(id);
          if (!rect) return false;
          return (
            minX <= rect.x + rect.width + 24 &&
            maxX >= rect.x - 24 &&
            minY <= rect.y + rect.height + 24 &&
            maxY >= rect.y - 24
          );
        });
        if (crosses) {
          rerouteIds.add(edge.id);
          break;
        }
      }
    }
    const visibleEdges = collapsedModel.architecture.edges
      .map((edge) => {
        const from = visibility.hiddenBlocks.has(edge.from)
          ? (visibility.collapsedTarget.get(edge.from) ?? null)
          : edge.from;
        const to = visibility.hiddenBlocks.has(edge.to)
          ? (visibility.collapsedTarget.get(edge.to) ?? null)
          : edge.to;
        return { id: edge.id, from, to };
      })
      .filter((edge): edge is { id: string; from: string; to: string } =>
        edge.from !== null && edge.to !== null && edge.from !== edge.to,
      );
    // 4. Частичная трассировка: кэш не затронутых стрелок + пересчёт затронутых.
    const output = routeEdges({
      rects: collapsedRects,
      edges: visibleEdges,
      cachedPaths: warm.paths,
      rerouteIds,
    });
    const elapsed = performance.now() - t0;
    // Все видимые стрелки после свёртывания имеют ломаные.
    expect(output.paths.size).toBe(visibleEdges.length);
    // Частичная трассировка дешевле полной (кэш работает).
    expect(rerouteIds.size).toBeLessThan(visibleEdges.length);
    expect(elapsed).toBeLessThanOrEqual(1000);
  });

  it('видимость и геометрия 20 ЛГ — не более 100 мс', () => {
    const t0 = performance.now();
    const visibility = computeGroupVisibility(model.architecture);
    const geometry = computeGroupGeometry(model.architecture, null, visibility);
    const elapsed = performance.now() - t0;
    expect(geometry.size).toBe(PERF_GROUP_COUNT);
    expect(elapsed).toBeLessThanOrEqual(100);
  });
});
