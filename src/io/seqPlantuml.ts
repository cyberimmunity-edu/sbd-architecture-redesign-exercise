/**
 * Подмножество PlantUML для ДП — раздел 7.2 ТЗ v0.02.01 (Ф-53, Ф-62).
 * Независимый парсер (не переиспользует парсер ДАП: тот пропускает строки
 * с `as` и не знает блочных конструкций). Экспорт — одна ДП в файл
 * `<имя ДП>.puml`; импорт по подмножеству из таблицы 7.2.
 *
 * Участники: `participant "Полное название" as алиас` (внешние — со
 * стереотипом <<external>>); сопоставление с ДАП — по 7.3. Стрелки:
 * `A -> B : подпись`, реверсы `A <- B`, self `A -> A`; тип линии не
 * различается. Блоки: `group`/`loop` (с #цветом) и `if (…) then (…) …
 * else (…) … end` (П-14). Вложенные блочные конструкции и alt/opt/par/
 * critical/repeat/while — вне подмножества (W-002); их заголовки
 * игнорируются, стрелки относятся к внешнему блоку. autonumber/title/
 * skinparam/scale/hide/show/caption/legend/footer/header/activate/
 * deactivate/destroy/== … ==/комментарии игнорируются молча; note/box/!…
 * — W-002 (блоки note/box пропускаются целиком); нераспознанная строка —
 * E-607; else/end без открытого блока — E-609; отсутствие пары
 * @startuml/@enduml — E-608.
 */

import type { Block, ImportMessage, SeqArrow, SeqBlock, SequenceDiagram } from '../engine/types';
import { SEQ_TEXT_LIMIT } from '../engine/types';
import { ERR, err, warn } from './errors';
import { matchDomain } from '../engine/sequence';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Результат разбора PlantUML ДП: линии жизни, стрелки и блоки. */
export interface SeqPumlModel {
  lifelines: string[];
  arrows: SeqArrow[];
  blocks: SeqBlock[];
}

export interface SeqPumlResult {
  errors: ImportMessage[];
  warnings: ImportMessage[];
  model?: SeqPumlModel;
}

interface Participant {
  alias: string;
  name: string;
  external: boolean;
  domainId: string | null;
}

/** Открытый контекст разбора. */
type OpenFrame =
  | {
      type: 'block';
      kind: 'group' | 'loop' | 'cond';
      name: string;
      color?: string;
      thenLabel?: string;
      elseLabel?: string;
      /** id первой стрелки после else; '__pending__' — стрелок ещё не было. */
      elseFrom?: string;
      arrowIds: string[];
    }
  | { type: 'pseudo'; keyword: string };

const PENDING_ELSE = '__pending__';

/** Конструкции, игнорируемые молча (однострочные, 7.2). */
const SILENT_PREFIXES = [
  'autonumber',
  'title',
  'skinparam',
  'scale',
  'hide',
  'show',
  'caption',
  'activate',
  'deactivate',
  'destroy',
];

/** Псевдоблоки вне подмножества: тело разбирается как стрелки без блочной семантики (W-002). */
const PSEUDO_KEYWORDS = ['alt', 'opt', 'par', 'critical', 'repeat', 'while', 'legend', 'header', 'footer'];

