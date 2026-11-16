/** Диагностика: какие советы советчика срабатывают на демо-состояниях примеров. */
import { readFileSync } from 'node:fs';
import { parseStateYaml } from '../src/io/stateFile.ts';
import { computeAdvice } from '../src/engine/advisor.ts';
import { recalcCosts } from '../src/engine/cost.ts';
import { computeTrust } from '../src/engine/trust.ts';

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

for (const sample of ['robot', 'vessel']) {
  const text = readFileSync(new URL(`../src/samples/${sample}/state.yaml`, import.meta.url), 'utf8');
  const parsed = parseStateYaml(text);
  if (parsed.errors.length > 0) {
    console.log(`${sample}: ошибки разбора`, parsed.errors);
    continue;
  }
  const project = parsed.model;
  const { systemCost, trust, costs } = recalcCosts(project);
  console.log(`\n=== ${sample}: C_системы = ${systemCost}`);
  const advices = computeAdvice(project);
  if (advices.length === 0) {
    console.log('  советов нет');
    continue;
  }
  for (const a of advices) {
    const parts = [];
    if (a.blocks.length) parts.push(`домены=[${a.blocks.join(',')}]`);
    if (a.functions.length) parts.push(`функции=[${a.functions.join(',')}]`);
    if (a.goals.length) parts.push(`цели=[${a.goals.join(',')}]`);
    if (a.deltaC !== null) parts.push(`ΔC=${a.deltaC}`);
    parts.push(
      'params=' + JSON.stringify(a.params),
    );
    console.log(`  ${kindRu[a.kind] ?? a.kind}: ${parts.join(' ')}`);
  }
  // Детали доменов: класс доверия, S, E, M, K, C
  for (const b of project.architecture.blocks) {
    if (b.external) continue;
    const c = costs.get(b.id);
    console.log(
      `  [${b.id}] ${trust.internal.get(b.id)} S=${c.functionsCost} E=${c.edgeCount} M=${c.multiplier} K=${c.trustCoefficient} C=${c.domainCost} C_блока=${b.cost}`,
    );
  }
}
