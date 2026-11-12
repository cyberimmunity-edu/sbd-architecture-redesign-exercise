/**
 * Движок режима «Диаграммы последовательности» и автонумерации доменов —
 * частное ТЗ v0.02.01 (разделы 4–8). Функции чистые: store и UI вызывают
 * их на актуальной модели проекта.
 *
 * Автонумерация (Ф-30…Ф-36): каждый внутренний домен носит полное название
 * «NN. Название» (NN — минимум два знака с ведущим нулём, от 100 — три);
 * номера идут подряд по порядку следования внутренних блоков в
 * architecture.blocks; внешние системы номеров не получают (П-1). Номер
 * вшит в строку имени (П-2), отдельного поля нет.
 *
 * Матчинг (7.3, П-9): id → номер «NN.» → точное имя → имя без префикса →
 * уникальная подстрока (без учёта регистра); неоднозначная подстрока —
 * E-606, не сопоставленный участник — E-602.
 *
 * Валидация ДП (6.1): каждая стрелка (кроме self) должна опираться на
 * связь ДАП с точным направлением (П-3) — иначе E-601; домены ДАП, не
 * входящие ни в одну ДП, выводятся строками W-008 (информационно, П-12).
 *
 * Цветовая гамма из ДАП (Ф-59, П-11): производные цвета, в модель и
 * экспорт не пишутся — считаются на лету по computeTrust.
 */

import type {
  Architecture,
  Block,
  ImportMessage,
  Project,
  SeqArrow,
  SeqBlock,
  SequenceDiagram,
} from './types';
import { ID_PATTERN, SEQ_BLOCK_COLORS, SEQ_TEXT_LIMIT } from './types';
import { computeTrust } from './trust';

/* ------------------------------------------------------------------ */
/* Автонумерация доменов (Ф-30…Ф-36)                                   */
/* ------------------------------------------------------------------ */

/** Формат номера: минимум два знака с ведущим нулём (01…99), от 100 — три знака. */
export function domainNumber(index: number): string {
  const n = index + 1;
  return n < 100 ? String(n).padStart(2, '0') : String(n);
}

/** Регулярное выражение префикса номера: «NN. » в начале строки. */
export const NUMBER_PREFIX_RE = /^(\d{2,3})\.\s+/;

/** Каноническое полное название внутреннего домена по его позиции. */
export function canonicalInternalName(rawName: string, index: number): string {
  const stripped = rawName.replace(NUMBER_PREFIX_RE, '');
  return `${domainNumber(index)}. ${stripped}`;
}

/**
 * Нормализация имени при переименовании (Ф-31…Ф-35): внутренний домен
 * получает канонический префикс своей текущей позиции (собственный
 * префикс «NN. », введённый пользователем, заменяется каноническим);
 * внешняя система префиксов не имеет — введённый префикс удаляется.
 */
export function normalizeName(rawName: string, index: number | null): string {
  if (index === null) {
    // Внешняя система: префикс номера в начале имени удаляется (Ф-35).
    return rawName.replace(NUMBER_PREFIX_RE, '');
  }
  return canonicalInternalName(rawName, index);
}

/**
 * Перенумерация внутренних доменов по порядку следования (Ф-30, Ф-34).
 * Имя, уже начинающееся с назначаемого префикса «NN. », сохраняется как
 * есть; остальные получают префикс автоматически (двойных префиксов не
 * возникает). Внешние системы не трогаются. Чистая функция: при
 * отсутствии изменений возвращается та же ссылка.
 */
export function renumberArchitecture(architecture: Architecture): Architecture {
  let internalIndex = 0;
  let changed = false;
  const blocks = architecture.blocks.map((block) => {
    if (block.external) return block;
    const canonical = canonicalInternalName(block.name, internalIndex);
    internalIndex += 1;
    if (canonical === block.name) return block;
    changed = true;
    return { ...block, name: canonical };
  });
  if (!changed) return architecture;
  return { ...architecture, blocks };
}

/* ------------------------------------------------------------------ */
/* Матчинг участников импорта (7.3, Ф-54, П-9)                         */
/* ------------------------------------------------------------------ */

export type MatchResult =
  | {
      status: 'matched';
      id: string;
      /** Матч по номеру при несовпадении остатка названия — источник W-007 (7.3). */
      numberWarning?: { fileName: string; projectName: string };
    }
  | { status: 'error'; code: string; message: string };

