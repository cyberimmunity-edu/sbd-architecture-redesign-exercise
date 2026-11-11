/**
 * Трассировка стрелок с обходом доменов — v0.01.05.
 *
 * Штатные кривые Безье React Flow идут по прямой дуге от порта к порту
 * и при плотной раскладке пересекают чужие домены. Здесь форма стрелки
 * рассчитывается так, чтобы обойти промежуточные домены по свободным
 * сторонам (как во Flying Logic):
 *
 * 1. Прямой отрезок «порт → порт» проверяется на пересечение с прямоугольниками
 *    доменов, расширенными на отступ pad; если пересечений нет — стрелка прямая.
 * 2. Иначе вокруг препятствий строится регулярная решётка (клетка ~14 px)
 *    и ищется путь поиском A* (8 направлений, без срезания углов),
 *    эвристика — октальное расстояние.
 * 3. Ломаная упрощается «прямой видимостью»: соседние точки сливаются,
 *    пока отрезок между ними не задевает препятствия, — остаются только
 *    повороты. Углы скругляются кубическими кривыми Безье после среза
 *    углов Чейкина (polylineToRoundedPath) — форма выходит плавной,
 *    без острых изломов и «лестниц».
 * 4. Стрелки с общим портом расходятся веером (computeEdgeFans):
 *    вертикальный сдвиг точек старта/финала разводит линии, выходящие
 *    из одного порта или входящие в один порт; параллельные стрелки одной
 *    пары доменов дополнительно разводятся перпендикулярным сдвигом
 *    в Canvas.tsx.
 * 5. Если путь не найден (домены перекрывают весь коридор) — откат к прямой
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
}

/** Отступ формы стрелки от границы домена по умолчанию, px. */
export const DEFAULT_PAD = 14;
/** Размер клетки решётки по умолчанию, px. */
export const DEFAULT_CELL = 20;
/** Запас области поиска по умолчанию, px. */
export const DEFAULT_MARGIN = 140;
/** Радиус скругления углов по умолчанию, px (v0.01.05: крупнее — плавнее). */
export const DEFAULT_CORNER_RADIUS = 16;
/** Шаг среза углов Чейкина (доля смежного отрезка) — v0.01.05. */
const CHAIKIN_RATIO = 0.25;
/** Предельный отступ среза угла Чейкина от вершины, px (v0.01.05):
 *  ограничивает отклонение сглаженной формы внутрь коридора. */
const CHAIKIN_MAX_CUT = 10;
/** Отношение контрольных точек кубической кривой к радиусу (v0.01.05):
 *  классическое приближение четверти окружности — 0.5523. */
const CUBIC_CONTROL = 0.5523;
/** Предел числа клеток решётки (защита от тяжёлых пересчётов при drag). */
const MAX_CELLS = 24000;
/** Радиус поиска свободной клетки от заблокированной точки, клеток. */
const MAX_CELL_SEARCH_RADIUS = 5;

const SQRT2 = Math.SQRT2;

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

/** Соседи клетки: сначала ортогональные, затем диагонали (без среза углов). */
const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Минимальная двоичная куча по приоритету (f, затем h — для детерминизма). */
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
 * Октальное расстояние (эвристика A* на 8 направлениях) — допустимая
 * (не завышенная) оценка длины пути между клетками.
 */
function octile(dx: number, dy: number): number {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  return absX > absY ? absX - absY + absY * SQRT2 : absY - absX + absX * SQRT2;
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

/** Путь A* по решётке: возвращает список клеток-индексов от старта к цели. */
function findGridPath(grid: Grid, start: number, goal: number): number[] | null {
  const { cols, rows, blocked } = grid;
  const goalCol = goal % cols;
  const goalRow = Math.floor(goal / cols);
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const heap = new MinHeap();
  // Эвристика считается напрямую от координат клеток:
  const startCol = start % cols;
  const startRow = Math.floor(start / cols);
  const hStart = octile(goalCol - startCol, goalRow - startRow);
  gScore[start] = 0;
  heap.push(hStart, hStart, start);
  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goal) {
      const path: number[] = [goal];
      let node = goal;
      while (cameFrom[node] >= 0) {
        node = cameFrom[node];
        path.push(node);
      }
      return path.reverse();
    }
    if (closed[current]) continue;
    closed[current] = 1;
    const col = current % cols;
    const row = Math.floor(current / cols);
    for (const [dc, dr, cost] of NEIGHBORS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * cols + nextCol;
      if (blocked[next] || closed[next]) continue;
      // Диагональ разрешена, только если свободны обе ортогональные клетки —
      // иначе путь срезает угол препятствия.
      if (dc !== 0 && dr !== 0) {
        if (blocked[row * cols + nextCol] || blocked[nextRow * cols + col]) continue;
      }
      const tentative = gScore[current] + cost;
      if (tentative < gScore[next]) {
        gScore[next] = tentative;
        cameFrom[next] = current;
        const h = octile(goalCol - nextCol, goalRow - nextRow);
        heap.push(tentative + h, h, next);
      }
    }
  }
  return null;
}