/** Разбор текста PlantUML ДП (Ф-53, таблица 7.2). */
export function parseSeqPlantUml(text: string, blocks: Block[]): SeqPumlResult {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];
  const lines = text.split(/\r?\n/);

  const participants: Participant[] = [];
  const byKey = new Map<string, Participant>();
  const arrows: SeqArrow[] = [];
  const seqBlocks: SeqBlock[] = [];
  const openFrames: OpenFrame[] = [];
  const warned = new Set<string>();
  let startSeen = false;
  let endSeen = false;
  let arrowCounter = 0;
  let skipBlock: 'note' | 'box' | null = null;

  const aliasOf = (key: string): string | null => byKey.get(key)?.domainId ?? null;

  /** Объявление участника: матчинг 7.3, контроль дубликатов (E-603). */
  const declareParticipant = (
    name: string,
    alias: string | undefined,
    external: boolean,
    line: number,
  ): void => {
    if ((alias && byKey.has(alias)) || byKey.has(name) || participants.some((p) => p.name === name)) {
      errors.push(
        err(ERR.E603, `дубликат участника «${alias ?? name}» (алиас или имя объявлены повторно)`, { line }),
      );
      return;
    }
    const matched = matchDomain(name, blocks);
    if (matched.status === 'error') {
      errors.push(err(matched.code, matched.message, { line }));
      return;
    }
    if (matched.numberWarning) {
      warnings.push(
        warn(
          'W-007',
          `Участник «${name}» принят по номеру; название в проекте иное: «${matched.numberWarning.projectName}»`,
          { line },
        ),
      );
    }
    if (participants.some((p) => p.domainId === matched.id)) {
      errors.push(err(ERR.E603, `дубликат участника «${name}» (алиас или имя объявлены повторно)`, { line }));
      return;
    }
    const participant: Participant = { alias: alias ?? name, name, external, domainId: matched.id };
    participants.push(participant);
    byKey.set(participant.alias, participant);
    if (alias && alias !== name) byKey.set(name, participant);
  };

  /** Добавление стрелки: в открытый блок (внешний) или плоско. */
  const addArrow = (from: string, to: string, label: string | undefined, line: number): void => {
    if (label !== undefined && label.length > SEQ_TEXT_LIMIT) {
      errors.push(err(ERR.E002, `подпись стрелки превышает ${SEQ_TEXT_LIMIT} символов`, { line }));
      return;
    }
    arrowCounter += 1;
    const id = `a-${arrowCounter}`;
    arrows.push({ id, from, to, ...(label !== undefined ? { label } : {}) });
    // Стрелки относятся к внешнему открытому блоку (7.2); псевдоблоки блоком не считаются.
    const frame = openFrames.find((f) => f.type === 'block') as
      | Extract<OpenFrame, { type: 'block' }>
      | undefined;
    if (frame) {
      frame.arrowIds.push(id);
      if (frame.kind === 'cond' && frame.elseFrom === PENDING_ELSE) {
        frame.elseFrom = id; // первая стрелка после else — граница ветки (П-14)
      }
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('\'')) continue; // комментарий PlantUML
    if (line === '@startuml') {
      startSeen = true;
      continue;
    }
    if (line === '@enduml') {
      endSeen = true;
      openFrames.length = 0; // @enduml закрывает диаграмму вместе с незакрытыми блоками
      continue;
    }
    if (!startSeen || endSeen) continue; // строки вне тела диаграммы игнорируются

    // Тело многострочного note/box пропускается целиком (W-002).
    if (skipBlock) {
      if (skipBlock === 'note' && /^(end\s*note|endnote)$/.test(line)) skipBlock = null;
      else if (skipBlock === 'box' && /^(end\s*box|endbox)$/.test(line)) skipBlock = null;
      continue;
    }

    // Закрывающая строка блока: end, endif, endloop, endgroup, endlegend…
    if (/^(end|endif|endloop|endgroup|endlegend|end legend|end note|endnote|end box|endbox)$/.test(line)) {
      if (skipBlock) continue;
      if (openFrames.length === 0) {
        errors.push(err(ERR.E609, 'конструкция «end» вне открытого блока', { line: lineNo }));
        continue;
      }
      const frame = openFrames.pop()!;
      if (frame.type === 'block') {
        finalizeBlock(frame, seqBlocks, errors, lineNo);
      }
      continue;
    }

    // Объявление участника (participant/actor, с кавычками или без).
    const participantMatch =
      /^(participant|actor)\s+"([^"]+)"(?:\s+as\s+([^\s]+))?((?:\s*<<[^<>]+>>\s*)*)$/.exec(line) ??
      /^(participant|actor)\s+([^\s"]+)(?:\s+as\s+([^\s]+))?((?:\s*<<[^<>]+>>\s*)*)$/.exec(line);
    if (participantMatch) {
      const name = participantMatch[2].trim();
      const alias = participantMatch[3] ? participantMatch[3].trim() : undefined;
      const stereotypes = participantMatch[4] ?? '';
      declareParticipant(name, alias, stereotypes.includes('<<external>>'), lineNo);
      continue;
    }

    // Стрелки: A -> B : text, A ->> B, A --> B, self A -> A; реверсы A <- B, A <-- B.
    const arrowMatch = /^([^\s]+)\s*(->>|-->|<--|->|<-)\s*([^\s]+)\s*(?::\s*(.*?)\s*)?$/.exec(line);
    if (arrowMatch) {
      const rawFrom = arrowMatch[1];
      const rawTo = arrowMatch[3];
      const label = arrowMatch[4] ? arrowMatch[4].trim() : undefined;
      const fromId = aliasOf(rawFrom);
      const toId = aliasOf(rawTo);
      if (fromId === null) {
        errors.push(err(ERR.E604, `стрелка ссылается на участника «${rawFrom}», не объявленного в составе ДП`, { line: lineNo }));
        continue;
      }
      if (toId === null) {
        errors.push(err(ERR.E604, `стрелка ссылается на участника «${rawTo}», не объявленного в составе ДП`, { line: lineNo }));
        continue;
      }
      // Реверс: A <- B означает B → A (7.2).
      if (arrowMatch[2] === '<-' || arrowMatch[2] === '<--') {
        addArrow(toId, fromId, label, lineNo);
      } else {
        addArrow(fromId, toId, label, lineNo);
      }
      continue;
    }

    // Открытие блока group/loop [#цвет]; вложенные конструкции — W-002 (7.2).
    const groupMatch = /^(group|loop)\s+(.*)$/.exec(line);
    if (groupMatch) {
      if (openFrames.some((f) => f.type === 'block')) {
        warnings.push(
          warn(
            'W-002',
            `PlantUML: вложенная конструкция «${groupMatch[1]}» пропущена, стрелки относятся к внешнему блоку`,
            { line: lineNo },
          ),
        );
        openFrames.push({ type: 'pseudo', keyword: groupMatch[1] });
        continue;
      }
      const restMatch = /^(.*?)\s*(#[0-9A-Fa-f]{6})?\s*$/.exec(groupMatch[2]);
      const name = (restMatch?.[1] ?? '').trim();
      const color = restMatch?.[2];
      if (name.length === 0 || name.length > SEQ_TEXT_LIMIT) {
        errors.push(err(ERR.E002, `имя блока должно быть от 1 до ${SEQ_TEXT_LIMIT} символов`, { line: lineNo }));
        continue;
      }
      if (color && !HEX_COLOR_RE.test(color)) {
        errors.push(err(ERR.E002, `цвет блока «${color}» не является hex #RRGGBB`, { line: lineNo }));
        continue;
      }
      openFrames.push({
        type: 'block',
        kind: groupMatch[1] as 'group' | 'loop',
        name,
        color: color ?? '#1E88E5',
        arrowIds: [],
      });
      continue;
    }

    // Условный блок: if (условие) then (подпись).
    const ifMatch = /^if\s*\((.+?)\)\s*then\s*\((.*)\)\s*$/.exec(line);
    if (ifMatch) {
      if (openFrames.some((f) => f.type === 'block')) {
        warnings.push(
          warn(
            'W-002',
            'PlantUML: вложенная конструкция «if» пропущена, стрелки относятся к внешнему блоку',
            { line: lineNo },
          ),
        );
        openFrames.push({ type: 'pseudo', keyword: 'if' });
        continue;
      }
      const condition = ifMatch[1].trim();
      const thenLabel = ifMatch[2].trim();
      if (condition.length === 0 || condition.length > SEQ_TEXT_LIMIT) {
        errors.push(err(ERR.E002, `условие условного блока должно быть от 1 до ${SEQ_TEXT_LIMIT} символов`, { line: lineNo }));
        continue;
      }
      openFrames.push({ type: 'block', kind: 'cond', name: condition, thenLabel, arrowIds: [] });
      continue;
    }

    // Граница ветки «иначе»: только для открытого условного блока верхнего уровня.
    const elseMatch = /^else\s*(?:\((.*?)\))?\s*$/.exec(line);
    if (elseMatch) {
      const frame = openFrames[openFrames.length - 1];
      if (frame && frame.type === 'pseudo') continue; // else вложенного alt/opt — игнорируется
      if (!frame || frame.type !== 'block' || frame.kind !== 'cond') {
        errors.push(err(ERR.E609, 'конструкция «else» вне открытого блока', { line: lineNo }));
        continue;
      }
      frame.elseFrom = PENDING_ELSE;
      frame.elseLabel = elseMatch[1] ? elseMatch[1].trim() : undefined;
      continue;
    }

    // Заголовки внутри псевдоблока (when/break/covers/…) игнорируются молча:
    // стрелки уже разобраны выше, остальные строки alt/opt и подобных
    // конструкций вне подмножества не несут семантики ДП.
    if (openFrames[openFrames.length - 1]?.type === 'pseudo') {
      continue;
    }

    // Псевдоблоки вне подмножества (W-002): заголовок игнорируется, тело разбирается как стрелки.
    const pseudoKeyword = PSEUDO_KEYWORDS.find((k) => line.startsWith(`${k} `) || line === k);
    if (pseudoKeyword) {
      if (!warned.has(pseudoKeyword)) {
        warned.add(pseudoKeyword);
        warnings.push(
          warn('W-002', `PlantUML: конструкция «${pseudoKeyword}» вне подмножества пропущена`, { line: lineNo }),
        );
      }
      openFrames.push({ type: 'pseudo', keyword: pseudoKeyword });
      continue;
    }

    // note/box: вне подмножества (W-002), многострочные пропускаются целиком.
    if (line.startsWith('note') || line.startsWith('box')) {
      const keyword = line.startsWith('note') ? 'note' : 'box';
      if (!warned.has(keyword)) {
        warned.add(keyword);
        warnings.push(
          warn('W-002', `PlantUML: конструкция «${keyword}» вне подмножества пропущена`, { line: lineNo }),
        );
      }
      if (!line.includes(':')) skipBlock = keyword; // многострочная форма
      continue;
    }

    // Однострочные директивы и разделители — игнорируются молча (7.2).
    if (SILENT_PREFIXES.some((p) => line.startsWith(p))) continue;
    if (line.startsWith('==')) continue;
    if (line.startsWith('!')) {
      if (!warned.has('!')) {
        warned.add('!');
        warnings.push(warn('W-002', 'PlantUML: директива вне подмножества пропущена', { line: lineNo }));
      }
      continue;
    }

    errors.push(err(ERR.E607, `строка PlantUML не распознана: «${line}»`, { line: lineNo }));
  }

  if (!startSeen || !endSeen) {
    errors.push(err(ERR.E608, 'отсутствует @startuml или @enduml'));
  }

  if (errors.length > 0) {
    return { errors, warnings };
  }
  if (participants.length === 0) {
    return { errors: [err(ERR.E602, 'в диаграмме не объявлено ни одного участника')], warnings };
  }
  return {
    errors,
    warnings,
    model: {
      lifelines: participants.map((p) => p.domainId!).filter((id) => id !== null),
      arrows,
      blocks: seqBlocks,
    },
  };
}

/** Завершение блока: сборка SeqBlock, минимальные составы (П-13, П-14). */
function finalizeBlock(
  frame: Extract<OpenFrame, { type: 'block' }>,
  seqBlocks: SeqBlock[],
  errors: ImportMessage[],
  line: number,
): void {
  if (frame.kind === 'cond') {
    if (frame.arrowIds.length === 0) {
      errors.push(err(ERR.E605, 'условный блок не содержит стрелок', { line }));
      return;
    }
    // Стрелок после else не было — блок без ветки «иначе» (П-14).
    const elseFrom = frame.elseFrom === PENDING_ELSE ? undefined : frame.elseFrom;
    seqBlocks.push({
      id: `g-${seqBlocks.length + 1}`,
      kind: 'cond',
      name: frame.name,
      color: '',
      arrows: [...frame.arrowIds],
      ...(frame.thenLabel !== undefined ? { thenLabel: frame.thenLabel } : {}),
      ...(elseFrom !== undefined && frame.elseLabel !== undefined
        ? { elseLabel: frame.elseLabel }
        : {}),
      ...(elseFrom !== undefined ? { elseFrom } : {}),
    });
    return;
  }
  if (frame.arrowIds.length === 0) {
    errors.push(err(ERR.E605, `блок «${frame.name}» не содержит стрелок`, { line }));
    return;
  }
  if (frame.kind === 'group' && frame.arrowIds.length < 2) {
    errors.push(err(ERR.E605, `группа «${frame.name}» содержит менее двух стрелок`, { line }));
    return;
  }
  seqBlocks.push({
    id: `g-${seqBlocks.length + 1}`,
    kind: frame.kind,
    name: frame.name,
    color: frame.color ?? '#1E88E5',
    arrows: [...frame.arrowIds],
  });
}

/**
 * Экспорт одной ДП в подмножество PlantUML (Ф-53): участник с полным
 * названием и алиасом-идентификатором домена, внешние — <<external>>;
 * group/loop с #цветом, if…then…else…end (без else при отсутствии ветки);
 * autonumber в начале. Рамка блока выводится на месте его первой стрелки
 * и охватывает ровно его стрелки.
 */
export function serializeSeqPuml(diagram: SequenceDiagram, blocks: Block[]): string {
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const lines: string[] = ['@startuml', 'autonumber'];
  for (const lifeline of diagram.lifelines) {
    const block = blockById.get(lifeline);
    const name = block?.name ?? lifeline;
    const external = block?.external ? ' <<external>>' : '';
    lines.push(`participant "${name}" as ${lifeline}${external}`);
  }
  lines.push('');

  const opensAt = new Map<string, SeqBlock>();
  for (const block of diagram.blocks) {
    if (block.arrows.length > 0) opensAt.set(block.arrows[0], block);
  }

  for (const arrow of diagram.arrows) {
    const opening = opensAt.get(arrow.id);
    if (opening) {
      if (opening.kind === 'cond') {
        lines.push(`if (${opening.name}) then (${opening.thenLabel ?? ''})`);
      } else {
        const keyword = opening.kind === 'group' ? 'group' : 'loop';
        lines.push(`${keyword} ${opening.name} ${opening.color}`);
      }
    }
    // Граница ветки «иначе» выводится перед первой стрелкой ветки (elseFrom),
    // чтобы обратный импорт дал ту же границу ветки.
    for (const block of diagram.blocks) {
      if (block.kind === 'cond' && block.elseFrom === arrow.id) {
        lines.push(`else (${block.elseLabel ?? ''})`);
      }
    }
    const label = arrow.label ? ` : ${arrow.label}` : '';
    lines.push(`${arrow.from} -> ${arrow.to}${label}`);
    for (const block of diagram.blocks) {
      if (block.arrows[block.arrows.length - 1] === arrow.id) {
        lines.push('end');
      }
    }
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}
