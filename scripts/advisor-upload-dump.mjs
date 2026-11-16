/** Диагностика советчика на загруженных пользователем state.yaml. */
import { readFileSync } from 'node:fs';
import { parseStateYaml } from '../src/io/stateFile.ts';
import { computeAdvice } from '../src/engine/advisor.ts';
import { recalcCosts } from '../src/engine/cost.ts';

const kindRu = {
  'goal-coverage': 'цель-не-покрыта',
  'unlinked-function': 'функция-без-целей',
  'empty-domain': 'пустой-домен',
  'isolated-domain': 'изолированный-домен',
  'ddbpcd-split': 'декомпозиция-ДДБПЦД',
  'ddb-regroup': 'вынос-некритичных-из-ДДБ',
  'filter-domain': 'дешёвый-посредник',
  'cost-leader': 'лидер-стоимости',
};

for (const path of ['upload/state.yaml', 'upload/state (3).yaml']) {
  let text;
  try {
    text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  } catch {
    continue;
  }
  const parsed = parseStateYaml(text);
  if (parsed.errors.length > 0) {
    console.log(`\n=== ${path}: ошибки разбора: ${parsed.errors.map((e) => e.code).join(', ')}`);
    continue;
  }
  const project = parsed.model;
  const { systemCost, trust, costs } = recalcCosts(project);
  console.log(`\n=== ${path}: C_системы = ${systemCost}`);
  const advices = computeAdvice(project);
  for (const a of advices) {
    const parts = [];
    if (a.blocks.length) parts.push(`домены=[${a.blocks.join(',')}]`);
    if (a.functions.length) parts.push(`функции=[${a.functions.join(',')}]`);
    if (a.deltaC !== null) parts.push(`ΔC=${a.deltaC}`);
    parts.push('params=' + JSON.stringify(a.params));
    console.log(`  ${kindRu[a.kind] ?? a.kind}: ${parts.join(' ')}`);
  }
  for (const b of project.architecture.blocks) {
    if (b.external) continue;
    const c = costs.get(b.id);
    const fns = project.assignments.filter((x) => x.block === b.id).map((x) => x.function);
    console.log(
      `  [${b.id}] ${trust.internal.get(b.id)} S=${c.functionsCost} E=${c.edgeCount} M=${c.multiplier} K=${c.trustCoefficient} C=${c.domainCost} C_блока=${b.cost} функции=[${fns.join(',')}]`,
    );
  }
}
