/**
 * Zod-схемы структур четырёх форматов данных — раздел 6 ТЗ.
 * Схемы проверяют типы и обязательность (шаг 2 валидации 6.5); диапазоны,
 * уникальность и ссылочную целостность проверяет семантическая валидация
 * (validate.ts), чтобы выдавать точные коды E-101…E-207.
 */

import { z } from 'zod';

/** Внутренняя структура architecture без поля version (для вложения в state.yaml). */
export const archInnerSchema = z.looseObject({
  system: z.looseObject({
    name: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  blocks: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      cost: z.number(),
      position: z.looseObject({ x: z.number(), y: z.number() }).optional(),
      external: z.boolean().optional(),
      trusted: z.boolean().optional(),
      // Принудительный ввод внутреннего домена в ДВБ (v0.01.06).
      forceTrusted: z.boolean().optional(),
    }),
  ),
  edges: z.array(
    z.looseObject({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      label: z.string().optional(),
    }),
  ),
});

/** Внутренняя структура security без поля version (для вложения в state.yaml). */
export const securityInnerSchema = z.looseObject({
  goals: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      // ПЛО — цель «при любых обстоятельствах» (v0.01.05).
      unconditional: z.boolean().optional(),
    }),
  ),
  // Предположения безопасности (v0.01.05).
  assumptions: z
    .array(
      z.looseObject({
        id: z.string(),
        text: z.string(),
      }),
    )
    .optional(),
  functions: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      cost: z.number(),
      implements: z
        .array(
          z.looseObject({
            goal: z.string(),
            weight: z.string(),
          }),
        )
        .optional(),
    }),
  ),
});

/** Любой из форматов может содержать неизвестные поля — они игнорируются с W-001. */
export const archSchema = z.looseObject({
  version: z.number(),
  ...archInnerSchema.shape,
});

export const securitySchema = z.looseObject({
  version: z.number(),
  ...securityInnerSchema.shape,
});

export const stateSchema = z.looseObject({
  version: z.number(),
  architecture: archInnerSchema.optional(),
  security: securityInnerSchema.optional(),
  assignments: z.array(
    z.looseObject({
      function: z.string(),
      block: z.string(),
    }),
  ),
  meta: z
    .looseObject({
      savedAt: z.string().optional(),
      source: z.string().optional(),
    })
    .optional(),
});

/** Дерево допустимых полей для обнаружения неизвестных полей (W-001). */
export const allowedKeys = {
  arch: {
    version: null,
    system: { name: null, description: null },
    blocks: { id: null, name: null, cost: null, position: { x: null, y: null }, external: null, trusted: null, forceTrusted: null },
    edges: { id: null, from: null, to: null, label: null },
  },
  security: {
    version: null,
    goals: { id: null, name: null, description: null, unconditional: null },
    assumptions: { id: null, text: null },
    functions: { id: null, name: null, cost: null, implements: { goal: null, weight: null } },
  },
  state: {
    version: null,
    architecture: {
      version: null,
      system: { name: null, description: null },
      blocks: { id: null, name: null, cost: null, position: { x: null, y: null }, external: null, trusted: null, forceTrusted: null },
      edges: { id: null, from: null, to: null, label: null },
    },
    security: {
      version: null,
      goals: { id: null, name: null, description: null, unconditional: null },
      assumptions: { id: null, text: null },
      functions: { id: null, name: null, cost: null, implements: { goal: null, weight: null } },
    },
    assignments: { function: null, block: null },
    meta: { savedAt: null, source: null },
  },
} as const;

/** Дерево допустимых полей для обхода неизвестных ключей (W-001). */
export interface KeyTree {
  [key: string]: KeyTree | null;
}

/** Обход данных и сбор путей неизвестных полей для W-001. */
export function collectUnknownKeys(
  data: unknown,
  tree: KeyTree | null,
  base = '',
): string[] {
  if (tree === null || data === null || typeof data !== 'object') return [];
  if (Array.isArray(data)) {
    const out: string[] = [];
    data.forEach((item, index) => {
      out.push(...collectUnknownKeys(item, tree, `${base}[${index}]`));
    });
    return out;
  }
  const out: string[] = [];
  const record = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const path = base ? `${base}.${key}` : key;
    if (!(key in tree)) {
      out.push(path);
    } else {
      out.push(...collectUnknownKeys(value, tree[key] ?? null, path));
    }
  }
  return out;
}

/** Строка пути из zod issue для сообщения E-002. */
export function issuePath(path: (string | number | symbol)[]): string {
  let result = '';
  for (const part of path) {
    const s = String(part);
    if (/^\d+$/.test(s)) result += `[${s}]`;
    else result += result ? `.${s}` : s;
  }
  return result;
}
