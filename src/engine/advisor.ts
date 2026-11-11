/**
 * Генератор советов по архитектуре — v0.01.08.
 *
 * Советы — не ошибки и не предупреждения: это эвристики улучшения модели
 * с численной оценкой эффекта. Каждый кандидат «что-если» пересчитывается
 * чистой recalcCosts на клоне архитектуры, поэтому ΔC — точная оценка
 * экономии C_системы для предложенного перестроения, а не мнение.
 * Автоприменения нет сознательно: совет подсвечивает домены и показывает
 * экономию, решение и перестроение остаются за студентом.
 *
 * Каталог:
 * - goal-coverage — цель не покрыта размещёнными функциями (мостик от
 *   валидатора к действию: какие функции разместить);
 * - unlinked-function — функция без связей с целями занимает домен;
 * - empty-domain — внутренний домен без стрелок и функций;
 * - isolated-domain — домен с функциями, но без стрелок («контроль
 *   висит в воздухе»);
 * - ddbpcd-split — декомпозиция ДДБПЦД с несколькими функциями: приёмник
 *   низкоцелостного потока остаётся в ДДБПЦД (K = 10), остальные функции
 *   переезжают в ДДБ (K = 5);
 * - ddb-regroup — в доверенном домене есть некритичные функции: их вынос
 *   в недоверенный домен снижает S части модели с K = 5;
 * - filter-domain — дешёвый посредник (вводится в ДВБ принудительно)
 *   принимает низкоцелостные потоки вместо дорогого доверенного домена;
 * - cost-leader — навигационный совет: домен-лидер даёт большую долю
 *   C_системы.
 *
 * Детерминизм: перебор в порядке модели, функции сортируются по id,
 * одинаковый проект — одинаковый список советов; сортировка вывода —
 * по экономии по убыванию.
 */

import type { Assignment, Block, Edge, Project, SecurityFunction } from './types';
import { recalcCosts, type DomainCostResult } from './cost';
import { computeTrust, type TrustResult } from './trust';
import { goalStatus } from './coverage';

/** Вид совета (см. каталог в шапке модуля). */
export type AdviceKind =
  | 'goal-coverage'
  | 'unlinked-function'
  | 'empty-domain'
  | 'isolated-domain'
  | 'ddbpcd-split'
  | 'ddb-regroup'
  | 'filter-domain'
  | 'cost-leader';

/** Один совет: адресаты на канве, оценка экономии и параметры формулировок. */
export interface Advice {
  kind: AdviceKind;
  /** Домены-адресаты: подсветка и фокус по клику на совет. */
  blocks: string[];
  /** Цели, которых касается совет (для формулировок в панели). */
  goals: string[];
  /** Функции, которых касается совет (для формулировок в панели). */
  functions: string[];
  /** Экономия C_системы кандидата «что-если»; null — оценка не выполнялась. */
  deltaC: number | null;
  /** Статус цели для goal-coverage. */
  severity?: 'red' | 'yellow';
  /** Числовые параметры формулировок (доля стоимости в процентах и т.п.). */
  params: Record<string, number>;
}

/** Минимальный клон проекта для пересчёта кандидата. */
function candidateCost(
  project: Project,
  patch: { blocks?: Block[]; edges?: Edge[]; assignments?: Assignment[] },
): number {
  return recalcCosts({
    architecture: {
      blocks: patch.blocks ?? project.architecture.blocks,
      edges: patch.edges ?? project.architecture.edges,
    },
    security: project.security,
    assignments: patch.assignments ?? project.assignments,
    meta: {},
  }).systemCost;
}

/** Функции, размещённые в домене, упорядоченные по id (детерминизм). */
function functionsOfBlock(
  project: Project,
  blockId: string,
  byId: Map<string, SecurityFunction>,
): SecurityFunction[] {
  const list: SecurityFunction[] = [];
  for (const assignment of project.assignments) {
    if (assignment.block !== blockId) continue;
    const fn = byId.get(assignment.function);
    if (fn) list.push(fn);
  }
  return list.sort((a, b) => a.id.localeCompare(b.id));
}

