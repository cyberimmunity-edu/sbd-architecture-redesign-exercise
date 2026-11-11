/** Публичный API слоя engine — чистые функции модели (8.2 ТЗ). */
export * from './types';
export { domainCost, connectivityMultiplier, recalcCosts, edgeCounts, functionsByBlock } from './cost';
export type { DomainCostResult } from './cost';
export { goalStatus, recalcCoverage, aggregateStatus } from './coverage';
export {
  computeTrust,
  trustedBlockIds,
  trustFill,
  frameBounds,
  isInsideFrame,
  snapExternalsOutside,
  TRUST_COST_COEFFICIENT,
  TRUST_SHORT,
} from './trust';
export type { DomainTrustClass, TrustColor, TrustResult, FrameBounds } from './trust';
export { decompose } from './decompose';
export type { DecomposeInput, DecomposeChildSpec, DecomposeEdgeAssignment, DecomposeResult } from './decompose';
export { canAddDomain, canAddEdge, limitsReport } from './limits';
