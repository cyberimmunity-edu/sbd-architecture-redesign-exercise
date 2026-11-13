/**
 * Логические группы ДБ (ЛГ) на ДАП — v0.02.03, Ф-70…Ф-76, по аналогии
 * с группами Flying Logic. Все функции чистые: архитектура не изменяется.
 *
 * Модель: у блока — groupId (одна ЛГ), у ЛГ — parentId (вложенность до
 * MAX_LG_DEPTH). Прямоугольник развёрнутой ЛГ охватывает свои ДБ и вложенные
 * ЛГ (вычисляется из позиций, не хранится); свёрнутая ЛГ отображается
 * небольшим блоком в левом верхнем углу охватывающего прямоугольника.
 *
 * Видимость: ЛГ отображается, когда развёрнута вся цепочка её предков;
 * ДБ скрыт, если хотя бы один его предок-ЛГ свёрнут. Связи скрытых ДБ
 * переносятся на ближайшую к корню свёрнутую ЛГ (Ф-72): все связи ведут
 * только к прямоугольнику ЛГ или от него; связи между ДБ одной свёрнутой
 * ЛГ не отображаются вовсе. В развёрнутой ЛГ связи проходят сквозь границу
 * ЛГ к ДБ и от них (рамка — не препятствие трассировки).
 *
 * Цвета ЛГ (П-15): палитра LG_COLORS без красного, жёлтого и зелёного —
 * эти цвета зарезервированы под уровни доверия ДБ; по умолчанию серый.
 */

import type { Architecture, Block, DomainGroup } from './types';
import { LG_DEFAULT_COLOR, LG_COLORS, MAX_LG_DEPTH } from './types';

/** Прямоугольник на канве (px, координаты потока). */
export interface LgRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Габариты ДБ для геометрии ЛГ (измеренные или оценочные). */
export type BlockSize = { width: number; height: number };

/** Отступ рамки ЛГ вокруг охватывающего прямоугольника членов, px. */
export const LG_FRAME_PADDING = 24;
/** Размер рамки свёрнутой ЛГ и пустой ЛГ, px. */
export const LG_COLLAPSED_WIDTH = 230;
export const LG_COLLAPSED_HEIGHT = 46;
/** Оценочные габариты скрытого ДБ (совпадают с оценкой рамки периметра). */
export const LG_HIDDEN_BLOCK_WIDTH = 300;
export const LG_HIDDEN_BLOCK_HEIGHT = 170;

/* ------------------------------------------------------------------ */
/* Вложенность                                                         */
/* ------------------------------------------------------------------ */

/** Карта «id ЛГ → глубина» (верхний уровень — 0). Циклы дают глубину 0. */
export function groupDepths(groups: DomainGroup[]): Map<string, number> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const depths = new Map<string, number>();
  for (const group of groups) {
    const seen = new Set<string>([group.id]);
    let depth = 0;
    let parent = group.parentId ? byId.get(group.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      depth += 1;
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    depths.set(group.id, depth);
  }
  return depths;
}

/** Цепочка предков ЛГ (от ближайшего к корню), без самой группы. */
export function groupAncestors(groups: DomainGroup[], id: string): string[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id);
  while (current?.parentId && !seen.has(current.parentId)) {
    chain.push(current.parentId);
    seen.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return chain;
}

/** Поддерево ЛГ (сама группа и все её потомки). */
export function groupSubtree(groups: DomainGroup[], id: string): string[] {
  const result = [id];
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (group.parentId && result.includes(group.parentId) && !result.includes(group.id)) {
        result.push(group.id);
        changed = true;
      }
    }
  }
  return result;
}

/** Глубина, которую получила бы новая ЛГ с родителем parentId (0 — корень). */
export function depthUnderParent(groups: DomainGroup[], parentId: string | null): number {
  if (!parentId) return 0;
  const depths = groupDepths(groups);
  return (depths.get(parentId) ?? 0) + 1;
}

