/**
 * Файл рабочего состояния state.yaml — раздел 6.4 ТЗ (решение D8).
 * Самодостаточен: содержит архитектуру, цели и функции и размещения,
 * поэтому сдача работы одним файлом полностью описывает решение студента.
 */

import { dump, load, YAMLException } from 'js-yaml';
import type { ImportMessage, Project } from '../engine/types';
import { FILE_VERSION } from '../engine/types';
import { ERR, err, warn } from './errors';
import { allowedKeys, collectUnknownKeys, issuePath, stateSchema } from './schema';
import { parseArchInner } from './archYaml';
import { parseSecurityInner } from './securityYaml';
import { parseSequencesInner } from './sequencesYaml';
import { serializeSequencesInner } from './sequencesYaml';
import type { ParseResult } from './archYaml';

/** Разбор уже распознанного объекта state. */
export function parseStateData(data: unknown): ParseResult<Project> {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];

  for (const path of collectUnknownKeys(data, allowedKeys.state as never)) {
    warnings.push(warn('W-001', `неизвестное поле ${path} игнорируется`, { path }));
  }
  const record = data as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      errors: [err(ERR.E002, 'структура не соответствует схеме: ожидается объект state', { path: '(корень)' })],
      warnings,
    };
  }
  for (const section of ['architecture', 'security', 'assignments']) {
    if (!(section in record)) {
      errors.push(err(ERR.E403, `отсутствует обязательный раздел ${section}`, { path: section }));
    }
  }
  if (record.version !== FILE_VERSION) {
    errors.push(err(ERR.E401, 'неподдерживаемая версия state.yaml (version не равен 1)', { path: 'version' }));
    return { errors, warnings };
  }
  if (errors.length > 0) {
    return { errors, warnings };
  }

  const parsed = stateSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issuePath(issue.path);
      errors.push(err(ERR.E002, `структура не соответствует схеме: ${issue.message}`, { path: path || '(корень)' }));
    }
    return { errors, warnings };
  }

  const archResult = parseArchInner(parsed.data.architecture);
  errors.push(...archResult.errors);
  warnings.push(...archResult.warnings);
  const securityResult = parseSecurityInner(parsed.data.security);
  errors.push(...securityResult.errors);
  warnings.push(...securityResult.warnings);
  if (errors.length > 0) {
    return { errors, warnings };
  }

  const functionIds = new Set(securityResult.model!.functions.map((fn) => fn.id));
  const blockIds = new Set(archResult.model!.blocks.map((b) => b.id));
  const assignments = parsed.data.assignments;
  for (let i = 0; i < assignments.length; i++) {
    const assignment = assignments[i];
    if (!functionIds.has(assignment.function)) {
      errors.push(err(ERR.E402, `размещение ссылается на отсутствующую функцию ${assignment.function}`, { path: `assignments[${i}].function` }));
    }
    if (!blockIds.has(assignment.block)) {
      errors.push(err(ERR.E402, `размещение ссылается на отсутствующий блок ${assignment.block}`, { path: `assignments[${i}].block` }));
    }
  }
  // Не более одного размещения на функцию (правило 3.2).
  const seen = new Set<string>();
  for (let i = 0; i < assignments.length; i++) {
    if (seen.has(assignments[i].function)) {
      errors.push(err(ERR.E402, `повторное размещение функции ${assignments[i].function}`, { path: `assignments[${i}]` }));
    }
    seen.add(assignments[i].function);
  }
  if (errors.length > 0) {
    return { errors, warnings };
  }

  // Диаграммы последовательности (v0.02.01, Ф-55): опциональная секция;
  // ссылки — идентификаторы доменов той же архитектуры (E-604 при отсутствии).
  let sequences: Project['sequences'];
  if (parsed.data.sequences !== undefined) {
    const seqResult = parseSequencesInner(parsed.data.sequences, archResult.model!.blocks, 'ids', 'sequences');
    errors.push(...seqResult.errors);
    warnings.push(...seqResult.warnings);
    if (errors.length > 0) {
      return { errors, warnings };
    }
    sequences = seqResult.model;
  }

  const model: Project = {
    architecture: archResult.model!,
    security: securityResult.model!,
    assignments: assignments.map((a) => ({ function: a.function, block: a.block })),
    meta: parsed.data.meta ?? {},
    ...(sequences !== undefined ? { sequences } : {}),
  };
  return { errors, warnings, model };
}

/** Разбор текста state.yaml (Ф-4, Ф-25). */
export function parseStateYaml(text: string): ParseResult<Project> {
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
  return parseStateData(data);
}

/** Экспорт полного снимка сеанса (Ф-24). */
export function serializeStateYaml(project: Project): string {
  const payload = {
    version: FILE_VERSION,
    architecture: {
      blocks: project.architecture.blocks.map((b) => ({
        id: b.id,
        name: b.name,
        cost: b.cost,
        ...(b.external ? { external: true } : {}),
        ...(b.external && b.trusted ? { trusted: true } : {}),
        // Принудительный ввод внутреннего домена в ДВБ (v0.01.06).
        ...(!b.external && b.forceTrusted ? { forceTrusted: true } : {}),
        // Логическая группа блока (v0.02.03, Ф-70).
        ...(b.groupId ? { group: b.groupId } : {}),
        ...(b.position ? { position: { x: b.position.x, y: b.position.y } } : {}),
      })),
      edges: project.architecture.edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        ...(e.label ? { label: e.label } : {}),
      })),
      // Логические группы ДБ (v0.02.03, Ф-70…Ф-76) — опциональная секция;
      // файлы v0.02.02 и старше читаются старыми версиями с W-001.
      ...(project.architecture.groups && project.architecture.groups.length > 0
        ? {
            groups: project.architecture.groups.map((g) => ({
              id: g.id,
              name: g.name,
              color: g.color,
              ...(g.collapsed ? { collapsed: true } : {}),
              ...(g.parentId ? { parent: g.parentId } : {}),
              ...(g.position ? { position: { x: g.position.x, y: g.position.y } } : {}),
            })),
          }
        : {}),
    },
    security: {
      ...(project.security.assumptions && project.security.assumptions.length > 0
        ? {
            assumptions: project.security.assumptions.map((a) => ({
              id: a.id,
              text: a.text,
            })),
          }
        : {}),
      goals: project.security.goals.map((g) => ({
        id: g.id,
        name: g.name,
        ...(g.description ? { description: g.description } : {}),
        ...(g.unconditional ? { unconditional: true } : {}),
      })),
      functions: project.security.functions.map((fn) => ({
        id: fn.id,
        name: fn.name,
        cost: fn.cost,
        ...(fn.implements && fn.implements.length > 0
          ? { implements: fn.implements.map((l) => ({ goal: l.goal, weight: l.weight })) }
          : {}),
      })),
    },
    assignments: project.assignments.map((a) => ({ function: a.function, block: a.block })),
    // Диаграммы последовательности (v0.02.01, Ф-55) — опциональная секция;
    // файлы v0.01.x без ДП читаются старыми версиями с W-001.
    ...(project.sequences && project.sequences.length > 0
      ? { sequences: serializeSequencesInner(project.sequences) }
      : {}),
    ...(project.meta?.savedAt || project.meta?.source
      ? {
          meta: {
            ...(project.meta?.savedAt ? { savedAt: project.meta.savedAt } : {}),
            ...(project.meta?.source ? { source: project.meta.source } : {}),
          },
        }
      : {}),
  };
  return dump(payload, { lineWidth: 120, noRefs: true });
}
