/**
 * Автоматическая раскладка доменов безопасности — v0.01.03.
 *
 * Раскладка повторяет принцип Flying Logic: домены выстраиваются слоями
 * по направлению стрелок — источники слева, домены-приёмники правее,
 * внутри рамки периметра целевой системы; внешние (смежные) системы
 * размещаются правее рамки, рядом с доменами, с которыми связаны.
 * Стрелки между соседними слоями идут слева направо по дугам
 * (кривизна параллельных стрелок разводится канвой — см. Canvas.tsx).
 *
 * Алгоритм (детерминированный, без случайности):
 * 1. Слой домена = длина самого длинного пути от источников до домена
 *    по внутренним стрелкам (итерационная релаксация «предшественники →
 *    приёмник»; у циклов слои выравниваются и ограничены числом доменов).
 * 2. Внутри слоя домены упорядочиваются по средней строке своих
 *    предшественников (barycenter, один проход) — меньше пересечений стрелок.
 * 3. Координаты: x = слой × шаг колонки, y = строка × шаг строки.
 * 4. Внешние системы: x — правее рамки периметра (frame.right + отступ),
 *    y — по средней вертикали связанных внутренних доменов; совпадающие
 *    позиции раздвигаются вниз.
 *
 * Функция чистая: архитектура не изменяется, возвращается новый словарь
 * позиций. Ручная раскладка не теряется — применение раскладки оформлено
 * как операция с историей (applyAutoLayout в projectStore), Ctrl+Z возвращает
 * прежние позиции.
 */

import type { Architecture } from './types';
import { FRAME_PADDING, NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from './trust';

/** Зазор между колонками слоёв, px. */
const COLUMN_GAP = 110;
/** Зазор между доменами одного слоя по вертикали, px. */
const ROW_GAP = 70;
/** Координата левого верхнего угла области раскладки, px. */
const ORIGIN = 80;
/** Отступ внешних систем от правой границы рамки периметра, px. */
const EXTERNAL_GAP = 80;

/** Позиция узла канвы. */
export interface LayoutPosition {
  x: number;
  y: number;
}

/**
 * Автоматическая раскладка: позиции для каждого блока архитектуры
 * (внутренние домены — слоями внутри периметра, внешние системы —
 * правее рамки). Возвращает пустой словарь для пустой архитектуры.
 */
export function computeAutoLayout(
  architecture: Pick<Architecture, 'blocks' | 'edges'>,
): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>();
  const internal = architecture.blocks.filter((b) => !b.external);
  const externals = architecture.blocks.filter((b) => b.external);
  if (internal.length === 0) {
    // Внутренних доменов нет: рамки периметра не существует — внешние
    // системы не перемещаем, чтобы не разрушать ручную раскладку.
    return positions;
  }

  const internalIds = new Set(internal.map((b) => b.id));
  // Предшественники — для упорядочивания колонок по центру тяжести (шаг 2).
  const incoming = new Map<string, string[]>();
  for (const block of internal) incoming.set(block.id, []);
  for (const edge of architecture.edges) {
    if (edge.from === edge.to) continue;
    const inc = incoming.get(edge.to);
    if (inc && internalIds.has(edge.from)) inc.push(edge.from);
  }
  const sortedIds = internal.map((b) => b.id).sort();

  // 1. Слой = длина самого длинного пути от источников (релаксация стрелок;
  //    у циклов слои перестают расти — глубина ограничена числом доменов).
  const depth = new Map<string, number>();
  for (const block of internal) depth.set(block.id, 0);
  const internalEdges = architecture.edges.filter(
    (edge) => edge.from !== edge.to && internalIds.has(edge.from) && internalIds.has(edge.to),
  );
  for (let pass = 0; pass < internal.length; pass += 1) {
    let changed = false;
    for (const edge of internalEdges) {
      const next = (depth.get(edge.from) ?? 0) + 1;
      if (next > internal.length) continue; // защита циклов: слой не растёт бесконечно
      if (next > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 2. Колонки по слоям; порядок в колонке — по средней строке предшественников.
  const columns = new Map<number, string[]>();
  for (const id of sortedIds) {
    const layer = depth.get(id) ?? 0;
    const column = columns.get(layer);
    if (column) column.push(id);
    else columns.set(layer, [id]);
  }
  const rowOf = new Map<string, number>();
  for (const ids of columns.values()) {
    ids.forEach((id, index) => rowOf.set(id, index));
  }
  const layers = [...columns.keys()].sort((a, b) => a - b);
  for (const layer of layers) {
    const barycenter = (id: string): number => {
      const preds = incoming.get(id) ?? [];
      if (preds.length === 0) return Number.MAX_SAFE_INTEGER; // без предшественников — в конец
      let sum = 0;
      for (const from of preds) sum += rowOf.get(from) ?? 0;
      return sum / preds.length;
    };
    const ordered = (columns.get(layer) ?? []).sort((a, b) => {
      const diff = barycenter(a) - barycenter(b);
      // Стабильность: при равном центре тяжести — по идентификатору.
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    ordered.forEach((id, index) => rowOf.set(id, index));
    columns.set(layer, ordered);
  }

  // 3. Координаты внутренних доменов.
  let maxRight = ORIGIN;
  for (const layer of layers) {
    const x = ORIGIN + layer * (NODE_ESTIMATED_WIDTH + COLUMN_GAP);
    const ids = columns.get(layer) ?? [];
    ids.forEach((id, row) => {
      positions.set(id, { x, y: ORIGIN + row * (NODE_ESTIMATED_HEIGHT + ROW_GAP) });
    });
    maxRight = Math.max(maxRight, x + NODE_ESTIMATED_WIDTH);
  }

  // 4. Внешние системы — правее рамки периметра (рамка охватывает внутренние
  //    домены с отступом FRAME_PADDING; справа до внешней системы — EXTERNAL_GAP).
  const externalX = maxRight + FRAME_PADDING + EXTERNAL_GAP;
  const neighborsOf = new Map<string, string[]>();
  for (const edge of architecture.edges) {
    const push = (id: string, other: string) => {
      const list = neighborsOf.get(id);
      if (list) list.push(other);
      else neighborsOf.set(id, [other]);
    };
    if (internalIds.has(edge.from) && externals.some((b) => b.id === edge.to)) {
      push(edge.to, edge.from);
    }
    if (internalIds.has(edge.to) && externals.some((b) => b.id === edge.from)) {
      push(edge.from, edge.to);
    }
  }
  let lastY = -Infinity;
  for (const block of [...externals].sort((a, b) => a.id.localeCompare(b.id))) {
    const neighbors = neighborsOf.get(block.id) ?? [];
    let y = ORIGIN;
    if (neighbors.length > 0) {
      let sum = 0;
      for (const id of neighbors) {
        const position = positions.get(id);
        // Центр связанного домена минус половина высоты внешней системы.
        sum += (position ? position.y : ORIGIN) + NODE_ESTIMATED_HEIGHT / 2;
      }
      y = sum / neighbors.length - NODE_ESTIMATED_HEIGHT / 2;
    }
    y = Math.max(ORIGIN, y);
    if (y - lastY < ROW_GAP) y = lastY + ROW_GAP; // совпавшие позиции раздвигаются
    lastY = y;
    positions.set(block.id, { x: externalX, y });
  }

  return positions;
}
