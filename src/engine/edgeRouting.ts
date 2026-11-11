/**
 * Трассировка стрелок с обходом доменов — v0.01.09.
 *
 * Штатные кривые Безье React Flow идут по прямой дуге от порта к порту
 * и при плотной раскладке пересекают чужие домены. Здесь форма стрелки
 * рассчитывается так, чтобы обойти промежуточные домены по свободным
 * сторонам (как во Flying Logic), с приоритетом длинных прямых участков:
 *
 * 1. Прямой отрезок «порт → порт» проверяется на пересечение с прямоугольниками
 *    доменов, расширенными на отступ pad; если пересечений нет — стрелка прямая.
 * 2. Ортогональные кандидаты (v0.01.09): ходы с двумя поворотами через
 *    свободные вертикальные/горизонтальные зазоры между препятствиями
 *    (границы препятствий ± 2 px, середина между портами, сами порты —
 *    вырождаются в Г-образный ход с одним поворотом). Кандидаты упорядочены
 *    по близости изгиба к середине и оси пары портов; из свободных
 *    выбирается ход с наименьшим «пробегом» по чужим коридорам
 *    (penaltyExposure).
 * 3. Если кандидатов нет — регулярная решётка (клетка ~20 px) и поиск A*
 *    по ортогональным направлениям (v0.01.09) со штрафом за поворот
 *    (TURN_COST): состояние поиска — «клетка + направление движения»,
 *    поэтому путь выходит с длинными прямыми участками и минимумом изломов
 *    вместо «ступенек» диагональной решётки прежних версий. Диагонали
 *    решётке не нужны: любой путь без срезания углов переводится в
 *    ортогональный, а манхэттенское расстояние — допустимая эвристика.
 * 4. Ломаная упрощается «прямой видимостью» (краткое пересечение чужой
 *    дорожки разрешено — PENALTY_CROSS_SAMPLES) и выпрямляется
 *    постобработкой (v0.01.09): слияние коллинеарных вершин, удаление
 *    одиночного угла, «лестница» из двух углов заменяется одним
 *    Г-образным ходом.
 * 5. Углы скругляются одной кубической кривой на вершину (v0.01.09):
 *    касательное приближение дуги, отступ дуги от вершины ограничен
 *    (MAX_CORNER_CUT) — плавные скругления вместо острых изломов и вместо
 *    двойного сглаживания «Чейкин + кривая» прежних версий.
 * 6. Развязка коридоров (v0.01.07): стрелки трассируются последовательно
 *    (порядок — в routeEdges), и клетки, уже занятые прежними стрелками,
 *    получают надбавку стоимости (мягкие препятствия). Линии расходятся
 *    параллельными дорожками вместо слияния в пучок; слияние сегментов
 *    при упрощении/выпрямлении допускает лишь краткое пересечение чужой
 *    дорожки, но не наложение.
 * 6а. Родственные группы (v0.01.08): коридоры накапливаются только между
 *     стрелками с общим доменом (edgeRelationGroups) — незнакомые стрелки
 *     не отклоняются от чужих линий и остаются прямыми.
 * 6б. Прямая трасса бракуется только пересечением с доменами (v0.01.08):
 *     штрафы влияют лишь на выбор варианта обхода. Скользящие якоря
 *     портов (portAnchorY, v0.01.08) тянут Y соединения к собеседнику.
 * 7. Стрелки с общим портом расходятся веером (computeEdgeFans):
 *    вертикальный сдвиг точек старта/финала разводит линии, выходящие
 *    из одного порта или входящие в один порт; параллельные стрелки одной
 *    пары доменов дополнительно разводятся перпендикулярным сдвигом.
 * 8. «Усики» у портов (горизонтальный участок) добавляются только при
 *    горизонтальном выходе/входе (v0.01.09): стрелка, уходящая от порта
 *    вертикалью, не получает крючок.
 * 9. Если путь не найден (домены перекрывают весь коридор) — откат к прямой
 *    стрелке прежнего поведения.
 *
 * Функции чистые и детерминированные: одинаковые входы дают одинаковую
 * форму (важно для тестов и для стабильности картинки при перерисовках).
 */

/** Точка на канве, px. */
export interface RoutePoint {
  x: number;
  y: number;
}

/** Прямоугольник препятствия (габариты узла-домена), px. */
export interface RouteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteOptions {
  /** Отступ формы стрелки от границы домена, px. */
  pad?: number;
  /** Размер клетки решётки, px. */
  cell?: number;
  /** Запас области поиска вокруг охватывающего прямоугольника, px. */
  margin?: number;
  /** Предпочтительный горизонтальный выход из порта-источника, px. */
  sourceExit?: RoutePoint;
  /** Предпочтительный горизонтальный вход в порт-приёмник, px. */
  targetEntry?: RoutePoint;
  /**
   * Прямоугольники соединяемых доменов (v0.01.04): включаются препятствиями
   * только если прямой отрезок сквозь них (встречные стрелки, когда
   * приёмник левее источника) — обычные стрелки из порта не задевают свой блок
   * и остаются прямыми, не теряя раннего выхода.
   */
  selfRects?: RouteRect[];
  /**
   * Мягкие препятствия (v0.01.07): решётка штрафов от ранее проложенных
   * стрелок родственной группы (v0.01.08) — общие коридоры дорожают,
   * линии расходятся. На прямой ход штрафы не влияют (v0.01.08): прямой
   * отрезок бракуется только пересечением с доменами.
   */
  penalty?: RoutePenalty;
}

/** Отступ формы стрелки от границы домена по умолчанию, px. */
export const DEFAULT_PAD = 14;
/** Размер клетки решётки по умолчанию, px. */
export const DEFAULT_CELL = 20;
/** Запас области поиска по умолчанию, px. */
export const DEFAULT_MARGIN = 140;
/** Радиус скругления углов по умолчанию, px (v0.01.05: крупнее — плавнее). */
export const DEFAULT_CORNER_RADIUS = 16;
/** Отношение контрольных точек кубической кривой к радиусу (v0.01.05):
 *  классическое приближение четверти окружности — 0.5523. */
const CUBIC_CONTROL = 0.5523;
/** Предел числа клеток решётки (защита от тяжёлых пересчётов при drag). */
const MAX_CELLS = 24000;
/** Радиус поиска свободной клетки от заблокированной точки, клеток. */
const MAX_CELL_SEARCH_RADIUS = 5;
/** Надбавка стоимости клетки за одну прежнюю стрелку в ней (v0.01.07):
 *  параллельный сдвиг дорожки стоит двух «шагов» по краям, поэтому уже
 *  надбавка ≈2 делает параллельный развод выгоднее слияния в пучок. */
