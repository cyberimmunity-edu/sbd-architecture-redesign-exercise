/**
 * Алгоритм расчёта стоимости — раздел 7.1 ТЗ, модель стоимости — раздел 3.3 (решение D2).
 *
 * C_домена = C_блока × S_eff × M × K, где S — сумма C_функции размещённых
 * в домене функций; S_eff = S при S > 0, иначе 1 (домен без функций стоит
 * C_блока × K); M = (E_вх + E_исх) / 2 при (E_вх + E_исх) >= 2, иначе M = 1 —
 * применяется только при S > 0; K — коэффициент доверия домена
 * (раздел 3.3 v0.01.01): НДБ — 0.1, ДДБ — 5, ДДБПЦД — 10.
 * C_системы = сумма C_домена по всем внутренним доменам; внешние системы
 * в расчёте стоимости разработки не участвуют: их стоимость не определяется
 * и не отображается (3.5 v0.01.01).
 * Округление вверх (ceil) выполняется один раз, на итоговом произведении.
 */

import type { Assignment, Block, Project, SecurityFunction } from './types';
import { computeTrust, TRUST_COST_COEFFICIENT, type DomainTrustClass, type TrustResult } from './trust';

/** Результат расчёта по одному домену — для отображения в узле (Ф-12). */
export interface DomainCostResult {
  /** C_блока. Для внешних систем не определяется и не отображается. */
  blockCost: number;
  /** S — сумма стоимостей размещённых функций. */
  functionsCost: number;
  /** E = E_вх + E_исх (включая потоки с внешними системами). */
  edgeCount: number;
  /** M — множитель связности. */
  multiplier: number;
  /** K — коэффициент доверия (НДБ 0.1, ДДБ 5, ДДБПЦД 10). */
  trustCoefficient: number;
  /** C_домена; для внешних систем всегда 0 (стоимость не определяется). */
  domainCost: number;
  /** Внешняя система: в C_системы не входит. */
  external: boolean;
}

/**
 * Множитель связности M по таблице раздела 3.3:
 * E = 0..2 → 1; E = 3 → 1.5; E = 4 → 2 и далее M = E / 2.
 */
export function connectivityMultiplier(eIn: number, eOut: number): number {
  const e = eIn + eOut;
  return e >= 2 ? e / 2 : 1;
}

/**
 * Стоимость домена по формуле раздела 7.1 v0.01.01 с коэффициентом доверия K:
 * домен без размещённых функций (S = 0) стоит C_блока × K (множитель связности
 * при S = 0 не применяется), домен с функциями — C_блока × S × M × K.
 */
export function domainCost(
  block: Pick<Block, 'cost'>,
  funcsIn: Pick<SecurityFunction, 'cost'>[],
  eIn: number,
  eOut: number,
  trust: DomainTrustClass = 'ndb',
): DomainCostResult {
  const s = funcsIn.reduce((sum, fn) => sum + fn.cost, 0);
  const m = s > 0 ? connectivityMultiplier(eIn, eOut) : 1;
  const k = TRUST_COST_COEFFICIENT[trust];
  return {
    blockCost: block.cost,
    functionsCost: s,
    edgeCount: eIn + eOut,
    multiplier: m,
    trustCoefficient: k,
    // Округление вверх, один раз на итоговом произведении (3.3, правило 1).
    domainCost: Math.ceil(block.cost * (s > 0 ? s : 1) * m * k),
    external: false,
  };
}

/** Число входящих и исходящих стрелок каждого домена. */
export function edgeCounts(project: Project): Map<string, { eIn: number; eOut: number }> {
  const counts = new Map<string, { eIn: number; eOut: number }>();
  for (const block of project.architecture.blocks) {
    counts.set(block.id, { eIn: 0, eOut: 0 });
  }
  for (const edge of project.architecture.edges) {
    const from = counts.get(edge.from);
    if (from) from.eOut += 1;
    const to = counts.get(edge.to);
    if (to) to.eIn += 1;
  }
  return counts;
}

/** Функции, размещённые в каждом домене (правило единственного размещения 3.2). */
export function functionsByBlock(
  project: Project,
): Map<string, SecurityFunction[]> {
  const byId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
  const map = new Map<string, SecurityFunction[]>();
  for (const block of project.architecture.blocks) {
    map.set(block.id, []);
  }
  for (const assignment of project.assignments as Assignment[]) {
    const fn = byId.get(assignment.function);
    const list = map.get(assignment.block);
    if (fn && list) list.push(fn);
  }
  return map;
}

/**
 * Полный пересчёт: C_домена каждого внутреннего домена и C_системы (Ф-18).
 * Внешние системы получают domainCost = 0 и не входят в C_системы.
 * Доверенность доменов и цвета стрелок пересчитываются на той же модели
 * (3.5 v0.01.01) — раскраска в интерфейсе всегда согласована со стоимостью.
 */
export function recalcCosts(project: Project): {
  costs: Map<string, DomainCostResult>;
  systemCost: number;
  trust: TrustResult;
} {
  const trust = computeTrust(project);
  const counts = edgeCounts(project);
  const byBlock = functionsByBlock(project);
  const costs = new Map<string, DomainCostResult>();
  let systemCost = 0;
  for (const block of project.architecture.blocks) {
    const { eIn, eOut } = counts.get(block.id) ?? { eIn: 0, eOut: 0 };
    if (block.external) {
      // Внешняя система: стоимость не определяется и не отображается.
      costs.set(block.id, {
        blockCost: block.cost,
        functionsCost: 0,
        edgeCount: eIn + eOut,
        multiplier: 1,
        trustCoefficient: 1,
        domainCost: 0,
        external: true,
      });
      continue;
    }
    const result = domainCost(
      block,
      byBlock.get(block.id) ?? [],
      eIn,
      eOut,
      trust.internal.get(block.id) ?? 'ndb',
    );
    costs.set(block.id, result);
    systemCost += result.domainCost;
  }
  return { costs, systemCost, trust };
}
