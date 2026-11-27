/**
 * Генерация фикстуры производительности tests/fixtures/perf/large-state.yaml
 * (50 ДБ, 20 ЛГ, 200 связей, 5 внешних систем). Фикстура хранится в репозитории,
 * чтобы E2E-тест производительности не зависел от генератора.
 * Запуск: bun run scripts/make-perf-fixture.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeStateYaml } from '../src/io/index';
import { buildLargeProject } from '../tests/perf/largeModel';

const project = buildLargeProject();
const counts = {
  blocks: project.architecture.blocks.length,
  internal: project.architecture.blocks.filter((b) => !b.external).length,
  external: project.architecture.blocks.filter((b) => b.external).length,
  edges: project.architecture.edges.length,
  groups: (project.architecture.groups ?? []).length,
};
const target = fileURLToPath(new URL('../tests/fixtures/perf/large-state.yaml', import.meta.url));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, serializeStateYaml(project), 'utf8');
console.log(`фикстура записана: ${target}`);
console.log(counts);
