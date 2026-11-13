/**
 * Формат architecture.yaml — раздел 6.1 ТЗ. Порядок валидации 6.5:
 * 1) разбор YAML; 2) схема (zod); 3) ссылочная целостность и уникальность;
 * 4) семантические предупреждения. Ошибка любого шага блокирует применение (Ф-6).
 */

import { dump, load, YAMLException } from 'js-yaml';
import type { Architecture, ImportMessage } from '../engine/types';
import { FILE_VERSION, LG_DEFAULT_COLOR } from '../engine/types';
import { ERR, WARN, err, warn } from './errors';
import {
  allowedKeys,
  archInnerSchema,
  archSchema,
  collectUnknownKeys,
  issuePath,
} from './schema';
import { normalizeGroups } from '../engine/groups';
import type { GroupIssue } from '../engine/groups';
import { validateArchitecture } from './validate';

export interface ParseResult<T> {
  errors: ImportMessage[];
  warnings: ImportMessage[];
  model?: T;
}

/** Разбор внутренней структуры архитектуры (без version) — используется также stateFile. */
export function parseArchInner(data: unknown): ParseResult<Architecture> {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];

  for (const path of collectUnknownKeys(data, allowedKeys.arch as never)) {
    warnings.push(warn('W-001', `неизвестное поле ${path} игнорируется`, { path }));
  }
  const parsed = archInnerSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issuePath(issue.path);
      errors.push(err(ERR.E002, `структура не соответствует схеме: ${issue.message}`, { path: path || '(корень)' }));
    }
    return { errors, warnings };
  }
  const raw = parsed.data;
  // Логические группы (v0.02.03, Ф-70): разбор с защитной нормализацией
  // (неизвестные ссылки W-010, цвет вне палитры W-011, циклы родителя W-012).
  const groupIssues: GroupIssue[] = [];
  const model: Architecture = {
    blocks: raw.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      cost: block.cost,
      position: block.position
        ? { x: block.position.x, y: block.position.y }
        : undefined,
      ...(block.external ? { external: true } : {}),
      ...(block.trusted ? { trusted: true } : {}),
      // Принудительный ввод внутреннего домена в ДВБ (v0.01.06).
      ...(!block.external && block.forceTrusted ? { forceTrusted: true } : {}),
      // Логическая группа блока (v0.02.03, Ф-70).
      ...(block.group ? { groupId: block.group } : {}),
    })),
    edges: raw.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
    })),
    ...(raw.groups
      ? {
          groups: raw.groups.map((group) => ({
            id: group.id,
            name: group.name,
            // Цвет не задан — серый по умолчанию (без W-011: цвет не указан).
            color: group.color ?? LG_DEFAULT_COLOR,
            ...(group.collapsed ? { collapsed: true } : {}),
            ...(group.parent ? { parentId: group.parent } : {}),
            ...(group.position ? { position: { x: group.position.x, y: group.position.y } } : {}),
          })),
        }
      : {}),
  };
  const normalized = normalizeGroups(model);
  groupIssues.push(...normalized.issues);
  for (const issue of groupIssues) {
    const path = issue.path ?? `groups`;
    if (issue.kind === 'unknownRef') {
      warnings.push(warn(WARN.W010, `ссылка на несуществующую группу «${issue.ref}» у «${issue.id}» игнорируется — объект остаётся несгруппированным`, { path }));
    } else if (issue.kind === 'badColor') {
      warnings.push(warn(WARN.W011, `цвет группы «${issue.id}» вне палитры ЛГ (красный, жёлтый и зелёный зарезервированы под доверие ДБ) — заменён серым`, { path }));
    } else {
      warnings.push(warn(WARN.W012, `цикл вложенности групп с участием «${issue.id}» — связь с родителем удалена`, { path }));
    }
  }
  const semantic = validateArchitecture(normalized.architecture);
  if (semantic.some((m) => m.code.startsWith('E'))) {
    return { errors: [...errors, ...semantic], warnings };
  }
  warnings.push(...semantic);
  return { errors, warnings, model: normalized.architecture };
}

/** Разбор уже распознанного объекта architecture.yaml. */
export function parseArchitectureData(data: unknown): ParseResult<Architecture> {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];
  const parsed = archSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issuePath(issue.path);
      errors.push(err(ERR.E002, `структура не соответствует схеме: ${issue.message}`, { path: path || '(корень)' }));
    }
    return { errors, warnings };
  }
  if (parsed.data.version !== FILE_VERSION) {
    errors.push(err(ERR.E002, 'поле version должно быть равно 1', { path: 'version' }));
    return { errors, warnings };
  }
  const inner = parseArchInner(data);
  return {
    errors: [...errors, ...inner.errors],
    warnings: [...warnings, ...inner.warnings],
    model: inner.model,
  };
}

/** Разбор текста architecture.yaml. */
export function parseArchitectureYaml(text: string): ParseResult<Architecture> {
  let data: unknown;
  try {
    data = load(text);
  } catch (e) {
    const exception = e as YAMLException;
    const line = exception.mark ? exception.mark.line + 1 : undefined;
    return {
      errors: [err(ERR.E001, `файл не является корректным YAML${line ? ` (строка ${line})` : ''}`, { line })],
      warnings: [],
    };
  }
  if (data === null || typeof data !== 'object') {
    return { errors: [err(ERR.E002, 'структура не соответствует схеме: ожидается объект с полями version, blocks, edges', { path: '(корень)' })], warnings: [] };
  }
  return parseArchitectureData(data);
}

/** Экспорт архитектуры: блоки, стрелки и логические группы с координатами (Ф-24). */
export function serializeArchitectureYaml(
  architecture: Architecture,
  system?: { name?: string; description?: string },
): string {
  const payload: Record<string, unknown> = {
    version: FILE_VERSION,
    ...(system && (system.name || system.description)
      ? { system: { name: system.name ?? '', description: system.description ?? '' } }
      : {}),
    blocks: architecture.blocks.map((b) => ({
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
    edges: architecture.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(e.label ? { label: e.label } : {}),
    })),
    // Логические группы ДБ (v0.02.03, Ф-70…Ф-76) — опциональная секция.
    ...(architecture.groups && architecture.groups.length > 0
      ? {
          groups: architecture.groups.map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            ...(g.collapsed ? { collapsed: true } : {}),
            ...(g.parentId ? { parent: g.parentId } : {}),
            ...(g.position ? { position: { x: g.position.x, y: g.position.y } } : {}),
          })),
        }
      : {}),
  };
  return dump(payload, { lineWidth: 120, noRefs: true });
}
