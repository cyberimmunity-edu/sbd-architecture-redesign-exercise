/**
 * Тесты CLI «skib» — v0.03.01 (интеграция с ИИ-агентами, топ-5 задача №1).
 * CLI запускается тем же Node, что и тесты: движок без сборки через
 * cli/ts-hook.mjs. Проверяются команды, коды возврата, fix_hint и
 * round-trip канонического экспорта.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStateYaml } from '../../src/io/stateFile';
import { recalcCosts } from '../../src/engine/cost';
import { APP_VERSION } from '../../src/engine/types';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const cliPath = fileURLToPath(new URL('../../cli/skib.mjs', import.meta.url));

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    // Предупреждение MODULE_TYPELESS в stderr не мешает JSON в stdout,
    // но для чистоты машиночитаемого вывода оно подавляется (как в Makefile).
    env: { ...process.env, NODE_OPTIONS: '--no-warnings' },
    ...options,
  });
}

function parseJson(result) {
  return JSON.parse(result.stdout);
}

describe('CLI «skib» — команды и коды возврата (v0.03.01)', () => {
  it('version: версия совпадает с APP_VERSION', () => {
    const result = runCli(['version']);
    expect(result.status).toBe(0);
    expect(parseJson(result)).toEqual({ command: 'version', ok: true, version: APP_VERSION });
  });

  it('validate: корректный пример — ok, код возврата 0, контроль 486', () => {
    const result = runCli(['validate', 'samples/robot/state.yaml']);
    expect(result.status).toBe(0);
    const parsed = parseJson(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.summary.systemCost).toBe(486);
  });

  it('validate: битый YAML — код 1, E-001 с подсказкой fix_hint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skib-cli-'));
    const file = join(dir, 'broken.yaml');
    writeFileSync(file, 'version: [1\narchitecture: :\n', 'utf8');
    try {
      const result = runCli(['validate', file]);
      expect(result.status).toBe(1);
      const parsed = parseJson(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.errors[0].code).toBe('E-001');
      expect(parsed.errors[0].hint).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validate: несуществующий файл — код 2 и сообщение об ошибке', () => {
    const result = runCli(['validate', 'no-such-file.yaml']);
    expect(result.status).toBe(2);
    const parsed = parseJson(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('не найден');
  });

  it('check: пример без размещений обязательных функций — E-501 и W-006, код 1', () => {
    const result = runCli(['check', 'samples/robot/state.yaml']);
    expect(result.status).toBe(1);
    const parsed = parseJson(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.map((m) => m.code)).toContain('E-501');
    expect(parsed.warnings.map((m) => m.code)).toContain('W-006');
    for (const message of [...parsed.errors, ...parsed.warnings]) {
      expect(message.hint).not.toBeNull();
    }
  });

  it('metrics: метрики robot — C_системы 486, размер ДВБ 3', () => {
    const result = runCli(['metrics', 'samples/robot/state.yaml']);
    expect(result.status).toBe(0);
    const parsed = parseJson(result);
    expect(parsed.metrics.systemCost).toBe(486);
    expect(parsed.metrics.dvb.size).toBe(3);
    expect(parsed.metrics.groups.count).toBe(1);
  });

  it('advice: советы vessel — JSON с kind и deltaC', () => {
    const result = runCli(['advice', 'samples/vessel/state.yaml']);
    expect(result.status).toBe(0);
    const parsed = parseJson(result);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.advice)).toBe(true);
    expect(parsed.advice.length).toBeGreaterThan(0);
    for (const advice of parsed.advice) {
      expect(typeof advice.kind).toBe('string');
      if (advice.deltaC !== null) expect(advice.deltaC).toBeGreaterThan(0);
    }
  });

  it('export --format state: канонический экспорт читается обратно без потерь (round-trip)', () => {
    const result = runCli(['export', 'samples/robot/state.yaml', '--format', 'state']);
    expect(result.status).toBe(0);
    const parsed = parseJson(result);
    expect(parsed.ok).toBe(true);
    const roundTrip = parseStateYaml(parsed.content);
    expect(roundTrip.errors).toEqual([]);
    expect(recalcCosts(roundTrip.model!).systemCost).toBe(486);
  });

  it('export --format plantuml: текст начинается с @startuml', () => {
    const result = runCli(['export', 'samples/robot/state.yaml', '--format', 'plantuml']);
    expect(result.status).toBe(0);
    const parsed = parseJson(result);
    expect(parsed.content.startsWith('@startuml')).toBe(true);
  });

  it('check: разрыв ДП↔ДАП (стрелка ДП без связи ДАП) — E-601 с fix_hint, код 1 (v0.03.01c)', () => {
    // state.yaml со встроенными ДП: связь d-src → d-dst удалена, стрелка ДП
    // осталась — общий чек «Проверить» обязан это поймать (кросс-проверка).
    const dir = mkdtempSync(join(tmpdir(), 'skib-cli-'));
    const file = join(dir, 'cross-gap.yaml');
    const state = [
      'version: 1',
      'architecture:',
      '  blocks:',
      '    - id: d-src',
      '      name: "01. Источник"',
      '      cost: 1',
      '    - id: d-dst',
      '      name: "02. Приёмник"',
      '      cost: 1',
      '  edges: [] # связь удалена — расхождение ДП↔ДАП',
      'security:',
      '  goals:',
      '    - id: t-1',
      '      name: Цель',
      '  functions:',
      '    - id: f-1',
      '      name: Функция',
      '      cost: 1',
      '      implements:',
      '        - goal: t-1',
      '          weight: mandatory',
      'assignments:',
      '  - function: f-1',
      '    block: d-src',
      'sequences:',
      '  - id: seq-1',
      '    name: Сценарий',
      '    lifelines: [d-src, d-dst]',
      '    arrows:',
      '      - id: a-1',
      '        from: d-src',
      '        to: d-dst',
      '    blocks: []',
    ].join('\n');
    writeFileSync(file, `${state}\n`, 'utf8');
    try {
      // Структурная валидация (validate) не приписывает семантических ошибок.
      const validateResult = runCli(['validate', file]);
      expect(validateResult.status).toBe(0);
      expect(parseJson(validateResult).errors).toEqual([]);

      // Семантический чек ловит разрыв: E-601 с подсказкой, код возврата 1.
      const result = runCli(['check', file]);
      expect(result.status).toBe(1);
      const parsed = parseJson(result);
      expect(parsed.ok).toBe(false);
      const e601 = parsed.errors.find((m) => m.code === 'E-601');
      expect(e601).toBeDefined();
      expect(e601.message).toContain('01. Источник → 02. Приёмник');
      expect(e601.hint).toContain('связ');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('check: та же модель со связью ДАП — чек чист, код 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skib-cli-'));
    const file = join(dir, 'cross-clean.yaml');
    const state = [
      'version: 1',
      'architecture:',
      '  blocks:',
      '    - id: d-src',
      '      name: "01. Источник"',
      '      cost: 1',
      '    - id: d-dst',
      '      name: "02. Приёмник"',
      '      cost: 1',
      '  edges:',
      '    - id: e-1',
      '      from: d-src',
      '      to: d-dst',
      'security:',
      '  goals:',
      '    - id: t-1',
      '      name: Цель',
      '  functions:',
      '    - id: f-1',
      '      name: Функция',
      '      cost: 1',
      '      implements:',
      '        - goal: t-1',
      '          weight: mandatory',
      'assignments:',
      '  - function: f-1',
      '    block: d-src',
      'sequences:',
      '  - id: seq-1',
      '    name: Сценарий',
      '    lifelines: [d-src, d-dst]',
      '    arrows:',
      '      - id: a-1',
      '        from: d-src',
      '        to: d-dst',
      '    blocks: []',
    ].join('\n');
    writeFileSync(file, `${state}\n`, 'utf8');
    try {
      const result = runCli(['check', file]);
      expect(result.status).toBe(0);
      const parsed = parseJson(result);
      expect(parsed.ok).toBe(true);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('schema: JSON-схема state.yaml v1 — version const 1', () => {
    const result = runCli(['schema']);
    expect(result.status).toBe(0);
    const parsed = parseJson(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.schema.properties.version.const).toBe(1);
    expect(parsed.schema.required).toEqual(['version', 'architecture', 'security', 'assignments']);
  });

  it('неизвестная команда — код 2 и подсказка о --help', () => {
    const result = runCli(['frobnicate']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--help');
  });
});