export const PENALTY_STEP = 2;
/** Верхняя граница штрафа клетки (после ~4 прежних стрелок коридор
 *  считается занятым окончательно). */
export const PENALTY_MAX = 8;
/** Концы ломаной не создают штрафов: у общих портов стрелки и так
 *  разведены веером (computeEdgeFans), а зона порта обязана оставаться
 *  достижимой для всех его стрелок. */
const PENALTY_TRIM = 24;
/** Штраф за поворот трассы в поиске A* (v0.01.09), в шагах решётки:
 *  путь с меньшим числом изломов предпочтителен — длинные прямые
 *  участки, максимум длины отрезков при минимуме углов. */
const TURN_COST = 2;
/** Допустимый «пробег» по чужим коридорам при слиянии сегментов (v0.01.09):
 *  краткое пересечение чужой дорожки (перпендикулярный проход, до
 *  PENALTY_CROSS_SAMPLES занятых клеток) разрешено, длинное параллельное
 *  наложение — нет. */
const PENALTY_CROSS_SAMPLES = 4;
/** Предельный «пробег» ортогонального кандидата по чужим коридорам
 *  (v0.01.09): кандидат, ложащийся вдоль занятой дорожки (краткое
 *  перпендикулярное пересечение — до нескольких клеток), отклоняется
 *  в пользу решётки A*, которая обойдёт коридор параллельной дорожкой. */
const PENALTY_CANDIDATE_LIMIT = 8;
/** Предельное срезание угла скруглением — отступ дуги от вершины, px
 *  (v0.01.09): скругление не приближает стрелку к домену заметнее решётки. */
const MAX_CORNER_CUT = 10;
/** Число проходов выпрямления ломаной (v0.01.09) — защита от зацикливания. */
const STRAIGHTEN_PASSES = 8;
/** Предел кандидатов на одну ось при подборе ортогонального хода (v0.01.09). */
const MAX_BEND_CANDIDATES = 8;
/** Допуск совмещения точек по строке/столбцу при упрощении (v0.01.09):
 *  якоря портов редко лежат ровно на центрах клеток решётки — слияние
 *  по почти общей горизонтали/вертикали даёт прямые участки вместо
 *  наклонных «стяжек». */
const SNAP_EPS = 2;

/**
 * Мягкие препятствия (v0.01.07): общая на весь кадр решётка штрафов.
 * Клетка без стрелок — 0, занятая прежними стрелками — до PENALTY_MAX.
 * Клетки вне решётки считаются свободными.
 */
export interface RoutePenalty {
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
  values: Float32Array;
}

/**
 * Решётка штрафов на кадр: область охватывает все узлы и порты
 * с запасом margin — трассы не уходят дальше от доменов.
 */
export function createRoutePenalty(
  rects: RouteRect[],
  points: RoutePoint[],
  cell = DEFAULT_CELL,
  margin = DEFAULT_MARGIN,
): RoutePenalty {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return { x0: 0, y0: 0, cell, cols: 0, rows: 0, values: new Float32Array(0) };
  const x0 = minX - margin;
  const y0 = minY - margin;
  const cols = Math.ceil((maxX + margin - x0) / cell) + 1;
  const rows = Math.ceil((maxY + margin - y0) / cell) + 1;
  return { x0, y0, cell, cols, rows, values: new Float32Array(cols * rows) };
}

function penaltyIndexAt(penalty: RoutePenalty, x: number, y: number): number {
  const col = Math.floor((x - penalty.x0) / penalty.cell);
  const row = Math.floor((y - penalty.y0) / penalty.cell);
  if (col < 0 || col >= penalty.cols || row < 0 || row >= penalty.rows) return -1;
  return row * penalty.cols + col;
}

function penaltyValueAt(penalty: RoutePenalty, x: number, y: number): number {
  const index = penaltyIndexAt(penalty, x, y);
  return index < 0 ? 0 : penalty.values[index];
}

/**
 * Накопление штрафов вдоль проложенной ломаной (v0.01.07): клетки трассы
 * дорожают для последующих стрелок. Концы ломаной (PENALTY_TRIM px
 * от порта) не штрафуются — зона порта общая для всех его стрелок.
 */
export function accumulateRoutePenalty(penalty: RoutePenalty, path: RoutePoint[]): void {
  if (penalty.values.length === 0 || path.length < 2) return;
  const step = penalty.cell / 2;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 0.5) continue;
    const samples = Math.max(1, Math.ceil(length / step));
    for (let s = 0; s <= samples; s += 1) {
      const t = s / samples;
      // Пропускаем зоны портов: первые и последние PENALTY_TRIM px трассы.
      const fromStart = i === 0 ? t * length : Infinity;
      const toEnd = i === path.length - 2 ? length - t * length : Infinity;
      if (fromStart < PENALTY_TRIM || toEnd < PENALTY_TRIM) continue;
      const index = penaltyIndexAt(
        penalty,
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
      );
      if (index < 0) continue;
      penalty.values[index] = Math.min(PENALTY_MAX, penalty.values[index] + PENALTY_STEP);
    }
  }
}

/** Есть ли занятые прежними стрелками клетки вдоль отрезка (v0.01.07). */
export function penaltyAlongSegment(
  penalty: RoutePenalty | undefined,
  a: RoutePoint,
  b: RoutePoint,
): boolean {
  return penaltyExposure(penalty, a, b) > 0;
}

/**
 * «Пробег» отрезка по чужим коридорам (v0.01.09): число занятых прежними
 * стрелками клеток вдоль отрезка. Краткое пересечение чужой дорожки
 * (перпендикулярный проход) даёт 1–3 клетки; длинное параллельное
 * наложение — десятки. Слияние сегментов при упрощении и выпрямлении
 * разрешено, пока пробег не превышает PENALTY_CROSS_SAMPLES: развязка
 * коридоров сохраняется, а лишние изломы «ступенек» убираются.
 */
export function penaltyExposure(
  penalty: RoutePenalty | undefined,
  a: RoutePoint,
  b: RoutePoint,
): number {
  if (!penalty || penalty.values.length === 0) return 0;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 0.5) return penaltyValueAt(penalty, a.x, a.y) > 0 ? 1 : 0;
  const samples = Math.max(1, Math.ceil(length / (penalty.cell / 2)));
  let exposed = 0;
  for (let s = 0; s <= samples; s += 1) {
    const t = s / samples;
    if (penaltyValueAt(penalty, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) > 0) {
      exposed += 1;
    }
  }
  return exposed;
}

