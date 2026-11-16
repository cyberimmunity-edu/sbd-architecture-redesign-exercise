/**
 * Генератор советов по архитектуре — v0.03.01b.
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
 * - ddbpcd-split — вынос некритичных функций из ДДБПЦД (v0.03.01, отзыв
 *   тестирования): приёмник низкоцелостного потока — критичные функции —
 *   остаётся в ДДБПЦД, некритичные переезжают в недоверенный домен
 *   (K = 0.1). Если некритичных функций нет, интерфейсный домен уже
 *   минимальный и такой совет не даётся;
 * - ddb-regroup — вынос некритичных функций из ДДБ в недоверенный домен:
 *   критичные остаются в ДДБ, переносимая часть уходит с K = 5 на 0.1;
 * - trusted-split — «валидатор + исполнитель» (v0.03.01b, по сверке с
 *   независимой моделью анализатора): часть функций доверенного домена
 *   переезжает в новый доверенный домен, получающий только зелёный вход
 *   от валидатора (K = 5 вместо 10 у ДДБПЦД-исходного). Валидатором
 *   считается оставшаяся часть с критичной функцией: она продолжает
 *   принимать красный поток;
 * - gateway-split — «шлюз с функциями» (v0.03.01b): валидатор (все
 *   критичные функции) выносится в новый домен-шлюз, принимающий красные
 *   стрелки (ДДБПЦД), исполнитель остаётся без критичных функций (НДБ,
 *   если не forceTrusted);
 * - filter-domain — дешёвый посредник (вводится в ДВБ принудительно)
 *   принимает низкоцелостные потоки вместо дорогого доверенного домена;
 *   допущения совета раскрыты в параметрах (C_блока = 1, forceTrusted);
 * - cost-leader — навигационный совет: домен-лидер даёт большую долю
 *   C_системы.
 *
 * Вариантный перебор (v0.03.01b): для каждого доверенного домена строится
 * семейство кандидатов разбиения на две части (все подмножества функций
 * при n ≤ 10, иначе детерминированное эвристическое семейство), каждая
 * часть оценивается точным пересчётом, домену выдаётся до
 * MAX_VARIANTS_PER_DOMAIN лучших вариантов по экономии. forceTrusted —
 * полноправный признак модели (принудительный ввод в ДВБ без критичной
 * функции — необходимое условие работы функций безопасности других
 * доменов), поэтому кандидаты не «обходят» его: флаг остаётся у исходной
 * части и не наследуется вынесенной.
 *
 * Детерминизм: перебор в порядке модели, функции сортируются по id,
 * одинаковый проект — одинаковый список советов; сортировка вывода —
 * по экономии по убыванию.
 */

import type { Assignment, Block, Edge, Project, SecurityFunction } from './types';
import { recalcCosts, type DomainCostResult } from './cost';
import { computeTrust, type DomainTrustClass, type TrustResult } from './trust';
import { goalStatus } from './coverage';

/** Вид совета (см. каталог в шапке модуля). */
export type AdviceKind =
  | 'goal-coverage'
  | 'unlinked-function'
  | 'empty-domain'
  | 'isolated-domain'
  | 'ddbpcd-split'
  | 'ddb-regroup'
  | 'trusted-split'
  | 'gateway-split'
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

/** Лучших вариантов разбиения на один доверенный домен (v0.03.01b). */
export const MAX_VARIANTS_PER_DOMAIN = 3;

/** Порог полного перебора подмножеств: при n ≤ 10 перебираются все 2^n − 2. */
export const MAX_ENUM_FUNCTIONS = 10;

/** Маршрут двух частей разбиения: валидатор остаётся или выносится. */
export type SplitRouting = 'downstream' | 'gateway';

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

/** Свободный идентификатор с суффиксами «-2», «-3»… (детерминированно). */
export function uniqueId(taken: Set<string>, base: string): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Кандидатная модель «что-если»: проект-кандидат и параметры перестроения. */
export interface AdviceCandidate {
  project: Project;
  /** Функции, переносимые в новый домен (для разбиений). */
  moved: string[];
  /** Идентификатор новой части (для проверок класса доверия в тестах). */
  newId: string;
  /** Маршрут частей: downstream — валидатор остаётся, gateway — выносится. */
  routing: SplitRouting;
}

