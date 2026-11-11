/**
 * Формат security.yaml — раздел 6.2 ТЗ: цели и функции безопасности
 * со связями «функция — цель» и весами mandatory/optional (решение D4).
 */

import { dump, load, YAMLException } from 'js-yaml';
import type { ImportMessage, LinkWeight, SecuritySpec } from '../engine/types';
import { FILE_VERSION } from '../engine/types';
import { ERR, err, warn } from './errors';
import {
  allowedKeys,
  collectUnknownKeys,
  issuePath,
  securityInnerSchema,
  securitySchema,
} from './schema';
import { validateSecurity } from './validate';
import type { ParseResult } from './archYaml';

/** Разбор внутренней структуры security (без version) — используется также stateFile. */
export function parseSecurityInner(data: unknown): ParseResult<SecuritySpec> {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];

  for (const path of collectUnknownKeys(data, allowedKeys.security as never)) {
    warnings.push(warn('W-001', `неизвестное поле ${path} игнорируется`, { path }));
  }
  const parsed = securityInnerSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issuePath(issue.path);
      errors.push(err(ERR.E002, `структура не соответствует схеме: ${issue.message}`, { path: path || '(корень)' }));
    }
    return { errors, warnings };
  }
  const raw = parsed.data;
  // Вес сохраняется как есть: E-206 выдаётся семантической валидацией.
  const model: SecuritySpec = {
    goals: raw.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      description: goal.description,
    })),
    functions: raw.functions.map((fn) => ({
      id: fn.id,
      name: fn.name,
      cost: fn.cost,
      implements: fn.implements?.map((link) => ({
        goal: link.goal,
        weight: link.weight as LinkWeight,
      })),
    })),
  };
  const semantic = validateSecurity(model);
  if (semantic.some((m) => m.code.startsWith('E'))) {
    return { errors: [...errors, ...semantic], warnings };
  }
  warnings.push(...semantic);
  return { errors, warnings, model };
}

/** Разбор уже распознанного объекта security.yaml. */
export function parseSecurityData(data: unknown): ParseResult<SecuritySpec> {
  const errors: ImportMessage[] = [];
  const warnings: ImportMessage[] = [];
  const parsed = securitySchema.safeParse(data);
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
  const inner = parseSecurityInner(data);
  return {
    errors: [...errors, ...inner.errors],
    warnings: [...warnings, ...inner.warnings],
    model: inner.model,
  };
}

/** Разбор текста security.yaml. */
export function parseSecurityYaml(text: string): ParseResult<SecuritySpec> {
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
    return { errors: [err(ERR.E002, 'структура не соответствует схеме: ожидается объект с полями version, goals, functions', { path: '(корень)' })], warnings: [] };
  }
  return parseSecurityData(data);
}

/** Экспорт спецификации безопасности (для комплектования вариантов заданий). */
export function serializeSecurityYaml(security: SecuritySpec): string {
  return dump(
    {
      version: FILE_VERSION,
      goals: security.goals.map((g) => ({
        id: g.id,
        name: g.name,
        ...(g.description ? { description: g.description } : {}),
      })),
      functions: security.functions.map((fn) => ({
        id: fn.id,
        name: fn.name,
        cost: fn.cost,
        ...(fn.implements && fn.implements.length > 0
          ? { implements: fn.implements.map((l) => ({ goal: l.goal, weight: l.weight })) }
          : {}),
      })),
    },
    { lineWidth: 120, noRefs: true },
  );
}