/** Расширение прямоугольника на отступ со всех сторон. */
export function expandRect(rect: RouteRect, pad: number): RouteRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + 2 * pad,
    height: rect.height + 2 * pad,
  };
}

/**
 * Пересекается ли отрезок ab с прямоугольником (касание границ и точки
 * внутри прямоугольника тоже считаются пересечением) — алгоритм
 * Лианга–Барски: параметрический клип отрезка по четырём полуплоскостям.
 */
export function segmentIntersectsRect(
  a: RoutePoint,
  b: RoutePoint,
  rect: RouteRect,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - rect.x, rect.x + rect.width - a.x, a.y - rect.y, rect.y + rect.height - a.y];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // параллелен стороне и снаружи
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

function crossesAny(a: RoutePoint, b: RoutePoint, obstacles: RouteRect[]): boolean {
  for (const rect of obstacles) {
    if (segmentIntersectsRect(a, b, rect)) return true;
  }
  return false;
}

/** Ближайшая свободная клетка решётки (спиральный поиск по радиусу). */
function nearestFreeCellIndex(
  blocked: Uint8Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
): number {
  if (col >= 0 && col < cols && row >= 0 && row < rows && !blocked[row * cols + col]) {
    return row * cols + col;
  }
  for (let radius = 1; radius <= MAX_CELL_SEARCH_RADIUS; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue; // только кольцо
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        if (!blocked[r * cols + c]) return r * cols + c;
      }
    }
  }
  return -1;
}

/**
 * Ортогональные направления движения по решётке (v0.01.09): диагонали
 * исключены. Путь A* без срезания углов всегда переводится в
 * ортогональный (шаг по диагонали заменяется парой ортогональных шагов
 * по свободным клеткам), а прямые углы дают чистые горизонтальные и
 * вертикальные участки вместо «лесенок».
 */
const GRID_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Манхэттенское расстояние — допустимая эвристика A* на ортогональной
 * решётке (v0.01.09; раньше было октальное — для восьми направлений).
 */
function manhattan(dx: number, dy: number): number {
  return Math.abs(dx) + Math.abs(dy);
}

interface Grid {
  cols: number;
  rows: number;
  cell: number;
  x0: number;
  y0: number;
  blocked: Uint8Array;
}

function buildGrid(
  source: RoutePoint,
  target: RoutePoint,
  obstacles: RouteRect[],
  cellSize: number,
  margin: number,
): Grid {
  // Область поиска охватывает и сами препятствия (а не только порты):
  // обход обязан иметь запас свободного места вокруг каждого домена,
  // иначе стрелка у узкой решётки не найдёт пути и откатится к прямой.
  let minX = Math.min(source.x, target.x);
  let minY = Math.min(source.y, target.y);
  let maxX = Math.max(source.x, target.x);
  let maxY = Math.max(source.y, target.y);
  for (const rect of obstacles) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  const x0 = minX - margin;
  const y0 = minY - margin;
  const cols = Math.ceil((maxX + margin - x0) / cellSize) + 1;
  const rows = Math.ceil((maxY + margin - y0) / cellSize) + 1;
  const blocked = new Uint8Array(cols * rows);
  for (const rect of obstacles) {
    const c0 = Math.max(0, Math.floor((rect.x - x0) / cellSize));
    const c1 = Math.min(cols - 1, Math.ceil((rect.x + rect.width - x0) / cellSize));
    const r0 = Math.max(0, Math.floor((rect.y - y0) / cellSize));
    const r1 = Math.min(rows - 1, Math.ceil((rect.y + rect.height - y0) / cellSize));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) blocked[r * cols + c] = 1;
    }
  }
  return { cols, rows, cell: cellSize, x0, y0, blocked };
}

/**
 * Минимальная двоичная куча по приоритету (f, затем h — для детерминизма).
 */
class MinHeap {
  private readonly items: Array<{ f: number; h: number; index: number }> = [];

  get size(): number {
    return this.items.length;
  }

  push(f: number, h: number, index: number): void {
    this.items.push({ f, h, index });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(i, parent)) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else break;
    }
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.less(left, smallest)) smallest = left;
        if (right < this.items.length && this.less(right, smallest)) smallest = right;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top.index;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.f < y.f || (x.f === y.f && x.h < y.h);
  }
}

/**
 * Путь A* по ортогональной решётке со штрафом за поворот (v0.01.09):
 * состояние поиска — «клетка + направление движения» (cell × 4 + dir),
 * смена направления стоит TURN_COST шагов. Поэтому среди путей одинаковой
 * длины выбирается путь с наименьшим числом изломов — длинные прямые
 * участки вместо «ступенек». Штрафы (v0.01.07) добавляются к стоимости
 * входа в клетку: клетки коридоров прежних стрелок дорожают, и путь
 * расходится в сторону. Возвращает список клеток-индексов от старта к цели.
 */
function findGridPath(
  grid: Grid,
  start: number,
  goal: number,
  penalty?: RoutePenalty,
): number[] | null {
  const { cols, rows, blocked } = grid;
  const dirCount = GRID_DIRECTIONS.length;
  const size = cols * rows;
  const goalCol = goal % cols;
  const goalRow = Math.floor(goal / cols);
  const gScore = new Float64Array(size * dirCount).fill(Infinity);
  const cameFrom = new Int32Array(size * dirCount).fill(-1);
  const closed = new Uint8Array(size * dirCount);
  const heap = new MinHeap();
  const cellPenalty = (index: number): number => {
    if (!penalty || penalty.values.length === 0) return 0;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return penaltyValueAt(
      penalty,
      grid.x0 + (col + 0.5) * grid.cell,
      grid.y0 + (row + 0.5) * grid.cell,
    );
  };
  const startCol = start % cols;
  const startRow = Math.floor(start / cols);
  const hStart = manhattan(goalCol - startCol, goalRow - startRow);
  // Стартовые состояния: направление ещё не выбрано — для каждого
  // направления g = 0, и первый ход не платит штраф за поворот.
  for (let d = 0; d < dirCount; d += 1) {
    gScore[start * dirCount + d] = 0;
    heap.push(hStart, hStart, start * dirCount + d);
  }
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    const cell = Math.floor(state / dirCount);
    if (cell === goal) {
      const path: number[] = [];
      let node = state;
      while (node >= 0) {
        path.push(Math.floor(node / dirCount));
        node = cameFrom[node];
      }
      return path.reverse();
    }
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    const dir = state % dirCount;
    const fromStart = cameFrom[state] < 0;
    for (let nd = 0; nd < dirCount; nd += 1) {
      const [dc, dr] = GRID_DIRECTIONS[nd];
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * cols + nextCol;
      if (blocked[next]) continue;
      const nextState = next * dirCount + nd;
      if (closed[nextState]) continue;
      const turn = nd !== dir && !fromStart ? TURN_COST : 0;
      // Стоимость шага: базовый шаг с надбавкой за занятость клетки
      // (штрафы коридоров) плюс штраф за смену направления.
      const tentative = gScore[state] + 1 + cellPenalty(next) + turn;
      if (tentative < gScore[nextState]) {
        gScore[nextState] = tentative;
        cameFrom[nextState] = state;
        const h = manhattan(goalCol - nextCol, goalRow - nextRow);
        heap.push(tentative + h, h, nextState);
      }
    }
  }
  return null;
}

