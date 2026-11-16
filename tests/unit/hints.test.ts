/**
 * Тесты таблицы подсказок fix_hint — v0.03.01 (интеграция с ИИ-агентами).
 * Каждому коду реестра соответствует ровно одна непустая подсказка,
 * лишних подсказок для кодов вне реестра нет.
 */

import { describe, expect, it } from 'vitest';
import { ERR, WARN, HINTS, hintFor } from '../../src/io/errors';

describe('fix_hint — полнота таблицы подсказок (v0.03.01)', () => {
  it('каждый код ошибок реестра имеет непустую подсказку', () => {
    for (const code of Object.values(ERR)) {
      const hint = hintFor(code);
      expect(hint, `нет подсказки для ${code}`).not.toBeNull();
      expect(hint!.length, `пустая подсказка для ${code}`).toBeGreaterThan(10);
    }
  });

  it('каждый код предупреждений реестра имеет непустую подсказку', () => {
    for (const code of Object.values(WARN)) {
      const hint = hintFor(code);
      expect(hint, `нет подсказки для ${code}`).not.toBeNull();
      expect(hint!.length, `пустая подсказка для ${code}`).toBeGreaterThan(10);
    }
  });

  it('в таблице нет подсказок для кодов вне реестра', () => {
    const known: Set<string> = new Set([...Object.values(ERR), ...Object.values(WARN)]);
    for (const code of Object.keys(HINTS)) {
      expect(known.has(code), `лишняя подсказка для ${code}`).toBe(true);
    }
  });

  it('подсказка неизвестного кода — null (без исключения)', () => {
    expect(hintFor('E-999')).toBeNull();
    expect(hintFor('')).toBeNull();
  });
});
