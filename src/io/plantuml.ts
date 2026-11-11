/**
 * Представление архитектуры в PlantUML — раздел 6.3 ТЗ (фиксированное
 * подмножество, решение D7). Стоимость блока записывается в стереотипе
 * `<<cost: N>>`; компоненты сопоставляются блокам по полю name.
 * Внешние (смежные) системы помечаются стереотипом `<<external>>`
 * (недоверенная по умолчанию) или `<<external-trusted>>` (доверенная,
 * зелёная) — раздел 3.5 ТЗ v0.01.01; стоимость для них не задаётся.
 */

import type { Architecture } from '../engine/types';
import { ERR, WARN, err, warn } from './errors';
import { validateArchitecture } from './validate';
import type { ParseResult } from './archYaml';

const COMPONENT_RE = /^\[([^\]]+)\]\s*((?:<<[^<>]+>>\s*)*)$/;
const STEREOTYPE_RE = /<<([^<>]+)>>/g;
const COST_RE = /^cost:\s*(\d+)$/;
const EDGE_RE = /^\[([^\]]+)\]\s*(?:-->|->)\s*\[([^\]]+)\]\s*(?::\s*(.*?)\s*)?$/;

/** Конструкции PlantUML вне подмножества, которые пропускаются с W-002. */
const IGNORABLE_PREFIXES = [
  'skinparam',
  'note',
  'package',
  'title',
  'legend',
  'footer',
  'header',
  'caption',
  'autonumber',
  'scale',
  'hide',
  'show',
  'left to right direction',
  'top to bottom direction',
  'allowmixing',
  '!',
];

function isIgnorable(line: string): string | null {
  if (line.includes(' as ')) return 'алиас as';
  for (const prefix of IGNORABLE_PREFIXES) {
    if (line.startsWith(prefix)) return prefix;
  }
  return null;
}