/**
 * Упрощение ломаной «прямой видимостью» по осям (v0.01.09): остаются только
 * повороты, причём сливаются лишь точки на общей (в пределах SNAP_EPS)
 * горизонтали или вертикали — наклонные «стяжки» между клетками решётки
 * не появляются, форма остаётся ортогональной. Занятые прежними стрелками
 * клетки (v0.01.07) тоже мешают слиянию, но лишь частично: краткое
 * пересечение чужой дорожки (до PENALTY_CROSS_SAMPLES занятых клеток —
 * перпендикулярный проход) разрешено, длинное параллельное наложение —
 * нет. Развязка коридоров сохраняется, «ступеньки» на свободных
 * направлениях сливаются в прямые.
 */
function simplifyPath(
  points: RoutePoint[],
  obstacles: RouteRect[],
  penalty?: RoutePenalty,
): RoutePoint[] {
  if (points.length <= 2) return points.slice();
  const clear = (a: RoutePoint, b: RoutePoint): boolean =>
    !crossesAny(a, b, obstacles) &&
    penaltyExposure(penalty, a, b) <= PENALTY_CROSS_SAMPLES;
  const aligned = (a: RoutePoint, b: RoutePoint): boolean =>
    Math.abs(a.x - b.x) <= SNAP_EPS || Math.abs(a.y - b.y) <= SNAP_EPS;
  const result: RoutePoint[] = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && (!aligned(points[i], points[j]) || !clear(points[i], points[j]))) {
      j -= 1;
    }
    result.push(points[j]);
    i = j;
  }
  return result;
}

/**
 * Выпрямление ломаной (v0.01.09): постобработка упрощённой трассы,
 * максимизирующая длину прямых отрезков и минимизирующая число углов.
 * Три правила, применяемые проходами до сходимости:
 * 1) слияние коллинеарных вершин (две смежные «горизонтали» или
 *    «вертикали» становятся одним отрезком);
 * 2) удаление одиночного угла — если прямая «через угол» свободна;
 * 3) «лестница» из двух углов (горизонталь-вертикаль-горизонталь или
 *    вертикаль-горизонталь-вертикаль) заменяется одним Г-образным ходом,
 *    если оба его колена свободны.
 * Слияния проверяются и на краткое пересечение чужих коридоров
 * (penaltyExposure ≤ PENALTY_CROSS_SAMPLES): развязка не рушится.
 */
function straightenPath(
  points: RoutePoint[],
  obstacles: RouteRect[],
  penalty?: RoutePenalty,
): RoutePoint[] {
  // Ортогонализация наклонных участков (v0.01.09): наклонные «усики»
  // у портов (якорь редко лежит на центре клетки) заменяются Г-образной
  // вставкой в свободном направлении; если оба направления заняты,
  // участок остаётся наклонным.
  let pts: RoutePoint[] = [points[0]];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
      const bend1: RoutePoint = { x: b.x, y: a.y };
      const bend2: RoutePoint = { x: a.x, y: b.y };
      const bend = !crossesAny(a, bend1, obstacles) && !crossesAny(bend1, b, obstacles)
        ? bend1
        : !crossesAny(a, bend2, obstacles) && !crossesAny(bend2, b, obstacles)
          ? bend2
          : null;
      if (bend) pts.push(bend);
    }
    pts.push(b);
  }
  pts = dedupePoints(pts);
  const clear = (a: RoutePoint, b: RoutePoint): boolean =>
    !crossesAny(a, b, obstacles) &&
    penaltyExposure(penalty, a, b) <= PENALTY_CROSS_SAMPLES;
  const axisOf = (a: RoutePoint, b: RoutePoint): 'h' | 'v' | null => {
    if (Math.abs(a.y - b.y) < 0.5) return 'h';
    if (Math.abs(a.x - b.x) < 0.5) return 'v';
    return null;
  };
  for (let pass = 0; pass < STRAIGHTEN_PASSES; pass += 1) {
    let changed = false;
    // 1. Коллинеарные вершины.
    {
      const result: RoutePoint[] = [pts[0]];
      for (let i = 1; i < pts.length - 1; i += 1) {
        const axis = axisOf(result[result.length - 1], pts[i + 1]);
        const sameH = axis === 'h' && Math.abs(pts[i].y - pts[i + 1].y) < 0.5;
        const sameV = axis === 'v' && Math.abs(pts[i].x - pts[i + 1].x) < 0.5;
        if (sameH || sameV) {
          changed = true;
          continue; // вершина на прямой — пропустить
        }
        result.push(pts[i]);
      }
      result.push(pts[pts.length - 1]);
      pts = result;
    }
    // 2. Одиночный угол: прямая через него свободна — угол лишний.
    for (let i = 1; i < pts.length - 1; ) {
      if (clear(pts[i - 1], pts[i + 1])) {
        pts.splice(i, 1);
        changed = true;
        // не сдвигаем i: следующая вершина может тоже убраться
      } else {
        i += 1;
      }
    }
    // 3. «Лестница» → Г-образный ход.
    for (let i = 1; i < pts.length - 3; ) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const d = pts[i + 2];
      const firstAxis = axisOf(a, b);
      const secondAxis = axisOf(c, d);
      if (
        firstAxis &&
        secondAxis &&
        firstAxis === secondAxis &&
        axisOf(b, c) &&
        axisOf(b, c) !== firstAxis
      ) {
        // Оба колена Г-образного хода: через (a.x, d.y) и через (d.x, a.y).
        const bend1: RoutePoint = { x: a.x, y: d.y };
        const bend2: RoutePoint = { x: d.x, y: a.y };
        const bend =
          (bend1.x !== a.x || bend1.y !== a.y) &&
          (bend1.x !== d.x || bend1.y !== d.y) &&
          clear(a, bend1) &&
          clear(bend1, d)
            ? bend1
            : (bend2.x !== a.x || bend2.y !== a.y) &&
                (bend2.x !== d.x || bend2.y !== d.y) &&
                clear(a, bend2) &&
                clear(bend2, d)
              ? bend2
              : null;
        if (bend) {
          pts.splice(i, 2, bend); // b и c заменяются одним изгибом
          changed = true;
          continue;
        }
      }
      i += 1;
    }
    pts = dedupePoints(pts);
    if (!changed) break;
  }
  return pts;
}

