/** Публичный API слоя io — парсеры и сериализаторы форматов данных (8.2 ТЗ). */
export { parseArchitectureYaml, parseArchitectureData, serializeArchitectureYaml } from './archYaml';
export type { ParseResult } from './archYaml';
export { parseSecurityYaml, parseSecurityData, serializeSecurityYaml } from './securityYaml';
export { parsePlantUml, serializePuml } from './plantuml';
export { parseStateYaml, parseStateData, serializeStateYaml } from './stateFile';
/** Режим «Диаграммы последовательности» (v0.02.01). */
export { parseSequencesYaml, serializeSequencesYaml, parseSequencesInner, serializeSequencesInner } from './sequencesYaml';
export type { SequencesParseResult, LinkMode } from './sequencesYaml';
export { parseSeqPlantUml, serializeSeqPuml } from './seqPlantuml';
export type { SeqPumlModel, SeqPumlResult } from './seqPlantuml';
export { ERR, WARN, err, warn, hasErrors } from './errors';