/** Разбор текста PlantUML в модель архитектуры. */
export function parsePlantUml(text: string): ParseResult<Architecture> {
  const errors: ImportMessageLike[] = [];
  const warnings: ImportMessageLike[] = [];
  const lines = text.split(/\r?\n/);

  interface Decl {
    name: string;
    cost: number;
    external: boolean;
    trusted: boolean;
    line: number;
  }
  interface RawEdge {
    from: string;
    to: string;
    label?: string;
    line: number;
  }
  const declarations: Decl[] = [];
  const rawEdges: RawEdge[] = [];
  let startSeen = false;
  let endSeen = false;
  const warnedTypes = new Set<string>();
  let skipBlock: 'note' | 'package' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('\'')) continue; // комментарий PlantUML без предупреждения
    if (line === '@startuml') {
      startSeen = true;
      continue;
    }
    if (line === '@enduml') {
      // @enduml закрывает диаграмму даже внутри незакрытого блока.
      endSeen = true;
      skipBlock = null;
      continue;
    }
    if (skipBlock) {
      // Тело многострочного блока (note/package) пропускается целиком.
      if (skipBlock === 'note' && /^(end\s*note|endnote)$/.test(line)) skipBlock = null;
      else if (skipBlock === 'package' && line === '}') skipBlock = null;
      continue;
    }
    if (line.startsWith('end ')) continue; // закрывающая строка ignorable-блока вне тела блока
    if (!startSeen || endSeen) {
      // Строки вне тела диаграммы игнорируются без предупреждения.
      continue;
    }
    const componentMatch = COMPONENT_RE.exec(line);
    if (componentMatch) {
      const name = componentMatch[1].trim();
      let cost: number | null = null;
      let external = false;
      let trusted = false;
      const stereotypeGroup = componentMatch[2] ?? '';
      for (const match of stereotypeGroup.matchAll(STEREOTYPE_RE)) {
        const token = match[1].trim();
        const costMatch = COST_RE.exec(token);
        if (costMatch) {
          cost = Number(costMatch[1]);
        } else if (token === 'external') {
          external = true;
        } else if (token === 'external-trusted') {
          external = true;
          trusted = true;
        } else if (!warnedTypes.has(token)) {
          warnedTypes.add(token);
          warnings.push(warn(WARN.W002, `PlantUML: стереотип «${token}» вне подмножества пропущен`, { line: lineNo }));
        }
      }
      if (cost === null) {
        if (external) {
          // Для внешних систем стоимость не определяется (3.5 v0.01.01).
          cost = 0;
        } else {
          warnings.push(warn(WARN.W005, `компонент «${name}» без стереотипа стоимости: назначена C_блока = 0`, { line: lineNo }));
          cost = 0;
        }
      }
      declarations.push({ name, cost, external, trusted, line: lineNo });
      continue;
    }
    const edgeMatch = EDGE_RE.exec(line);
    if (edgeMatch) {
      rawEdges.push({
        from: edgeMatch[1].trim(),
        to: edgeMatch[2].trim(),
        label: edgeMatch[3] ? edgeMatch[3].trim() : undefined,
        line: lineNo,
      });
      continue;
    }
    const ignorable = isIgnorable(line);
    if (ignorable) {
      if (!warnedTypes.has(ignorable)) {
        warnedTypes.add(ignorable);
        warnings.push(warn(WARN.W002, `PlantUML: неподдерживаемая конструкция «${ignorable}» пропущена`, { line: lineNo }));
      }
      // Многострочные блоки пропускаются целиком (однострочные note «note … : …» не входят).
      if (ignorable === 'note' && !line.includes(':')) skipBlock = 'note';
      else if (ignorable === 'package' && line.endsWith('{')) skipBlock = 'package';
      continue;
    }
    errors.push(err(ERR.E301, `строка PlantUML не распознана: «${line}»`, { line: lineNo }));
  }

  if (!startSeen || !endSeen) {
    errors.push(err(ERR.E304, 'отсутствует @startuml или @enduml'));
  }

  const byName = new Map<string, Decl>();
  for (const decl of declarations) {
    if (byName.has(decl.name)) {
      errors.push(err(ERR.E302, `дубликат имени компонента «${decl.name}»`, { line: decl.line }));
    } else {
      byName.set(decl.name, decl);
    }
  }
  for (const edge of rawEdges) {
    if (!byName.has(edge.from)) {
      errors.push(err(ERR.E303, `стрелка ссылается на необъявленный компонент «${edge.from}»`, { line: edge.line }));
    }
    if (!byName.has(edge.to)) {
      errors.push(err(ERR.E303, `стрелка ссылается на необъявленный компонент «${edge.to}»`, { line: edge.line }));
    }
  }
  if (errors.length > 0) {
    return { errors, warnings };
  }
  if (declarations.length === 0) {
    return { errors: [err(ERR.E301, 'в диаграмме не объявлено ни одного компонента')], warnings };
  }

  // Компоненты сопоставляются блокам по имени; идентификаторы генерируются по порядку объявления.
  const nameToId = new Map<string, string>();
  const blocks = declarations.map((decl, index) => {
    const id = `blk-${index + 1}`;
    nameToId.set(decl.name, id);
    return {
      id,
      name: decl.name,
      cost: decl.cost,
      ...(decl.external ? { external: true } : {}),
      ...(decl.external && decl.trusted ? { trusted: true } : {}),
    };
  });
  const edges = rawEdges.map((edge, index) => ({
    id: `e-${index + 1}`,
    from: nameToId.get(edge.from)!,
    to: nameToId.get(edge.to)!,
    ...(edge.label ? { label: edge.label } : {}),
  }));
  const model: Architecture = { blocks, edges };
  const semantic = validateArchitecture(model);
  if (semantic.some((m) => m.code.startsWith('E'))) {
    return { errors: [...errors, ...semantic], warnings };
  }
  warnings.push(...semantic);
  return { errors, warnings, model };
}

/** Экспорт архитектуры в подмножество PlantUML (Ф-24). */
export function serializePuml(architecture: Architecture): string {
  const nameById = new Map(architecture.blocks.map((b) => [b.id, b.name]));
  const lines: string[] = ['@startuml'];
  for (const block of architecture.blocks) {
    if (block.external) {
      // Внешняя система: стоимость не задаётся, доверенность — стереотипом (3.5 v0.01.01).
      lines.push(`[${block.name}] <<${block.trusted ? 'external-trusted' : 'external'}>>`);
    } else {
      lines.push(`[${block.name}] <<cost: ${block.cost}>>`);
    }
  }
  for (const edge of architecture.edges) {
    const from = nameById.get(edge.from) ?? edge.from;
    const to = nameById.get(edge.to) ?? edge.to;
    lines.push(edge.label ? `[${from}] --> [${to}] : ${edge.label}` : `[${from}] --> [${to}]`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

type ImportMessageLike = import('../engine/types').ImportMessage;