/** Проверка допустимой глубины при создании/переносе ЛГ (Ф-71). */
export function depthAllowed(groups: DomainGroup[], parentId: string | null): boolean {
  return depthUnderParent(groups, parentId) < MAX_LG_DEPTH;
}

/* ------------------------------------------------------------------ */
/* Членство                                                            */
/* ------------------------------------------------------------------ */

/** Прямые члены-ДБ каждой ЛГ (из блоков, неизвестные группы игнорируются). */
export function groupBlockMembers(arch: Pick<Architecture, 'blocks' | 'groups'>): Map<string, string[]> {
  const groupIds = new Set((arch.groups ?? []).map((g) => g.id));
  const map = new Map<string, string[]>();
  for (const id of groupIds) map.set(id, []);
  for (const block of arch.blocks) {
    if (!block.groupId) continue;
    const list = map.get(block.groupId);
    if (list) list.push(block.id);
  }
  return map;
}

/** Прямые члены-ДБ одной ЛГ. */
export function blocksOfGroup(arch: Pick<Architecture, 'blocks'>, groupId: string): string[] {
  return arch.blocks.filter((b) => b.groupId === groupId).map((b) => b.id);
}

/** Число прямых ДБ-членов ЛГ. */
export function groupMemberCount(arch: Pick<Architecture, 'blocks'>, groupId: string): number {
  return blocksOfGroup(arch, groupId).length;
}

/** Все ДБ поддерева ЛГ (прямые члены и члены вложенных ЛГ на любой глубине). */
export function subtreeBlockIds(
  arch: Pick<Architecture, 'blocks' | 'groups'>,
  groupId: string,
): string[] {
  const ids = new Set(groupSubtree(arch.groups ?? [], groupId));
  return arch.blocks.filter((b) => b.groupId && ids.has(b.groupId)).map((b) => b.id);
}

/** Якорь пустой ЛГ: левый верхний угол охвата позиций перечисленных ДБ; null — список пуст. */
export function blocksRectAnchor(
  blocks: Pick<Block, 'id' | 'position'>[],
): { x: number; y: number } | null {
  const cover = unionRects(blocks.map((b) => blockRect(b, null)));
  return cover ? { x: cover.x, y: cover.y } : null;
}

/** ЛГ пуста: нет ни прямых ДБ, ни вложенных ЛГ. */
export function isGroupEmpty(
  arch: Pick<Architecture, 'blocks' | 'groups'>,
  groupId: string,
): boolean {
  const groups = arch.groups ?? [];
  const hasBlocks = arch.blocks.some((b) => b.groupId === groupId);
  if (hasBlocks) return false;
  return !groups.some((g) => g.parentId === groupId);
}

/* ------------------------------------------------------------------ */
/* Цвета и имена (П-15)                                                */
/* ------------------------------------------------------------------ */

/** Цвет входит в палитру ЛГ (красный/жёлтый/зелёный в неё не входят). */
export function isAllowedGroupColor(color: string | undefined): boolean {
  if (!color) return false;
  return (LG_COLORS as readonly string[]).includes(color);
}

/** Цвет ЛГ, приведённый к палитре: недопустимый заменяется серым. */
export function normalizeGroupColor(color: string | undefined): string {
  return isAllowedGroupColor(color) ? (color as string) : LG_DEFAULT_COLOR;
}

