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
export {
  groupDepths,
  groupAncestors,
  groupSubtree,
  depthUnderParent,
  depthAllowed,
  groupBlockMembers,
  blocksOfGroup,
  groupMemberCount,
  subtreeBlockIds,
  blocksRectAnchor,
  isGroupEmpty,
  isAllowedGroupColor,
  normalizeGroupColor,
  uniqueGroupName,
  computeGroupVisibility,
  remapEdgeEnd,
  remapEdgesForDisplay,
  unionRects,
  computeGroupGeometry,
  normalizeGroups,
  frameFromRects,
  clampDragDelta,
  LG_FRAME_PADDING,
  LG_COLLAPSED_WIDTH,
  LG_COLLAPSED_HEIGHT,
} from './groups';
export type {
  LgRect,
  BlockSize,
  GroupVisibility,
  RemappedEdge,
  GroupGeometry,
  GroupIssue,
  GroupIssueKind,
  NormalizedGroups,
} from './groups';
export { decompose } from './decompose';
export type { DecomposeInput, DecomposeChildSpec, DecomposeEdgeAssignment, DecomposeResult } from './decompose';
export { canAddDomain, canAddEdge, limitsReport } from './limits';
export { computeAdvice } from './advisor';
export type { Advice, AdviceKind } from './advisor';
export { validateProject } from './audit';
/** Режим «Диаграммы последовательности» и автонумерация доменов (v0.02.01). */
export {
  domainNumber,
  NUMBER_PREFIX_RE,
  canonicalInternalName,
  normalizeName,
  renumberArchitecture,
  matchDomain,
  arrowRef,
  validateSequences,
  validateSequencesRows,
  missingEdgePairs,
  isConsecutive,
  firstFreeColor,
  defaultGroupName,
  defaultLoopName,
  cleanBlocksAfterArrowRemoval,
  cleanBlocksAfterLifelineRemoval,
  uniqueSequenceName,
  seqTextValid,
  seqIdValid,
  computeSeqColors,
} from './sequence';
export type { MatchResult, SeqColorScheme, SeqValidationRow } from './sequence';
export { domainSizeFactors, sizeForFactor, SIZE_BASE_WIDTH, SIZE_BASE_HEIGHT, SIZE_MAX_FACTOR } from './sizing';
export type { SizeMode } from './sizing';
