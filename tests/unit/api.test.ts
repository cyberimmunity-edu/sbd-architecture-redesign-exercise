/**
 * Дополнительные тесты: публичный API слоёв (8.2), лимиты (Ф-17),
 * вспомогательные функции расчёта, граничные случаи парсеров.
 */

import { describe, expect, it } from 'vitest';
import * as engine from '@/engine';
import * as io from '@/io';
import { useSkibStore } from '@/store/projectStore';
import { issuePath } from '@/io/schema';
import { parseArchitectureYaml } from '@/io/archYaml';
import { parseSecurityYaml } from '@/io/securityYaml';
import { parseStateYaml, serializeStateYaml } from '@/io/stateFile';
import { parsePlantUml } from '@/io/plantuml';
import { emptyProject, MAX_DOMAINS, MAX_EDGES } from '@/engine/types';

describe('Публичный API слоёв (раздел 8.2)', () => {
  it('engine/index экспортирует функции модели', () => {
    expect(typeof engine.domainCost).toBe('function');
    expect(typeof engine.recalcCosts).toBe('function');
    expect(typeof engine.recalcCoverage).toBe('function');
    expect(typeof engine.goalStatus).toBe('function');
    expect(typeof engine.decompose).toBe('function');
    expect(typeof engine.canAddDomain).toBe('function');
    expect(typeof engine.canAddEdge).toBe('function');
    expect(typeof engine.limitsReport).toBe('function');
    expect(typeof engine.functionsByBlock).toBe('function');
    expect(typeof engine.edgeCounts).toBe('function');
    expect(typeof engine.emptyProject).toBe('function');
    expect(engine.FILE_VERSION).toBe(1);
    expect(engine.STORAGE_KEY).toBe('skib-lab-state-v1');
  });

  it('io/index экспортирует парсеры и сериализаторы', () => {
    expect(typeof io.parseArchitectureYaml).toBe('function');
    expect(typeof io.parseSecurityYaml).toBe('function');
    expect(typeof io.parseStateYaml).toBe('function');
    expect(typeof io.parsePlantUml).toBe('function');
    expect(typeof io.serializeArchitectureYaml).toBe('function');
    expect(typeof io.serializeSecurityYaml).toBe('function');
    expect(typeof io.serializeStateYaml).toBe('function');
    expect(typeof io.serializePuml).toBe('function');
    expect(io.ERR.E102).toBe('E-102');
    expect(io.WARN.W005).toBe('W-005');
  });

  it('hasErrors различает результаты валидации', () => {
    expect(io.hasErrors({ errors: [] })).toBe(false);
    expect(io.hasErrors({ errors: [{ code: 'E-102', message: 'x' }] })).toBe(true);
  });

  it('issuePath форматирует путь с индексами массивов', () => {
    expect(issuePath(['blocks', 0, 'cost'])).toBe('blocks[0].cost');
    expect(issuePath(['version'])).toBe('version');
    expect(issuePath([])).toBe('');
    expect(issuePath(['architecture', 'blocks', 12, 'position', 'x'])).toBe(
      'architecture.blocks[12].position.x',
    );
  });
});

describe('Ф-17: лимиты модели', () => {
  function projectWithCounts(blocks: number, edges: number) {
    const project = emptyProject();
    project.architecture = {
      blocks: Array.from({ length: blocks }, (_, i) => ({
        id: `blk-${i + 1}`,
        name: `Блок ${i + 1}`,
        cost: 1,
      })),
      edges: Array.from({ length: edges }, (_, i) => ({
        id: `e-${i + 1}`,
        from: 'blk-1',
        to: 'blk-2',
      })),
    };
    return project;
  }

  it('canAddDomain / canAddEdge / limitsReport на границах лимитов', () => {
    expect(engine.canAddDomain(projectWithCounts(MAX_DOMAINS - 1, 0))).toBe(true);
    expect(engine.canAddDomain(projectWithCounts(MAX_DOMAINS, 0))).toBe(false);
    expect(engine.canAddEdge(projectWithCounts(2, MAX_EDGES - 1))).toBe(true);
    expect(engine.canAddEdge(projectWithCounts(2, MAX_EDGES))).toBe(false);
    expect(engine.limitsReport(projectWithCounts(MAX_DOMAINS, MAX_EDGES))).toHaveLength(2);
    expect(engine.limitsReport(projectWithCounts(1, 0))).toHaveLength(0);
  });

  it('store: добавление стрелки блокируется на лимите (Ф-17)', () => {
    useSkibStore.getState().resetProject();
    const full = projectWithCounts(2, MAX_EDGES);
    useSkibStore.setState({ project: full, past: [], future: [] });
    expect(useSkibStore.getState().addEdge('blk-1', 'blk-2')).toBeNull();
  });
});

