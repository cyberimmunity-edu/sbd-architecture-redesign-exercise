/**
 * CLI-тесты «skib» — v0.03.01b (запрос: скрипты для запуска cli-тестов).
 * Самостоятельный гейт без vitest: запускает cli/skib.mjs тем же Node,
 * проверяет команды, коды возврата, контрольные числа, советы, round-trip
 * экспорта и предупреждение W-013. Запуск: `make test-cli` или
 * `npm run test:cli` (Node ≥ 22.12; на 24+ — без флагов).
 *
 * Отличие от tests/unit/cli.test.ts: юнит-тесты проверяют поведение команд
 * в vitest-среде, этот скрипт — интеграционный гейт поставки: он гоняет
 * CLI ровно так, как его будут вызывать внешние инструменты (процессы,
 * stdout, коды возврата) и проверяет сценарий целиком.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const cliPath = join(repoRoot, 'cli', 'skib.mjs');
const env = { ...process.env, NODE_OPTIONS: '--no-warnings' };

let passed = 0;
let failed = 0;
const failures = [];

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
  if (result.error) throw new Error(`CLI не запущен: ${result.error}`);
  return result;
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`stdout не JSON: ${String(error).slice(0, 120)}; stdout=${result.stdout.slice(0, 200)}`);
  }
}

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    failures.push(`  FAIL  ${name}\n        ${String(error.message || error).slice(0, 400)}`);
    console.log(`  FAIL  ${name}`);
  }
}

function assertEquals(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, label) {
  if (!value) throw new Error(`${label}: условие не выполнено`);
}

const APP_VERSION = readFileSync(join(repoRoot, 'src/engine/types.ts'), 'utf8').match(
  /APP_VERSION = '([^']+)'/,
)?.[1];
assertTrue(Boolean(APP_VERSION), 'APP_VERSION не найден в src/engine/types.ts');

console.log(`CLI-тесты «skib» (APP_VERSION = ${APP_VERSION})\n`);

check('version: совпадает с APP_VERSION из движка', () => {
  const result = runCli(['version']);
  assertEquals(result.status, 0, 'код возврата');
  assertEquals(parseJson(result).version, APP_VERSION, 'версия');
});

for (const [sample, control] of [
  ['samples/robot/state.yaml', 486],
  ['samples/vessel/state.yaml', 943],
  ['tests/fixtures/vessel-user-state.yaml', 335],
]) {
  check(`validate ${sample}: ok=true, C_системы = ${control}`, () => {
    const result = runCli(['validate', sample]);
    assertEquals(result.status, 0, 'код возврата');
    const parsed = parseJson(result);
    assertEquals(parsed.ok, true, 'ok');
    assertEquals(parsed.errors.length, 0, 'errors');
    assertEquals(parsed.summary.systemCost, control, 'C_системы');
  });
}

check('validate: несуществующий файл — код 2', () => {
  const result = runCli(['validate', 'no-such-file.yaml']);
  assertEquals(result.status, 2, 'код возврата');
  assertEquals(parseJson(result).ok, false, 'ok');
});

check('validate: битый YAML — код 1, E-001 c fix_hint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skib-cli-'));
  const file = join(dir, 'broken.yaml');
  writeFileSync(file, 'version: [1\narchitecture: :\n', 'utf8');
  try {
    const result = runCli(['validate', file]);
    assertEquals(result.status, 1, 'код возврата');
    const parsed = parseJson(result);
    assertEquals(parsed.errors[0].code, 'E-001', 'код ошибки');
    assertTrue(parsed.errors[0].hint !== null, 'fix_hint');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check('check robot: E-501 и W-006 (размещения не заполнены), код 1', () => {
  const result = runCli(['check', 'samples/robot/state.yaml']);
  assertEquals(result.status, 1, 'код возврата');
  const parsed = parseJson(result);
  const codes = [...parsed.errors, ...parsed.warnings].map((m) => m.code);
  assertTrue(codes.includes('E-501'), `E-501 в ${codes.join(',')}`);
  assertTrue(codes.includes('W-006'), `W-006 в ${codes.join(',')}`);
});

check('check vessel-user (честная модель): код 0, W-013 нет', () => {
  // После снятия forceTrusted с лидара предупреждение W-013 не возникает.
  const result = runCli(['check', 'tests/fixtures/vessel-user-state.yaml']);
  assertEquals(result.status, 0, 'код возврата');
  const parsed = parseJson(result);
  assertEquals(parsed.ok, true, 'ok');
  const codes = [...parsed.errors, ...parsed.warnings].map((m) => m.code);
  assertTrue(!codes.includes('W-013'), `W-013 не должно быть: ${codes.join(',')}`);
});

check('check: forceTrusted-домен с красным входом — W-013 (модель лидара до исправления)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skib-cli-'));
  const file = join(dir, 'forced.yaml');
  writeFileSync(
    file,
    [
      'version: 1',
      'architecture:',
      '  blocks:',
      '    - id: ext-env',
      '      name: "Среда"',
      '      cost: 0',
      '      external: true',
      '    - id: d-lidar',
      '      name: "Лидар"',
      '      cost: 2',
      '      forceTrusted: true',
      '  edges:',
      '    - id: e-env-lidar',
      '      from: ext-env',
      '      to: d-lidar',
      'security:',
      '  goals:',
      '    - id: g-1',
      '      name: "Цель"',
      '  functions:',
      '    - id: f-1',
      '      name: "Функция"',
      '      cost: 1',
      '      implements:',
      '        - { goal: g-1, weight: mandatory }',
      'assignments:',
      '  - { function: f-1, block: d-lidar }',
      'meta: {}',
      '',
    ].join('\n'),
    'utf8',
  );
  try {
    const result = runCli(['check', file]);
    const parsed = parseJson(result);
    const codes = [...parsed.errors, ...parsed.warnings].map((m) => m.code);
    assertTrue(codes.includes('W-013'), `W-013 в ${codes.join(',')}`);
    const w013 = [...parsed.errors, ...parsed.warnings].find((m) => m.code === 'W-013');
    assertTrue(w013.hint !== null, 'fix_hint для W-013');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check('metrics robot: C_системы = 486, размер ДВБ = 3, bestSaving в диапазоне', () => {
  const result = runCli(['metrics', 'samples/robot/state.yaml']);
  assertEquals(result.status, 0, 'код возврата');
  const metrics = parseJson(result).metrics;
  assertEquals(metrics.systemCost, 486, 'C_системы');
  assertEquals(metrics.dvb.size, 3, 'размер ДВБ');
  assertTrue(metrics.advice.bestSaving > 0 && metrics.advice.bestSaving <= 486, 'bestSaving');
  assertTrue(metrics.advice.bestSavingPercent >= 0 && metrics.advice.bestSavingPercent <= 100, 'bestSavingPercent');
  assertTrue(metrics.advice.totalSaving >= metrics.advice.bestSaving, 'totalSaving >= bestSaving');
});

check('advice robot: trusted-split для blk-plan/blk-link с положительной deltaC', () => {
  const result = runCli(['advice', 'samples/robot/state.yaml']);
  assertEquals(result.status, 0, 'код возврата');
  const advice = parseJson(result).advice;
  assertTrue(Array.isArray(advice) && advice.length > 0, 'список советов');
  for (const item of advice) {
    if (item.deltaC !== null) assertTrue(item.deltaC > 0, `deltaC > 0 у ${item.kind}`);
  }
  // Вариантный перебор v0.03.01b: интерфейсные домены получили
  // «валидатор + исполнитель», но не декомпозицию в НДБ (домены минимальны).
  const trusted = advice.filter((a) => a.kind === 'trusted-split').map((a) => a.blocks[0]);
  assertTrue(trusted.includes('blk-plan') && trusted.includes('blk-link'), `trusted-split: ${trusted.join(',')}`);
  assertEquals(advice.filter((a) => a.kind === 'ddbpcd-split').length, 0, 'ddbpcd-split отсутствует');
});

check('advice vessel-user: посредник перед dom-4 (бонус отчёта анализатора, −42)', () => {
  const result = runCli(['advice', 'tests/fixtures/vessel-user-state.yaml']);
  assertEquals(result.status, 0, 'код возврата');
  const advice = parseJson(result).advice;
  const filter = advice.find((a) => a.kind === 'filter-domain' && a.blocks[0] === 'dom-4');
  assertTrue(Boolean(filter), 'совет filter-domain для dom-4');
  assertEquals(filter.deltaC, 42, 'экономия');
  assertEquals(filter.params.mediatorCost, 1, 'C_блока посредника раскрыт');
  assertEquals(filter.params.mediatorForceTrusted, 1, 'forceTrusted посредника раскрыт');
});

check('export --format state: round-trip robot без потерь (validate = 486)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skib-cli-'));
  const out = join(dir, 'roundtrip.yaml');
  try {
    const exportResult = runCli(['export', 'samples/robot/state.yaml', '--format', 'state', '--out', out]);
    assertEquals(exportResult.status, 0, 'код возврата export');
    const validateResult = runCli(['validate', out]);
    assertEquals(validateResult.status, 0, 'код возврата validate');
    assertEquals(parseJson(validateResult).summary.systemCost, 486, 'C_системы после round-trip');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check('export --format plantuml: @startuml в начале', () => {
  const result = runCli(['export', 'samples/robot/state.yaml', '--format', 'plantuml']);
  assertEquals(result.status, 0, 'код возврата');
  assertTrue(parseJson(result).content.startsWith('@startuml'), 'PlantUML');
});

check('schema: JSON-схема state.yaml v1', () => {
  const result = runCli(['schema']);
  assertEquals(result.status, 0, 'код возврата');
  const schema = parseJson(result).schema;
  assertEquals(schema.properties.version.const, 1, 'version.const');
});

check('неизвестная команда — код 2 и подсказка --help', () => {
  const result = runCli(['frobnicate']);
  assertEquals(result.status, 2, 'код возврата');
  assertTrue(result.stderr.includes('--help'), 'подсказка');
});

console.log(`\nИтог: ${passed} ok, ${failed} fail`);
if (failed > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