/** Общие проверки кандидата: домен существует и внутренний. */
function internalBlock(project: Project, blockId: string): Block | null {
  const block = project.architecture.blocks.find((b) => b.id === blockId);
  if (!block || block.external) return null;
  return block;
}

/** Функция критична, если связана хотя бы с одной целью безопасности. */
function isCritical(fn: SecurityFunction): boolean {
  return (fn.implements ?? []).length > 0;
}

/**
 * Семейство переносимых наборов функций домена (детерминированно).
 * При n ≤ 10 — все непустые собственные подмножества; при n > 10 —
 * ограниченное семейство: одиночные, «все кроме одного», все некритичные,
 * все критичные и префиксы по убыванию стоимости.
 */
function movedSets(fns: SecurityFunction[]): string[][] {
  const sorted = [...fns].sort((a, b) => a.id.localeCompare(b.id));
  const n = sorted.length;
  if (n < 2) return [];
  if (n <= MAX_ENUM_FUNCTIONS) {
    const sets: string[][] = [];
    for (let mask = 1; mask < (1 << n) - 1; mask += 1) {
      sets.push(sorted.filter((_, i) => mask & (1 << i)).map((fn) => fn.id));
    }
    return sets;
  }
  const byCostDesc = [...sorted].sort(
    (a, b) => b.cost - a.cost || a.id.localeCompare(b.id),
  );
  const sets: string[][] = [];
  for (const fn of sorted) sets.push([fn.id]);
  for (const fn of sorted) sets.push(sorted.filter((f) => f.id !== fn.id).map((f) => f.id));
  const nonCritical = sorted.filter((fn) => !isCritical(fn)).map((fn) => fn.id);
  if (nonCritical.length > 0) sets.push(nonCritical);
  const critical = sorted.filter(isCritical).map((fn) => fn.id);
  if (critical.length > 0 && critical.length < n) sets.push(critical);
  for (let k = 1; k < n; k += 1) sets.push(byCostDesc.slice(0, k).map((fn) => fn.id));
  return sets;
}

/**
 * Кандидат разбиения доверенного домена на две части.
 *
 * movedIds — переносимые функции; routing:
 * - downstream («валидатор + исполнитель»): в исходной части остаётся
 *   хотя бы одна критичная функция — она продолжает принимать красные
 *   стрелки (валидатор); все стрелки остаются у исходной части, между
 *   частями добавляется поток (валидатор → исполнитель). Новая часть
 *   получает только зелёный вход и класс ДДБ (или НДБ, если переносились
 *   только некритичные функции).
 * - gateway («шлюз с функциями»): все критичные функции переезжают;
 *   красные входящие стрелки перенаправляются новому домену-шлюзу
 *   (ДДБПЦД), исходная часть получает от шлюза зелёный поток; без
 *   критичных функций и forceTrusted она становится НДБ.
 *
 * Чистая функция; null — кандидат неприменим (состав, класс домена,
 * маршрут не согласованы).
 */
