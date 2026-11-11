/**
 * Формат architecture.yaml — раздел 6.1 ТЗ. Порядок валидации 6.5:
 * 1) разбор YAML; 2) схема (zod); 3) ссылочная целостность и уникальность;
 * 4) семантические предупреждения. Ошибка любого шага блокирует применение (Ф-6).
 */

import { dump, load, YAMLException } from 'js-yaml';
import type { Architecture, ImportMessage } from '../engine/types';
import { FILE_VERSION } from '../engine/types';
import { ERR, err, warn } from './errors';
import {
  allowedKeys,
  archInnerSchema,
  archSchema,
  collectUnknownKeys,
  issuePath,
} from './schema';
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
    })),
    edges: raw.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
    })),
  };
  const semantic = validateArchitecture(model);
  if (semantic.some((m) => m.code.startsWith('E'))) {
    return { errors: [...errors, ...semantic], warnings };
  }
  warnings.push(...semantic);
  return { errors, warnings, model };
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

/** Экспорт архитектуры: блоки и стрелки с координатами (Ф-24). */
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
      ...(b.position ? { position: { x: b.position.x, y: b.position.y } } : {}),
    })),
    edges: architecture.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(e.label ? { label: e.label } : {}),
    })),
  };
  return dump(payload, { lineWidth: 120, noRefs: true });
}
