/**
 * Алгоритм расчёта покрытия — раздел 7.2 ТЗ, правила — раздел 3.4 (решение D4).
 */

import type { Project, Status } from './types';

/**
 * Статус одной цели по таблице 3.4:
 * - цель без связанных функций — красная (предупреждение W-003 фиксируется при валидации);
 * - M(t) непуст: все mandatory размещены — зелёный; иначе размещена хотя бы одна
 *   функция из M(t) ∪ O(t) — жёлтый; иначе красный;
 * - M(t) пуст, O(t) непуст: все optional размещены — зелёный; часть — жёлтый; нет — красный.
 */
export function goalStatus(project: Project, goalId: string): Status {
  let mandatory: string[] = [];
  let optional: string[] = [];
  for (const fn of project.security.functions) {
    for (const link of fn.implements ?? []) {
      if (link.goal !== goalId) continue;
      if (link.weight === 'mandatory') mandatory.push(fn.id);
      else optional.push(fn.id);
    }
  }
  const placed = new Set(project.assignments.map((a) => a.function));
  mandatory = [...new Set(mandatory)];
  optional = [...new Set(optional)];

  if (mandatory.length === 0 && optional.length === 0) {
    return 'red'; // W-003
  }
  if (mandatory.length > 0) {
    const m = mandatory.filter((id) => placed.has(id)).length;
    if (m === mandatory.length) return 'green';
    const o = optional.filter((id) => placed.has(id)).length;
    if (m + o > 0) return 'yellow';
    return 'red';
  }
  const o = optional.filter((id) => placed.has(id)).length;
  if (o === optional.length) return 'green';
  if (o > 0) return 'yellow';
  return 'red';
}

/**
 * Агрегат статусов по правилу «худшего статуса» (3.4, правило 1):
 * красный, если есть красная; иначе жёлтый, если есть жёлтая; иначе зелёный.
 */
export function aggregateStatus(statuses: Status[]): Status {
  if (statuses.length === 0) return 'green';
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}

/** Строка сведений об обеспечивающем механизме цели (v0.01.09). */
export interface GoalFunctionRow {
  id: string;
  name: string;
  cost: number;
  /** Вес связи «функция — цель» (решение D4). */
  weight: 'mandatory' | 'optional';
  /** Домен размещения или null — функция в пуле. */
  blockId: string | null;
}

/** Строка сведений о критичном домене цели (v0.01.09). */
export interface GoalDomainRow {
  id: string;
  name: string;
}

/** Распределение цели — карточка ЦБ (v0.01.09): механизмы, их размещение
 *  и критичные домены — домены, где размещены функции, обязательные
 *  (mandatory) для цели. Чистая функция: только чтение модели. */
export interface GoalDistribution {
  goalId: string;
  status: Status;
  /** Обеспечивающие механизмы — все функции, связанные с целью. */
  functions: GoalFunctionRow[];
  /** Критичные домены — домены обязательных механизмов, без повторов. */
  criticalDomains: GoalDomainRow[];
}

/**
 * Распределение цели безопасности (v0.01.09): статус покрытия по таблице 3.4,
 * список обеспечивающих механизмов (функций) с весом и доменом размещения,
 * критичные домены — домены, в которых размещены обязательные функции цели.
 * Порядок списков следует порядку функций в модели — детерминированно.
 */
export function goalDistribution(project: Project, goalId: string): GoalDistribution {
  const blockById = new Map(project.architecture.blocks.map((b) => [b.id, b]));
  const placementByFn = new Map(project.assignments.map((a) => [a.function, a.block]));
  const functions: GoalFunctionRow[] = [];
  const domainIds: string[] = [];
  for (const fn of project.security.functions) {
    const link = (fn.implements ?? []).find((l) => l.goal === goalId);
    if (!link) continue;
    const blockId = placementByFn.get(fn.id) ?? null;
    functions.push({ id: fn.id, name: fn.name, cost: fn.cost, weight: link.weight, blockId });
    if (link.weight === 'mandatory' && blockId && !domainIds.includes(blockId)) {
      domainIds.push(blockId);
    }
  }
  const criticalDomains: GoalDomainRow[] = domainIds
    .map((id) => ({ id, name: blockById.get(id)?.name ?? id }))
    .filter((row) => blockById.has(row.id));
  return {
    goalId,
    status: goalStatus(project, goalId),
    functions,
    criticalDomains,
  };
}

/**
 * Полный пересчёт покрытия (Ф-18): статусы целей, агрегат доменов
 * (домен без функций — нейтральный) и статус системы.
 */
export function recalcCoverage(project: Project): {
  goalStatuses: Map<string, Status>;
  domainStatuses: Map<string, Status>;
  systemStatus: Status;
} {
  const goalStatuses = new Map<string, Status>();
  for (const goal of project.security.goals) {
    goalStatuses.set(goal.id, goalStatus(project, goal.id));
  }

  const domainStatuses = new Map<string, Status>();
  const byBlock = new Map<string, string[]>();
  for (const block of project.architecture.blocks) {
    byBlock.set(block.id, []);
  }
  for (const assignment of project.assignments) {
    byBlock.get(assignment.block)?.push(assignment.function);
  }
  const fnGoals = new Map<string, string[]>();
  for (const fn of project.security.functions) {
    fnGoals.set(
      fn.id,
      (fn.implements ?? []).map((link) => link.goal),
    );
  }
  for (const block of project.architecture.blocks) {
    const goalIds = new Set<string>();
    for (const fnId of byBlock.get(block.id) ?? []) {
      for (const goalId of fnGoals.get(fnId) ?? []) goalIds.add(goalId);
    }
    if (goalIds.size === 0) {
      domainStatuses.set(block.id, 'neutral');
    } else {
      const statuses = [...goalIds].map(
        (goalId) => goalStatuses.get(goalId) ?? 'red',
      );
      // Агрегат домена: зелёный, если все зелёные; красный, если есть красная; иначе жёлтый.
      if (statuses.includes('red')) domainStatuses.set(block.id, 'red');
      else if (statuses.includes('yellow')) domainStatuses.set(block.id, 'yellow');
      else domainStatuses.set(block.id, 'green');
    }
  }

  const systemStatus = aggregateStatus([...goalStatuses.values()]);
  return { goalStatuses, domainStatuses, systemStatus };
}
