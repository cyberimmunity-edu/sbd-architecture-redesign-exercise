/**
 * Автоматическая раскладка доменов безопасности — v0.01.07, ЛГ — v0.03.01m.
 *
 * Принцип приблиён к Graphviz (dot): слоёная раскладка слева направо
 * с минимизацией пересечений и выравниванием доменов по связям.
 *
 * Алгоритм (детерминированный, без случайности):
 * 1. Слой домена = длина самого длинного пути от источников до домена
 *    по внутренним стрелкам (волны Кана); циклы разрываются детерминированно
 *    — как dot с обратными дугами: стрелка цикла от «позднего» домена к
 *    «раннему» рисуется встречной, а слои не раздуваются.
 *    1б (v0.03.01m): поддерево каждой корневой ЛГ выравнивается на один
 *    слой (максимальный в поддереве) — семья стоит одной колонкой, рамка
 *    ЛГ минимальной площади, без пустого места внутри.
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
 * 5. Логические группы учитываются геометрией (v0.03.01k):
 *    а) ЛГ-смежность — в каждой колонке члены одной ЛГ (поддерево её
 *    верхней группы) стоят подряд, не перемешиваясь с чужими доменами;
 *    б) уплотнение — члены одного юнита в колонке ставятся вплотную
 *    (зазор ROW_GAP), медианы соседних колонок не растягивают рамку ЛГ —
 *    площадь рамки минимальна при данной структуре потоков;
 *    в) разрешение наложений — охватывающие прямоугольники ЛГ (рамки
 *    считаются развёрнутыми) разводятся сдвигом поддерева вниз, если
 *    пересекают рамку другой ЛГ или чужой ДБ; полная вложенность (рамки
 *    предков и потомков, члены своего поддерева) наложением не считается.
 * 6. Внешние системы ставятся по обе стороны рамки периметра:
 *    преимущественно источники (стрелки в систему) — слева, преимущественно
 *    приёмники — справа; при равенстве доверенная внешняя система слева,
 *    недоверенная справа. По вертикали внешняя система тянется к средней
 *    вертикали связанных с ней доменов, совпадающие позиции раздвигаются.
 * 7. Габариты узлов берутся из sizes (измеренные размеры узлов канвы);
 *    без них — оценка 300×170 (NODE_ESTIMATED_*).
 *
 * Функция чистая: архитектура не изменяется, возвращается новый словарь
 * позиций. Ручная раскладка не теряется — применение раскладки оформлено
 * как операция с историей (applyAutoLayout в projectStore), Ctrl+Z возвращает
 * прежние позиции.
 */

import type { Architecture } from './types';
import { FRAME_PADDING, NODE_ESTIMATED_HEIGHT, NODE_ESTIMATED_WIDTH } from './trust';
import {
  computeGroupGeometry,
  computeGroupVisibility,
  groupAncestors,
  groupSubtree,
  subtreeBlockIds,
  type LgRect,
} from './groups';