export function partitionCandidate(
  project: Project,
  blockId: string,
  movedIds: string[],
  routing: SplitRouting,
): AdviceCandidate | null {
  const block = internalBlock(project, blockId);
  if (!block) return null;
  const trust = computeTrust(project);
  const parentClass = trust.internal.get(blockId);
  if (parentClass !== 'ddbpcd' && parentClass !== 'ddb') return null;
  const byFnId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
  const fns = functionsOfBlock(project, blockId, byFnId);
  if (fns.length < 2) return null;
  if (new Set(movedIds).size !== movedIds.length) return null;
  const moved = movedIds
    .map((id) => byFnId.get(id))
    .filter((fn): fn is SecurityFunction => fn !== undefined && fns.some((f) => f.id === fn.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  // Переносимый набор обязан целиком состоять из функций домена: совет и
  // кандидатная модель должны воспроизводиться по одним и тем же id.
  if (moved.length !== movedIds.length) return null;
  if (moved.length === 0 || moved.length === fns.length) return null;
  const kept = fns.filter((fn) => !moved.some((m) => m.id === fn.id));
  if (routing === 'downstream') {
    // Валидатор остаётся: в исходной части — критичная функция.
    if (!kept.some(isCritical)) return null;
  } else {
    // Шлюз: валидатор переносится целиком — исходная часть без критичных.
    if (kept.some(isCritical)) return null;
    // Красные стрелки есть только у ДДБПЦД — перенаправлять нечего у ДДБ.
    if (parentClass !== 'ddbpcd') return null;
    const hasRedIncoming = project.architecture.edges.some(
      (edge) => edge.to === blockId && trust.edges.get(edge.id) === 'red',
    );
    if (!hasRedIncoming) return null;
  }

  const takenBlocks = new Set(project.architecture.blocks.map((b) => b.id));
  const takenEdges = new Set(project.architecture.edges.map((e) => e.id));
  // Имя новой части по ожидаемому классу: НДБ — «-ndb»/«-split» (совместимо
  // с v0.03.01), шлюз — «-gw», доверенный исполнитель — «-exec».
  const allMovedNonCritical = moved.every((fn) => !isCritical(fn));
  const base =
    routing === 'gateway'
      ? `${blockId}-gw`
      : allMovedNonCritical
        ? parentClass === 'ddbpcd'
          ? `${blockId}-split`
          : `${blockId}-ndb`
        : `${blockId}-exec`;
  const newId = uniqueId(takenBlocks, base);
  const linkId = uniqueId(takenEdges, `${base}-link`);
  const sTotal = fns.reduce((sum, fn) => sum + fn.cost, 0);
  const sMoved = moved.reduce((sum, fn) => sum + fn.cost, 0);
  const movedCost = Math.max(0, Math.round((block.cost * sMoved) / Math.max(1, sTotal)));
  const splitBlocks: Block[] = [
    ...project.architecture.blocks.filter((candidate) => candidate.id !== blockId),
    { ...block, cost: Math.max(0, block.cost - movedCost) },
    {
      // Новая часть не наследует forceTrusted: признак обосновывает
      // доверенность исходной части (например, доверенный датчик), а
      // переносимые функции вводят новый домен в ДВБ сами по себе.
      // ЛГ наследуется (рамка продолжает охватывать выделенную часть).
      id: newId,
      name: block.name,
      cost: movedCost,
      ...(block.groupId ? { groupId: block.groupId } : {}),
      ...(block.position
        ? { position: { x: block.position.x + 40, y: block.position.y + 40 } }
        : {}),
    },
  ];
  let splitEdges: Edge[];
  if (routing === 'downstream') {
    // Все стрелки остаются у валидатора; между частями — новый поток.
    splitEdges = [...project.architecture.edges, { id: linkId, from: blockId, to: newId }];
  } else {
    // Красные входы перенаправляются шлюзу; остальная маршрутизация — без
    // изменений; шлюз отдаёт валидированный поток исходной части.
    const redIds = new Set(
      project.architecture.edges
        .filter((edge) => edge.to === blockId && trust.edges.get(edge.id) === 'red')
        .map((edge) => edge.id),
    );
    splitEdges = project.architecture.edges.map((edge) =>
      redIds.has(edge.id) ? { ...edge, to: newId } : edge,
    );
    splitEdges.push({ id: linkId, from: newId, to: blockId });
  }
  const movedIdsSet = new Set(moved.map((fn) => fn.id));
  const splitAssignments: Assignment[] = project.assignments.map((assignment) =>
    movedIdsSet.has(assignment.function) && assignment.block === blockId
      ? { ...assignment, block: newId }
      : assignment,
  );
  return {
    project: {
      ...project,
      architecture: { ...project.architecture, blocks: splitBlocks, edges: splitEdges },
      assignments: splitAssignments,
    },
    moved: moved.map((fn) => fn.id),
    newId,
    routing,
  };
}

/**
 * С1. Вынос некритичных функций из ДДБПЦД (интерфейсного домена):
 * критичные функции (приёмник низкоцелостного потока) остаются, некритичные
 * переезжают в отдельный недоверенный домен. null — домен уже минимальный
 * (некритичных функций нет) или совет неприменим. Чистая функция.
 */
export function splitCandidate(project: Project, blockId: string): AdviceCandidate | null {
  const block = internalBlock(project, blockId);
  if (!block) return null;
  const trust = computeTrust(project);
  if (trust.internal.get(blockId) !== 'ddbpcd') return null;
  const hasRedIncoming = project.architecture.edges.some(
    (edge) => edge.to === blockId && trust.edges.get(edge.id) === 'red',
  );
  if (!hasRedIncoming) return null;
  const byFnId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
  const fns = functionsOfBlock(project, blockId, byFnId);
  const nonCritical = fns.filter((fn) => !isCritical(fn)).map((fn) => fn.id);
  if (nonCritical.length === 0 || nonCritical.length === fns.length) return null;
  return partitionCandidate(project, blockId, nonCritical, 'downstream');
}

/**
 * С2. Вынос некритичных функций из ДДБ: остаток домена остаётся доверенным,
 * некритичные функции переезжают в недоверенный домен. Чистая функция.
 */
export function regroupCandidate(project: Project, blockId: string): AdviceCandidate | null {
  const block = internalBlock(project, blockId);
  if (!block) return null;
  const trust = computeTrust(project);
  if (trust.internal.get(blockId) !== 'ddb') return null;
  const byFnId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
  const fns = functionsOfBlock(project, blockId, byFnId);
  const nonCritical = fns.filter((fn) => !isCritical(fn)).map((fn) => fn.id);
  if (nonCritical.length === 0 || nonCritical.length === fns.length) return null;
  return partitionCandidate(project, blockId, nonCritical, 'downstream');
}

/**
 * С3. Дешёвый посредник перед ДДБПЦД: новый принудительно доверенный домен
 * принимает низкоцелостные потоки, исходный домен возвращается в ДДБ.
 * Допущения кандидата (C_блока = 1, forceTrusted) — часть совета: оба
 * значения входят в params совета filter-domain. Чистая функция.
 */
export function filterCandidate(project: Project, blockId: string): AdviceCandidate | null {
  const block = internalBlock(project, blockId);
  if (!block) return null;
  const trust = computeTrust(project);
  if (trust.internal.get(blockId) !== 'ddbpcd') return null;
  const redIncoming = project.architecture.edges
    .filter((edge) => edge.to === blockId && trust.edges.get(edge.id) === 'red')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (redIncoming.length === 0) return null;

  const takenBlocks = new Set(project.architecture.blocks.map((b) => b.id));
  const takenEdges = new Set(project.architecture.edges.map((e) => e.id));
  const filterId = uniqueId(takenBlocks, `${blockId}-filter`);
  const filterBlocks: Block[] = [
    ...project.architecture.blocks,
    { id: filterId, name: block.name, cost: 1, forceTrusted: true },
  ];
  const filterEdges: Edge[] = [];
  for (const edge of project.architecture.edges) {
    if (redIncoming.some((red) => red.id === edge.id)) {
      filterEdges.push({ ...edge, to: filterId });
      const viaId = uniqueId(takenEdges, `${edge.id}-via`);
      filterEdges.push({ id: viaId, from: filterId, to: blockId });
      takenEdges.add(viaId);
    } else {
      filterEdges.push(edge);
    }
  }
  return {
    project: {
      ...project,
      architecture: { ...project.architecture, blocks: filterBlocks, edges: filterEdges },
    },
    moved: [],
    newId: filterId,
    routing: 'downstream',
  };
}

/** Вид совета-разбиения по классу новой части и маршруту (детерминированно). */
function splitKind(
  parentClass: DomainTrustClass,
  routing: SplitRouting,
  newClass: DomainTrustClass | undefined,
): AdviceKind {
  if (routing === 'gateway') return 'gateway-split';
  if (newClass === 'ndb') return parentClass === 'ddbpcd' ? 'ddbpcd-split' : 'ddb-regroup';
  return 'trusted-split';
}

/**
 * Вариантный перебор разбиений доверенного домена (v0.03.01b): семейство
 * переносимых наборов × маршрут частей, каждый кандидат — точный пересчёт;
 * в ответе до MAX_VARIANTS_PER_DOMAIN лучших вариантов с положительной
 * экономией, отсортированных по ней. Детерминированная чистая функция.
 */
export function splitVariants(project: Project, blockId: string): Advice[] {
  const block = internalBlock(project, blockId);
  if (!block) return [];
  const trust = computeTrust(project);
  const parentClass = trust.internal.get(blockId);
  if (parentClass !== 'ddbpcd' && parentClass !== 'ddb') return [];
  const byFnId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
  const fns = functionsOfBlock(project, blockId, byFnId);
  if (fns.length < 2) return [];
  const { systemCost } = recalcCosts(project);

  const seen = new Set<string>();
  const variants: Array<{ kind: AdviceKind; moved: string[]; saving: number; params: Record<string, number> }> = [];
  for (const candidateIds of movedSets(fns)) {
    const key = candidateIds.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // Маршрут: осталась критичная функция — валидатор на месте (downstream);
    // критичные переносятся все — шлюз (только для ДДБПЦД с красными входами).
    const keptCritical = fns.some(
      (fn) => !candidateIds.includes(fn.id) && isCritical(fn),
    );
    const routing: SplitRouting | null = keptCritical
      ? 'downstream'
      : parentClass === 'ddbpcd'
        ? 'gateway'
        : null;
    if (!routing) continue;
    const candidate = partitionCandidate(project, blockId, candidateIds, routing);
    if (!candidate) continue;
    const recalc = recalcCosts(candidate.project);
    const saving = systemCost - recalc.systemCost;
    if (saving <= 0) continue;
    variants.push({
      kind: splitKind(parentClass, candidate.routing, recalc.trust.internal.get(candidate.newId)),
      moved: candidate.moved,
      saving,
      params: { moved: candidate.moved.length },
    });
  }
  variants.sort(
    (a, b) =>
      b.saving - a.saving ||
      a.moved.join(',').localeCompare(b.moved.join(',')) ||
      a.kind.localeCompare(b.kind),
  );
  return variants.slice(0, MAX_VARIANTS_PER_DOMAIN).map((variant) => ({
    kind: variant.kind,
    blocks: [blockId],
    goals: [],
    functions: variant.moved,
    deltaC: variant.saving,
    params: variant.params,
  }));
}

/**
 * Кандидатная модель совета (для тестов экономики и внешних инструментов:
 * CLI/MCP пересчитывают cost кандидата и проверяют deltaC). Для советов без
 * кандидатной модели (структурные, навигационные) — null.
 */
export function adviceCandidate(
  project: Project,
  advice: Pick<Advice, 'kind' | 'blocks' | 'functions'>,
): AdviceCandidate | null {
  const blockId = advice.blocks[0] ?? '';
  switch (advice.kind) {
    case 'ddbpcd-split':
    case 'ddb-regroup':
    case 'trusted-split':
      return partitionCandidate(project, blockId, advice.functions, 'downstream');
    case 'gateway-split':
      return partitionCandidate(project, blockId, advice.functions, 'gateway');
    case 'filter-domain':
      return filterCandidate(project, blockId);
    default:
      return null;
  }
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

  /* С1/С2/С8/С9 и С3 — по доверенным доменам. Кандидаты строятся общими
     экспортируемыми функциями: deltaC совета и кандидат для тестов
     экономики — одна и та же модель по построению (v0.03.01). Для каждого
     домена перебираются варианты разбиения (v0.03.01b) — до трёх лучших
     с положительной экономией. */
  for (const block of project.architecture.blocks) {
    if (block.external) continue;
    const cls = trust.internal.get(block.id);
    if (cls !== 'ddbpcd' && cls !== 'ddb') continue;

    /* С3. Дешёвый посредник для всех низкоцелостных входов домена
       (только ДДБПЦД); допущения кандидата раскрыты в params. */
    if (cls === 'ddbpcd') {
      const filter = filterCandidate(project, block.id);
      if (filter) {
        const filterSaving = systemCost - recalcCosts(filter.project).systemCost;
        if (filterSaving > 0) {
          const redIncoming = project.architecture.edges.filter(
            (edge) => edge.to === block.id && trust.edges.get(edge.id) === 'red',
          ).length;
          advices.push({
            kind: 'filter-domain',
            blocks: [block.id],
            goals: [],
            functions: [],
            deltaC: filterSaving,
            params: { redIncoming, mediatorCost: 1, mediatorForceTrusted: 1 },
          });
        }
      }
    }

    /* С1/С2/С8/С9. Вариантный перебор разбиений домена. */
    advices.push(...splitVariants(project, block.id));
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