/** Удаление почти совпадающих последовательных точек. */
function dedupePoints(points: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) continue;
    result.push(point);
  }
  return result;
}

/**
 * «Усики» у портов: короткий горизонтальный участок, чтобы стрелка выходила
 * из порта по горизонтали (как во Flying Logic). Добавляется только если
 * и сам усик, и отрезок до следующей точки формы не задевают домены.
 * С v0.01.09 усик уместен только при горизонтальном первом/последнем
 * отрезке формы: стрелка, уходящая от порта вертикалью, не получает
 * горизонтальный крючок.
 */
function withPortHints(
  points: RoutePoint[],
  expanded: RouteRect[],
  sourceExit?: RoutePoint,
  targetEntry?: RoutePoint,
): RoutePoint[] {
  let result = points;
  if (sourceExit && result.length >= 2) {
    const [first, second] = result;
    const horizontal = Math.abs(second.y - first.y) < 0.5;
    const hint = { x: first.x + sourceExit.x, y: first.y + sourceExit.y };
    if (horizontal && !crossesAny(first, hint, expanded) && !crossesAny(hint, second, expanded)) {
      result = [first, hint, ...result.slice(1)];
    }
  }
  if (targetEntry && result.length >= 2) {
    const last = result[result.length - 1];
    const prev = result[result.length - 2];
    const horizontal = Math.abs(last.y - prev.y) < 0.5;
    const hint = { x: last.x + targetEntry.x, y: last.y + targetEntry.y };
    if (horizontal && !crossesAny(hint, last, expanded) && !crossesAny(prev, hint, expanded)) {
      result = [...result.slice(0, -1), hint, last];
    }
  }
  return result;
}

/**
 * Ортогональные кандидаты трассировки (v0.01.09): ходы с двумя поворотами
 * через свободные зазоры между препятствиями. Изгиб вертикали подбирается
 * по границам препятствий ± 2 px (свободный «контурный» ход вокруг них),
 * по середине между портами и по самим портам (вырождение в Г-образный ход
 * с одним поворотом). Кандидаты упорядочены: сначала ось преобладающего
 * смещения пары портов (горизонталь при широкой стрелке), внутри оси —
 * по близости изгиба к середине; так длинные прямые участки сохраняются.
 */
function orthoCandidates(
  source: RoutePoint,
  target: RoutePoint,
  expanded: RouteRect[],
): RoutePoint[][] {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const bends = (from: number, to: number, mid: number, axis: 'x' | 'y'): number[] => {
    const candidates = new Set<number>([mid, from, to]);
    for (const rect of expanded) {
      if (axis === 'x') {
        candidates.add(rect.x - 2);
        candidates.add(rect.x + rect.width + 2);
      } else {
        candidates.add(rect.y - 2);
        candidates.add(rect.y + rect.height + 2);
      }
    }
    const list = [...candidates].filter((value) => Number.isFinite(value));
    list.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    return list.slice(0, MAX_BEND_CANDIDATES);
  };
  const horizontalFirst = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
  const xs = bends(source.x, target.x, midX, 'x');
  const ys = bends(source.y, target.y, midY, 'y');
  const candidates: RoutePoint[][] = [];
  const push = (bend: number, axis: 'x' | 'y'): void => {
    candidates.push(
      axis === 'x'
        ? [source, { x: bend, y: source.y }, { x: bend, y: target.y }, target]
        : [source, { x: source.x, y: bend }, { x: target.x, y: bend }, target],
    );
  };
  const primaryAxis: 'x' | 'y' = horizontalFirst ? 'x' : 'y';
  const secondaryAxis: 'x' | 'y' = horizontalFirst ? 'y' : 'x';
  for (const bend of primaryAxis === 'x' ? xs : ys) push(bend, primaryAxis);
  for (const bend of primaryAxis === 'x' ? ys : xs) push(bend, secondaryAxis);
  return candidates;
}

/**
 * Форма стрелки с обходом препятствий: список точек ломаной от порта-источника
 * к порту-приёмнику. Без пересечений возвращает прямой отрезок, при
 * невозможности обхода — тоже прямой отрезок (откат к прежнему поведению).
 * Конвейер v0.01.09: прямая → ортогональные кандидаты через свободные
 * зазоры → решётка A* со штрафом за поворот → упрощение → выпрямление →
 * «усики» портов.
 */
