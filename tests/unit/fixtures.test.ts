/**
 * Проверка фикстур и НФ-1 (порог отклика пересчёта 100 мс на максимальной модели).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArchitectureYaml } from '@/io/archYaml';
import { parseSequencesYaml } from '@/io/sequencesYaml';
import { renumberArchitecture } from '@/engine/sequence';
import { parseSecurityYaml } from '@/io/securityYaml';
import { parseStateYaml } from '@/io/stateFile';
import { parsePlantUml } from '@/io/plantuml';
import { recalcCosts } from '@/engine/cost';
import { recalcCoverage } from '@/engine/coverage';
import { computeTrust } from '@/engine/trust';
import { emptyProject, MAX_DOMAINS, MAX_EDGES } from '@/engine/types';
import {
  DEMO_ARCHITECTURE_YAML as ROBOT_ARCH,
  DEMO_PUML as ROBOT_PUML,
  DEMO_SECURITY_YAML as ROBOT_SECURITY,
  DEMO_STATE_YAML as ROBOT_STATE,
} from '@/samples/robot/content';
import {
  DEMO_ARCHITECTURE_YAML as VESSEL_ARCH,
  DEMO_PUML as VESSEL_PUML,
  DEMO_SECURITY_YAML as VESSEL_SECURITY,
  DEMO_STATE_YAML as VESSEL_STATE,
} from '@/samples/vessel/content';
import {
  DEMO_SEQUENCES_YAML as VESSEL_DEMO_SEQUENCES,
  SCENARIO_SEQUENCES_YAML as VESSEL_SCENARIO_SEQUENCES,
} from '@/samples/vessel/content';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('Фикстуры (раздел 11.4)', () => {
  const invalidDir = resolve(FIXTURES, 'invalid');
  const files = readdirSync(invalidDir).filter((f) => f.endsWith('.yaml'));

  it('Набор invalid содержит не менее 8 файлов, каждый ровно с одним дефектом', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  const expectedCodes: Record<string, string> = {
    'e001-broken-yaml.yaml': 'E-001',
    'e101-duplicate-block-id.yaml': 'E-101',
    'e102-negative-cost.yaml': 'E-102',
    'e103-edge-unknown-block.yaml': 'E-103',
    'e104-self-loop.yaml': 'E-104',
    'e106-bad-id.yaml': 'E-106',
    'e203-empty-goals.yaml': 'E-203',
    'e205-unknown-goal.yaml': 'E-205',
    'e206-bad-weight.yaml': 'E-206',
    'e208-duplicate-assumption.yaml': 'E-208',
    'e401-bad-state-version.yaml': 'E-401',
  };

  it('Каждый код из 6.5 воспроизводится фикстурой invalid/ (приёмка 14.2, пункт 5)', () => {
    for (const [file, code] of Object.entries(expectedCodes)) {
      const text = readFileSync(resolve(invalidDir, file), 'utf8');
      if (file.startsWith('e4')) {
        const result = parseStateYaml(text);
        expect(result.errors.map((e) => e.code), file).toContain(code);
      } else if (file.startsWith('e2')) {
        const result = parseSecurityYaml(text);
        expect(result.errors.map((e) => e.code), file).toContain(code);
      } else {
        const result = parseArchitectureYaml(text);
        expect(result.errors.map((e) => e.code), file).toContain(code);
      }
    }
  });

  it('PlantUML обоих примеров разбирается без ошибок, включая внешние системы', () => {
    for (const puml of [ROBOT_PUML, VESSEL_PUML]) {
      const result = parsePlantUml(puml);
      expect(result.errors).toEqual([]);
      expect(result.model!.blocks.filter((b) => b.external)).toHaveLength(2);
    }
  });
});

describe('Примеры 14.4 ТЗ — единый источник данных', () => {
  const samples: Array<[{ arch: string; sec: string; puml: string; state: string }, string]> = [
    [{ arch: ROBOT_ARCH, sec: ROBOT_SECURITY, puml: ROBOT_PUML, state: ROBOT_STATE }, 'robot'],
    [{ arch: VESSEL_ARCH, sec: VESSEL_SECURITY, puml: VESSEL_PUML, state: VESSEL_STATE }, 'vessel'],
  ];

  it('Встроенные строки совпадают с файлами src/samples и tests/fixtures', () => {
    for (const [demo, dir] of samples) {
      for (const [embedded, file] of [
        [demo.arch, 'architecture.yaml'],
        [demo.sec, 'security.yaml'],
        [demo.puml, 'architecture.puml'],
        [demo.state, 'state.yaml'],
      ] as const) {
        const onDisk = readFileSync(resolve(FIXTURES, `${dir}/${file}`), 'utf8');
        expect(onDisk, `${dir}/${file}`).toBe(embedded);
        const inSamples = readFileSync(resolve(__dirname, '../..', `samples/${dir}/${file}`), 'utf8');
        expect(inSamples, `samples/${dir}/${file}`).toBe(embedded);
      }
    }
  });

  it('Примеры валидны: architecture, security, state и PlantUML разбираются без ошибок', () => {
    for (const [demo] of samples) {
      expect(parseArchitectureYaml(demo.arch).errors).toEqual([]);
      expect(parseSecurityYaml(demo.sec).errors).toEqual([]);
      expect(parseStateYaml(demo.state).errors).toEqual([]);
      expect(parsePlantUml(demo.puml).errors).toEqual([]);
    }
  });

  it('Пример 1 (робот): C_системы = 486, картина доверия из 14.4 ТЗ', () => {
    const parsed = parseStateYaml(ROBOT_STATE);
    expect(parsed.errors).toEqual([]);
    const { systemCost, costs } = recalcCosts(parsed.model!);
    expect(costs.get('blk-perc')!.domainCost).toBe(1);
    expect(costs.get('blk-plan')!.domainCost).toBe(240);
    expect(costs.get('blk-drive')!.domainCost).toBe(45);
    expect(costs.get('blk-link')!.domainCost).toBe(200);
    expect(systemCost).toBe(486);
    const trust = computeTrust(parsed.model!);
    expect(trust.internal.get('blk-perc')).toBe('ndb');
    expect(trust.internal.get('blk-plan')).toBe('ddbpcd');
    expect(trust.internal.get('blk-drive')).toBe('ddb');
    expect(trust.internal.get('blk-link')).toBe('ddbpcd');
    expect(trust.external.get('ext-ctrl')).toBe('green');
    expect(trust.external.get('ext-charge')).toBe('red');
  });

  it('Пример 2 (судно, доработка v0.01.05): C_системы = 943, картина доверия', () => {
    const parsed = parseStateYaml(VESSEL_STATE);
    expect(parsed.errors).toEqual([]);
    const { systemCost, costs } = recalcCosts(parsed.model!);
    expect(costs.get('blk-radio')!.domainCost).toBe(250);
    expect(costs.get('blk-nav')!.domainCost).toBe(480);
    expect(costs.get('blk-ota')!.domainCost).toBe(68);
    expect(costs.get('blk-avoid')!.domainCost).toBe(120);
    expect(costs.get('blk-cargo')!.domainCost).toBe(20);
    expect(systemCost).toBe(943);
    const trust = computeTrust(parsed.model!);
    expect(trust.internal.get('blk-radio')).toBe('ddbpcd');
    expect(trust.internal.get('blk-nav')).toBe('ddbpcd');
    expect(trust.internal.get('blk-avoid')).toBe('ddbpcd');
    expect(trust.internal.get('blk-ota')).toBe('ddb');
    expect(trust.internal.get('blk-cargo')).toBe('ddb');
    expect(trust.internal.get('blk-ai')).toBe('ndb');
    expect(trust.internal.get('blk-gps-ins')).toBe('ndb');
    expect(trust.external.get('ext-shore')).toBe('green');
    expect(trust.external.get('ext-lock')).toBe('red');
  });

  it('Пример 2 (судно): 9 целей ПЛО, 2 предположения, 10 механизмов', () => {
    const parsed = parseSecurityYaml(VESSEL_SECURITY);
    expect(parsed.errors).toEqual([]);
    expect(parsed.model!.goals).toHaveLength(9);
    expect(parsed.model!.goals.every((goal) => goal.unconditional === true)).toBe(true);
    expect(parsed.model!.assumptions).toHaveLength(2);
    expect(parsed.model!.assumptions![0].id).toBe('asm-shore');
    expect(parsed.model!.functions).toHaveLength(10);
    const navIntegrity = parsed.model!.functions.find((fn) => fn.id === 'fn-nav-integrity')!;
    expect(navIntegrity.implements).toEqual([
      { goal: 'g-cargo-zone', weight: 'mandatory' },
      { goal: 'g-move-limits', weight: 'mandatory' },
    ]);
  });

  it('Примеры без размещений: все внутренние домены НДБ', () => {
    for (const [demo, internalCount] of [
      [samples[0][0], 4],
      [samples[1][0], 10],
    ] as Array<[typeof samples[number][0], number]>) {
      const parsed = parseStateYaml(demo.state);
      const noAssignments = { ...parsed.model!, assignments: [] };
      const { systemCost } = recalcCosts(noAssignments);
      expect(systemCost).toBe(internalCount); // ceil(C_блока × 0.1) = 1 на каждый внутренний домен
      const trust = computeTrust(noAssignments);
      expect(trust.internal.size).toBe(internalCount);
      for (const cls of trust.internal.values()) expect(cls).toBe('ndb');
    }
  });
});

describe('НФ-1: пересчёт на максимальной модели не более 100 мс', () => {
  it('200 доменов, 500 стрелок, 100 функций — пересчёт быстрее 100 мс', () => {
    const project = emptyProject();
    const blocks = Array.from({ length: MAX_DOMAINS }, (_, i) => ({
      id: `blk-${i + 1}`,
      name: `Домен ${i + 1}`,
      cost: (i % 9) + 1,
      position: { x: (i % 10) * 280, y: Math.floor(i / 10) * 180 },
    }));
    const edges = Array.from({ length: MAX_EDGES }, (_, i) => ({
      id: `e-${i + 1}`,
      from: `blk-${(i % MAX_DOMAINS) + 1}`,
      to: `blk-${((i + 7) % MAX_DOMAINS) + 1}`,
      label: `поток ${i + 1}`,
    })).filter((e) => e.from !== e.to);
    const functions = Array.from({ length: 100 }, (_, i) => ({
      id: `fn-${i + 1}`,
      name: `Функция ${i + 1}`,
      cost: (i % 5) + 1,
      implements: [{ goal: `g-${(i % 20) + 1}`, weight: i % 3 === 0 ? ('optional' as const) : ('mandatory' as const) }],
    }));
    const goals = Array.from({ length: 20 }, (_, i) => ({ id: `g-${i + 1}`, name: `Цель ${i + 1}` }));
    project.architecture = { blocks, edges };
    project.security = { goals, functions };
    project.assignments = functions.map((fn) => ({ function: fn.id, block: blocks[fn.id.length % blocks.length].id }));

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      recalcCosts(project);
      recalcCoverage(project);
    }
    const elapsed = (performance.now() - start) / 100; // среднее на один пересчёт
    expect(elapsed).toBeLessThan(100);
  });

  it('Образцы ДП v0.02.01b: fixture scenario генерируется из content.ts и разбирается на ДАП 22 блоков', () => {
    const sample = readFileSync(resolve(FIXTURES, 'vessel/sequences.yaml'), 'utf8');
    expect(sample).toBe(VESSEL_SCENARIO_SEQUENCES);
    const full = parseStateYaml(readFileSync(resolve(FIXTURES, 'vessel-full/state.yaml'), 'utf8')).model!;
    const parsedFull = parseSequencesYaml(sample, renumberArchitecture(full.architecture).blocks);
    expect(parsedFull.errors).toEqual([]);
    expect(parsedFull.model?.map((s) => s.arrows.length)).toEqual([13, 21]);
  });

  it('Образцы ДП v0.02.01b: demo-sequences разбирается на ДАП примера 2 без ошибок (демо показывает ДП)', () => {
    const sample = readFileSync(resolve(__dirname, '../../src/samples/vessel/sequences.yaml'), 'utf8');
    expect(sample).toBe(VESSEL_DEMO_SEQUENCES);
    const arch = parseArchitectureYaml(VESSEL_ARCH).model!;
    const parsed = parseSequencesYaml(sample, renumberArchitecture(arch).blocks);
    expect(parsed.errors).toEqual([]);
    // Все линии жизни — домены ДАП примера 2; «Проверить ДП» без E-601.
    const blockIds = new Set(arch.blocks.map((b) => b.id));
    for (const diagram of parsed.model ?? []) {
      for (const lifeline of diagram.lifelines) expect(blockIds.has(lifeline)).toBe(true);
    }
    expect(parsed.model?.map((s) => s.arrows.length)).toEqual([8, 14]);
  });
});
