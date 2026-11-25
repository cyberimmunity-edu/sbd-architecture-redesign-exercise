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
 * 3. Поперечные координаты — не жёсткой решёткой, а выравниванием
 *    по связям (упрощённый метод Брандеса–Кёпфа из dot): четыре варианта
 *    однократного выравнивания (к предшественникам / к преемникам, каждый
 *    с верхней/нижней медианой), итоговая координата — медиана
 *    вариантов, затем разрешение наложений. Стрелки между соседними слоями
 *    выходят короткими и по возможности параллельными, ромбы — симметричными.
 * 4. Серпантинная упаковка слоёв в полосы (v0.03.01i): слои образуют ленту
 *    слева направо; когда лента вытягивается в длину (много слоёв, мало
 *    доменов в слое) и диаграмма теряет читаемость, лента заворачивается
 *    в несколько горизонтальных полос — полосы складываются по вертикали,
 *    нечётные рисуются зеркально («змейкой», как разворот строки текста),
 *    поэтому связи на стыке полос остаются короткими. Число слоёв в полосе
 *    выбирается перебором — так, чтобы итоговая пропорция (ширина к высоте,
 *    с учётом боков под внешние системы) была ближе всего к целевой.
 *    Ленты из трёх и менее слоёв не заворачиваются — поведение прежнее.
 * 5. Внешние системы ставятся по обе стороны рамки периметра:
 *    преимущественно источники (стрелки в систему) — слева, преимущественно
 *    приёмники — справа; при равенстве доверенная внешняя система слева,
 *    недоверенная справа. По вертикали внешняя система тянется к средней
 *    вертикали связанных с ней доменов, совпадающие позиции раздвигаются.
 * 6. Габариты узлов берутся из sizes (измеренные размеры узлов канвы);
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
/** Зазор между полосами слоёв по вертикали (v0.03.01i), px. */
const BAND_GAP = 120;
/** Целевое отношение ширины диаграммы к высоте при упаковке полос
 *  (v0.03.01i): слегка альбомное — под типовой экран. */
const TARGET_ASPECT = 1.6;
/** Минимальное число слоёв, при котором лента может заворачиваться
 *  в полосы (v0.03.01i); короткие ленты не заворачиваются. */