/** Зазор между колонками слоёв, px. */
const COLUMN_GAP = 120;
/** Зазор между доменами одного слоя по вертикали, px. */
export const ROW_GAP = 64;
/** Зазор между полосами слоёв по вертикали (v0.03.01i), px. */
const BAND_GAP = 120;
/** Зазор между рамками разных ЛГ и чужими ДБ при раскладке (v0.03.01k), px. */
const LG_LAYOUT_GAP = 24;
/** Предохранительный предел проходов разрешения наложений ЛГ (v0.03.01k). */
const LG_RESOLVE_PASSES = 12;
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
  architecture: Pick<Architecture, 'blocks' | 'edges' | 'groups'>,
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

  // Ключ «юнита» раскладки (v0.03.01k): верхняя ЛГ цепочки предков или сам
  // домен (несгруппированный). Члены одного юнита держатся вместе в колонках
  // — рамки ЛГ не перемешиваются с чужими доменами.
  const groupsAll = architecture.groups ?? [];
  const knownGroupIds = new Set(groupsAll.map((g) => g.id));
  const rootGroupOfBlock = new Map<string, string>();
  for (const block of internal) {
    if (!block.groupId || !knownGroupIds.has(block.groupId)) continue;
    const chain = groupAncestors(groupsAll, block.groupId);
    rootGroupOfBlock.set(block.id, chain.length > 0 ? chain[chain.length - 1] : block.groupId);
  }
  const unitOf = (id: string): string => rootGroupOfBlock.get(id) ?? `blk:${id}`;

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

  // 1б. Свёртка ЛГ в один слой (v0.03.01m): поддерево каждой КОРНЕВОЙ ЛГ
  //     (семья — корень с вложенными ЛГ) выравнивается на максимальный слой
  //     своих членов. Раньше слои членов определялись только потоками, члены
  //     одной ЛГ расходились по разным колонкам, рамка охватывала несколько
  //     колонок с пустым местом внутри (охват — от крайней до крайней),
  //     периметр растягивался и навигация усложнялась. Теперь семья стоит
  //     одной колонкой (члены — вплотную, стадия 3), площадь рамки
  //     минимальна: ширина = колонка + отступы рамки. Стрелки из внешних
  //     доменов в свёрнутую семью удлиняются (несколько колонок) —
  //     приемлемая цена за компактность; обратные дуги циклов не
  //     добавляются: выравнивание только ВПРАВО (на max).
  if (rootGroupOfBlock.size > 0) {
    for (const group of groupsAll) {
      // Только корни семьи: вложенные выравниваются вместе с корнем
      // (рамка потомка остаётся внутри рамки предка).
      if (group.parentId && knownGroupIds.has(group.parentId)) continue;
      const members = subtreeBlockIds(
        { blocks: architecture.blocks, groups: groupsAll },
        group.id,
      ).filter((id) => internalIds.has(id));
      if (members.length === 0) continue;
      const target = Math.max(...members.map((id) => layerOf.get(id) ?? 0));
      for (const id of members) layerOf.set(id, target);
    }
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

  // 2б. ЛГ-смежность в колонке (v0.03.01k): члены одной ЛГ — всё поддерево
  //     верхней группы — стоят в колонке подряд; иначе рамки ЛГ чередуются
  //     с чужими доменами и накладываются друг на друга. Юниты упорядочиваются
  //     по средней «строке» членов (барицентр юнита — продолжение проходов
  //     барицентров); при равенстве — юнит, начавшийся выше, затем ключ
  //     (детерминизм).
  //     Порядок внутри юнита — обход дерева ЛГ (v0.03.01m): прямые члены
  //     корня, затем поддерево каждой вложенной ЛГ сплошным прогоном
  //     (рекурсивно). Порядок барицентров перемешивал прогон семьи, вложенная
  //     рамка охватывала чужой член своей семьи между своими, и разрешение
  //     наложений (стадия 3в) раздвигало семью — внутри рамок оставалось
  //     пустое место, площадь росла.
  const dfsRankOf = new Map<string, number>();
  if (rootGroupOfBlock.size > 0) {
    let rank = 0;
    const walk = (groupId: string): void => {
      for (const id of internal
        .filter((b) => b.groupId === groupId)
        .map((b) => b.id)
        .sort()) {
        rank += 1;
        dfsRankOf.set(id, rank);
      }
      for (const child of groupsAll
        .filter((g) => g.parentId === groupId)
        .map((g) => g.id)
        .sort()) {
        walk(child);
      }
    };
    for (const root of groupsAll
      .filter((g) => !g.parentId || !knownGroupIds.has(g.parentId))
      .map((g) => g.id)
      .sort()) {
      walk(root);
    }
  }
  if (rootGroupOfBlock.size > 0) {
    for (const layer of layers) {
      const ids = columns.get(layer) ?? [];
      if (ids.length <= 1) continue;
      const stats = new Map<string, { sum: number; count: number; first: number }>();
      ids.forEach((id, row) => {
        const unit = unitOf(id);
        const entry = stats.get(unit);
        if (entry) {
          entry.sum += row;
          entry.count += 1;
        } else {
          stats.set(unit, { sum: row, count: 1, first: row });
        }
      });
      const units = [...stats.keys()].sort((a, b) => {
        const ua = stats.get(a)!;
        const ub = stats.get(b)!;
        const diff = ua.sum / ua.count - ub.sum / ub.count;
        return diff !== 0 ? diff : ua.first - ub.first || a.localeCompare(b);
      });
      const ordered: string[] = [];
      for (const unit of units) {
        const members = ids.filter((id) => unitOf(id) === unit);
        // Внутри юнита — обход дерева ЛГ: вложенная ЛГ — сплошной прогон,
        // её рамка не содержит чужих членов своей семьи.
        members.sort((a, b) => {
          const ra = dfsRankOf.get(a) ?? Number.MAX_SAFE_INTEGER;
          const rb = dfsRankOf.get(b) ?? Number.MAX_SAFE_INTEGER;
          return ra - rb || a.localeCompare(b);
        });
        ordered.push(...members);
      }
      columns.set(layer, ordered);
    }
    setRows();
  }

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
  // тоже), остаётся гарантировать минимальный зазор. Члены одного юнита
  // ставятся вплотную (v0.03.01k): тяга медиан соседних колонок не раздвигает
  // члены ЛГ — площадь рамки минимальна при данной структуре потоков.
  for (const layer of layers) {
    let prevBottom = -Infinity;
    let prevUnit: string | null = null;
    for (const id of columns.get(layer) ?? []) {
      const height = sizeOf(id).height;
      const unit = unitOf(id);
      const desired = unit === prevUnit ? -Infinity : crossOf.get(id) ?? ORIGIN;
      const cross = Math.max(desired, prevBottom + ROW_GAP);
      crossOf.set(id, cross);
      prevBottom = cross + height;
      prevUnit = unit;
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

  // 3в. Разрешение наложений рамок ЛГ (v0.03.01k): слоёная раскладка не
  //     гарантирует непересечения охватывающих прямоугольников ЛГ (рамка
  //     охватывает члены в нескольких колонках). Рамки разных ЛГ и чужие
  //     ДБ разводятся сдвигом поддерева вниз; полная вложенность разрешена.
  resolveGroupOverlaps(architecture, positions, sizeOf);

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

/** Элемент прохода разрешения наложений: рамка ЛГ или несгруппированный ДБ. */
interface ResolveItem {
  id: string;
  /** id ЛГ; null — несгруппированный ДБ (двигается сам). */
  group: string | null;
  /** Корневая ЛГ двигает всё поддерево; вложенная — только своё. */
  root: boolean;
  /** С непустым поддеревом двигается; пустая ЛГ — статичный якорь. */
  movable: boolean;
}

/**
 * Разрешение наложений рамок ЛГ после слоёной раскладки (v0.03.01k).
 *
 * Охватывающий прямоугольник ЛГ строится по членам в нескольких колонках,
 * поэтому рамки разных ЛГ (и рамка поверх чужого ДБ) могут пересекаться,
 * хотя сами домены пересечений не имеют. Размещение — сверху вниз по
 * текущим позициям: уже размещённый элемент — препятствие для следующих,
 * ещё не размещённый уступит сам при своём размещении (пуш против позиций,
 * которые ещё изменятся в этом же проходе, даёт взаимные «догонялки» семей
 * и расходимость). Подвижные единицы:
 *
 * 1. рамка-КОРЕНЬ («семья») — переезжает со всем поддеревом (вложенные
 *    рамки и члены едут вместе с корнем — жёсткая вложенность, как при
 *    переносе родителя, Ф-78); соперничает с другими корнями,
 *    несгруппированными ДБ и статичными якорями;
 * 2. рамка вложенной ЛГ — соперничает только с рамками соседей и членами
 *    своей семьи вне своего поддерева (конфликт с чужой семьёй —
 *    ответственность её корня; выросший от сдвига потомка охват предка
 *    гасится на следующем проходе — семья переедет целиком);
 * 3. несгруппированный ДБ — двигается сам.
 *
 * Каждый элемент сдвигается вниз на минимальную величину, уводящую его
 * прямоугольник из всех наложений по вертикали (с зазором LG_LAYOUT_GAP);
 * полная вложенность (рамки предков и потомков, члены своего поддерева)
 * наложением не считается. Пустые ЛГ (нет членов — двигать нечего) —
 * статичные якоря-препятствия. Раскладка считается для развёрнутого
 * состояния всех ЛГ: свёрнутая плашка встаёт в угол охвата членов и при
 * последующем разворачивании соседей не перекрывает. Сдвиги только вниз,
 * координаты растут монотонно — проходы сходятся; предохранительный
 * предел — LG_RESOLVE_PASSES. Позиции изменяются на месте (positions —
 * внутренний словарь computeAutoLayout). Экспортируется для тестов
 * (tests/unit/layout.test.ts).
 */
export function resolveGroupOverlaps(
  architecture: Pick<Architecture, 'blocks' | 'edges' | 'groups'>,
  positions: Map<string, LayoutPosition>,
  sizeOf: (id: string) => LayoutSize,
): void {
  const groups = architecture.groups ?? [];
  if (groups.length === 0) return;

  // Видимость и геометрия для развёрнутого состояния всех ЛГ.
  const expandedArch: Pick<Architecture, 'blocks' | 'groups'> = {
    ...architecture,
    groups: groups.map((g) => ({ ...g, collapsed: false })),
  };
  const visibility = computeGroupVisibility(expandedArch);
  const liveRects = new Map<string, LgRect>();
  for (const [id, position] of positions) {
    const size = sizeOf(id);
    liveRects.set(id, { x: position.x, y: position.y, width: size.width, height: size.height });
  }

  // Поддеревья каждой ЛГ: блоки (сдвиг, исключения) и группы (исключения),
  // цепочка предков (рамки предков — не препятствие для потомка).
  const subtreeBlocksOf = new Map<string, Set<string>>();
  const subtreeGroupsOf = new Map<string, Set<string>>();
  const ancestorsOf = new Map<string, Set<string>>();
  for (const group of groups) {
    subtreeBlocksOf.set(group.id, new Set(subtreeBlockIds(expandedArch, group.id)));
    subtreeGroupsOf.set(group.id, new Set(groupSubtree(groups, group.id)));
    ancestorsOf.set(group.id, new Set(groupAncestors(groups, group.id)));
  }
  const knownGroupIds = new Set(groups.map((g) => g.id));
  const groupedBlocks = new Set(
    architecture.blocks
      .filter((b) => b.groupId && knownGroupIds.has(b.groupId))
      .map((b) => b.id),
  );

  // Корень семьи для каждой ЛГ и каждого сгруппированного ДБ (чужие семьи
  // друг с другом не соперничают на уровне вложенных рамок — накрываются
  // конфликтом корней, см. правила препятствий ниже).
  const familyRootOfGroup = new Map<string, string>();
  for (const group of groups) {
    const chain = groupAncestors(groups, group.id);
    familyRootOfGroup.set(group.id, chain.length > 0 ? chain[chain.length - 1] : group.id);
  }
  const familyRootOfBlock = new Map<string, string>();
  for (const block of architecture.blocks) {
    if (!block.groupId || !knownGroupIds.has(block.groupId)) continue;
    familyRootOfBlock.set(block.id, familyRootOfGroup.get(block.groupId)!);
  }

  // Сдвиг блоков вниз на dy (позиции + живые рамки).
  const shiftDown = (ids: Iterable<string>, dy: number): void => {
    for (const id of ids) {
      const position = positions.get(id);
      if (position) positions.set(id, { x: position.x, y: position.y + dy });
      const rect = liveRects.get(id);
      if (rect) liveRects.set(id, { ...rect, y: rect.y + dy });
    }
  };

  for (let pass = 0; pass < LG_RESOLVE_PASSES; pass += 1) {
    let geometry = computeGroupGeometry(expandedArch, liveRects, visibility);
    const rectOf = (item: ResolveItem): LgRect =>
      item.group ? geometry.get(item.id)!.rect : liveRects.get(item.id)!;

    // Элементы: рамки ЛГ (корневые и вложенные; пустые — статичные якоря)
    // и все внутренние ДБ (несгруппированные двигаются, сгруппированные —
    // статичные препятствия внутри своих семей). Порядок: сверху вниз,
    // затем слева направо, затем id (детерминизм).
    const items: ResolveItem[] = [];
    for (const group of groups) {
      items.push({
        id: group.id,
        group: group.id,
        root: !group.parentId,
        movable: subtreeBlocksOf.get(group.id)!.size > 0,
      });
    }
    for (const block of architecture.blocks) {
      if (block.external) continue;
      if (!liveRects.has(block.id)) continue;
      const grouped = groupedBlocks.has(block.id);
      items.push({ id: block.id, group: null, root: false, movable: !grouped });
    }
    items.sort((a, b) => {
      const ra = rectOf(a);
      const rb = rectOf(b);
      return ra.y - rb.y || ra.x - rb.x || a.id.localeCompare(b.id);
    });

    let pushed = false;
    // Размещение сверху вниз: уже размещённые элементы — препятствия,
    // ещё не размещённые уступят сами, когда до них дойдёт очередь.
    // Пуш против позиций, которые ещё изменятся в этом же проходе,
    // даёт взаимные догонялки семей — расходимость.
    const placed = new Set<ResolveItem>();
    for (const item of items) {
      if (!item.movable) continue;
      const itemRect = rectOf(item);
      const ownBlocks = item.group ? subtreeBlocksOf.get(item.group)! : null;
      const ownGroups = item.group ? subtreeGroupsOf.get(item.group)! : null;
      const itemAncestors = item.group ? ancestorsOf.get(item.group)! : null;
      let required = 0;
      const myRoot = item.group ? familyRootOfGroup.get(item.id) : undefined;
      for (const other of items) {
        if (other === item) continue;
        // Ещё не размещённый подвижный элемент — не препятствие: при своём
        // размещении он уступит всем уже размещённым. Исключение —
        // несгруппированный ДБ для рамки-корня: рамка уступает чужому ДБ
        // (он стоит в своём слоте потока, охват ЛГ — искусственный), а не
        // наоборот; циклов это не создаёт — ДБ не двигает семьи.
        if (
          other.movable &&
          !placed.has(other) &&
          !(item.root && other.group === null)
        ) {
          continue;
        }
        /* Правила препятствий.
         *
         * Рамка-КОРЕНЬ отвечает за внешний контур семьи: соперничает
         * с рамками других КОРНЕЙ, несгруппированными ДБ и якорями;
         * свои члены и свои вложенные рамки — своя вложенность, чужие
         * вложенные рамки сидят внутри своих корней (накрываются
         * конфликтом корней).
         *
         * Вложенная рамка соперничает только с элементами СВОЕЙ семьи
         * (рамки соседей и чужие ДБ вне своего поддерева): конфликт
         * с чужой семьей — ответственность её корня; иначе вырастающий
         * охват предка запускает встречные пуши семей — расходимся.
         *
         * Несгруппированный ДБ соперничает с корневыми рамками
         * (вложенные сидят внутри своих корней) и другими ДБ.
         */
        if (item.group) {
          if (other.group === null) {
            // ДБ: корень отвечает за внешний контур (несгруппированные и
            // чужие члены накрываются конфликтом корней); вложенная рамка
            // соперничает только с членами своей семьи вне своего поддерева.
            const otherRoot = familyRootOfBlock.get(other.id);
            if (item.root) {
              if (otherRoot === myRoot) continue; // свой член — своя вложенность
            } else {
              if (otherRoot !== myRoot) continue; // чужие ДБ — не соперники
              if (ownBlocks!.has(other.id)) continue; // свои члены
            }
          } else {
            if (familyRootOfGroup.get(other.id) !== myRoot) {
              if (!item.root || !other.root) continue; // только корень с корнем
            }
            if (ownGroups!.has(other.id) || itemAncestors!.has(other.id)) continue;
          }
        } else {
          // Несгруппированный ДБ: чужие/свои вложенные рамки и сгруппированные
          // ДБ накрываются рамкой их корня.
          if (other.group !== null && !other.root) continue;
          if (other.group === null && familyRootOfBlock.has(other.id)) continue;
        }
        const rect = rectOf(other);
        const overlapsY =
          itemRect.y < rect.y + rect.height + LG_LAYOUT_GAP &&
          itemRect.y + itemRect.height + LG_LAYOUT_GAP > rect.y;
        const overlapsX =
          itemRect.x < rect.x + rect.width && itemRect.x + itemRect.width > rect.x;
        if (overlapsY && overlapsX) {
          required = Math.max(required, rect.y + rect.height + LG_LAYOUT_GAP - itemRect.y);
        }
      }
      if (required > 0) {
        // Корневая ЛГ переезжает со всем поддеревом (семья жёстко), вложенная
        // — только со своим; ДБ — сам.
        shiftDown(ownBlocks ?? [item.id], required);
        pushed = true;
        // Рамки предков выросшего охвата пересчитываются до проверки
        // следующих элементов прохода.
        geometry = computeGroupGeometry(expandedArch, liveRects, visibility);
      }
      placed.add(item);
    }
    if (!pushed) break;
  }
}
