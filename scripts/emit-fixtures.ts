/**
 * Генерация файлов примеров и фикстур из единых источников
 * src/samples/robot/content.ts и src/samples/vessel/content.ts.
 * Запуск: bun run scripts/emit-fixtures.ts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  DEMO_ARCHITECTURE_YAML as ROBOT_ARCH,
  DEMO_PUML as ROBOT_PUML,
  DEMO_SECURITY_YAML as ROBOT_SECURITY,
  DEMO_STATE_YAML as ROBOT_STATE,
} from '../src/samples/robot/content';
import {
  DEMO_ARCHITECTURE_YAML as VESSEL_ARCH,
  DEMO_PUML as VESSEL_PUML,
  DEMO_SECURITY_YAML as VESSEL_SECURITY,
  DEMO_STATE_YAML as VESSEL_STATE,
} from '../src/samples/vessel/content';

// Старый демо-комплект (АСУ ТП учебного стенда) заменён двумя примерами 14.4 ТЗ.
rmSync('tests/fixtures/demo', { recursive: true, force: true });
rmSync('samples/demo', { recursive: true, force: true });
rmSync('src/samples/demo', { recursive: true, force: true });

const targets = [
  ['tests/fixtures/robot', { 'architecture.yaml': ROBOT_ARCH, 'security.yaml': ROBOT_SECURITY, 'architecture.puml': ROBOT_PUML, 'state.yaml': ROBOT_STATE }],
  ['tests/fixtures/vessel', { 'architecture.yaml': VESSEL_ARCH, 'security.yaml': VESSEL_SECURITY, 'architecture.puml': VESSEL_PUML, 'state.yaml': VESSEL_STATE }],
  ['samples/robot', { 'architecture.yaml': ROBOT_ARCH, 'security.yaml': ROBOT_SECURITY, 'architecture.puml': ROBOT_PUML, 'state.yaml': ROBOT_STATE }],
  ['samples/vessel', { 'architecture.yaml': VESSEL_ARCH, 'security.yaml': VESSEL_SECURITY, 'architecture.puml': VESSEL_PUML, 'state.yaml': VESSEL_STATE }],
  ['src/samples/robot', { 'architecture.yaml': ROBOT_ARCH, 'security.yaml': ROBOT_SECURITY, 'architecture.puml': ROBOT_PUML, 'state.yaml': ROBOT_STATE }],
  ['src/samples/vessel', { 'architecture.yaml': VESSEL_ARCH, 'security.yaml': VESSEL_SECURITY, 'architecture.puml': VESSEL_PUML, 'state.yaml': VESSEL_STATE }],
] as const;

for (const [dir, files] of targets) {
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(`${dir}/${name}`, content);
  }
}
console.log('fixtures emitted:', targets.map(([dir]) => dir).join(', '));

// Образцы ДП v0.02.01b: demo — под ДАП примера 2 (12 доменов); scenario —
// под расширенную ДАП сквозного сценария (22 домена, fixture vessel-full).
import {
  DEMO_SEQUENCES_YAML as VESSEL_DEMO_SEQUENCES,
  SCENARIO_SEQUENCES_YAML as VESSEL_SCENARIO_SEQUENCES,
} from '../src/samples/vessel/content';

const seqTargets = [
  ['tests/fixtures/vessel', VESSEL_SCENARIO_SEQUENCES],
  ['samples/vessel', VESSEL_DEMO_SEQUENCES],
  ['src/samples/vessel', VESSEL_DEMO_SEQUENCES],
] as const;

for (const [dir, content] of seqTargets) {
  writeFileSync(`${dir}/sequences.yaml`, content);
}
console.log('sequences.yaml emitted:', seqTargets.map(([dir]) => `${dir}/sequences.yaml`).join(', '));