/** Упрощение ломаной «прямой видимостью» — остаются только повороты. */
function simplifyPath(points: RoutePoint[], obstacles: RouteRect[]): RoutePoint[] {
  if (points.length <= 2) return points.slice();
  const result: RoutePoint[] = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && crossesAny(points[i], points[j], obstacles)) j -= 1;
    result.push(points[j]);
    i = j;
  }
  return result;
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
    const hint = { x: first.x + sourceExit.x, y: first.y + sourceExit.y };
    if (!crossesAny(first, hint, expanded) && !crossesAny(hint, second, expanded)) {
      result = [first, hint, ...result.slice(1)];
    }
  }
  if (targetEntry && result.length >= 2) {
    const last = result[result.length - 1];
    const prev = result[result.length - 2];
    const hint = { x: last.x + targetEntry.x, y: last.y + targetEntry.y };
    if (!crossesAny(hint, last, expanded) && !crossesAny(prev, hint, expanded)) {
      result = [...result.slice(0, -1), hint, last];
    }
  }
  return result;
}

/**
 * Форма стрелки с обходом препятствий: список точек ломаной от порта-источника
 * к порту-приёмнику. Без пересечений возвращает прямой отрезок, при
 * невозможности обхода — тоже прямой отрезок (откат к прежнему поведению).
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
  if (!crossesAny(source, target, expanded)) {
    return [source, target];
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

  const cells = findGridPath(grid, start, goal);
  if (!cells || cells.length < 2) return [source, target];

  const cellPoints = cells.map((index) => ({
    x: grid.x0 + ((index % grid.cols) + 0.5) * grid.cell,
    y: grid.y0 + (Math.floor(index / grid.cols) + 0.5) * grid.cell,
  }));

  // Порог видимости чуть меньше блокирующего отступа: упрощённая ломаная
  // может подходить к домену ближе решётки, но не к самому контуру.
  const loose = expanded.map((rect) => expandRect(rect, -4));
  const simplified = simplifyPath(dedupePoints([source, ...cellPoints, target]), loose);
  // «Усики» проверяются по тому же порогу, что и упрощение: иначе коридор,
  // зажатый между доменами, отклонял бы усик при допустимой ломаной.
  return withPortHints(simplified, loose, options?.sourceExit, options?.targetEntry);
}

/**
 * Срез углов Чейкина (v0.01.05): каждый угол ломаной заменяется парой точек
 * на смежных отрезках — «лестница» превращается в плавную линию. Концы
 * ломаной (порты) остаются на местах; отступ среза ограничен (CHAIKIN_MAX_CUT),
 * чтобы сглаживание не приближало стрелку к доменам заметнее решётки.
 */
function chaikinCorners(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 3) return points.slice();
  const result: RoutePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (d1 < 0.5 || d2 < 0.5) {
      result.push(cur);
      continue;
    }
    const t1 = Math.min(CHAIKIN_RATIO, CHAIKIN_MAX_CUT / d1);
    const t2 = Math.min(CHAIKIN_RATIO, CHAIKIN_MAX_CUT / d2);
    result.push(
      { x: cur.x - (cur.x - prev.x) * t1, y: cur.y - (cur.y - prev.y) * t1 },
      { x: cur.x + (next.x - cur.x) * t2, y: cur.y + (next.y - cur.y) * t2 },
    );
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * SVG-путь по ломаной со сглаживанием (v0.01.05): сначала углы срезаются
 * по Чейкину, затем каждый поворот рисуется кубической кривой Безье
 * с касательными контрольными точками — классическое приближение дуги
 * окружности (коэффициент 0.5523): «M … L … C … L … C …». Радиус
 * скругления уменьшается до половины короткого смежного отрезка.
 */
export function polylineToRoundedPath(
  points: RoutePoint[],
  radius = DEFAULT_CORNER_RADIUS,
): string {
  if (points.length < 2) return '';
  const smooth = chaikinCorners(points);
  const fmt = (value: number) => Math.round(value * 100) / 100;
  const first = smooth[0];
  const last = smooth[smooth.length - 1];
  let d = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (let i = 1; i < smooth.length - 1; i += 1) {
    const prev = smooth[i - 1];
    const cur = smooth[i];
    const next = smooth[i + 1];
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (d1 < 0.5 || d2 < 0.5) continue;
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const t1x = (cur.x - prev.x) / d1;
    const t1y = (cur.y - prev.y) / d1;
    const t2x = (next.x - cur.x) / d2;
    const t2y = (next.y - cur.y) / d2;
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

  // Порт источника: стрелки с общим from сортируются по позиции приёмника.
  assignFan((edge) => edge.from, (edge) => edge.to, 'sourceFan');
  // Порт приёмника: стрелки с общим to сортируются по позиции источника.
  assignFan((edge) => edge.to, (edge) => edge.from, 'targetFan');
  return fans;
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