/**
 * Сопоставление строки S с доменом ДАП (7.3). Порядок: id → номер «NN.» →
 * точное имя (полное и без префикса) → уникальная подстрока (без учёта
 * регистра); неоднозначная подстрока — E-606, нет совпадения — E-602.
 */
export function matchDomain(s: string, blocks: Block[]): MatchResult {
  const value = s.trim();
  if (value.length === 0) {
    return { status: 'error', code: 'E-602', message: 'участник с пустым именем не сопоставлен с доменом ДАП' };
  }
  // Шаг 1: идентификатор блока ДАП (dom-N, ext-N, blk-*).
  const byId = blocks.find((b) => b.id === value);
  if (byId) return { status: 'matched', id: byId.id };

  // Шаг 2: номер «NN. » — только внутренние домены (П-9).
  const prefixMatch = NUMBER_PREFIX_RE.exec(value);
  let effective = value;
  if (prefixMatch) {
    const number = parseInt(prefixMatch[1], 10);
    const internals = blocks.filter((b) => !b.external);
    const byNumber = internals[number - 1];
    if (byNumber && number >= 1) {
      const rest = value.replace(NUMBER_PREFIX_RE, '').trim();
      const ownRest = byNumber.name.replace(NUMBER_PREFIX_RE, '').trim();
      if (rest.length === 0 || rest === ownRest) {
        return { status: 'matched', id: byNumber.id };
      }
      return {
        status: 'matched',
        id: byNumber.id,
        numberWarning: { fileName: rest, projectName: ownRest },
      };
    }
    // Номер не найден (или это внешняя система — по номеру не матчится):
    // шаги 3–4 выполняются по остатку названия без префикса.
    effective = value.replace(NUMBER_PREFIX_RE, '').trim();
  }

  // Шаг 3: точное имя — полное название или название без префикса.
  const exact = blocks.find(
    (b) => b.name === effective || b.name.replace(NUMBER_PREFIX_RE, '').trim() === effective,
  );
  if (exact) return { status: 'matched', id: exact.id };

  // Шаг 4: подстрока названия (без учёта регистра), кандидат ровно один.
  const needle = effective.toLowerCase();
  const candidates = blocks.filter((b) => b.name.toLowerCase().includes(needle));
  if (candidates.length === 1) return { status: 'matched', id: candidates[0].id };
  if (candidates.length > 1) {
    return {
      status: 'error',
      code: 'E-606',
      message: `часть названия «${value}» сопоставляется с несколькими доменами (${candidates.map((b) => b.name).join(', ')})`,
    };
  }

  // Шаг 5: не сопоставлен.
  return { status: 'error', code: 'E-602', message: `участник «${value}» не сопоставлен с доменом ДАП` };
}

/* ------------------------------------------------------------------ */
/* Валидация ДП (6.1, Ф-49, Ф-51)                                      */
/* ------------------------------------------------------------------ */

/** Текст стрелки для сообщений: номер, направление «A → B». */
export function arrowRef(
  diagram: SequenceDiagram,
  arrow: SeqArrow,
  nameOf: (id: string) => string,
): string {
  const number = diagram.arrows.findIndex((a) => a.id === arrow.id) + 1;
  return `стрелка ${number} (${nameOf(arrow.from)} → ${nameOf(arrow.to)})`;
}

/** Строка результата валидации ДП (6.2): код, ДП, стрелка, сообщение. */
export interface SeqValidationRow {
  code: string;
  diagram: string;
  /** «N (A → B)» — только для строк E-601. */
  arrow?: string;
  message: string;
}

/**
 * Проверка всех ДП проекта (Ф-49, Ф-51): расхождения связей E-601
 * (с учётом строгого направления, П-3; self-стрелки не проверяются) и
 * неиспользуемые домены W-008 (информационно, П-12). Структурированные
 * строки для таблицы результатов 6.2.
 */
