/**
 * Диагностика для аудита forceTrusted (не входит в гейты).
 * Считает варианты моделирования лидара в демо-примере vessel:
 *  - текущее состояние (лидар НДБ, C_блока = 2);
 *  - лидар с forceTrusted (C_блока = 2) — класс, стоимость, C_системы;
 *  - лидар forceTrusted + искусственный красный вход — проверка ДДБПЦД.
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(new URL('../cli/ts-hook.mjs', import.meta.url));
const { parseStateYaml } = await import('../src/io/stateFile.ts');
const { recalcCosts } = await import('../src/engine/cost.ts');

const text = readFileSync(new URL('../src/samples/vessel/state.yaml', import.meta.url), 'utf8');
const parsed = parseStateYaml(text);
if (parsed.errors.length > 0) {
  console.log('Ошибки разбора:', parsed.errors);
  process.exit(1);
}
const project = parsed.model;

const show = (label, p) => {
  const { systemCost, costs, trust } = recalcCosts(p);
  const fmt = (id) => {
    const c = costs.get(id);
    const cls = trust.internal.get(id) ?? `ext:${trust.external.get(id)}`;
    return `${id}: класс=${cls}, K=${c.trustCoefficient}, C=${c.domainCost}`;
  };
  console.log(`\n--- ${label}: C_системы = ${systemCost}`);
  for (const id of ['blk-lidar', 'blk-cam', 'blk-vision', 'blk-ai']) console.log(' ', fmt(id));
  return systemCost;
};

const base = show('Текущее состояние (лидар НДБ, C_блока=2)', project);

const forced = JSON.parse(JSON.stringify(project));
const lidar = forced.architecture.blocks.find((b) => b.id === 'blk-lidar');
lidar.forceTrusted = true;
const withForce = show('Лидар forceTrusted (C_блока=2, без красных входов → ДДБ)', forced);

// Проверка «недопустимого сценария»: forceTrusted + красный вход.
const red = JSON.parse(JSON.stringify(forced));
red.architecture.edges.push({ id: 'e-ext-lidar', from: 'ext-lock', to: 'blk-lidar', label: 'внешняя команда' });
const withRed = show('Лидар forceTrusted + красный вход (ожидается ДДБПЦД, K=10)', red);

console.log(`\nИтог: база=${base}, лидар-forceTrusted=${withForce} (Δ ${withForce - base}), с красным входом=${withRed} (Δ ${withRed - base})`);
