/**
 * Формат sequences.yaml — раздел 7.1 ТЗ v0.02.01 (Ф-52, Ф-63, П-8).
 * Файл описывает все ДП проекта; импорт заменяет все ДП проекта (одна
 * операция истории). Ссылки на домены при импорте сопоставляются по
 * правилам 7.3 (id → номер → имя → подстрока); справочник `domains`
 * выводится при экспорте для человека и при импорте игнорируется.
 * Та же внутренняя структура без version/domains вкладывается в state.yaml
 * (7.4), где ссылки — идентификаторы доменов той же архитектуры.
 */

import { dump, load, YAMLException } from 'js-yaml';
import type { Block, ImportMessage, SequenceDiagram } from '../engine/types';
import {
  ID_PATTERN,
  FILE_VERSION,
  MAX_LIFELINES,
  MAX_SEQ_ARROWS,
  MAX_SEQ_BLOCKS,
  MAX_SEQUENCES,
  SEQ_TEXT_LIMIT,
} from '../engine/types';
import { ERR, err, warn } from './errors';
import {
  allowedKeys,
  collectUnknownKeys,
  issuePath,
  seqArrowInnerSchema,
  seqBlockInnerSchema,
  seqDiagramInnerSchema,
  sequencesFileSchema,
} from './schema';
import { matchDomain } from '../engine/sequence';

/** Режим разрешения ссылок на домены. */
export type LinkMode = 'match' | 'ids';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Результат разбора последовательностей. */
export interface SequencesParseResult {
  errors: ImportMessage[];
  warnings: ImportMessage[];
  model?: SequenceDiagram[];
}

/**
 * Внутренний разбор массива ДП (общий для sequences.yaml и state.yaml).
 * mode 'match' — ссылки на домены сопоставляются по 7.3 (sequences.yaml);
 * mode 'ids' — ссылки обязаны быть идентификаторами блоков архитектуры
 * (state.yaml, 7.4); отсутствующий домен — E-604.
 */
