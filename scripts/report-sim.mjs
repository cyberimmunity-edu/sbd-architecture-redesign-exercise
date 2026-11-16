/** Реконструкция сценария «Сводного отчёта v1.2.5» на движке конструктора v0.03.01a.
 *
 * A: исходный state.yaml без forceTrusted на blk-lidar (модель анализатора) — ожидаем C=335.
 * B: A + корректная декомпозиция dom-6 (валидатор dom-6 + исполнитель dom-cargo-cmd) — ожидаем −10.
 * C: B + шлюз dom-4-gw с ФБ fn-lidar-check — ожидаем −42.
 * Плюс: советы советчика на модели A (появляется ли С3-посредник для dom-4).
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(new URL('../cli/ts-hook.mjs', import.meta.url));
const { parseStateYaml } = await import('../src/io/stateFile.ts');
const { computeAdvice } = await import('../src/engine/advisor.ts');
const { recalcCosts } = await import('../src/engine/cost.ts');

const kindRu = {
  'goal-coverage': 'цель-не-покрыта',
  'unlinked-function': 'функция-без-целей',
  'empty-domain': 'пустой-домен',
  'isolated-domain': 'изолированный-домен',
  'ddbpcd-split': 'С1-декомпозиция',
  'ddb-regroup': 'С2-вынос',
  'filter-domain': 'С3-посредник',
  'cost-leader': 'С7-лидер',
};

const base = parseStateYaml(readFileSync(new URL('../upload/state.yaml', import.meta.url), 'utf8')).model;

function cloneStripForceTrusted(project) {
  return {
    ...project,
    architecture: {
      ...project.architecture,
      blocks: project.architecture.blocks.map((b) =>
        b.id === 'blk-lidar' ? { ...b, forceTrusted: undefined } : b,
      ),
    },
  };
}

/** B: декомпозиция dom-6 по отчёту: blk-cargo → dom-6 → dom-cargo-cmd → dom-8. */
function decomposeDom6(project) {
  const edges = project.architecture.edges.map((e) =>
    e.id === 'e-15' ? { id: 'e-15a', from: 'dom-6', to: 'dom-cargo-cmd' } : e,
  );
  edges.push({ id: 'e-15b', from: 'dom-cargo-cmd', to: 'dom-8' });
  return {
    ...project,
    architecture: {
      ...project.architecture,
      blocks: [
        ...project.architecture.blocks,
        { id: 'dom-cargo-cmd', name: 'Питание привода выгрузки', cost: 1, position: { x: 2200, y: 900 } },
      ],
      edges,
    },
    assignments: project.assignments.map((a) =>
      a.function === 'fn-cargo-power' ? { ...a, block: 'dom-cargo-cmd' } : a,
    ),
  };
}

/** C: шлюз dom-4-gw с новой ФБ fn-lidar-check (implements g-safe-distance). */
function addLidarGateway(project) {
  const edges = project.architecture.edges.map((e) =>
    e.id === 'e-6' ? { ...e, to: 'dom-4-gw' } : e,
  );
  edges.push({ id: 'e-6b', from: 'dom-4-gw', to: 'dom-4' });
  return {
    ...project,
    architecture: {
      ...project.architecture,
      blocks: [
        ...project.architecture.blocks,
        { id: 'dom-4-gw', name: 'Контроль целостности данных лидара', cost: 1, position: { x: 2400, y: 100 } },
      ],
      edges,
    },
    security: {
      ...project.security,
      functions: [
        ...project.security.functions,
        {
          id: 'fn-lidar-check',
          name: 'Контроль целостности данных лидара',
          cost: 1,
          implements: [{ goal: 'g-safe-distance', weight: 'mandatory' }],
        },
      ],
    },
    assignments: [...project.assignments, { function: 'fn-lidar-check', block: 'dom-4-gw' }],
  };
}

function show(label, project, baseCost) {
  const { systemCost, costs, trust } = recalcCosts(project);
  const delta = baseCost !== undefined ? ` (Δ ${systemCost - baseCost})` : '';
  console.log(`\n=== ${label}: C_системы = ${systemCost}${delta}`);
  for (const id of ['blk-lidar', 'dom-4', 'dom-6', 'dom-cargo-cmd', 'dom-4-gw']) {
    const b = project.architecture.blocks.find((x) => x.id === id);
    if (!b) continue;
    const c = costs.get(id);
    const fns = project.assignments.filter((x) => x.block === id).map((x) => x.function);
    console.log(`  [${id}] ${trust.internal.get(id).toUpperCase()} S=${c.functionsCost} E=${c.edgeCount} M=${c.multiplier} K=${c.trustCoefficient} C=${c.domainCost} C_блока=${b.cost} функции=[${fns.join(',')}]`);
  }
  return systemCost;
}

const a = cloneStripForceTrusted(base);
const cA = show('A: без forceTrusted на blk-lidar (модель анализатора)', a);
console.log('Советы советчика на модели A:');
for (const adv of computeAdvice(a)) {
  console.log(`  ${kindRu[adv.kind] ?? adv.kind}: домены=[${adv.blocks.join(',')}] ΔC=${adv.deltaC}`);
}

const b = decomposeDom6(a);
const cB = show('B: A + декомпозиция dom-6 (маршрут через валидацию)', b, cA);
const c = addLidarGateway(b);
show('C: B + шлюз dom-4-gw с fn-lidar-check', c, cB);