/** Число стрелок каждого домена (входящие + исходящие). */
function degreeCounts(project: Project): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of project.architecture.blocks) counts.set(block.id, 0);
  for (const edge of project.architecture.edges) {
    if (counts.has(edge.from)) counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    if (counts.has(edge.to)) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

/**
 * Полный список советов по проекту. Чистая и детерминированная функция.
 */
export function computeAdvice(project: Project): Advice[] {
  const advices: Advice[] = [];
  const byFnId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
  const { costs, systemCost } = recalcCosts(project);
  const trust: TrustResult = computeTrust(project);
  const degrees = degreeCounts(project);
  const placedByFn = new Map(project.assignments.map((a) => [a.function, a.block] as const));

  /* С6. Цели без размещения обязательных функций — мостик к действию. */
  for (const goal of project.security.goals) {
    const status = goalStatus(project, goal.id);
    if (status !== 'red' && status !== 'yellow') continue;
    const linked = project.security.functions.filter((fn) =>
      (fn.implements ?? []).some((link) => link.goal === goal.id),
    );
    const blocks = new Set<string>();
    for (const fn of linked) {
      const block = placedByFn.get(fn.id);
      if (block) blocks.add(block);
    }
    advices.push({
      kind: 'goal-coverage',
      blocks: [...blocks],
      goals: [goal.id],
      functions: linked.filter((fn) => !placedByFn.has(fn.id)).map((fn) => fn.id),
      deltaC: null,
      severity: status,
      params: {},
    });
  }

  /* С5. Функция без связей с целями занимает место в домене. */
  for (const fn of project.security.functions) {
    if ((fn.implements ?? []).length > 0) continue;
    const block = placedByFn.get(fn.id);
    if (!block) continue;
    advices.push({
      kind: 'unlinked-function',
      blocks: [block],
      goals: [],
      functions: [fn.id],
      deltaC: null,
      params: {},
    });
  }

  /* С1 и С3 — по доверенным доменам с низкоцелостными входами. */
  for (const block of project.architecture.blocks) {
    if (block.external) continue;
    const cls = trust.internal.get(block.id);
    if (cls !== 'ddbpcd') continue;
    const redIncoming = project.architecture.edges
      .filter((edge) => edge.to === block.id && trust.edges.get(edge.id) === 'red')
      .sort((a, b) => a.id.localeCompare(b.id));
    if (redIncoming.length === 0) continue;
    const fns = functionsOfBlock(project, block.id, byFnId);
    const sTotal = fns.reduce((sum, fn) => sum + fn.cost, 0);

    /* С3. Дешёвый посредник для всех низкоцелостных входов домена. */
    const filterId = `${block.id}-filter`;
    const filterBlocks: Block[] = [
      ...project.architecture.blocks,
      { id: filterId, name: block.name, cost: 1, forceTrusted: true },
    ];
    const filterEdges: Edge[] = [];
    for (const edge of project.architecture.edges) {
      if (redIncoming.some((red) => red.id === edge.id)) {
        filterEdges.push({ ...edge, to: filterId });
        filterEdges.push({ id: `${edge.id}-via`, from: filterId, to: block.id });
      } else {
        filterEdges.push(edge);
      }
    }
    const filterCost = candidateCost(project, { blocks: filterBlocks, edges: filterEdges });
    const filterSaving = systemCost - filterCost;
    if (filterSaving > 0) {
      advices.push({
        kind: 'filter-domain',
        blocks: [block.id],
        goals: [],
        functions: [],
        deltaC: filterSaving,
        params: { redIncoming: redIncoming.length },
      });
    }

    /* С1. Декомпозиция: приёмник потока остаётся, остальные функции
        переезжают в новый домен без низкоцелостных входов. */
    if (fns.length >= 2) {
      const [head, ...rest] = fns;
      const sRest = rest.reduce((sum, fn) => sum + fn.cost, 0);
      const splitId = `${block.id}-split`;
      const restBlockCost = Math.max(0, Math.round((block.cost * sRest) / Math.max(1, sTotal)));
      const splitBlocks: Block[] = [
        ...project.architecture.blocks.filter((candidate) => candidate.id !== block.id),
        { ...block, cost: Math.max(0, block.cost - restBlockCost) },
        { id: splitId, name: block.name, cost: restBlockCost },
      ];
      // Все стрелки остаются на принимающей части; между частями —
      // новый поток (данные между функциями частей предполагаются).
      const splitEdges: Edge[] = [
        ...project.architecture.edges,
        { id: `${block.id}-split-link`, from: block.id, to: splitId },
      ];
      const restIds = new Set(rest.map((fn) => fn.id));
      const splitAssignments: Assignment[] = project.assignments.map((assignment) =>
        restIds.has(assignment.function) && assignment.block === block.id
          ? { ...assignment, block: splitId }
          : assignment,
      );
      const splitCost = candidateCost(project, {
        blocks: splitBlocks,
        edges: splitEdges,
        assignments: splitAssignments,
      });
      const splitSaving = systemCost - splitCost;
      if (splitSaving > 0) {
        advices.push({
          kind: 'ddbpcd-split',
          blocks: [block.id],
          goals: [],
          functions: rest.map((fn) => fn.id),
          deltaC: splitSaving,
          params: { moved: rest.length },
        });
      }
      void head;
    }
  }

  /* С2. Некритичные функции в доверенном (но не «жёлтом») домене. */
  for (const block of project.architecture.blocks) {
    if (block.external) continue;
    if (trust.internal.get(block.id) !== 'ddb') continue;
    const fns = functionsOfBlock(project, block.id, byFnId);
    if (fns.length < 2) continue;
    const critical = fns.filter((fn) => (fn.implements ?? []).length > 0);
    const nonCritical = fns.filter((fn) => (fn.implements ?? []).length === 0);
    if (critical.length === 0 || nonCritical.length === 0) continue;
    const sTotal = fns.reduce((sum, fn) => sum + fn.cost, 0);
    const sNc = nonCritical.reduce((sum, fn) => sum + fn.cost, 0);
    const ndbId = `${block.id}-ndb`;
    const ndbCost = Math.max(0, Math.round((block.cost * sNc) / Math.max(1, sTotal)));
    const regroupBlocks: Block[] = [
      ...project.architecture.blocks.filter((candidate) => candidate.id !== block.id),
      { ...block, cost: Math.max(0, block.cost - ndbCost) },
      { id: ndbId, name: block.name, cost: ndbCost },
    ];
    const ncIds = new Set(nonCritical.map((fn) => fn.id));
    const regroupAssignments: Assignment[] = project.assignments.map((assignment) =>
      ncIds.has(assignment.function) && assignment.block === block.id
        ? { ...assignment, block: ndbId }
        : assignment,
    );
    const regroupCost = candidateCost(project, {
      blocks: regroupBlocks,
      assignments: regroupAssignments,
    });
    const regroupSaving = systemCost - regroupCost;
    if (regroupSaving > 0) {
      advices.push({
        kind: 'ddb-regroup',
        blocks: [block.id],
        goals: [],
        functions: nonCritical.map((fn) => fn.id),
        deltaC: regroupSaving,
        params: { moved: nonCritical.length },
      });
    }
  }

  /* С4. Пустые и изолированные внутренние домены. */
  for (const block of project.architecture.blocks) {
    if (block.external) continue;
    const degree = degrees.get(block.id) ?? 0;
    const fns = functionsOfBlock(project, block.id, byFnId);
    if (degree === 0 && fns.length === 0 && !block.forceTrusted) {
      advices.push({
        kind: 'empty-domain',
        blocks: [block.id],
        goals: [],
        functions: [],
        deltaC: null,
        params: {},
      });
    }
    if (degree === 0 && fns.length > 0) {
      advices.push({
        kind: 'isolated-domain',
        blocks: [block.id],
        goals: [],
        functions: fns.map((fn) => fn.id),
        deltaC: null,
        params: {},
      });
    }
  }

  /* С7. Домен-лидер стоимости (навигационный совет). */
  const internal = project.architecture.blocks.filter((block) => !block.external);
  if (internal.length >= 2 && systemCost > 0) {
    let leader: { id: string; cost: number } | null = null;
    for (const block of internal) {
      const cost = costs.get(block.id)?.domainCost ?? 0;
      if (!leader || cost > leader.cost || (cost === leader.cost && block.id.localeCompare(leader.id) < 0)) {
        leader = { id: block.id, cost };
      }
    }
    if (leader && leader.cost > 0) {
      const percent = Math.round((leader.cost / systemCost) * 100);
      if (percent >= 35) {
        advices.push({
          kind: 'cost-leader',
          blocks: [leader.id],
          goals: [],
          functions: [],
          deltaC: null,
          params: { percent },
        });
      }
    }
  }

  /* Порядок вывода: по экономии по убыванию (совет с максимальной
     экономией — первый), советы без оценки — по виду и домену. */
  return advices.sort(
    (a, b) =>
      (b.deltaC ?? -1) - (a.deltaC ?? -1) ||
      a.kind.localeCompare(b.kind) ||
      (a.blocks[0] ?? '').localeCompare(b.blocks[0] ?? ''),
  );
}

/** Стоимость домена для советчика (используется панелью). */
export function adviceBlockCost(costs: Map<string, DomainCostResult>, blockId: string): number {
  return costs.get(blockId)?.domainCost ?? 0;
}