export function computeRoutePath(
  source: RoutePoint,
  target: RoutePoint,
  obstacles: RouteRect[],
  options?: RouteOptions,
): RoutePoint[] {
  const pad = options?.pad ?? DEFAULT_PAD;
  const cellSize = options?.cell ?? DEFAULT_CELL;
  const margin = options?.margin ?? DEFAULT_MARGIN;
  if (
    Math.abs(source.x - target.x) < 0.5 &&
    Math.abs(source.y - target.y) < 0.5
  ) {
    return [source, target];
  }
  // Свои домены — препятствия только при встречной геометрии: проверка
  // по прямоугольнику, сжатому на 1 px, чтобы касание порта не считалось.
  const crossing = (options?.selfRects ?? []).filter((rect) =>
    segmentIntersectsRect(source, target, expandRect(rect, -1)),
  );
  const expanded = [...obstacles, ...crossing].map((rect) => expandRect(rect, pad));
  const penalty = options?.penalty;
  // Прямой ход проверяется только на пересечение с доменами (v0.01.08):
  // штрафы коридоров не бракуют прямую трассу — незнакомые стрелки больше
  // не отклоняются от чужих линий; штрафы влияют только на выбор варианта
  // обхода.
  if (!crossesAny(source, target, expanded)) {
    return [source, target];
  }

  // Порог видимости чуть меньше блокирующего отступа: упрощённая ломаная
  // может подходить к домену ближе решётки, но не к самому контуру.
  const loose = expanded.map((rect) => expandRect(rect, -4));

  // Ортогональные кандидаты (v0.01.09): ходы с двумя поворотами через
  // свободные зазоры. Из свободных выбирается ход с наименьшим «пробегом»
  // по чужим коридорам родственной группы (порядок кандидатов — при равном
  // пробеге), тогда развязка параллельных дорожек сохраняется без решётки.
  let bestLegs: RoutePoint[] | null = null;
  let bestExposure = Infinity;
  for (const candidate of orthoCandidates(source, target, expanded)) {
    const legs = dedupePoints(candidate);
    if (legs.length < 2) continue;
    let blocked = false;
    let exposure = 0;
    for (let leg = 0; leg < legs.length - 1; leg += 1) {
      if (crossesAny(legs[leg], legs[leg + 1], expanded)) {
        blocked = true;
        break;
      }
      exposure += penaltyExposure(penalty, legs[leg], legs[leg + 1]);
    }
    if (blocked) continue;
    if (exposure < bestExposure) {
      bestExposure = exposure;
      bestLegs = legs;
    }
  }
  // Кандидат, ложащийся вдоль чужой дорожки родственной группы (пробег
  // выше предела), отклоняется: решётка A* обойдёт коридор параллельной
  // дорожкой — развязка стрелок сохраняется.
  if (bestLegs && bestExposure <= PENALTY_CANDIDATE_LIMIT) {
    // «Усики» у портов сливаются с горизонтальными коленами кандидата.
    return withPortHints(bestLegs, loose, options?.sourceExit, options?.targetEntry);
  }

  // Размер клетки подбирается так, чтобы решётка оставалась компактной:
  // область поиска — union портов и всех препятствий с запасом margin.
  let cell = cellSize;
  let minX = Math.min(source.x, target.x);
  let minY = Math.min(source.y, target.y);
  let maxX = Math.max(source.x, target.x);
  let maxY = Math.max(source.y, target.y);
  for (const rect of expanded) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  while (((maxX - minX + 2 * margin) / cell) * ((maxY - minY + 2 * margin) / cell) > MAX_CELLS) {
    cell *= 1.5;
  }

  const grid = buildGrid(source, target, expanded, cell, margin);
  const startCol = Math.floor((source.x - grid.x0) / grid.cell);
  const startRow = Math.floor((source.y - grid.y0) / grid.cell);
  const goalCol = Math.floor((target.x - grid.x0) / grid.cell);
  const goalRow = Math.floor((target.y - grid.y0) / grid.cell);
  const start = nearestFreeCellIndex(grid.blocked, grid.cols, grid.rows, startCol, startRow);
  const goal = nearestFreeCellIndex(grid.blocked, grid.cols, grid.rows, goalCol, goalRow);
  if (start < 0 || goal < 0) return [source, target];

  const cells = findGridPath(grid, start, goal, penalty);
  if (!cells || cells.length < 2) return [source, target];

  const cellPoints = cells.map((index) => ({
    x: grid.x0 + ((index % grid.cols) + 0.5) * grid.cell,
    y: grid.y0 + (Math.floor(index / grid.cols) + 0.5) * grid.cell,
  }));

  const simplified = simplifyPath(dedupePoints([source, ...cellPoints, target]), loose, penalty);
  // Выпрямление (v0.01.09): лестницы и лишние углы сливаются в прямые.
  const straightened = straightenPath(simplified, loose, penalty);
  // «Усики» проверяются по тому же порогу, что и упрощение: иначе коридор,
  // зажатый между доменами, отклонял бы усик при допустимой ломаной.
  return withPortHints(straightened, loose, options?.sourceExit, options?.targetEntry);
}

/**
 * SVG-путь по ломаной со скруглением углов (v0.01.09): каждый поворот
 * заменяется одной кубической кривой Безье с касательными контрольными
 * точками — классическое приближение дуги окружности (коэффициент 0.5523):
 * «M … L … C … L …». Радиус скругления уменьшается до половины короткого
 * смежного отрезка и до предельного срезания угла (MAX_CORNER_CUT) —
 * скругление не приближает стрелку к домену заметнее решётки. Коллинеарные
 * вершины пропускаются: длинные прямые участки остаются линиями «L».
 */
export function polylineToRoundedPath(
  points: RoutePoint[],
  radius = DEFAULT_CORNER_RADIUS,
): string {
  if (points.length < 2) return '';
  const fmt = (value: number) => Math.round(value * 100) / 100;
  const first = points[0];
  const last = points[points.length - 1];
  let d = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (d1 < 0.5 || d2 < 0.5) continue;
    const t1x = (cur.x - prev.x) / d1;
    const t1y = (cur.y - prev.y) / d1;
    const t2x = (next.x - cur.x) / d2;
    const t2y = (next.y - cur.y) / d2;
    const dot = t1x * t2x + t1y * t2y; // косинус угла поворота
    if (dot > 0.999) continue; // коллинеарно — прямая через вершину
    // Отступ дуги от вершины: r·(1 − sin(θ/2)) / cos(θ/2) ≤ MAX_CORNER_CUT.
    const cosHalf = Math.sqrt((1 + dot) / 2);
    const sinHalf = Math.sqrt((1 - dot) / 2);
    const cutCap =
      1 - sinHalf > 1e-9 ? (MAX_CORNER_CUT * cosHalf) / (1 - sinHalf) : Infinity;
    const r = Math.min(radius, d1 / 2, d2 / 2, cutCap);
    if (r < 0.5) continue;
    const k = r * CUBIC_CONTROL;
    d +=
      ` L ${fmt(cur.x - t1x * r)} ${fmt(cur.y - t1y * r)}` +
      ` C ${fmt(cur.x - t1x * (r - k))} ${fmt(cur.y - t1y * (r - k))}` +
      ` ${fmt(cur.x + t2x * (r - k))} ${fmt(cur.y + t2y * (r - k))}` +
      ` ${fmt(cur.x + t2x * r)} ${fmt(cur.y + t2y * r)}`;
  }
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/* ------------------------------------------------------------------ */
/* Развязка стрелок у общих портов (v0.01.05)                          */
/* ------------------------------------------------------------------ */

