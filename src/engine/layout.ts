/**
 * Автоматическая раскладка доменов безопасности — v0.01.07.
 *
 * Принцип приблиён к Graphviz (dot): слоёная раскладка слева направо
 * с минимизацией пересечений и выравниванием доменов по связям.
 *
 * Алгоритм (детерминированный, без случайности):
 * 1. Слой домена = длина самого длинного пути от источников до домена
 *    по внутренним стрелкам (волны Кана); циклы разрываются детерминированно
 *    — как dot с обратными дугами: стрелка цикла от «позднего» домена к
 *    «раннему» рисуется встречной, а слои не раздуваются.
 * 2. Порядок в слое минимизирует пересечения стрелок: серия проходов
 *    барицентров вниз и вверх (как median/barycenter в dot); после каждого
 *    прохода считается число пересечений и сохраняется лучший порядок.
 * 3. Вертикальные координаты — не жёсткой решёткой, а выравниванием
 *    по связям (упрощённый метод Брандеса–Кёпфа из dot): четыре варианта
 *    однократного выравнивания (к предшественникам / к преемникам, каждый
 *    с верхней/нижней медианой), итоговая вертикаль узла — медиана
 *    вариантов, затем разрешение наложений. Стрелки между соседними слоями
 *    выходят короткими и по возможности параллельными, ромбы — симметричными.
 * 4. Внешние системы ставятся по обе стороны рамки периметра:
 *    преимущественно источники (стрелки в систему) — слева, преимущественно
 *    приёмники — справа; при равенстве доверенная внешняя система слева,
 *    недоверенная справа. По вертикали внешняя система тянется к средней
 *    вертикали связанных с ней доменов, совпадающие позиции раздвигаются.
 * 5. Габариты узлов берутся из sizes (измеренные размеры узлов канвы);
 *    без них — оценка 300×170 (NODE_ESTIMATED_*).
 *
 * Функция чистая: архитектура не изменяется, возвращается новый словарь
 * позиций. Ручная раскладка не теряется — применение раскладки оформлено
 * как операция с историей (applyAutoLayout в projectStore), Ctrl+Z возвращает
 * прежние позиции.
 */

