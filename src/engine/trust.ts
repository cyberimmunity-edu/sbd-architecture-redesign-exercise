/**
 * Модель доверия доменов и целостности потоков данных — раздел 3.5 ТЗ v0.01.01.
 *
 * Состояния внутренних доменов безопасности:
 * - НДБ (ndb) — недоверенный домен: полупрозрачная красная заливка.
 *   Внутренний домен, в котором нет ни одной функции безопасности, критичной
 *   хотя бы для одной цели безопасности, и который не введён в ДВБ
 *   принудительно (v0.01.06).
 * - ДДБ (ddb) — доверенный домен безопасности: зелёная заливка. Домен введён
 *   в доверенную вычислительную базу (в нём есть критичная функция), и все
 *   входящие в него стрелки зелёные (в том числе при отсутствии входящих).
 * - ДДБПЦД (ddbpcd) — доверенный домен, повышающий целостность данных:
 *   жёлтая заливка. Домен введён в ДВБ, но в него входит хотя бы одна
 *   красная стрелка (низкоцелостный поток).
 *
 * Внешние (смежные) системы не получают функций и не входят в ДВБ через
 * размещение: они могут быть доверенными (зелёные, явный признак trusted)
 * или недоверенными (красные, по умолчанию).
 *
 * Цвет стрелки (целостность потока данных):
 * - зелёный — высокоцелостный поток, исходит из доверенного источника
 *   (ДДБ, ДДБПЦД или доверенная внешняя система);
 * - красный — низкоцелостный поток во всех остальных случаях.
 *
 * Функция считается критичной для цели, если у неё есть связь implements
 * с этой целью (любой вес); «критичность хотя бы для одной цели» — это
 * наличие хотя бы одной такой связи (решение D4 раздела 3.2 ТЗ).
 *
 * Раскраска пересчитывается автоматически при любом изменении архитектуры,
 * спецификации безопасности или размещений: recalcCosts и UI-канва вызывают
 * computeTrust на актуальной модели проекта (раздел 5.3 ТЗ v0.01.01).
 */

import type { Architecture, Project } from './types';

/** Класс доверия внутреннего домена (3.5). */
export type DomainTrustClass = 'ndb' | 'ddb' | 'ddbpcd';

/** Цвет доверенного/недоверенного элемента модели. */
export type TrustColor = 'red' | 'yellow' | 'green';

/** Коэффициенты доверия формулы стоимости — раздел 3.3 ТЗ v0.01.01. */
export const TRUST_COST_COEFFICIENT: Record<DomainTrustClass, number> = {
  ndb: 0.1,
  ddb: 5,
  ddbpcd: 10,
};

/** Результат пересчёта доверия по всему проекту. */
export interface TrustResult {
  /** Класс доверия каждого внутреннего домена. */
  internal: Map<string, DomainTrustClass>;
  /** Цвет каждой внешней системы: red — недоверенная, green — доверенная. */
  external: Map<string, TrustColor>;
  /** Цвет каждой стрелки: green — высокоцелостный поток, red — низкоцелостный. */
  edges: Map<string, TrustColor>;
}

/**
 * Идентификаторы доменов, содержащих хотя бы одну функцию, критичную
 * хотя бы для одной цели безопасности (основание ввода в ДВБ).
 * v0.01.06: в ДВБ входят также домены с явным признаком forceTrusted —
 * принудительный ввод без критичной функции (например, доверенные датчики);
 * для внешних систем признак не применяется (их доверенность — trusted).
 */
export function trustedBlockIds(project: Project): Set<string> {
  const critical = new Set(
    project.security.functions
      .filter((fn) => (fn.implements ?? []).length > 0)
      .map((fn) => fn.id),
  );
  const trusted = new Set(
    project.assignments
      .filter((assignment) => critical.has(assignment.function))
      .map((assignment) => assignment.block),
  );
  // Принудительный ввод в ДВБ (v0.01.06): только внутренние домены.
  for (const block of project.architecture.blocks) {
    if (!block.external && block.forceTrusted) trusted.add(block.id);
  }
  return trusted;
}

/**
 * Полный пересчёт доверия доменов и цветов стрелок (раздел 3.5).
 * Заливка доверенного домена: жёлтая при наличии входящей красной стрелки,
 * иначе зелёная. Все исходящие из доверенного домена стрелки — зелёные.
 */