export function validateSequencesRows(project: Project): SeqValidationRow[] {
  const rows: SeqValidationRow[] = [];
  const sequences = project.sequences ?? [];
  const nameOf = (id: string) =>
    project.architecture.blocks.find((b) => b.id === id)?.name ?? id;
  const edgeSet = new Set(
    project.architecture.edges.map((e) => `${e.from}>${e.to}`),
  );
  const used = new Set<string>();
  for (const diagram of sequences) {
    for (const lifeline of diagram.lifelines) used.add(lifeline);
    for (const [index, arrow] of diagram.arrows.entries()) {
      if (arrow.from === arrow.to) continue; // self-стрелка соответствия не требует
      if (!edgeSet.has(`${arrow.from}>${arrow.to}`)) {
        const ref = `${index + 1} (${nameOf(arrow.from)} → ${nameOf(arrow.to)})`;
        rows.push({
          code: 'E-601',
          diagram: diagram.name,
          arrow: ref,
          message: `Стрелка ${ref} в ДП «${diagram.name}» не соответствует связям ДАП`,
        });
      }
    }
  }
  for (const block of project.architecture.blocks) {
    if (!used.has(block.id)) {
      const suffix = block.external ? ' (внешняя)' : '';
      rows.push({
        code: 'W-008',
        diagram: '',
        message: `Домен «${block.name}»${suffix} не используется ни в одной ДП`,
      });
    }
  }
  return rows;
}

/**
 * Сообщения валидации ДП (Ф-49, Ф-51) — плоский список для панели валидации.
 */
export function validateSequences(project: Project): ImportMessage[] {
  return validateSequencesRows(project).map((row) => ({
    code: row.code,
    message: row.message,
  }));
}

/** Расхождения связей E-601 из списка сообщений валидации ДП. */
export function missingEdgePairs(
  project: Project,
  messages: ImportMessage[],
): Array<{ from: string; to: string }> {
  if (!messages.some((m) => m.code === 'E-601')) return [];
  const sequences = project.sequences ?? [];
  const edgeSet = new Set(
    project.architecture.edges.map((e) => `${e.from}>${e.to}`),
  );
  const pairs: Array<{ from: string; to: string }> = [];
  for (const diagram of sequences) {
    for (const arrow of diagram.arrows) {
      if (arrow.from === arrow.to) continue;
      if (!edgeSet.has(`${arrow.from}>${arrow.to}`)) {
        pairs.push({ from: arrow.from, to: arrow.to });
      }
    }
  }
  return pairs;
}

/* ------------------------------------------------------------------ */
/* Блоки ДП (П-6, П-13, П-14)                                          */
/* ------------------------------------------------------------------ */

/** Проверка, что id стрелок образуют подряд идущий диапазон без пересечений. */
export function isConsecutive(diagram: SequenceDiagram, arrowIds: string[]): boolean {
  if (arrowIds.length === 0) return false;
  const order = diagram.arrows.map((a) => a.id);
  const indexes = arrowIds.map((id) => order.indexOf(id));
  if (indexes.some((i) => i < 0)) return false;
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return indexes.length === sorted.length;
}

/** Первый свободный цвет палитры для новой группы/цикла (П-13). */
export function firstFreeColor(diagram: SequenceDiagram): string {
  for (const color of SEQ_BLOCK_COLORS) {
    if (!diagram.blocks.some((b) => b.kind !== 'cond' && b.color === color)) {
      return color;
    }
  }
  return SEQ_BLOCK_COLORS[0];
}

/** Имя по умолчанию: «Группа N» — первый свободный номер. */
export function defaultGroupName(diagram: SequenceDiagram): string {
  let n = 1;
  while (diagram.blocks.some((b) => b.name === `Группа ${n}`)) n += 1;
  return `Группа ${n}`;
}

/** Имя по умолчанию цикла: «Цикл N» — первый свободный номер. */
export function defaultLoopName(diagram: SequenceDiagram): string {
  let n = 1;
  while (diagram.blocks.some((b) => b.name === `Цикл ${n}`)) n += 1;
  return `Цикл ${n}`;
}

/**
 * Чистка блоков после удаления стрелок: блоки с оставшимися стрелками
 * сужаются; пустой блок распускается; у cond опустевшая ветка «иначе»
 * оставляет блок без else, опустевшая ветка «то» распускает блок; граница
 * else сдвигается к первой оставшейся стрелке ветки «иначе» (5.4).
 */