const MIN_LAYERS_FOR_BANDS = 4;
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

  // 3. Поперечные координаты (v0.01.07, упрощённый метод Брандеса–Кёпфа):
  //    четыре варианта однократного выравнивания — к предшественникам слева
  //    направо и к преемникам справа налево, каждый с верхней/нижней медианой —
  //    без обратной связи; итоговая поперечная координата узла — медиана
  //    четырёх вариантов (как в dot), затем разрешение наложений с сохранением
  //    порядка колонки. Ромб ложится симметрично, цепочка — в одну строку.
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
  const crossOf = new Map<string, number>();
  for (const layer of layers) {
    for (const id of columns.get(layer) ?? []) {
      const values = [...(variantYs.get(id) ?? [ORIGIN])].sort((a, b) => a - b);
      const mid = values.length % 2 === 1
        ? values[(values.length - 1) / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
      crossOf.set(id, mid);
    }
  }
  // Финальное разрешение наложений: медианы сохраняют порядок колонок
  // (каждый вариант сохраняет порядок — средние двух упорядоченных списков
  // тоже), остаётся гарантировать минимальный зазор.
  for (const layer of layers) {
    let prevBottom = -Infinity;
    for (const id of columns.get(layer) ?? []) {
      const height = sizeOf(id).height;
      const cross = Math.max(crossOf.get(id) ?? ORIGIN, prevBottom + ROW_GAP);
      crossOf.set(id, cross);
      prevBottom = cross + height;
    }
  }

  // Нормировка поперечных координат: верх области раскладки — ORIGIN
  // (медианы могли увести верхний край выше области).
  let minCross = Infinity;
  for (const cross of crossOf.values()) minCross = Math.min(minCross, cross);
  if (Number.isFinite(minCross) && minCross !== ORIGIN) {
    const shift = ORIGIN - minCross;
    for (const [id, cross] of crossOf) crossOf.set(id, cross + shift);
  }

  // Стороны внешних систем не зависят от позиций (только потоки стрелок
  // и доверие) — нужны заранее для оценки пропорций при упаковке полос.
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
  const leftGroup: string[] = [];
  const rightGroup: string[] = [];
  for (const block of [...externals].sort((a, b) => a.id.localeCompare(b.id))) {
    const out = outDegree.get(block.id) ?? 0;
    const inc = inDegree.get(block.id) ?? 0;
    const toLeft = out > inc || (out === inc && (block.trusted ?? false));
    (toLeft ? leftGroup : rightGroup).push(block.id);
  }
  const externalMaxWidth =
    externals.length > 0 ? Math.max(...externals.map((b) => sizeOf(b.id).width)) : 0;
  // Боковой запас под внешние системы (каждая занятая сторона рамки).
  const sideExtent =
    (leftGroup.length > 0 ? EXTERNAL_GAP + FRAME_PADDING + externalMaxWidth : 0) +
    (rightGroup.length > 0 ? EXTERNAL_GAP + FRAME_PADDING + externalMaxWidth : 0);

  // 3б. Серпантинная упаковка слоёв в полосы (v0.03.01i): слои образуют
  //    ленту слева направо; длинная лента (много слоёв, мало доменов
  //    в слое) заворачивается в несколько горизонтальных полос — ширина
  //    диаграммы становится сопоставима с высотой. Нечётные полосы
  //    рисуются зеркально («змейкой»), чтобы связи на стыке полос были
  //    короткими. Число слоёв в полосе — перебором: пропорция ближе всего
  //    к целевой; при равенстве побеждает меньше полос (меньше стыков).
  const columnWidth = new Map<number, number>();
  for (const layer of layers) {
    columnWidth.set(layer, Math.max(...(columns.get(layer) ?? []).map((id) => sizeOf(id).width), 1));
  }
  const layerBottom = (layer: number): number => {
    let bottom = ORIGIN;
    for (const id of columns.get(layer) ?? []) {
      bottom = Math.max(bottom, (crossOf.get(id) ?? ORIGIN) + sizeOf(id).height);
    }
    return bottom;
  };
  // Габариты диаграммы при заданном числе слоёв в полосе.
  const bandBounds = (size: number): { width: number; height: number } => {
    const count = Math.ceil(layers.length / size);
    let width = 0;
    let height = 0;
    for (let b = 0; b < count; b += 1) {
      const bandLayers = layers.slice(b * size, (b + 1) * size);
      let w = 0;
      let bottom = ORIGIN;
      for (const layer of bandLayers) {
        w += (columnWidth.get(layer) ?? 0) + COLUMN_GAP;
        bottom = Math.max(bottom, layerBottom(layer));
      }
      width = Math.max(width, w - COLUMN_GAP);
      height += bottom - ORIGIN + (b + 1 < count ? BAND_GAP : 0);
    }
    return { width, height };
  };
  let bandSize = layers.length; // одна лента — прежнее поведение
  if (layers.length >= MIN_LAYERS_FOR_BANDS) {
    const deviation = (size: number): number => {
      const { width, height } = bandBounds(size);
      const ratio = (width + sideExtent) / Math.max(height, 1);
      return Math.abs(Math.log(ratio) - Math.log(TARGET_ASPECT));
    };
    let best = deviation(bandSize);
    for (let candidate = bandSize - 1; candidate >= 1; candidate -= 1) {
      const candidateDeviation = deviation(candidate);
      if (candidateDeviation < best - 1e-9) {
        best = candidateDeviation;
        bandSize = candidate;
      }
    }
  }
  const bandCount = Math.ceil(layers.length / bandSize);
  // Смещения полос по поперечной оси, высоты и ширины полос.
  const bandOffset: number[] = [];
  const bandHeight: number[] = [];
  const bandWidth: number[] = [];
  let crossOffset = 0;
  for (let b = 0; b < bandCount; b += 1) {
    const bandLayers = layers.slice(b * bandSize, (b + 1) * bandSize);
    let bottom = ORIGIN;
    let w = 0;
    for (const layer of bandLayers) {
      bottom = Math.max(bottom, layerBottom(layer));
      w += (columnWidth.get(layer) ?? 0) + COLUMN_GAP;
    }
    bandOffset.push(crossOffset);
    bandHeight.push(bottom - ORIGIN);
    bandWidth.push(w - COLUMN_GAP);
    crossOffset += bottom - ORIGIN + BAND_GAP;
  }
  for (let b = 0; b < bandCount; b += 1) {
    const bandLayers = layers.slice(b * bandSize, (b + 1) * bandSize);
    const mirrored = b % 2 === 1;
    const top = ORIGIN + bandOffset[b];
    let localX = 0;
    for (const layer of bandLayers) {
      const width = columnWidth.get(layer) ?? 0;
      const layerX = ORIGIN + (mirrored ? bandWidth[b] - localX - width : localX);
      for (const id of columns.get(layer) ?? []) {
        const raw = crossOf.get(id) ?? ORIGIN;
        // Зеркалирование внутри полосы: ly' = h − ly − height, где ly —
        // локальная поперечная координата от верха полосы.
        const cross = mirrored
          ? top + bandHeight[b] + ORIGIN - raw - sizeOf(id).height
          : raw + bandOffset[b];
        positions.set(id, { x: layerX, y: cross });
      }
      localX += width + COLUMN_GAP;
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