/** Минимальные сведения о стрелке для расчёта развязки портов. */
export interface FanEdge {
  id: string;
  from: string;
  to: string;
  /** Сторона выхода из источника (v0.01.07): right — обычная, left — встречная. */
  sourceSide?: 'left' | 'right';
  /** Сторона входа в приёмник (v0.01.07): left — обычная, right — встречная. */
  targetSide?: 'left' | 'right';
}

/** Сдвиги стрелки у портов (v0.01.05). */
export interface EdgeFanOffsets {
  /** Вертикальный сдвиг точки старта у порта источника, px. */
  sourceFan: number;
  /** Вертикальный сдвиг точки финала у порта приёмника, px. */
  targetFan: number;
}

/**
 * Развязка стрелок с общими портами (v0.01.05): у домена один порт слева
 * и один справа, и все стрелки порта выходят из одной точки, сливаясь
 * в неразличимый пучок. Стрелки каждого порта упорядочиваются по вертикали
 * противоположного конца (верхняя цель — верхний слот) и получают
 * вертикальный сдвиг ±spacing px с ограничением maxOffset.
 * С v0.01.07 у домена два выхода и два входа (обычные и встречные стрелки):
 * группы считаются по паре «узел + сторона» — веер обычных выходов (справа)
 * не смешивается с веером встречных выходов (слева).
 * Чистая и детерминированная функция: одинаковые входы — одинаковые сдвиги.
 */
export function computeEdgeFans(
  edges: FanEdge[],
  positions: Record<string, { x: number; y: number }>,
  options?: { spacing?: number; maxOffset?: number },
): Map<string, EdgeFanOffsets> {
  const spacing = options?.spacing ?? 9;
  const maxOffset = options?.maxOffset ?? 30;
  const fans = new Map<string, EdgeFanOffsets>();
  for (const edge of edges) fans.set(edge.id, { sourceFan: 0, targetFan: 0 });
  const positionOf = (id: string) => positions[id] ?? { x: 0, y: 0 };

  const assignFan = (
    groupKey: (edge: FanEdge) => string,
    otherKey: (edge: FanEdge) => string,
    side: 'sourceFan' | 'targetFan',
  ): void => {
    const groups = new Map<string, FanEdge[]>();
    for (const edge of edges) {
      const key = groupKey(edge);
      const list = groups.get(key);
      if (list) list.push(edge);
      else groups.set(key, [edge]);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => {
        const pa = positionOf(otherKey(a));
        const pb = positionOf(otherKey(b));
        return pa.y - pb.y || pa.x - pb.x || a.id.localeCompare(b.id);
      });
      sorted.forEach((edge, index) => {
        const raw = (index - (sorted.length - 1) / 2) * spacing;
        const fan = Math.max(-maxOffset, Math.min(maxOffset, raw));
        fans.get(edge.id)![side] = fan;
      });
    }
  };

  // Порт источника: стрелки с общим «узел + сторона выхода» сортируются
  // по позиции приёмника (v0.01.07: сторона учитывается, по умолчанию right).
  assignFan(
    (edge) => `${edge.from}#${edge.sourceSide ?? 'right'}`,
    (edge) => edge.to,
    'sourceFan',
  );
  // Порт приёмника: стрелки с общим «узел + сторона входа» — по позиции
  // источника (по умолчанию left).
  assignFan(
    (edge) => `${edge.to}#${edge.targetSide ?? 'left'}`,
    (edge) => edge.from,
    'targetFan',
  );
  return fans;
}

/* ------------------------------------------------------------------ */
/* Скользящие якоря портов и родственные группы (v0.01.08)              */
/* ------------------------------------------------------------------ */

/** Отступ скользящего якоря от верхней/нижней границы домена, px. */
export const ANCHOR_INSET = 24;

/**
 * Скользящий якорь порта (v0.01.08): Y точки соединения тянется к
 * вертикальному центру домена-собеседника и зажимается в пределах высоты
 * своего домена (с отступом inset от краёв) — стрелки выходят и входят
 * лицом к лицу, а не строго на середине высоты порта. Веерный сдвиг
 * (computeEdgeFans) добавляется к якорю поверх зажима.
 * Чистая функция: одинаковые входы — одинаковый якорь.
 */
export function portAnchorY(
  own: RouteRect,
  other: RouteRect,
  offset = 0,
  inset = ANCHOR_INSET,
): number {
  const desired = other.y + other.height / 2;
  const min = own.y + inset;
  const max = Math.max(min, own.y + own.height - inset);
  return Math.min(Math.max(desired, min), max) + offset;
}

/**
 * Родственные группы стрелок (v0.01.08): стрелки, у которых есть общий
 * домен хотя бы по одному концу, попадают в одну группу — только внутри
 * группы коридоры развязываются штрафами. Незнакомые стрелки трассируются
 * независимо и не отклоняются от чужих линий (причина «необъяснимых
 * изломов» v0.01.07 — общая решётка штрафов на весь кадр).
 * Система непересекающихся множеств по доменам; возвращает индекс группы
 * для каждой стрелки в порядке входа — детерминированно.
 */
export function edgeRelationGroups(
  edges: Array<Pick<FanEdge, 'from' | 'to'>>,
): number[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let current = x;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  for (const edge of edges) {
    if (!parent.has(edge.from)) parent.set(edge.from, edge.from);
    if (!parent.has(edge.to)) parent.set(edge.to, edge.to);
    const rootFrom = find(edge.from);
    const rootTo = find(edge.to);
    if (rootFrom !== rootTo) parent.set(rootFrom, rootTo);
  }
  const groupByRoot = new Map<string, number>();
  const groups: number[] = [];
  for (const edge of edges) {
    const root = find(edge.from);
    let group = groupByRoot.get(root);
    if (group === undefined) {
      group = groupByRoot.size;
      groupByRoot.set(root, group);
    }
    groups.push(group);
  }
  return groups;
}

/** Середина ломаной по длине — точка размещения подписи стрелки. */
export function polylineMidpoint(points: RoutePoint[]): RoutePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(length);
    total += length;
  }
  let remain = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remain <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : remain / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    remain -= lengths[i];
  }
  return points[points.length - 1];
}

/* ------------------------------------------------------------------ */
/* Централизованная трассировка видимых стрелок (v0.01.09)             */
/* ------------------------------------------------------------------ */

/** Стрелка для трассировки: идентификатор и концы. */
export interface RouteEdgeSpec {
  id: string;
  from: string;
  to: string;
}

