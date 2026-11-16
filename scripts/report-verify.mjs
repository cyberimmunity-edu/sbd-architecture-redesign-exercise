/** Верификация «Сводного отчёта по советам советника» (v1.2.5) на движке конструктора v0.03.01a.
 *
 * Для каждого загруженного state.yaml печатает:
 *  - полный разбор стоимости по доменам (класс, S, E, M, K, C);
 *  - красные входы и советы советчика с deltaC;
 *  - для каждого «стоимостного» совета — разбор кандидатной модели;
 *  - чувствительность совета-посредника к честному C_блока (артефакт из отчёта).
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(new URL('../cli/ts-hook.mjs', import.meta.url));
const { parseStateYaml } = await import('../src/io/stateFile.ts');
const { computeAdvice, splitCandidate, regroupCandidate, filterCandidate } = await import('../src/engine/advisor.ts');
const { recalcCosts } = await import('../src/engine/cost.ts');

const kindRu = {
  'goal-coverage': 'цель-не-покрыта',
  'unlinked-function': 'функция-без-целей',
  'empty-domain': 'пустой-домен',
  'isolated-domain': 'изолированный-домен',
  'ddbpcd-split': 'декомпозиция-ДДБПЦД(С1)',
  'ddb-regroup': 'вынос-некритичных-из-ДДБ(С2)',
  'filter-domain': 'дешёвый-посредник(С3)',
  'cost-leader': 'лидер-стоимости(С7)',
};

function dump(name, project) {
  const { systemCost, trust, costs } = recalcCosts(project);
  console.log(`\n########## ${name}: C_системы = ${systemCost}`);
  const redEdges = [...trust.edges].filter(([, c]) => c === 'red');
  console.log('Красные стрелки:');
  for (const [id, ] of redEdges) {
    const e = project.architecture.edges.find((x) => x.id === id);
    if (e) console.log(`  ${e.from} -> ${e.to}`);
  }
  for (const b of project.architecture.blocks) {
    if (b.external) continue;
    const c = costs.get(b.id);
    const fns = project.assignments.filter((x) => x.block === b.id).map((x) => x.function);
    console.log(
      `  [${b.id}] ${trust.internal.get(b.id).toUpperCase()} S=${c.functionsCost} E=${c.edgeCount} M=${c.multiplier} K=${c.trustCoefficient} C=${c.domainCost} C_блока=${b.cost}${b.forceTrusted ? ' forceTrusted' : ''} функции=[${fns.join(',')}]`,
    );
  }
  console.log('Советы:');
  for (const a of computeAdvice(project)) {
    const parts = [];
    if (a.blocks.length) parts.push(`домены=[${a.blocks.join(',')}]`);
    if (a.functions.length) parts.push(`функции=[${a.functions.join(',')}]`);
    if (a.deltaC !== null) parts.push(`ΔC=${a.deltaC}`);
    parts.push('params=' + JSON.stringify(a.params));
    console.log(`  ${kindRu[a.kind] ?? a.kind}: ${parts.join(' ')}`);
  }
  return { systemCost, trust, costs };
}

function candidateDump(label, base, candidate) {
  if (!candidate) {
    console.log(`  ${label}: кандидат не строится (null)`);
    return;
  }
  const { systemCost, costs, trust } = recalcCosts(candidate.project);
  console.log(`  ${label}: C_кандидата=${systemCost}`);
  for (const b of candidate.project.architecture.blocks) {
    if (b.external) continue;
    const c = costs.get(b.id);
    const fns = candidate.project.assignments.filter((x) => x.block === b.id).map((x) => x.function);
    console.log(
      `    [${b.id}] ${trust.internal.get(b.id).toUpperCase()} S=${c.functionsCost} E=${c.edgeCount} M=${c.multiplier} K=${c.trustCoefficient} C=${c.domainCost} C_блока=${b.cost} функции=[${fns.join(',')}]`,
    );
  }
}

const files = ['upload/state.yaml', 'upload/state (3).yaml'];
const models = {};
for (const path of files) {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const parsed = parseStateYaml(text);
  if (parsed.errors.length > 0) {
    console.log(`\n=== ${path}: ошибки разбора: ${parsed.errors.map((e) => e.code).join(', ')}`);
    continue;
  }
  models[path] = parsed.model;
  const { systemCost, costs } = dump(path, parsed.model);

  console.log('  Кандидаты стоимостных советов:');
  for (const a of computeAdvice(parsed.model)) {
    if (a.kind === 'ddbpcd-split') candidateDump(`С1 split ${a.blocks[0]}`, parsed.model, splitCandidate(parsed.model, a.blocks[0]));
    if (a.kind === 'ddb-regroup') candidateDump(`С2 regroup ${a.blocks[0]}`, parsed.model, regroupCandidate(parsed.model, a.blocks[0]));
    if (a.kind === 'filter-domain') {
      candidateDump(`С3 filter ${a.blocks[0]} (C_блока=1)`, parsed.model, filterCandidate(parsed.model, a.blocks[0]));
      // Чувствительность: тот же кандидат, но C_блока посредника = C_блока оригинала.
      const honest = filterCandidate(parsed.model, a.blocks[0]);
      if (honest) {
        const orig = parsed.model.architecture.blocks.find((b) => b.id === a.blocks[0]);
        honest.project = {
          ...honest.project,
          architecture: {
            ...honest.project.architecture,
            blocks: honest.project.architecture.blocks.map((b) =>
              b.id.endsWith('-filter') ? { ...b, cost: orig.cost } : b,
            ),
          },
        };
        const c = recalcCosts(honest.project).systemCost;
        console.log(`    Чувствительность: при C_блока посредника = C_блока оригинала (${orig.cost}) C_кандидата=${c}, ΔC=${systemCost - c}`);
      }
    }
  }
}