export function computeTrust(project: Project): TrustResult {
  const trusted = trustedBlockIds(project);
  const internal = new Map<string, DomainTrustClass>();
  const external = new Map<string, TrustColor>();

  for (const block of project.architecture.blocks) {
    if (block.external) {
      // Внешние системы: доверенная только по явному признаку trusted.
      external.set(block.id, block.trusted ? 'green' : 'red');
    } else {
      internal.set(block.id, trusted.has(block.id) ? 'ddb' : 'ndb');
    }
  }

  // Цвет стрелки определяется доверенностью источника потока.
  const trustedSources = new Set<string>(trusted);
  for (const [id, color] of external) {
    if (color === 'green') trustedSources.add(id);
  }
  const edges = new Map<string, TrustColor>();
  for (const edge of project.architecture.edges) {
    edges.set(edge.id, trustedSources.has(edge.from) ? 'green' : 'red');
  }

  // Доверенный домен с хотя бы одной входящей красной стрелкой — ДДБПЦД.
  const hasRedIncoming = new Set<string>();
  for (const edge of project.architecture.edges) {
    if (edges.get(edge.id) === 'red') hasRedIncoming.add(edge.to);
  }
  for (const [id, cls] of internal) {
    if (cls === 'ddb' && hasRedIncoming.has(id)) internal.set(id, 'ddbpcd');
  }

  return { internal, external, edges };
}

/** Цвет заливки домена по классу доверия и признаку внешней системы. */
export function trustFill(
  cls: DomainTrustClass | 'external',
  externalTrusted: boolean,
): TrustColor {
  if (cls === 'external') return externalTrusted ? 'green' : 'red';
  if (cls === 'ndb') return 'red';
  return cls === 'ddbpcd' ? 'yellow' : 'green';
}

/** Русские подписи классов доверия (НФ-8: строки интерфейса — в i18n). */
export const TRUST_SHORT: Record<DomainTrustClass, string> = {
  ndb: 'НДБ',
  ddb: 'ДДБ',
  ddbpcd: 'ДДБПЦД',
};

/* ------------------------------------------------------------------ */
/* Рамка периметра целевой системы                                     */
/* ------------------------------------------------------------------ */

/** Оценочные размеры узла домена для геометрии рамки (узел 240–320 px шириной). */
export const NODE_ESTIMATED_WIDTH = 300;
export const NODE_ESTIMATED_HEIGHT = 170;
/** Внутренний отступ рамки периметра вокруг внутренних доменов. */
export const FRAME_PADDING = 60;

/** Прямоугольник рамки периметра целевой системы на канве. */
export interface FrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Рамка периметра охватывает только внутренние домены (внешние системы
 * находятся вне периметра). При отсутствии внутренних доменов рамка не
 * строится — возвращается null.
 */
export function frameBounds(architecture: Pick<Architecture, 'blocks'>): FrameBounds | null {
  const internal = architecture.blocks.filter((b) => !b.external);
  if (internal.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of internal) {
    const position = block.position ?? { x: 0, y: 0 };
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + NODE_ESTIMATED_WIDTH);
    maxY = Math.max(maxY, position.y + NODE_ESTIMATED_HEIGHT);
  }
  return {
    x: minX - FRAME_PADDING,
    y: minY - FRAME_PADDING,
    width: maxX - minX + FRAME_PADDING * 2,
    height: maxY - minY + FRAME_PADDING * 2,
  };
}

/**
 * Внешняя система не может размещаться внутри рамки периметра: позиция
 * центра внутри рамки считается недопустимой (3.5 ТЗ v0.01.01).
 */
export function isInsideFrame(
  position: { x: number; y: number },
  frame: FrameBounds,
): boolean {
  const cx = position.x + NODE_ESTIMATED_WIDTH / 2;
  const cy = position.y + NODE_ESTIMATED_HEIGHT / 2;
  return (
    cx > frame.x &&
    cx < frame.x + frame.width &&
    cy > frame.y &&
    cy < frame.y + frame.height
  );
}

/**
 * Внешняя система с позицией внутри рамки выносится вправо за периметр.
 * Чистая функция: архитектура не изменяется, возвращается новая при необходимости.
 */
export function snapExternalsOutside(architecture: Architecture): Architecture {
  const frame = frameBounds(architecture);
  if (!frame) return architecture;
  let moved = false;
  const blocks = architecture.blocks.map((block) => {
    if (!block.external || !block.position) return block;
    if (!isInsideFrame(block.position, frame)) return block;
    moved = true;
    return {
      ...block,
      position: { x: frame.x + frame.width + 80, y: block.position.y },
    };
  });
  if (!moved) return architecture;
  return { ...architecture, blocks };
}