/** Стороны портов стрелки (обычная или встречная). */
export interface RouteSide {
  source: 'left' | 'right';
  target: 'left' | 'right';
}

/** Вход централизованной трассировки: габариты доменов и видимые стрелки. */
export interface RoutingLayout {
  /** Прямоугольники всех видимых доменов канвы (id → габариты). */
  rects: Map<string, RouteRect>;
  /** Видимые стрелки; концы без габаритов пропускаются. */
  edges: RouteEdgeSpec[];
}

/** Результат трассировки: ломаные и стороны портов. */
export interface RoutingOutput {
  paths: Map<string, RoutePoint[]>;
  sides: Map<string, RouteSide>;
}

/**
 * Трассировка всех видимых стрелок (v0.01.09): единая чистая функция,
 * которую вызывает канва (раньше цикл жил в Canvas.tsx). Порядок шагов:
 * стороны портов по геометрии (встречные стрелки — назад), веера общих
 * портов, скользящие якоря, родственные группы штрафов, параллельный сдвиг
 * пар, индивидуальная трассировка каждой стрелки с накоплением коридоров.
 * Чистая и детерминированная: одинаковые входы — одинаковые формы.
 */
export function routeEdges(layout: RoutingLayout): RoutingOutput {
  const paths = new Map<string, RoutePoint[]>();
  const sides = new Map<string, RouteSide>();
  const { rects } = layout;
  const visible = layout.edges.filter((edge) => rects.has(edge.from) && rects.has(edge.to));
  const centerX = (id: string): number => {
    const rect = rects.get(id);
    return rect ? rect.x + rect.width / 2 : 0;
  };
  for (const edge of visible) {
    const backward = centerX(edge.to) < centerX(edge.from) - 40;
    sides.set(
      edge.id,
      backward
        ? { source: 'left', target: 'right' }
        : { source: 'right', target: 'left' },
    );
  }
  // Вееры портов с учётом сторон: обычные и встречные выходы не смешиваются.
  const positionsMap: Record<string, { x: number; y: number }> = {};
  const portPoints: RoutePoint[] = [];
  for (const [id, rect] of rects) {
    positionsMap[id] = { x: rect.x, y: rect.y };
    portPoints.push({ x: rect.x, y: rect.y + rect.height / 2 });
    portPoints.push({ x: rect.x + rect.width, y: rect.y + rect.height / 2 });
  }
  const fanEdges: FanEdge[] = visible.map((edge) => {
    const side = sides.get(edge.id);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      sourceSide: side?.source,
      targetSide: side?.target,
    };
  });
  const fans = computeEdgeFans(fanEdges, positionsMap);
  // Родственные группы: решётка штрафов — по группе, а не на весь кадр.
  const relationGroups = edgeRelationGroups(visible);
  const groupOf = new Map<string, number>();
  visible.forEach((edge, index) => groupOf.set(edge.id, relationGroups[index]));
  const penalties = new Map<number, RoutePenalty>();
  const penaltyFor = (group: number): RoutePenalty => {
    let grid = penalties.get(group);
    if (!grid) {
      grid = createRoutePenalty([...rects.values()], portPoints);
      penalties.set(group, grid);
    }
    return grid;
  };
  // Параллельные стрелки одной пары узлов разводятся перпендикулярным
  // сдвигом ±8 px вокруг оси пары.
  const pairIndex = new Map<string, number>();
  const pairCount = new Map<string, number>();
  for (const edge of visible) {
    const pairKey = [edge.from, edge.to].sort().join('~');
    pairCount.set(pairKey, (pairCount.get(pairKey) ?? 0) + 1);
  }
  const ordered = [...visible].sort((a, b) => a.id.localeCompare(b.id));
  for (const edge of ordered) {
    const side = sides.get(edge.id);
    if (!side) continue;
    const fan = fans.get(edge.id) ?? { sourceFan: 0, targetFan: 0 };
    const sourceRect = rects.get(edge.from)!;
    const targetRect = rects.get(edge.to)!;
    const sourcePort = side.source === 'left' ? sourceRect.x : sourceRect.x + sourceRect.width;
    const targetPort = side.target === 'left' ? targetRect.x : targetRect.x + targetRect.width;
    // Скользящие якоря: Y тянется к вертикальному центру собеседника
    // с зажимом в пределах своего домена; веер — поверх якоря.
    let from: RoutePoint = {
      x: sourcePort,
      y: portAnchorY(sourceRect, targetRect, fan.sourceFan),
    };
    let to: RoutePoint = {
      x: targetPort,
      y: portAnchorY(targetRect, sourceRect, fan.targetFan),
    };
    const pairKey = [edge.from, edge.to].sort().join('~');
    const nth = pairIndex.get(pairKey) ?? 0;
    pairIndex.set(pairKey, nth + 1);
    const shift = (nth - ((pairCount.get(pairKey) ?? 1) - 1) / 2) * 8;
    if (shift !== 0) {
      // Каноническая ось пары (v0.01.09): у стрелок «туда-обратно» перпендикуляр
      // считается по одному и тому же направлению оси — иначе сдвиги совпадали
      // и обе стрелки ложились на одну дорожку.
      let axisX = to.x - from.x;
      let axisY = to.y - from.y;
      if (axisX < 0 || (Math.abs(axisX) < 1e-9 && axisY < 0)) {
        axisX = -axisX;
        axisY = -axisY;
      }
      const length = Math.hypot(axisX, axisY) || 1;
      from = { x: from.x + (-axisY / length) * shift, y: from.y + (axisX / length) * shift };
      to = { x: to.x + (-axisY / length) * shift, y: to.y + (axisX / length) * shift };
    }
    const obstacles: RouteRect[] = [];
    const selfRects: RouteRect[] = [];
    for (const [id, rect] of rects) {
      if (id === edge.from || id === edge.to) selfRects.push(rect);
      else obstacles.push(rect);
    }
    const penalty = penaltyFor(groupOf.get(edge.id) ?? 0);
    const points = computeRoutePath(from, to, obstacles, {
      // Горизонтальные «усики»: из правого порта — вправо, из левого — влево.
      sourceExit: side.source === 'left' ? { x: -16, y: 0 } : { x: 16, y: 0 },
      targetEntry: side.target === 'left' ? { x: -16, y: 0 } : { x: 16, y: 0 },
      // Встречные стрелки обходят и свой блок (см. selfRects).
      selfRects,
      penalty,
    });
    paths.set(edge.id, points);
    accumulateRoutePenalty(penalty, points);
  }
  return { paths, sides };
}