export function cleanBlocksAfterArrowRemoval(
  blocks: SeqBlock[],
  remainingArrows: string[],
): SeqBlock[] {
  const result: SeqBlock[] = [];
  for (const block of blocks) {
    const kept = block.arrows.filter((id) => remainingArrows.includes(id));
    if (kept.length === 0) continue; // блок опустел — распускается
    if (block.kind === 'cond') {
      const origElseIndex = block.elseFrom ? block.arrows.indexOf(block.elseFrom) : -1;
      const keptThen =
        origElseIndex > 0
          ? kept.filter((id) => block.arrows.indexOf(id) < origElseIndex)
          : [...kept];
      const keptElse =
        origElseIndex > 0 ? kept.filter((id) => block.arrows.indexOf(id) > origElseIndex) : [];
      if (keptThen.length === 0) continue; // ветка «то» опустела — блок распускается
      if (keptElse.length === 0) {
        // Ветка «иначе» опустела — блок без else (модель допускает, П-14).
        result.push({ ...block, arrows: kept, elseFrom: undefined, elseLabel: undefined });
        continue;
      }
      // Обе ветки живы: граница else — первая оставшаяся стрелка ветки «иначе».
      const newElseFrom = block.arrows.find(
        (id) => origElseIndex >= 0 && block.arrows.indexOf(id) > origElseIndex && kept.includes(id),
      );
      result.push({
        ...block,
        arrows: kept,
        ...(newElseFrom ? { elseFrom: newElseFrom } : { elseFrom: undefined, elseLabel: undefined }),
      });
    } else if (block.kind === 'group' && kept.length < 2) {
      continue; // группа, сжавшаяся до одной стрелки, распускается
    } else {
      result.push({ ...block, arrows: kept }); // цикл из одной стрелки сохраняется
    }
  }
  return result;
}

/**
 * Чистка блоков после удаления линии жизни: из блоков убираются её стрелки
 * (они удаляются вместе с линией жизни).
 */
export function cleanBlocksAfterLifelineRemoval(
  blocks: SeqBlock[],
  arrows: SeqArrow[],
  removedLifeline: string,
): SeqBlock[] {
  const remainingArrows = arrows
    .filter((a) => a.from !== removedLifeline && a.to !== removedLifeline)
    .map((a) => a.id);
  return cleanBlocksAfterArrowRemoval(blocks, remainingArrows);
}

/** Уникальное имя ДП: база (по умолчанию «Новая ДП»), при занятости — «… 2», «… 3», … (Ф-39, Ф-65). */
export function uniqueSequenceName(existing: SequenceDiagram[], base = 'Новая ДП'): string {
  if (!existing.some((s) => s.name === base)) return base;
  let n = 2;
  while (existing.some((s) => s.name === `${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** Проверка длины текста ДП (имя, подписи, условие — до 60 символов). */
export function seqTextValid(text: string): boolean {
  return text.length > 0 && text.length <= SEQ_TEXT_LIMIT;
}

/** Проверка id сущности ДП по ID_PATTERN (стрелки a-N, блоки g-N). */
export function seqIdValid(id: string): boolean {
  return ID_PATTERN.test(id);
}

/* ------------------------------------------------------------------ */
/* Цветовая гамма из ДАП (Ф-59, П-11)                                  */
/* ------------------------------------------------------------------ */

export interface SeqColorScheme {
  /** Цвет заливки линии жизни по классу доверия домена. */
  lifelines: Map<string, 'red' | 'yellow' | 'green'>;
  /** Цвет стрелки по домену-источнику: из красных — красные, из жёлтых и зелёных — зелёные. */
  arrows: Map<string, 'red' | 'green'>;
}

/**
 * Производные цвета канвы ДП по модели доверия ДАП (П-11). В модель
 * данных и экспорт не пишутся; пересчитываются при любом изменении ДАП
 * и при переключении опции.
 */
export function computeSeqColors(project: Project): SeqColorScheme {
  const trust = computeTrust(project);
  const lifelines = new Map<string, 'red' | 'yellow' | 'green'>();
  const arrows = new Map<string, 'red' | 'green'>();
  const sourceIsGreen = (blockId: string): boolean => {
    const internal = trust.internal.get(blockId);
    if (internal === 'ddb' || internal === 'ddbpcd') return true;
    return trust.external.get(blockId) === 'green';
  };
  for (const diagram of project.sequences ?? []) {
    for (const lifeline of diagram.lifelines) {
      const block = project.architecture.blocks.find((b) => b.id === lifeline);
      if (!block) continue;
      if (block.external) {
        lifelines.set(lifeline, block.trusted ? 'green' : 'red');
      } else {
        const cls = trust.internal.get(lifeline) ?? 'ndb';
        lifelines.set(lifeline, cls === 'ndb' ? 'red' : cls === 'ddbpcd' ? 'yellow' : 'green');
      }
    }
    for (const arrow of diagram.arrows) {
      arrows.set(arrow.id, sourceIsGreen(arrow.from) ? 'green' : 'red');
    }
  }
  return { lifelines, arrows };
}
