/**
 * Резолвер для CLI «skib» (v0.03.01): движок и io написаны на TypeScript
 * с импортами без расширений («./types») — резолвер Node ESM требует
 * явные расширения. Хук добавляет «.ts» / «/index.ts», когда прямая
 * загрузка не удалась; синтаксис типов Node снимает нативно
 * (Node ≥ 24 — без флагов; Node 22.12+ — с --experimental-strip-types).
 * Внешние пакеты (js-yaml, zod) резолвятся стандартно.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') || specifier.startsWith('file:')) {
    try {
      return await next(specifier, context);
    } catch (error) {
      const parent = context.parentURL;
      if (!parent) throw error;
      const dir = new URL('.', parent);
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = new URL(specifier + suffix, dir);
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true, format: 'module-typescript' };
        }
      }
      throw error;
    }
  }
  return next(specifier, context);
}
