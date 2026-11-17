/**
 * CLI «skib» — доступ к движку «Моделирование СКИБ» без браузера (v0.03.01,
 * интеграция с ИИ-агентами, топ-5 задача №1). Тот же код разбора, валидации
 * и расчётов, что и в приложении: parseStateYaml / validateProject /
 * computeMetrics / computeAdvice / serializeStateYaml.
 *
 * Команды (вывод — JSON в stdout; stderr для диагностических сообщений):
 * - validate <state.yaml>   — валидация файла (структура + ссылки, E-/W-коды
 *                             с fix_hint); код возврата 1 при ошибках;
 * - check <state.yaml>      — семантическая проверка «Проверить»
 *                             (трассировка цель → функция → домен E-501/E-502/W-006,
 *                             кросс-проверка ДП↔ДАП E-601/W-008, обоснование
 *                             forceTrusted W-013);
 * - metrics <state.yaml>    — снимок метрик (C_системы, бюджет ДВБ, состав,
 *                             цели, ДП, ЛГ, советы);
 * - advice <state.yaml>     — советы по архитектуре с оценкой экономии deltaC;
 * - export <state.yaml>     --format state|plantuml [--out путь] — канонический
 *                             экспорт (пере-сериализация модели) или PlantUML ДАП;
 * - schema                  — JSON-схема state.yaml v1 (docs/state.schema.json);
 * - version                 — версия инструмента.
 *
 * Коды возврата: 0 — успех; 1 — ошибки валидации/разбора файла; 2 —
 * ошибка использования (нет файла, неизвестная команда).
 * Node ≥ 24: node cli/skib.mjs …; Node 22.12+: node --experimental-strip-types cli/skib.mjs …
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseStateYaml, serializeStateYaml } from '../src/io/stateFile';
import { serializePuml } from '../src/io/plantuml';
import { validateProject } from '../src/engine/audit';
import { computeMetrics } from '../src/engine/metrics';
import { computeAdvice } from '../src/engine/advisor';
import { recalcCosts } from '../src/engine/cost';
import { hintFor } from '../src/io/errors';
import { APP_VERSION } from '../src/engine/types';
import type { ImportMessage, Project } from '../src/engine/types';

/** Запись машиночитаемого вывода: код, текст, путь, строка и fix_hint. */
interface MessageJson {
  code: string;
  message: string;
  path?: string;
  line?: number;
  hint: string | null;
}

/** Успешный разбор state.yaml. */
interface LoadedState {
  ok: true;
  exit: 0;
  project: Project;
  errors: MessageJson[];
  warnings: MessageJson[];
  file: string;
}

/** Отказ разбора: результат уже сформирован и код возврата известен. */
interface FailedLoad {
  ok: false;
  exit: 1 | 2;
  result: Record<string, unknown>;
}

/** Сообщение валидации → машиночитаемая запись с fix_hint. */
function messageJson(message: ImportMessage): MessageJson {
  const out: MessageJson = {
    code: message.code,
    message: message.message,
    hint: hintFor(message.code),
  };
  if (message.path !== undefined) out.path = message.path;
  if (message.line !== undefined) out.line = message.line;
  return out;
}

/** Разбор state.yaml; при отказе — готовый результат и код возврата. */
function loadState(file: string): LoadedState | FailedLoad {
  if (!existsSync(file)) {
    return { ok: false, exit: 2, result: { ok: false, error: `файл не найден: ${file}` } };
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, exit: 2, result: { ok: false, error: `файл не прочитан: ${String(e)}` } };
  }
  const parsed = parseStateYaml(text);
  const errors = parsed.errors.map(messageJson);
  const warnings = parsed.warnings.map(messageJson);
  if (errors.length > 0 || !parsed.model) {
    return { ok: false, exit: 1, result: { command: 'validate', ok: false, file, errors, warnings } };
  }
  return { ok: true, exit: 0, project: parsed.model, errors, warnings, file };
}

function cmdValidate(file: string) {
  const loaded = loadState(file);
  if (!loaded.ok) return { exit: loaded.exit, result: loaded.result };
  // Валидация файла: структура и ссылки уже проверены парсером; сюда же —
  // предупреждения загрузки. Семантическая трассировка — команда check.
  const { systemCost } = recalcCosts(loaded.project);
  return {
    exit: 0,
    result: {
      command: 'validate',
      ok: true,
      file,
      errors: [],
      warnings: loaded.warnings,
      summary: { systemCost, domains: loaded.project.architecture.blocks.length },
    },
  };
}

function cmdCheck(file: string) {
  const loaded = loadState(file);
  if (!loaded.ok) return { exit: loaded.exit, result: loaded.result };
  const messages = validateProject(loaded.project);
  const errors = messages.filter((m) => m.code.startsWith('E-')).map(messageJson);
  const warnings = messages.filter((m) => m.code.startsWith('W-')).map(messageJson);
  return {
    exit: errors.length > 0 ? 1 : 0,
    result: {
      command: 'check',
      ok: errors.length === 0,
      file,
      errors,
      warnings: [...loaded.warnings, ...warnings],
    },
  };
}

function cmdMetrics(file: string) {
  const loaded = loadState(file);
  if (!loaded.ok) return { exit: loaded.exit, result: loaded.result };
  return {
    exit: 0,
    result: { command: 'metrics', ok: true, file, warnings: loaded.warnings, metrics: computeMetrics(loaded.project) },
  };
}