describe('Граничные случаи парсеров', () => {
  it('architecture.yaml: пустой файл и не-объект дают E-001/E-002', () => {
    const empty = parseArchitectureYaml('');
    expect(['E-001', 'E-002']).toContain(empty.errors[0].code);
    expect(parseArchitectureYaml('42').errors[0].code).toBe('E-002');
    expect(parseArchitectureYaml('version: 2\nblocks: [{id: a, name: A, cost: 1}]\nedges: []\n').errors[0].message).toContain('version');
  });

  it('security.yaml: пустой файл, не-объект и неверная версия дают E-001/E-002', () => {
    const empty = parseSecurityYaml('');
    expect(['E-001', 'E-002']).toContain(empty.errors[0].code);
    expect(parseSecurityYaml('[]').errors[0].code).toBe('E-002');
    const bad = parseSecurityYaml('version: 3\ngoals: [{id: g, name: G}]\nfunctions: [{id: f, name: F, cost: 1}]\n');
    expect(bad.errors.some((e) => e.message.includes('version'))).toBe(true);
  });

  it('state.yaml: не-объект и сломанный YAML дают E-002/E-001', () => {
    expect(parseStateYaml('42').errors[0].code).toBe('E-002');
    expect(parseStateYaml('state: [1,\n').errors[0].code).toBe('E-001');
  });

  it('state.yaml: сериализация без meta и с частичной meta', () => {
    const project = emptyProject();
    project.architecture = {
      blocks: [{ id: 'blk-a', name: 'А', cost: 1 }],
      edges: [],
    };
    project.security = {
      goals: [{ id: 'g1', name: 'Цель' }],
      functions: [{ id: 'f1', name: 'Функция', cost: 1 }],
    };
    const noMeta = serializeStateYaml({ ...project, meta: {} });
    expect(noMeta).not.toContain('meta:');
    const sourceOnly = serializeStateYaml({ ...project, meta: { source: 'тест' } });
    expect(sourceOnly).toContain('source: тест');
    expect(sourceOnly).not.toContain('savedAt');
    const parsed = parseStateYaml(noMeta);
    expect(parsed.errors).toEqual([]);
    expect(parsed.model!.meta).toEqual({});
  });

  it('PlantUML: пустая диаграмма и component-ключевое слово вне подмножества', () => {
    expect(parsePlantUml('@startuml\n@enduml\n').errors.some((e) => e.code === 'E-301')).toBe(true);
    const result = parsePlantUml('@startuml\ncomponent Foo\n@enduml\n');
    expect(result.errors.some((e) => e.code === 'E-301')).toBe(true);
    // Строки вне тела диаграммы игнорируются.
    expect(parsePlantUml('junk\n@startuml\n[A] <<cost: 1>>\n@enduml\ntrailing\n').errors).toEqual([]);
  });

  it('cost: стрелки и размещения на неизвестные объекты игнорируются', () => {
    const project = emptyProject();
    project.architecture = {
      blocks: [{ id: 'b1', name: 'Блок', cost: 2 }],
      edges: [{ id: 'e-ghost', from: 'ghost-a', to: 'ghost-b' }],
    };
    project.security = {
      goals: [{ id: 'g1', name: 'Цель' }],
      functions: [{ id: 'f1', name: 'Функция', cost: 3 }],
    };
    project.assignments = [
      { function: 'ghost-fn', block: 'b1' },
      { function: 'f1', block: 'ghost-block' },
    ];
    const { costs, systemCost } = engine.recalcCosts(project);
    expect(costs.get('b1')!.domainCost).toBe(1); // S = 0: функция не попала в домен; НДБ: ceil(2 × 0.1)
    expect(systemCost).toBe(1);
  });
});

describe('Хранилище: дополнительные действия', () => {
  it('setValidation и hydrate без localStorage (node-среда) безопасны', () => {
    useSkibStore.getState().resetProject();
    useSkibStore.getState().setValidation({
      errors: [{ code: 'E-102', message: 'тест' }],
      warnings: [],
    });
    expect(useSkibStore.getState().validation?.errors).toHaveLength(1);
    useSkibStore.getState().setValidation(null);
    expect(useSkibStore.getState().validation).toBeNull();
    // hydrate без window (тестовая среда node) не должен падать.
    expect(() => useSkibStore.getState().hydrate()).not.toThrow();
  });

  it('updateEdge и updatePositions изменяют проект без истории', () => {
    useSkibStore.getState().resetProject();
    const arch = parseArchitectureYaml(
      'version: 1\nblocks: [{id: b1, name: B, cost: 1, position: {x: 0, y: 0}}]\nedges: [{id: e1, from: b1, to: b1}]\n'.replace(
        'to: b1',
        'to: b1',
      ),
    );
    void arch;
    const project = emptyProject();
    project.architecture = {
      blocks: [{ id: 'b1', name: 'Блок', cost: 1, position: { x: 0, y: 0 } }],
      edges: [{ id: 'e1', from: 'b1', to: 'b1' }],
    };
    useSkibStore.setState({ project, past: [], future: [] });
    useSkibStore.getState().updateEdge('e1', { label: 'связь' });
    expect(useSkibStore.getState().project.architecture.edges[0].label).toBe('связь');
    // Правка подписи записывается в историю (Ф-21), перемещение узлов — нет.
    expect(useSkibStore.getState().past).toHaveLength(1);
    useSkibStore.getState().updatePositions({ b1: { x: 40, y: 60 } });
    expect(useSkibStore.getState().project.architecture.blocks[0].position).toEqual({ x: 40, y: 60 });
    expect(useSkibStore.getState().past).toHaveLength(1);
  });

  it('undo на пустой истории и повтор undo безопасны', () => {
    useSkibStore.getState().resetProject();
    expect(() => useSkibStore.getState().undo()).not.toThrow();
    expect(() => useSkibStore.getState().redo()).not.toThrow();
  });
});
