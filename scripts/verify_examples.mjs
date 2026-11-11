/** Сверка контрольных чисел примеров 14.4 с фактическим движком (ТЗ v0.01.01). */
import * as yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { recalcCosts } from '../src/engine/cost.js';
import { computeTrust } from '../src/engine/trust.js';

const load = (p) =>
  yaml.load(readFileSync(new URL(p, import.meta.url), 'utf8'));

function projectFrom(archPath, secPath) {
  const arch = load(archPath);
  const sec = load(secPath);
  return {
    architecture: { blocks: arch.blocks, edges: arch.edges },
    security: { goals: sec.goals, functions: sec.functions },
    assignments: [],
    meta: {},
  };
}

function applyAssignments(project, pairs) {
  return { ...project, assignments: pairs.map(([f, b]) => ({ function: f, block: b })) };
}

const trustRu = { ndb: 'НДБ', ddb: 'ДДБ', ddbpcd: 'ДДБПЦД' };

function report(title, project) {
  const { costs, systemCost, trust } = recalcCosts(project);
  console.log(`\n=== ${title}: C_системы = ${systemCost}`);
  for (const b of project.architecture.blocks) {
    const c = costs.get(b.id);
    const cls = b.external ? (b.trusted ? 'внешняя доверенная' : 'внешняя недоверенная') : trustRu[trust.internal.get(b.id)];
    console.log(
      `  ${b.id.padEnd(10)} C_блока=${b.cost} S=${c.functionsCost} E=${c.edgeCount} M=${c.multiplier} K=${c.trustCoefficient} C=${c.domainCost} ${cls}`,
    );
  }
  for (const e of project.architecture.edges) {
    console.log(`  ${e.id.padEnd(14)} ${trust.edges.get(e.id) === 'green' ? 'зелёная' : 'красная'}`);
  }
}

// Пример 1: робот.
const robot = projectFrom('../tests/fixtures/robot/architecture.yaml', '../tests/fixtures/robot/security.yaml');
report('Робот: после загрузки', robot);
const robotStep1 = applyAssignments(robot, [
  ['fn-auth', 'blk-link'], ['fn-sign', 'blk-link'], ['fn-sanitize', 'blk-plan'],
  ['fn-geofence', 'blk-plan'], ['fn-estop', 'blk-drive'],
]);
report('Робот: шаг 1 (14.4)', robotStep1);
const robotLinkOnly = applyAssignments(robot, [['fn-auth', 'blk-link']]);
report('Робот: только fn-auth в link (Э-03)', robotLinkOnly);
const robotPlanSanitize = applyAssignments(robot, [['fn-sanitize', 'blk-plan']]);
report('Робот: только fn-sanitize в plan (Э-05 до декомпозиции)', robotPlanSanitize);

// Пример 2: судно.
const vessel = projectFrom('../tests/fixtures/vessel/architecture.yaml', '../tests/fixtures/vessel/security.yaml');
report('Судно: после загрузки', vessel);
const vesselStep1 = applyAssignments(vessel, [
  ['fn-ais', 'blk-radio'], ['fn-auth-shore', 'blk-radio'], ['fn-collision', 'blk-avoid'],
  ['fn-route-check', 'blk-nav'], ['fn-cargo-seal', 'blk-cargo'],
]);
report('Судно: шаг 1 (14.4)', vesselStep1);