export function parseSequencesInner(
  data: unknown,
  blocks: Block[],
  mode: LinkMode,
  basePath = '',
): SequencesParseResult {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];
  const rawList = data as unknown[] | null;
  if (!Array.isArray(rawList)) {
    return {
      errors: [err(ERR.E002, 'структура не соответствует схеме: ожидается массив ДП', { path: basePath || '(корень)' })],
      warnings,
    };
  }
  if (rawList.length > MAX_SEQUENCES) {
    errors.push(err(ERR.E002, `число ДП превышает лимит (${MAX_SEQUENCES})`, { path: basePath }));
  }

  /** Разрешение ссылки на домен: матчинг 7.3 или строгие идентификаторы. */
  const resolve = (value: string, path: string): string | null => {
    if (mode === 'ids') {
      const block = blocks.find((b) => b.id === value);
      if (!block) {
        errors.push(err(ERR.E604, `ссылка на домен, отсутствующий в архитектуре: «${value}»`, { path }));
        return null;
      }
      return block.id;
    }
    const matched = matchDomain(value, blocks);
    if (matched.status === 'error') {
      errors.push(err(matched.code, matched.message, { path }));
      return null;
    }
    if (matched.numberWarning) {
      warnings.push(
        warn(
          'W-007',
          `Участник «${value}» принят по номеру; название в проекте иное: «${matched.numberWarning.projectName}»`,
          { path },
        ),
      );
    }
    return matched.id;
  };

  const diagrams: SequenceDiagram[] = [];
  const seenIds = new Set<string>();
  rawList.forEach((raw, index) => {
    const path = basePath ? `${basePath}[${index}]` : `sequences[${index}]`;
    const parsed = seqDiagramInnerSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(err(ERR.E002, `структура не соответствует схеме: ${issue.message}`, { path: `${path}.${issuePath(issue.path)}`.replace(/\.$/, '') }));
      }
      return;
    }
    const rawDiagram = parsed.data;

    // id и имя.
    if (!ID_PATTERN.test(rawDiagram.id)) {
      errors.push(err(ERR.E002, `идентификатор ДП «${rawDiagram.id}» не соответствует шаблону`, { path: `${path}.id` }));
      return;
    }
    if (seenIds.has(rawDiagram.id)) {
      errors.push(err(ERR.E002, `дубликат идентификатора ДП «${rawDiagram.id}»`, { path: `${path}.id` }));
      return;
    }
    seenIds.add(rawDiagram.id);
    if (rawDiagram.name.length > SEQ_TEXT_LIMIT) {
      errors.push(err(ERR.E002, `имя ДП превышает ${SEQ_TEXT_LIMIT} символов`, { path: `${path}.name` }));
      return;
    }

    // Линии жизни (Ф-54, П-12).
    if (rawDiagram.lifelines.length > MAX_LIFELINES) {
      errors.push(err(ERR.E002, `число линий жизни в ДП «${rawDiagram.name}» превышает лимит (${MAX_LIFELINES})`, { path: `${path}.lifelines` }));
      return;
    }
    const lifelines: string[] = [];
    for (const [i, ref] of rawDiagram.lifelines.entries()) {
      const id = resolve(ref, `${path}.lifelines[${i}]`);
      if (id === null) return;
      if (lifelines.includes(id)) {
        errors.push(err(ERR.E002, `участник «${ref}» объявлен в ДП «${rawDiagram.name}» повторно`, { path: `${path}.lifelines[${i}]` }));
        return;
      }
      lifelines.push(id);
    }
    const lifelineSet = new Set(lifelines);

    // Стрелки.
    if (rawDiagram.arrows.length > MAX_SEQ_ARROWS) {
      errors.push(err(ERR.E002, `число стрелок в ДП «${rawDiagram.name}» превышает лимит (${MAX_SEQ_ARROWS})`, { path: `${path}.arrows` }));
      return;
    }
    const arrowIds = new Set<string>();
    const resolvedArrows: Array<{ id: string; from: string; to: string; label?: string }> = [];
    for (const [i, rawArrow] of rawDiagram.arrows.entries()) {
      const arrowPath = `${path}.arrows[${i}]`;
      if (!ID_PATTERN.test(rawArrow.id)) {
        errors.push(err(ERR.E002, `идентификатор стрелки «${rawArrow.id}» не соответствует шаблону`, { path: `${arrowPath}.id` }));
        return;
      }
      if (arrowIds.has(rawArrow.id)) {
        errors.push(err(ERR.E002, `дубликат идентификатора стрелки «${rawArrow.id}»`, { path: `${arrowPath}.id` }));
        return;
      }
      arrowIds.add(rawArrow.id);
      const from = resolve(rawArrow.from, `${arrowPath}.from`);
      const to = resolve(rawArrow.to, `${arrowPath}.to`);
      if (from === null || to === null) return;
      if (!lifelineSet.has(from) || !lifelineSet.has(to)) {
        errors.push(err(ERR.E604, `стрелка «${rawArrow.id}» ссылается на участника, не объявленного в составе ДП «${rawDiagram.name}»`, { path: arrowPath }));
        return;
      }
      if (rawArrow.label !== undefined && rawArrow.label.length > SEQ_TEXT_LIMIT) {
        errors.push(err(ERR.E002, `подпись стрелки превышает ${SEQ_TEXT_LIMIT} символов`, { path: `${arrowPath}.label` }));
        return;
      }
      resolvedArrows.push({
        id: rawArrow.id,
        from,
        to,
        ...(rawArrow.label !== undefined ? { label: rawArrow.label } : {}),
      });
    }

    // Блоки (П-13, П-14): подряд идущие стрелки, без пересечений и вложений.
    if (rawDiagram.blocks.length > MAX_SEQ_BLOCKS) {
      errors.push(err(ERR.E002, `число блоков в ДП «${rawDiagram.name}» превышает лимит (${MAX_SEQ_BLOCKS})`, { path: `${path}.blocks` }));
      return;
    }
    const order = rawDiagram.arrows.map((a) => a.id);
    const occupied = new Map<string, string>();
    const parsedBlocks: Array<{
      id: string;
      kind: string;
      name: string;
      color?: string;
      arrows: string[];
      thenLabel?: string;
      elseLabel?: string;
      elseFrom?: string;
    }> = [];
    for (const [i, rawBlock] of rawDiagram.blocks.entries()) {
      const blockPath = `${path}.blocks[${i}]`;
      if (!ID_PATTERN.test(rawBlock.id)) {
        errors.push(err(ERR.E002, `идентификатор блока «${rawBlock.id}» не соответствует шаблону`, { path: `${blockPath}.id` }));
        return;
      }
      if (parsedBlocks.some((b) => b.id === rawBlock.id)) {
        errors.push(err(ERR.E002, `дубликат идентификатора блока «${rawBlock.id}»`, { path: `${blockPath}.id` }));
        return;
      }
      if (rawBlock.kind !== 'group' && rawBlock.kind !== 'loop' && rawBlock.kind !== 'cond') {
        errors.push(err(ERR.E002, `неизвестный вид блока «${rawBlock.kind}» (ожидается group, loop или cond)`, { path: `${blockPath}.kind` }));
        return;
      }
      if (rawBlock.name.length > SEQ_TEXT_LIMIT) {
        errors.push(err(ERR.E002, `имя блока превышает ${SEQ_TEXT_LIMIT} символов`, { path: `${blockPath}.name` }));
        return;
      }
      if (rawBlock.color !== undefined && !HEX_COLOR_RE.test(rawBlock.color)) {
        errors.push(err(ERR.E002, `цвет блока «${rawBlock.color}» не является hex #RRGGBB`, { path: `${blockPath}.color` }));
        return;
      }
      // Ссылки на стрелки: все объявлены, подряд, без пересечений (E-604, E-605).
      const indexes: number[] = [];
      for (const [j, arrowRef] of rawBlock.arrows.entries()) {
        if (!arrowIds.has(arrowRef)) {
          errors.push(err(ERR.E604, `блок «${rawBlock.name}» ссылается на необъявленную стрелку «${arrowRef}»`, { path: `${blockPath}.arrows[${j}]` }));
          return;
        }
        indexes.push(order.indexOf(arrowRef));
      }
      const sorted = [...indexes].sort((a, b) => a - b);
      if (sorted.length === 0 || sorted.some((v, k) => k > 0 && v !== sorted[k - 1] + 1) || sorted.length !== indexes.length) {
        errors.push(err(ERR.E605, `блок «${rawBlock.name}» составлен не из подряд идущих стрелок`, { path: blockPath }));
        return;
      }
      for (const arrowId of rawBlock.arrows) {
        if (occupied.has(arrowId)) {
          errors.push(err(ERR.E605, `стрелка «${arrowId}» входит в блоки «${occupied.get(arrowId)}» и «${rawBlock.name}» одновременно`, { path: blockPath }));
          return;
        }
        occupied.set(arrowId, rawBlock.id);
      }
      if (rawBlock.kind === 'group' && rawBlock.arrows.length < 2) {
        errors.push(err(ERR.E605, `группа «${rawBlock.name}» содержит менее двух стрелок`, { path: blockPath }));
        return;
      }
      if (rawBlock.arrows.length === 0) {
        errors.push(err(ERR.E605, `блок «${rawBlock.name}» не содержит стрелок`, { path: blockPath }));
        return;
      }
      if (
        rawBlock.kind === 'cond' &&
        rawBlock.elseFrom !== undefined &&
        (!arrowIds.has(rawBlock.elseFrom) ||
          !rawBlock.arrows.includes(rawBlock.elseFrom) ||
          rawBlock.arrows.indexOf(rawBlock.elseFrom) === 0)
      ) {
        errors.push(err(ERR.E605, `блок «${rawBlock.name}» имеет некорректную границу ветки «иначе»`, { path: blockPath }));
        return;
      }
      if (
        (rawBlock.thenLabel !== undefined && rawBlock.thenLabel.length > SEQ_TEXT_LIMIT) ||
        (rawBlock.elseLabel !== undefined && rawBlock.elseLabel.length > SEQ_TEXT_LIMIT)
      ) {
        errors.push(err(ERR.E002, `подпись ветки условного блока превышает ${SEQ_TEXT_LIMIT} символов`, { path: blockPath }));
        return;
      }
      parsedBlocks.push({
        id: rawBlock.id,
        kind: rawBlock.kind,
        name: rawBlock.name,
        ...(rawBlock.color !== undefined ? { color: rawBlock.color } : {}),
        arrows: [...rawBlock.arrows],
        ...(rawBlock.thenLabel !== undefined ? { thenLabel: rawBlock.thenLabel } : {}),
        ...(rawBlock.elseLabel !== undefined ? { elseLabel: rawBlock.elseLabel } : {}),
        ...(rawBlock.elseFrom !== undefined ? { elseFrom: rawBlock.elseFrom } : {}),
      });
    }

    diagrams.push({
      id: rawDiagram.id,
      name: rawDiagram.name,
      lifelines,
      arrows: resolvedArrows,
      blocks: parsedBlocks.map((b) => ({
        id: b.id,
        kind: b.kind as 'group' | 'loop' | 'cond',
        name: b.name,
        color: b.kind !== 'cond' ? b.color ?? '#1E88E5' : '',
        arrows: [...b.arrows],
        ...(b.thenLabel !== undefined ? { thenLabel: b.thenLabel } : {}),
        ...(b.elseLabel !== undefined ? { elseLabel: b.elseLabel } : {}),
        ...(b.elseFrom !== undefined ? { elseFrom: b.elseFrom } : {}),
      })),
    });
  });

  if (errors.length > 0) {
    return { errors, warnings };
  }
  return { errors, warnings, model: diagrams };
}