import type { Architecture } from './types';
import { FRAME_PADDING, NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from './trust';

/** Зазор между колонками слоёв, px. */
const COLUMN_GAP = 120;
/** Зазор между доменами одного слоя по вертикали, px. */
const ROW_GAP = 64;
/** Координата левого верхнего угла области раскладки, px. */
const ORIGIN = 80;
/** Отступ внешних систем от рамки периметра, px (с каждой стороны). */
const EXTERNAL_GAP = 90;
/** Число проходов минимизации пересечений (вниз + вверх = один проход). */
const ORDER_SWEEPS = 6;

/** Позиция узла канвы. */
export interface LayoutPosition {
  x: number;
  y: number;
}

/** Габариты узла для раскладки. */
export interface LayoutSize {
  width: number;
  height: number;
}

/** Опции раскладки: измеренные размеры узлов канвы (если известны). */
export interface AutoLayoutOptions {
  /** Реальные габариты узлов; отсутствие — оценка 300×170. */
  sizes?: Map<string, LayoutSize>;
}

/** Число пересечений стрелок между соседними слоями при данном порядке. */
function countCrossings(
  layers: number[],
  columns: Map<number, string[]>,
  layerOf: Map<string, number>,
  successors: Map<string, string[]>,
  rowOf: Map<string, number>,
): number {
  let total = 0;
  for (let i = 0; i < layers.length - 1; i += 1) {
    const fromLayer = layers[i];
    const pairs: Array<[number, number]> = [];
    for (const u of columns.get(fromLayer) ?? []) {
      for (const v of successors.get(u) ?? []) {
        if (layerOf.get(v) === fromLayer + 1) {
          pairs.push([rowOf.get(u) ?? 0, rowOf.get(v) ?? 0]);
        }
      }
    }
    for (let a = 0; a < pairs.length; a += 1) {
      for (let b = a + 1; b < pairs.length; b += 1) {
        const [ra, rb] = pairs[a];
        const [sa, sb] = pairs[b];
        if ((ra - sa) * (rb - sb) < 0) total += 1;
      }
    }
  }
  return total;
}

/**
 * Автоматическая раскладка: позиции для каждого блока архитектуры
 * (внутренние домены — слоями внутри периметра, внешние системы —
 * по сторонам рамки). Возвращает пустой словарь для пустой архитектуры.
 */
export function computeAutoLayout(
  architecture: Pick<Architecture, 'blocks' | 'edges'>,
  options?: AutoLayoutOptions,
): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>();
  const internal = architecture.blocks.filter((b) => !b.external);
  const externals = architecture.blocks.filter((b) => b.external);
  if (internal.length === 0) {
    // Внутренних доменов нет: рамки периметра не существует — внешние
    // системы не перемещаем, чтобы не разрушать ручную раскладку.
    return positions;
  }

  const sizeOf = (id: string): LayoutSize =>
    options?.sizes?.get(id) ?? { width: NODE_ESTIMATED_WIDTH, height: NODE_ESTIMATED_HEIGHT };

  const internalIds = new Set(internal.map((b) => b.id));
  const externalIds = new Set(externals.map((b) => b.id));
  // Предшественники и преемники — только между внутренними доменами:
  // они управляют слоями, порядком и выравниванием.
  const incoming = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const block of internal) {
    incoming.set(block.id, []);
    successors.set(block.id, []);
  }
  for (const edge of architecture.edges) {
    if (edge.from === edge.to) continue;
    const inc = incoming.get(edge.to);
    if (inc && internalIds.has(edge.from)) inc.push(edge.from);
    const succ = successors.get(edge.from);
    if (succ && internalIds.has(edge.to)) succ.push(edge.to);
  }
  const sortedIds = internal.map((b) => b.id).sort();

  // 1. Слой = длина самого длинного пути от источников; циклы разрываются
  //    детерминированно (как dot с обратными дугами): раз в волне нет
  //    готовых узлов, размещается узел с наибольшим числом уже размещённых
  //    предшественников — его входящие стрелки от неразмещённых доменов
  //    станут единственными «обратными дугами» цикла, а слои не раздуваются.
  const layerOf = new Map<string, number>();
  const remaining = new Set(internalIds);
  let wave = 0;
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => (incoming.get(id) ?? []).every((pred) => !remaining.has(pred)))
      .sort((a, b) => a.localeCompare(b));
    let batch = ready;
    if (batch.length === 0) {
      // Цикл: разрываем на узле с наибольшим числом размещённых
      // предшественников; при равенстве — с наименьшим числом неразмещённых,
      // далее по идентификатору (детерминизм).
      const scored = [...remaining].map((id) => {
        const preds = incoming.get(id) ?? [];
        const done = preds.filter((pred) => !remaining.has(pred)).length;
        return { id, done, pending: preds.length - done };
      });
      scored.sort((a, b) => b.done - a.done || a.pending - b.pending || a.id.localeCompare(b.id));
      batch = [scored[0].id];
    }
    for (const id of batch) {
      layerOf.set(id, wave);
      remaining.delete(id);
    }
    wave += 1;
  }

  // 2. Порядок в колонках: старт — по идентификатору (детерминизм),
  //    затем проходы барицентров вниз/вверх; сохраняется порядок
  //    с наименьшим числом пересечений стрелок.
  const columns = new Map<number, string[]>();
  for (const id of sortedIds) {
    const layer = layerOf.get(id) ?? 0;
    const column = columns.get(layer);
    if (column) column.push(id);
    else columns.set(layer, [id]);
  }
  const layers = [...columns.keys()].sort((a, b) => a - b);
  const rowOf = new Map<string, number>();
  const setRows = (): void => {
    for (const ids of columns.values()) {
      ids.forEach((id, index) => rowOf.set(id, index));
    }
  };
  setRows();

  const barycenter = (id: string, neighbors: string[]): number => {
    if (neighbors.length === 0) return rowOf.get(id) ?? 0; // без соседей — на месте
    let sum = 0;
    for (const from of neighbors) sum += rowOf.get(from) ?? 0;
    return sum / neighbors.length;
  };

  const sweepOnce = (): void => {
    // Вниз: колонка упорядочивается по средней строке предшественников.
    for (const layer of layers) {
      if (layer === layers[0]) continue;
      const ordered = [...(columns.get(layer) ?? [])].sort((a, b) => {
        const diff = barycenter(a, incoming.get(a) ?? []) - barycenter(b, incoming.get(b) ?? []);
        return diff !== 0 ? diff : a.localeCompare(b);
      });
      columns.set(layer, ordered);
      ordered.forEach((id, index) => rowOf.set(id, index));
    }
    // Вверх: колонка упорядочивается по средней строке преемников.
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (i === layers.length - 1) continue;
      const ordered = [...(columns.get(layer) ?? [])].sort((a, b) => {
        const diff = barycenter(a, successors.get(a) ?? []) - barycenter(b, successors.get(b) ?? []);
        return diff !== 0 ? diff : a.localeCompare(b);
      });
      columns.set(layer, ordered);
      ordered.forEach((id, index) => rowOf.set(id, index));
    }
  };

  let bestCrossings = countCrossings(layers, columns, layerOf, successors, rowOf);
  let bestColumns = new Map([...columns.entries()].map(([k, v]) => [k, [...v]]));
  for (let sweep = 0; sweep < ORDER_SWEEPS && bestCrossings > 0; sweep += 1) {
    sweepOnce();
    const crossings = countCrossings(layers, columns, layerOf, successors, rowOf);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      bestColumns = new Map([...columns.entries()].map(([k, v]) => [k, [...v]]));
    }
  }
  for (const [layer, ids] of bestColumns) columns.set(layer, ids);
  setRows();

  // 3. Координаты (v0.01.07, упрощённый метод Брандеса–Кёпфа): четыре
  //    варианта однократного выравнивания — к предшественникам слева направо
  //    и к преемникам справа налево, каждый с верхней/нижней медианой —
  //    без обратной связи; итоговая вертикаль узла — медиана четырёх
  //    вариантов (как в dot), затем разрешение наложений с сохранением
  //    порядка колонки. Ромб ложится симметрично, цепочка — в одну строку.
  let x = ORIGIN;
  const columnX = new Map<number, number>();
  for (const layer of layers) {
    const width = Math.max(...(columns.get(layer) ?? []).map((id) => sizeOf(id).width), 1);
    columnX.set(layer, x);
    x += width + COLUMN_GAP;
  }
  const variantYs = new Map<string, number[]>();
  const medianCenter = (centers: number[], pick: 'upper' | 'lower'): number => {
    const sorted = [...centers].sort((a, b) => a - b);
    if (sorted.length % 2 === 1) return sorted[(sorted.length - 1) / 2];
    return pick === 'upper' ? sorted[sorted.length / 2] : sorted[sorted.length / 2 - 1];
  };
  // Один вариант: колонки обходятся в одну сторону (без обратной связи);
  // узел тянется к медиане вертикалей уже размещённых соседей, наложения
  // разрешаются с сохранением порядка строки.
  const buildVariant = (alignTo: 'preds' | 'succs', pick: 'upper' | 'lower'): void => {
    const ys = new Map<string, number>();
    const orderedColumns = alignTo === 'preds' ? layers : [...layers].reverse();
    for (const layer of orderedColumns) {
      const ids = columns.get(layer) ?? [];
      // Базовая линия колонки — сетка строк (для узлов без размещённых соседей).
      let baselineY = ORIGIN;
      const baselines = new Map<string, number>();
      for (const id of ids) {
        baselines.set(id, baselineY);
        baselineY += sizeOf(id).height + ROW_GAP;
      }
      let prevBottom = -Infinity;
      for (const id of ids) {
        const height = sizeOf(id).height;
        const neighborIds = alignTo === 'preds' ? (incoming.get(id) ?? []) : (successors.get(id) ?? []);
        const placedCenters: number[] = [];
        for (const neighbor of neighborIds) {
          const neighborY = ys.get(neighbor);
          if (neighborY !== undefined) {
            placedCenters.push(neighborY + sizeOf(neighbor).height / 2);
          }
        }
        const desired = placedCenters.length > 0
          ? medianCenter(placedCenters, pick) - height / 2
          : baselines.get(id) ?? ORIGIN;
        const y = Math.max(desired, prevBottom + ROW_GAP);
        ys.set(id, y);
        prevBottom = y + height;
      }
    }
    for (const [id, y] of ys) {
      const list = variantYs.get(id);
      if (list) list.push(y);
      else variantYs.set(id, [y]);
    }
  };
  buildVariant('preds', 'lower');
  buildVariant('preds', 'upper');
  buildVariant('succs', 'lower');
  buildVariant('succs', 'upper');
  for (const layer of layers) {
    for (const id of columns.get(layer) ?? []) {
      const values = [...(variantYs.get(id) ?? [ORIGIN])].sort((a, b) => a - b);
      const mid = values.length % 2 === 1
        ? values[(values.length - 1) / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
      positions.set(id, { x: columnX.get(layer) ?? ORIGIN, y: mid });
    }
  }
  // Финальное разрешение наложений: медианы сохраняют порядок колонок
  // (каждый вариант сохраняет порядок — средние двух упорядоченных списков
  // тоже), остаётся гарантировать минимальный зазор.
  for (const layer of layers) {
    let prevBottom = -Infinity;
    for (const id of columns.get(layer) ?? []) {
      const height = sizeOf(id).height;
      const current = positions.get(id)!;
      const y = Math.max(current.y, prevBottom + ROW_GAP);
      positions.set(id, { x: current.x, y });
      prevBottom = y + height;
    }
  }

  // 4. Внешние системы по сторонам рамки: источники стрелок — слева,
  //    приёмники — справа; при равенстве доверенная — слева.
  const bounds = frameRect(positions, internalIds, sizeOf);
  const neighborsOfExternal = new Map<string, string[]>();
  for (const edge of architecture.edges) {
    const push = (id: string, other: string) => {
      const list = neighborsOfExternal.get(id);
      if (list) list.push(other);
      else neighborsOfExternal.set(id, [other]);
    };
    if (internalIds.has(edge.from) && externalIds.has(edge.to)) push(edge.to, edge.from);
    if (internalIds.has(edge.to) && externalIds.has(edge.from)) push(edge.from, edge.to);
  }
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const edge of architecture.edges) {
    // Исходящие из внешней системы (источники) и входящие в неё (приёмники).
    if (externalIds.has(edge.from) && internalIds.has(edge.to)) {
      outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    }
    if (externalIds.has(edge.to) && internalIds.has(edge.from)) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }
  const desiredY = (id: string): number => {
    const neighbors = neighborsOfExternal.get(id) ?? [];
    const height = sizeOf(id).height;
    if (neighbors.length === 0) return ORIGIN;
    let sum = 0;
    for (const neighbor of neighbors) {
      const position = positions.get(neighbor);
      sum += (position ? position.y : ORIGIN) + sizeOf(neighbor).height / 2;
    }
    return Math.max(ORIGIN, sum / neighbors.length - height / 2);
  };
  const leftGroup: string[] = [];
  const rightGroup: string[] = [];
  for (const block of [...externals].sort((a, b) => a.id.localeCompare(b.id))) {
    const out = outDegree.get(block.id) ?? 0;
    const inc = inDegree.get(block.id) ?? 0;
    const toLeft = out > inc || (out === inc && (block.trusted ?? false));
    (toLeft ? leftGroup : rightGroup).push(block.id);
  }
  const placeExternals = (ids: string[], sideX: number): void => {
    ids.sort((a, b) => desiredY(a) - desiredY(b) || a.localeCompare(b));
    let lastBottom = -Infinity;
    for (const id of ids) {
      const height = sizeOf(id).height;
      const y = Math.max(desiredY(id), lastBottom + ROW_GAP);
      positions.set(id, { x: sideX, y });
      lastBottom = y + height;
    }
  };
  if (leftGroup.length > 0) {
    const width = Math.max(...leftGroup.map((id) => sizeOf(id).width));
    placeExternals(
      leftGroup,
      bounds.minX - FRAME_PADDING - EXTERNAL_GAP - width,
    );
  }
  if (rightGroup.length > 0) {
    placeExternals(rightGroup, bounds.maxRight + FRAME_PADDING + EXTERNAL_GAP);
  }

  // 5. Нормировка: при внешних системах слева вся диаграмма сдвигается
  //    так, чтобы левый край остался в области раскладки (≥ ORIGIN).
  let minX = Infinity;
  for (const position of positions.values()) minX = Math.min(minX, position.x);
  if (minX < ORIGIN) {
    const shift = ORIGIN - minX;
    for (const [id, position] of positions) {
      positions.set(id, { x: position.x + shift, y: position.y });
    }
  }

  return positions;
}

/** Границы внутренних доменов (для позиционирования внешних систем). */
function frameRect(
  positions: Map<string, LayoutPosition>,
  internalIds: Set<string>,
  sizeOf: (id: string) => LayoutSize,
): { minX: number; maxRight: number } {
  let minX = Infinity;
  let maxRight = -Infinity;
  for (const id of internalIds) {
    const position = positions.get(id);
    if (!position) continue;
    minX = Math.min(minX, position.x);
    maxRight = Math.max(maxRight, position.x + sizeOf(id).width);
  }
  if (!Number.isFinite(minX)) {
    minX = ORIGIN;
    maxRight = ORIGIN + NODE_ESTIMATED_WIDTH;
  }
  return { minX, maxRight };
}
