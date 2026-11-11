/**
 * Проверка Makefile — правило проекта после регрессии v0.01.04: в рецептах
 * вместо табуляции оказались 8 пробелов, make падал с «missing separator»,
 * а прежние проверки (npm-скрипты напрямую) этого не выявляли. Тесты проекта
 * запускаются через make (make check → check-makefile → lint → test); этот
 * файл дополнительно страхует синтаксис Makefile при прямом `npm run test:unit`.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAKEFILE = resolve(__dirname, '../../Makefile');
const lines = readFileSync(MAKEFILE, 'utf8').split('\n');

// Цели, объявленные в файле (специальные цели вида .PHONY не учитываются).
const targetNames = lines
  .filter((line) => /^[a-zA-Z][a-zA-Z0-9_-]*:/.test(line))
  .map((line) => line.slice(0, line.indexOf(':')));

// Рецепт цели: строки после объявления цели до следующей строки без отступа.
function recipeOf(target: string): string[] {
  const start = lines.findIndex((line) => line.startsWith(`${target}:`));
  if (start < 0) return [];
  const recipe: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) break;
    recipe.push(lines[i]);
  }
  return recipe;
}

describe('Makefile (правило проекта: проверки запускаются через make)', () => {
  it('регрессия v0.01.04: строки рецептов начинаются с табуляции, а не с пробелов', () => {
    const broken: string[] = [];
    lines.forEach((line, i) => {
      const indentedWithSpaces = /^ +\S/.test(line);
      // Продолжения предыдущей строки (оканчивается на «\») с отступом пробелами допустимы.
      const isContinuation = i > 0 && lines[i - 1].trimEnd().endsWith('\\');
      if (indentedWithSpaces && !isContinuation) broken.push(`${i + 1}: ${line.trimEnd()}`);
    });
    expect(broken).toEqual([]);
  });

  it('у каждой объявленной цели есть рецепт (строка с табуляции)', () => {
    const empty = targetNames.filter(
      (target) => !recipeOf(target).some((line) => line.startsWith('\t')),
    );
    expect(empty).toEqual([]);
  });

  it('цель check запускает проверку Makefile перед lint и test', () => {
    const steps = recipeOf('check')
      .filter((line) => line.startsWith('\t'))
      .map((line) => line.trim().replace('$(MAKE) ', '').trim())
      .filter(Boolean);
    expect(steps).toEqual(['check-makefile', 'lint', 'test']);
  });

  it('состав .PHONY соответствует объявленным целям', () => {
    const phonyIndex = lines.findIndex((line) => line.startsWith('.PHONY:'));
    const declared: string[] = [];
    for (let i = phonyIndex; i < lines.length; i += 1) {
      const line = lines[i];
      declared.push(
        ...line
          .replace(/^\.PHONY:|\\\s*$/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean),
      );
      if (!line.trimEnd().endsWith('\\')) break;
    }
    expect(declared.sort()).toEqual([...targetNames].sort());
  });

  it('сухой прогон всех целей (make -n) завершается без ошибок синтаксиса', () => {
    // check и check-makefile вызываются через $(MAKE) и проверяются запуском make check.
    const targets = targetNames.filter((t) => t !== 'check' && t !== 'check-makefile');
    const run = spawnSync('make', ['-n', ...targets], {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    if (run.error) return; // make недоступен в среде запуска — проверка выполняется make check
    expect(run.status).toBe(0);
  });
});