function cmdAdvice(file: string) {
  const loaded = loadState(file);
  if (!loaded.ok) return { exit: loaded.exit, result: loaded.result };
  const advice = computeAdvice(loaded.project).map((a) => ({
    kind: a.kind,
    blocks: a.blocks,
    goals: a.goals,
    functions: a.functions,
    deltaC: a.deltaC,
    params: a.params,
  }));
  return {
    exit: 0,
    result: { command: 'advice', ok: true, file, warnings: loaded.warnings, advice },
  };
}

function cmdExport(file: string, format: string, out: string | null) {
  const loaded = loadState(file);
  if (!loaded.ok) return { exit: loaded.exit, result: loaded.result };
  const project = loaded.project;
  let content;
  if (format === 'plantuml') {
    content = serializePuml(project.architecture);
  } else if (format === 'state') {
    // Каноническая пере-сериализация: модель разбирается и собирается заново
    // (стабильный порядок полей, без неизвестных ключей) — round-trip.
    content = serializeStateYaml(project);
  } else {
    return {
      exit: 2,
      result: { command: 'export', ok: false, error: `неизвестный формат: ${format} (допустимо state, plantuml)` },
    };
  }
  if (out) {
    writeFileSync(out, content, 'utf8');
    return { exit: 0, result: { command: 'export', ok: true, file, format, out } };
  }
  return { exit: 0, result: { command: 'export', ok: true, file, format, content } };
}

function cmdSchema() {
  const schemaPath = new URL('../docs/state.schema.json', import.meta.url);
  const content = readFileSync(schemaPath, 'utf8');
  return { exit: 0, result: { command: 'schema', ok: true, schema: JSON.parse(content) } };
}

const HELP = `skib — CLI «Моделирование СКИБ» v${APP_VERSION}

Использование: node cli/skib.mjs <команда> <state.yaml> [опции]

Команды:
  validate <файл>      валидация state.yaml (коды E-/W- с подсказкой fix_hint)
  check <файл>         семантическая проверка «Проверить» (цели E-501/E-502/W-006,
                       кросс-проверка ДП↔ДАП E-601/W-008, forceTrusted W-013)
  metrics <файл>       метрики: C_системы, бюджет ДВБ, состав, цели, ДП, ЛГ, советы
  advice <файл>        советы по архитектуре с оценкой экономии deltaC
  export <файл>        --format state|plantuml [--out путь] — канонический экспорт
  schema               JSON-схема state.yaml v1 (docs/state.schema.json)
  version              версия инструмента

Опции: --pretty — отступы в JSON; --out <путь> — записать файл экспорта.
Коды возврата: 0 — успех, 1 — ошибки файла, 2 — ошибка использования.
Документация для ИИ-агентов: docs/ai-integration.md`;

/** Точка входа CLI: возвращает код возврата процесса. */
export function run(args) {
  const parsed: {
    command: string | null;
    file: string | null;
    format: string;
    out: string | null;
    pretty: boolean;
  } = { command: null, file: null, format: 'state', out: null, pretty: false };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pretty') parsed.pretty = true;
    else if (arg === '--out') parsed.out = args[++i] ?? null;
    else if (arg === '--format') parsed.format = args[++i] ?? 'state';
    else if (arg === '--help' || arg === '-h') parsed.command = 'help';
    else positional.push(arg);
  }
  parsed.command = parsed.command ?? positional.shift() ?? null;
  parsed.file = positional[0] ?? null;

  if (!parsed.command || parsed.command === 'help') {
    process.stdout.write(HELP + '\n');
    return Promise.resolve(parsed.command ? 0 : 2);
  }

  let outcome;
  switch (parsed.command) {
    case 'validate':
      if (!parsed.file) return Promise.resolve(usage('укажите файл state.yaml'));
      outcome = cmdValidate(parsed.file);
      break;
    case 'check':
      if (!parsed.file) return Promise.resolve(usage('укажите файл state.yaml'));
      outcome = cmdCheck(parsed.file);
      break;
    case 'metrics':
      if (!parsed.file) return Promise.resolve(usage('укажите файл state.yaml'));
      outcome = cmdMetrics(parsed.file);
      break;
    case 'advice':
      if (!parsed.file) return Promise.resolve(usage('укажите файл state.yaml'));
      outcome = cmdAdvice(parsed.file);
      break;
    case 'export':
      if (!parsed.file) return Promise.resolve(usage('укажите файл state.yaml'));
      outcome = cmdExport(parsed.file, parsed.format, parsed.out);
      break;
    case 'schema':
      outcome = cmdSchema();
      break;
    case 'version':
      outcome = { exit: 0, result: { command: 'version', ok: true, version: APP_VERSION } };
      break;
    default:
      return Promise.resolve(usage(`неизвестная команда: ${parsed.command}`));
  }

  const json = JSON.stringify(outcome.result, null, parsed.pretty ? 2 : 0);
  process.stdout.write(json + '\n');
  return Promise.resolve(outcome.exit);
}

function usage(message) {
  process.stderr.write(JSON.stringify({ ok: false, error: message }) + '\n');
  process.stderr.write('Запустите с --help для списка команд.\n');
  return 2;
}
