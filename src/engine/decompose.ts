/**
 * Алгоритм декомпозиции домена — раздел 7.3 ТЗ (плоская модель, решение D5).
 * Домен заменяется группой из k доменов (2..6) того же уровня; стрелки
 * переподключаются по назначению; функции исходного домена возвращаются в пул.
 * Отказ по любому параметру оставляет модель неизменной (транзакционность).
 */

import type { Block, Edge, Project } from './types';
import { ID_PATTERN } from './types';

export interface DecomposeChildSpec {
  name: string;
  cost: number;
}

/** Назначение стрелки исходного домена одному из потомков (индекс с 0). */
export interface DecomposeEdgeAssignment {
  edgeId: string;
  childIndex: number;
}

export interface DecomposeInput {
  blockId: string;
  children: DecomposeChildSpec[];
  edgeAssignments: DecomposeEdgeAssignment[];
}

export type DecomposeResult =
  | { ok: true; project: Project }
  | { ok: false; errors: string[] };

/** Уникальный идентификатор потомка: <id родителя>-<n> с подбором свободного суффикса. */
function generateChildId(project: Project, parentId: string, index: number): string {
  const taken = new Set(project.architecture.blocks.map((b) => b.id));
  let base = `${parentId}-${index + 1}`;
  if (base.length > 64 || !ID_PATTERN.test(base)) {
    base = `blk-child-${index + 1}`;
  }
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/**
 * Декомпозиция домена. Все проверки выполняются до применения —
 * при отказе возвращается список ошибок и модель не изменяется (T-D-01).
 */
export function decompose(project: Project, input: DecomposeInput): DecomposeResult {
  const errors: string[] = [];
  const parent = project.architecture.blocks.find((b) => b.id === input.blockId);
  if (!parent) {
    return { ok: false, errors: ['Домен не найден'] };
  }
  // Декомпозировать можно только внутренние домены (3.5 v0.01.01):
  // внешняя система — цельный объект смежной среды, не часть целевой системы.
  if (parent.external) {
    return { ok: false, errors: ['Декомпозировать можно только внутренние домены: внешняя система не входит в периметр целевой системы'] };
  }
  const k = input.children.length;
  if (k < 2 || k > 6) {
    errors.push('Число дочерних доменов должно быть от 2 до 6');
  }
  const otherNames = new Set(
    project.architecture.blocks.filter((b) => b.id !== input.blockId).map((b) => b.name),
  );
  const childNames = new Set<string>();
  input.children.forEach((child, index) => {
    if (!child.name || child.name.trim().length === 0) {
      errors.push(`Имя потомка ${index + 1} не может быть пустым`);
    } else if (otherNames.has(child.name) || childNames.has(child.name)) {
      errors.push(`Имя потомка «${child.name}» совпадает с именем другого домена`);
    } else {
      childNames.add(child.name);
    }
    if (!Number.isInteger(child.cost) || child.cost < 0) {
      errors.push(`Стоимость потомка ${index + 1} должна быть целым числом не меньше 0`);
    }
  });

  const touching = project.architecture.edges.filter(
    (edge) => edge.from === input.blockId || edge.to === input.blockId,
  );
  const assigned = new Map<string, number>();
  for (const edge of touching) {
    const record = input.edgeAssignments.find((a) => a.edgeId === edge.id);
    if (!record || record.childIndex < 0 || record.childIndex >= k) {
      errors.push(`Стрелка «${edge.id}» не назначена ни одному потомку`);
    } else {
      assigned.set(edge.id, record.childIndex);
    }
  }
  for (const record of input.edgeAssignments) {
    if (!touching.some((edge) => edge.id === record.edgeId)) {
      errors.push(`Стрелка «${record.edgeId}» не принадлежит декомпозируемому домену`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Транзакция: создание потомков, переподключение стрелок, возврат функций в пул (T-D-03).
  const childIds: string[] = [];
  const children: Block[] = input.children.map((child, index) => {
    const id = generateChildId(project, input.blockId, index);
    childIds.push(id);
    return {
      id,
      name: child.name,
      cost: child.cost,
      position: {
        x: (parent.position?.x ?? 0) + (index % 2) * 300,
        y: (parent.position?.y ?? 0) + Math.floor(index / 2) * 200,
      },
    };
  });

  const newEdges: Edge[] = project.architecture.edges.map((edge) => {
    const childIndex = assigned.get(edge.id);
    if (childIndex === undefined) return edge;
    const target = childIds[childIndex];
    if (edge.from === input.blockId && edge.to === input.blockId) return edge;
    return {
      ...edge,
      from: edge.from === input.blockId ? target : edge.from,
      to: edge.to === input.blockId ? target : edge.to,
    };
  });

  const newBlocks = [
    ...project.architecture.blocks.filter((b) => b.id !== input.blockId),
    ...children,
  ];
  // Функции декомпозированного домена возвращаются в пул (T-D-03).
  const assignments = project.assignments.filter((a) => a.block !== input.blockId);

  return {
    ok: true,
    project: {
      ...project,
      architecture: { blocks: newBlocks, edges: newEdges },
      assignments,
    },
  };
}