/** Уникальное имя ЛГ: «База», «База (2)», «База (3)»… */
export function uniqueGroupName(groups: DomainGroup[], base: string): string {
  const taken = new Set(groups.map((g) => g.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/* ------------------------------------------------------------------ */
/* Видимость и перенос связей (Ф-72)                                   */
/* ------------------------------------------------------------------ */

export interface GroupVisibility {
  /** ЛГ, отображаемые как развёрнутая рамка (все предки развёрнуты). */
  visibleExpanded: Set<string>;
  /** ЛГ, отображаемые свёрнутым блоком (сама свёрнута, предки развёрнуты). */
  visibleCollapsed: Set<string>;
  /** ДБ, скрытые внутри свёрнутых ЛГ (своей или предков). */
  hiddenBlocks: Set<string>;
  /** Для каждого скрытого ДБ — ближайшая к корню видимая свёрнутая ЛГ. */
  collapsedTarget: Map<string, string>;
}

/**
 * Видимость ЛГ и ДБ при текущих флагах collapsed. Чистая функция; циклы
 * parentId (возможны только из повреждённого файла) разрываются защитно.
 */
export function computeGroupVisibility(arch: Pick<Architecture, 'blocks' | 'groups'>): GroupVisibility {
  const groups = arch.groups ?? [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const depths = groupDepths(groups);
  const ordered = [...groups].sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0));

  const visibleExpanded = new Set<string>();
  const visibleCollapsed = new Set<string>();
  // Свёрнутый предок, под которым лежит ЛГ (null — цепочка развёрнута).
  const collapsedCover = new Map<string, string | null>();

  for (const group of ordered) {
    const cover = group.parentId ? collapsedCover.get(group.parentId) ?? null : null;
    if (cover) {
      // ЛГ скрыта внутри свёрнутого предка.
      collapsedCover.set(group.id, cover);
      continue;
    }
    if (group.collapsed) {
      visibleCollapsed.add(group.id);
      collapsedCover.set(group.id, group.id);
    } else {
      visibleExpanded.add(group.id);
      collapsedCover.set(group.id, null);
    }
  }

  const hiddenBlocks = new Set<string>();
  const collapsedTarget = new Map<string, string>();
  for (const block of arch.blocks) {
    if (!block.groupId || !byId.has(block.groupId)) continue;
    // Ближайший к корню свёрнутый предок цепочки (включая свою ЛГ):
    // предки упорядочены от корня, поэтому берём последний свёрнутый.
    const chain = [...groupAncestors(groups, block.groupId).reverse(), block.groupId];
    let target: string | null = null;
    for (const id of chain) {
      if (visibleCollapsed.has(id)) target = id;
    }
    if (target) {
      hiddenBlocks.add(block.id);
      collapsedTarget.set(block.id, target);
    }
  }

  return { visibleExpanded, visibleCollapsed, hiddenBlocks, collapsedTarget };
}

/** Перенос конца связи на свёрнутую ЛГ; null — связь целиком скрыта (Ф-72). */
export function remapEdgeEnd(
  blockId: string,
  visibility: GroupVisibility,
): string | null {
  if (!visibility.hiddenBlocks.has(blockId)) return blockId;
  return visibility.collapsedTarget.get(blockId) ?? null;
}

export interface RemappedEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Оба конца скрыты одной и той же свёрнутой ЛГ — связь не отображается. */
  internal: boolean;
}

/**
 * Перенос связей на рамки свёрнутых ЛГ (Ф-72): конец скрытого ДБ ведёт
 * к ближайшей видимой свёрнутой ЛГ; связи между членами одной свёрнутой
 * ЛГ помечаются internal и не отображаются.
 */
export function remapEdgesForDisplay(
  edges: Pick<import('./types').Edge, 'id' | 'from' | 'to' | 'label'>[],
  visibility: GroupVisibility,
): RemappedEdge[] {
  const result: RemappedEdge[] = [];
  for (const edge of edges) {
    const from = remapEdgeEnd(edge.from, visibility);
    const to = remapEdgeEnd(edge.to, visibility);
    if (from === null || to === null) continue;
    result.push({
      id: edge.id,
      from,
      to,
      ...(edge.label ? { label: edge.label } : {}),
      internal: from === to,
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Геометрия рамок                                                     */
/* ------------------------------------------------------------------ */

/** Охватывающий прямоугольник набора прямоугольников; null — набор пуст. */
export function unionRects(rects: LgRect[]): LgRect | null {
  if (rects.length === 0) return null;
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
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Прямоугольник ДБ по позиции и габаритам (с оценочными по умолчанию). */
export function blockRect(
  block: Pick<Block, 'id' | 'position'>,
  sizes: Map<string, BlockSize> | null,
): LgRect {
  const size = sizes?.get(block.id) ?? {
    width: LG_HIDDEN_BLOCK_WIDTH,
    height: LG_HIDDEN_BLOCK_HEIGHT,
  };
  const position = block.position ?? { x: 0, y: 0 };
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

export interface GroupGeometry {
  /** Прямоугольник отображения: развёрнутая рамка, свёрнутый блок или пустая ЛГ. */
  rect: LgRect;
  /** ЛГ отображается свёрнутым блоком. */
  collapsed: boolean;
  /** ЛГ пуста (нет ДБ и вложенных ЛГ). */
  empty: boolean;
}

/**
 * Прямоугольники видимых ЛГ. Развёрнутая рамка охватывает прямые ДБ-члены
 * и рамки вложенных ЛГ с отступом LG_FRAME_PADDING; свёрнутая ЛГ — блок
 * LG_COLLAPSED_* в левом верхнем углу охватывающего прямоугольника членов;
 * пустая ЛГ — блок в якоре group.position. ЛГ под свёрнутым предком не
 * вычисляются (они скрыты). Члены берутся из переданных прямоугольников
 * (живые позиции канвы) или из позиций модели с оценочными габаритами.
 */
export function computeGroupGeometry(
  arch: Pick<Architecture, 'blocks' | 'groups'>,
  liveRects: Map<string, LgRect> | null,
  visibility: GroupVisibility,
): Map<string, GroupGeometry> {
  const groups = arch.groups ?? [];
  const depths = groupDepths(groups);
  const blockMembers = groupBlockMembers(arch);
  // От корня к листьям: рамки детей готовы к моменту расчёта родителя.
  const ordered = [...groups]
    .filter((g) => visibility.visibleExpanded.has(g.id) || visibility.visibleCollapsed.has(g.id))
    .sort((a, b) => (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0));

  const childRects = new Map<string, LgRect[]>();
  const result = new Map<string, GroupGeometry>();
  for (const group of ordered) {
    const collapsed = visibility.visibleCollapsed.has(group.id);
    if (collapsed) {
      // Свёрнутая ЛГ: якорь — левый верхний угол охвата всех ДБ поддерева
      // (включая скрытые ДБ вложенных ЛГ); живых прямоугольников у скрытых
      // ДБ нет — позиции модели с оценочными габаритами.
      const ids = subtreeBlockIds(arch, group.id);
      const memberRects = ids.flatMap((id) => {
        const block = arch.blocks.find((b) => b.id === id);
        return block ? [blockRect(block, null)] : [];
      });
      const cover = unionRects(memberRects);
      result.set(group.id, {
        rect: {
          x: cover ? cover.x : group.position?.x ?? 80,
          y: cover ? cover.y : group.position?.y ?? 80,
          width: LG_COLLAPSED_WIDTH,
          height: LG_COLLAPSED_HEIGHT,
        },
        collapsed: true,
        empty: cover === null,
      });
      continue;
    }
    const memberRects = [
      ...(blockMembers.get(group.id) ?? []).flatMap((id) => {
        const live = liveRects?.get(id);
        if (live) return [live];
        const block = arch.blocks.find((b) => b.id === id);
        return block ? [blockRect(block, null)] : [];
      }),
      ...(childRects.get(group.id) ?? []),
    ];
    const cover = unionRects(memberRects);
    if (!cover) {
      // Пустая развёрнутая ЛГ: небольшой блок в якоре group.position.
      const rect = {
        x: group.position?.x ?? 80,
        y: group.position?.y ?? 80,
        width: LG_COLLAPSED_WIDTH,
        height: LG_COLLAPSED_HEIGHT,
      };
      result.set(group.id, { rect, collapsed: false, empty: true });
      childRects.set(group.id, [rect]);
      continue;
    }
    const rect = {
      x: cover.x - LG_FRAME_PADDING,
      y: cover.y - LG_FRAME_PADDING,
      width: cover.width + LG_FRAME_PADDING * 2,
      height: cover.height + LG_FRAME_PADDING * 2,
    };
    result.set(group.id, { rect, collapsed: false, empty: false });
    childRects.set(group.id, [rect]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Нормализация при разборе файлов (W-010…W-012)                       */
/* ------------------------------------------------------------------ */

export type GroupIssueKind = 'unknownRef' | 'badColor' | 'cycle';

export interface GroupIssue {
  kind: GroupIssueKind;
  /** id группы или блока с проблемой. */
  id: string;
  /** Ссылка, которую не удалось разрешить (для unknownRef). */
  ref?: string;
  /** Путь в файле данных для сообщения валидации (например, blocks[2].group). */
  path?: string;
}

export interface NormalizedGroups {
  architecture: Architecture;
  issues: GroupIssue[];
}

/**
 * Защитная нормализация групп из файла: неизвестные ссылки на группы
 * удаляются (блок остаётся несгруппированным, ЛГ — верхнего уровня),
 * цвета вне палитры заменяются серым, циклы parentId разрываются.
 * Порядок ссылок не изменяется; группы без проблем сохраняются как есть.
 */
export function normalizeGroups(architecture: Architecture): NormalizedGroups {
  const issues: GroupIssue[] = [];
  const rawGroups = architecture.groups ?? [];
  const byId = new Map<string, DomainGroup>();
  const duplicateIds = new Set<string>();
  for (const group of rawGroups) {
    if (byId.has(group.id)) duplicateIds.add(group.id);
    else byId.set(group.id, group);
  }
  if (rawGroups.length === 0 && !architecture.blocks.some((b) => b.groupId)) {
    // Файл без ЛГ — модель возвращается без изменений (обратная совместимость).
    return { architecture, issues };
  }

  // 1. Ссылки: parentId на существующую группу, без дубликатов.
  const groups: DomainGroup[] = rawGroups.map((group, index) => {
    if (duplicateIds.has(group.id)) return group; // сообщит валидатор E-101
    let parentId: string | undefined = group.parentId;
    if (parentId && !byId.has(parentId)) {
      issues.push({ kind: 'unknownRef', id: group.id, ref: parentId, path: `groups[${index}].parent` });
      parentId = undefined;
    }
    let color = group.color;
    if (color === undefined) {
      // Цвет не задан — серый по умолчанию без предупреждения.
      color = LG_DEFAULT_COLOR;
    } else if (!isAllowedGroupColor(color)) {
      issues.push({ kind: 'badColor', id: group.id, path: `groups[${index}].color` });
      color = LG_DEFAULT_COLOR;
    }
    // Исходный parentId не переносится: при удалённой ссылке ключ не пишется.
    const { parentId: _rawParent, ...rest } = group;
    return {
      ...rest,
      ...(parentId ? { parentId } : {}),
      color,
    };
  });

  // 2. Циклы parentId: у каждого участника цикла связь с родителем разрывается.
  const broken = new Set<string>();
  for (const group of groups) {
    const seen = new Set<string>([group.id]);
    let current = group;
    while (current.parentId && byId.has(current.parentId)) {
      if (seen.has(current.parentId)) {
        // current — первая вершина возврата в пройденное множество.
        if (!broken.has(current.id)) {
          broken.add(current.id);
          issues.push({ kind: 'cycle', id: current.id });
        }
        break;
      }
      seen.add(current.parentId);
      current = byId.get(current.parentId)!;
    }
  }

  // 3. Ссылки блоков на несуществующие группы.
  const blocks: Block[] = architecture.blocks.map((block, index) => {
    if (!block.groupId) return block;
    if (!byId.has(block.groupId) || duplicateIds.has(block.groupId)) {
      issues.push({ kind: 'unknownRef', id: block.id, ref: block.groupId, path: `blocks[${index}].group` });
      const { groupId: _dropped, ...rest } = block;
      return rest;
    }
    return block;
  });

  return {
    architecture: {
      ...architecture,
      blocks,
      // Секция сохраняется только при наличии групп (файлы без ЛГ не меняются).
      ...(rawGroups.length > 0
        ? { groups: groups.map((g) => (broken.has(g.id) ? { ...g, parentId: undefined } : g)) }
        : {}),
    },
    issues,
  };
}