/** Разбор текста sequences.yaml (Ф-52). Возвращает все ДП файла. */
export function parseSequencesYaml(
  text: string,
  blocks: Block[],
): SequencesParseResult {
  let data: unknown;
  try {
    data = load(text);
  } catch (e) {
    const exception = e as YAMLException;
    const line = exception.mark ? exception.mark.line + 1 : undefined;
    return {
      errors: [{ code: ERR.E001, message: `файл не является корректным YAML${line ? ` (строка ${line})` : ''}`, line }],
      warnings: [],
    };
  }
  const warnings: ImportMessage[] = [];
  for (const path of collectUnknownKeys(data, allowedKeys.sequences as never)) {
    warnings.push(warn('W-001', `неизвестное поле ${path} игнорируется`, { path }));
  }
  const parsed = sequencesFileSchema.safeParse(data);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) =>
      err(ERR.E002, `структура не соответствует схеме: ${issue.message}`, { path: issuePath(issue.path) || '(корень)' }),
    );
    return { errors, warnings };
  }
  if (parsed.data.version !== FILE_VERSION) {
    return {
      errors: [err(ERR.E002, 'поле version должно быть равно 1', { path: 'version' })],
      warnings,
    };
  }
  const inner = parseSequencesInner(parsed.data.sequences, blocks, 'match');
  return {
    errors: inner.errors,
    warnings: [...warnings, ...inner.warnings],
    model: inner.model,
  };
}

/** Экспорт всех ДП проекта в sequences.yaml (Ф-52, Ф-63). */
export function serializeSequencesYaml(
  sequences: SequenceDiagram[],
  blocks: Block[],
): string {
  const payload = {
    version: FILE_VERSION,
    domains: domainsGlossary(sequences, blocks),
    sequences: sequences.map(serializeSequenceInner),
  };
  return dump(payload, { lineWidth: 120, noRefs: true });
}

/** Массив ДП для вкладывания в state.yaml (без version и domains, 7.4). */
export function serializeSequencesInner(sequences: SequenceDiagram[]): unknown[] {
  return sequences.map(serializeSequenceInner);
}

/** Справочник «id → полное название» для всех доменов, встречающихся в ДП. */
function domainsGlossary(
  sequences: SequenceDiagram[],
  blocks: Block[],
): Record<string, string> {
  const used = new Set<string>();
  for (const diagram of sequences) {
    for (const lifeline of diagram.lifelines) used.add(lifeline);
  }
  const glossary: Record<string, string> = {};
  for (const block of blocks) {
    if (used.has(block.id)) {
      glossary[block.id] = block.external ? `${block.name} (внешняя)` : block.name;
    }
  }
  return glossary;
}

/** Одна ДП в формате раздела 7.1. */
function serializeSequenceInner(diagram: SequenceDiagram): unknown {
  return {
    id: diagram.id,
    name: diagram.name,
    lifelines: [...diagram.lifelines],
    arrows: diagram.arrows.map((a) => ({
      id: a.id,
      from: a.from,
      to: a.to,
      ...(a.label !== undefined ? { label: a.label } : {}),
    })),
    blocks: diagram.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      // У условных блоков цвета нет (П-13).
      ...(b.kind !== 'cond' ? { color: b.color } : {}),
      arrows: [...b.arrows],
      ...(b.thenLabel !== undefined ? { thenLabel: b.thenLabel } : {}),
      ...(b.elseLabel !== undefined ? { elseLabel: b.elseLabel } : {}),
      ...(b.elseFrom !== undefined ? { elseFrom: b.elseFrom } : {}),
    })),
  };
}
