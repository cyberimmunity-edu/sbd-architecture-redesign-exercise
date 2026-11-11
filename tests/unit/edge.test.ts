/**
 * Дополнительные тесты ветвей: отказы схем на шаге 2 валидации 6.5,
 * служебные ветви декомпозиции и хранилища.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decompose } from '@/engine/decompose';
import { parseArchitectureYaml } from '@/io/archYaml';
import { parseSecurityYaml } from '@/io/securityYaml';
import { parseStateYaml, serializeStateYaml } from '@/io/stateFile';
import { parsePlantUml, serializePuml } from '@/io/plantuml';
import { parseArchInner } from '@/io/archYaml';
import { parseSecurityInner } from '@/io/securityYaml';
import { emptyProject } from '@/engine/types';
import { useSkibStore } from '@/store/projectStore';
import { MAX_DOMAINS } from '@/engine/types';

describe('Отказы схемы zod (шаг 2 валидации 6.5) — E-002 с путём', () => {
  it('architecture.yaml: blocks не массив — E-002 с путём blocks', () => {
    const result = parseArchitectureYaml('version: 1\nblocks: "не список"\nedges: []\n');
    expect(result.errors.some((e) => e.code === 'E-002' && e.path === 'blocks')).toBe(true);
  });

  it('architecture.yaml: cost строкой — E-002 с путём blocks[0].cost', () => {
    const result = parseArchitectureYaml(
      'version: 1\nblocks:\n  - id: b1\n    name: "Блок"\n    cost: "много"\nedges: []\n',
    );
    expect(result.errors.some((e) => e.code === 'E-002' && e.path === 'blocks[0].cost')).toBe(true);
  });

  it('architecture.yaml: без обязательного поля name — E-002', () => {
    const result = parseArchitectureYaml('version: 1\nblocks: [{id: b1, cost: 1}]\nedges: []\n');
    expect(result.errors.some((e) => e.code === 'E-002')).toBe(true);
  });

  it('security.yaml: cost строкой — E-002; weight числом — E-002 схемы', () => {
    const schemaFail = parseSecurityYaml(
      'version: 1\ngoals: [{id: g1, name: "Цель"}]\nfunctions: [{id: f1, name: "Функция", cost: "ноль"}]\n',
    );
    expect(schemaFail.errors.some((e) => e.code === 'E-002' && e.path === 'functions[0].cost')).toBe(true);

    const schemaWeight = parseSecurityYaml(
      'version: 1\ngoals: [{id: g1, name: "Цель"}]\nfunctions: [{id: f1, name: "Функция", cost: 1, implements: [{goal: g1, weight: 1}]}]\n',
    );
    expect(schemaWeight.errors.some((e) => e.code === 'E-002')).toBe(true);
  });

  it('security.yaml: текст «null» — не объект — E-002', () => {
    expect(parseSecurityYaml('null').errors[0].code).toBe('E-002');
  });

  it('state.yaml: assignments строкой — E-002; неизвестные поля — W-001', () => {
    const schemaFail = parseStateYaml(
      'version: 1\narchitecture: {blocks: [{id: b, name: B, cost: 1}], edges: []}\nsecurity: {goals: [{id: g, name: G}], functions: [{id: f, name: F, cost: 1}]}\nassignments: "все"\n',
    );
    expect(schemaFail.errors.some((e) => e.code === 'E-002' && e.path === 'assignments')).toBe(true);

    const warning = parseStateYaml(
      'version: 1\nextra: 1\narchitecture: {blocks: [{id: b, name: B, cost: 1}], edges: []}\nsecurity: {goals: [{id: g, name: G}], functions: [{id: f, name: F, cost: 1}]}\nassignments: []\n',
    );
    expect(warning.errors).toEqual([]);
    expect(warning.warnings.some((w) => w.code === 'W-001' && w.path === 'extra')).toBe(true);
  });

  it('state.yaml: пустая архитектура внутри — E-105 останавливает применение', () => {
    const result = parseStateYaml(
      'version: 1\narchitecture: {blocks: [], edges: []}\nsecurity: {goals: [{id: g, name: G}], functions: [{id: f, name: F, cost: 1}]}\nassignments: []\n',
    );
    expect(result.errors.some((e) => e.code === 'E-105')).toBe(true);
  });
});

describe('Служебные ветви декомпозиции', () => {
  it('Назначение чужой стрелки — ошибка', () => {
    const project = emptyProject();
    project.architecture = {
      blocks: [
        { id: 'blk-a', name: 'А', cost: 1 },
        { id: 'blk-b', name: 'Б', cost: 1 },
      ],
      edges: [{ id: 'e-foreign', from: 'blk-b', to: 'blk-b' }],
    };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    const result = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [{ edgeId: 'e-foreign', childIndex: 0 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('не принадлежит'))).toBe(true);
    }
  });

  it('Конфликт id потомка: свободный суффикс подбирается, fallback при длинном id', () => {
    const project = emptyProject();
    project.architecture = {
      blocks: [
        { id: 'blk-a', name: 'А', cost: 1 },
        { id: 'blk-a-1', name: 'Занятый потомок', cost: 1 },
        {
          // id ровно 64 символа: база потомка 66 символов не входит в шаблон.
          id: 'blk-' + 'a'.repeat(60),
          name: 'Длинный',
          cost: 1,
        },
      ],
      edges: [],
    };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    const result = decompose(project, {
      blockId: 'blk-a',
      children: [
        { name: 'А.1', cost: 1 },
        { name: 'А.2', cost: 1 },
      ],
      edgeAssignments: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.project.architecture.blocks.map((b) => b.id);
    expect(ids).toContain('blk-a-1-2'); // blk-a-1 занят
    // Длинный родитель декомпозируется отдельно: fallback blk-child-N.
    const longId = 'blk-' + 'a'.repeat(60);
    const result2 = decompose(result.project, {
      blockId: longId,
      children: [
        { name: 'Д.1', cost: 1 },
        { name: 'Д.2', cost: 1 },
      ],
      edgeAssignments: [],
    });
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    const ids2 = result2.project.architecture.blocks.map((b) => b.id);
    expect(ids2.some((id) => id.startsWith('blk-child-'))).toBe(true);
  });
});

describe('Служебные ветви хранилища', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setSelection выбирает и снимает выбор', () => {
    useSkibStore.getState().setSelection({ kind: 'domain', id: 'blk-1' });
    expect(useSkibStore.getState().selection).toEqual({ kind: 'domain', id: 'blk-1' });
    useSkibStore.getState().setSelection(null);
    expect(useSkibStore.getState().selection).toBeNull();
  });

  it('addDomain без позиции использует координаты по умолчанию', () => {
    const id = useSkibStore.getState().addDomain();
    expect(id).toBe('dom-1');
    const block = useSkibStore.getState().project.architecture.blocks[0];
    expect(block.position).toEqual({ x: 120, y: 120 });
  });

  it('updateDomain/deleteDomain/deleteEdge с неизвестными id безопасны', () => {
    const project = emptyProject();
    project.architecture = { blocks: [{ id: 'b1', name: 'B', cost: 1 }], edges: [] };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    useSkibStore.setState({ project, past: [], future: [] });
    useSkibStore.getState().updateDomain('ghost', { name: 'X' });
    useSkibStore.getState().deleteDomain('ghost');
    useSkibStore.getState().deleteEdge('ghost');
    expect(useSkibStore.getState().project.architecture.blocks[0].name).toBe('B');
    expect(useSkibStore.getState().past).toHaveLength(0);
  });

  it('decomposeBlock блокируется на лимите доменов (Ф-17)', () => {
    const project = emptyProject();
    project.architecture = {
      blocks: Array.from({ length: MAX_DOMAINS - 1 }, (_, i) => ({
        id: `blk-${i + 1}`,
        name: `Домен ${i + 1}`,
        cost: 1,
      })),
      edges: [],
    };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    useSkibStore.setState({ project, past: [], future: [] });
    const result = useSkibStore.getState().decomposeBlock({
      blockId: 'blk-1',
      children: [
        { name: 'Потомок 1', cost: 1 },
        { name: 'Потомок 2', cost: 1 },
      ],
      edgeAssignments: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain('лимит');
  });

  it('hydrate восстанавливает проект из localStorage, повреждённый JSON игнорируется', async () => {
    const store = { data: '' };
    const windowStub = {
      localStorage: {
        getItem: (key: string) => (key === 'skib-lab-state-v1' ? store.data : null),
        setItem: (key: string, value: string) => {
          if (key === 'skib-lab-state-v1') store.data = value;
        },
        removeItem: (key: string) => {
          if (key === 'skib-lab-state-v1') store.data = '';
        },
      },
    };
    vi.stubGlobal('window', windowStub);

    const project = emptyProject();
    project.architecture = { blocks: [{ id: 'b1', name: 'B', cost: 1 }], edges: [] };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    useSkibStore.setState({ project, past: [], future: [] });
    // Автосохранение срабатывает с задержкой; ждём записи.
    useSkibStore.getState().placeFunction('f', 'b1');
    await vi.waitFor(() => expect(store.data).not.toBe(''));
    const saved = store.data;

    // Восстановление: пустой проект + hydrate → размещение из localStorage.
    useSkibStore.getState().resetProject();
    expect(useSkibStore.getState().project.assignments).toHaveLength(0);
    store.data = saved; // resetProject очистил хранилище — восстанавливаем снимок
    useSkibStore.getState().hydrate();
    expect(useSkibStore.getState().hydrated).toBe(true);
    expect(useSkibStore.getState().project.assignments).toEqual([{ function: 'f', block: 'b1' }]);

    // Повреждённый JSON не ломает hydrate.
    store.data = '{broken';
    useSkibStore.getState().resetProject();
    useSkibStore.getState().hydrate();
    expect(useSkibStore.getState().project.architecture.blocks).toHaveLength(0);

    // Частичное состояние (без security) игнорируется.
    store.data = JSON.stringify({ architecture: { blocks: [], edges: [] } });
    useSkibStore.getState().hydrate();
    expect(useSkibStore.getState().hydrated).toBe(true);
  });

  it('scheduleSave при ошибке localStorage не ломает операцию', async () => {
    const windowStub = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceeded');
        },
        removeItem: () => {},
      },
    };
    vi.stubGlobal('window', windowStub);
    const project = emptyProject();
    project.architecture = { blocks: [{ id: 'b1', name: 'B', cost: 1 }], edges: [] };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    useSkibStore.setState({ project, past: [], future: [] });
    expect(() => useSkibStore.getState().placeFunction('f', 'b1')).not.toThrow();
    expect(useSkibStore.getState().project.assignments).toHaveLength(1);
    await vi.waitFor(() => true);
  });
});

describe('Длины полей и составные ветви (E-002)', () => {
  it('Подпись стрелки длиннее 60 символов — E-002', () => {
    const label = 'x'.repeat(61);
    const result = parseArchitectureYaml(
      `version: 1\nblocks: [{id: b1, name: "Блок", cost: 1}]\nedges: [{id: e1, from: b1, to: b1, label: "${label}"}]\n`.replace('to: b1', 'to: b1'),
    );
    expect(result.errors.some((e) => e.code === 'E-002' && e.message.includes('подпись'))).toBe(true);
  });

  it('Описание цели длиннее 500 символов и имя функции длиннее 100 — E-002', () => {
    const desc = 'd'.repeat(501);
    const name = 'n'.repeat(101);
    const result = parseSecurityYaml(
      `version: 1\ngoals: [{id: g1, name: "Цель", description: "${desc}"}]\nfunctions: [{id: f1, name: "${name}", cost: 1}]\n`,
    );
    expect(result.errors.some((e) => e.code === 'E-002' && e.message.includes('описание цели'))).toBe(true);
    expect(result.errors.some((e) => e.code === 'E-002' && e.message.includes('имя функции'))).toBe(true);
  });

  it('PlantUML: стрелка от необъявленного компонента-источника — E-303', () => {
    const result = parsePlantUml('@startuml\n[A] <<cost: 1>>\n[Призрак] --> [A]\n@enduml\n');
    expect(result.errors.some((e) => e.code === 'E-303' && e.message.includes('Призрак'))).toBe(true);
  });

  it('state.yaml: неверные типы во вложенной архитектуре и спецификации — E-002', () => {
    const badArch = parseStateYaml(
      'version: 1\narchitecture: {blocks: [{id: b, name: B, cost: "ноль"}], edges: []}\nsecurity: {goals: [{id: g, name: G}], functions: [{id: f, name: F, cost: 1}]}\nassignments: []\n',
    );
    expect(badArch.errors.some((e) => e.code === 'E-002' && e.path === 'architecture.blocks[0].cost')).toBe(true);

    const badSecurity = parseStateYaml(
      'version: 1\narchitecture: {blocks: [{id: b, name: B, cost: 1}], edges: []}\nsecurity: {goals: [{id: g, name: G}], functions: [{id: f, name: F, cost: "много"}]}\nassignments: []\n',
    );
    expect(badSecurity.errors.some((e) => e.code === 'E-002' && e.path === 'security.functions[0].cost')).toBe(true);
  });

  it('state.yaml: сериализация meta только с savedAt', () => {
    const project = emptyProject();
    project.architecture = { blocks: [{ id: 'b', name: 'B', cost: 1 }], edges: [] };
    project.security = { goals: [{ id: 'g', name: 'G' }], functions: [{ id: 'f', name: 'F', cost: 1 }] };
    const text = serializeStateYaml({ ...project, meta: { savedAt: '2026-11-09T00:00:00Z' } });
    expect(text).toContain('savedAt');
    expect(text).not.toContain('source');
  });
});

describe('Прямые вызовы внутренних парсеров и ветви сериализации', () => {
  it('parseArchInner: неверные типы — E-002; неизвестные поля — W-001', () => {
    const bad = parseArchInner({ blocks: 'не список', edges: [] });
    expect(bad.errors.some((e) => e.code === 'E-002')).toBe(true);
    const unknown = parseArchInner({
      blocks: [{ id: 'b1', name: 'Блок', cost: 1, note: 'x' }],
      edges: [],
      from: 'будущее',
    });
    expect(unknown.errors).toEqual([]);
    expect(unknown.warnings.some((w) => w.code === 'W-001' && w.path === 'blocks[0].note')).toBe(true);
    expect(unknown.warnings.some((w) => w.code === 'W-001' && w.path === 'from')).toBe(true);
  });

  it('parseSecurityInner: неверные типы — E-002; неизвестные поля — W-001', () => {
    const bad = parseSecurityInner({ goals: [], functions: 'не список' });
    expect(bad.errors.some((e) => e.code === 'E-002')).toBe(true);
    const unknown = parseSecurityInner({
      goals: [{ id: 'g1', name: 'Цель' }],
      functions: [{ id: 'f1', name: 'Функция', cost: 1, priority: 5 }],
      tag: 'x',
    });
    expect(unknown.errors).toEqual([]);
    expect(unknown.warnings.some((w) => w.code === 'W-001' && w.path === 'functions[0].priority')).toBe(true);
    expect(unknown.warnings.some((w) => w.code === 'W-001' && w.path === 'tag')).toBe(true);
  });

  it('PlantUML: алиасы, комментарии и строка после @enduml', () => {
    const result = parsePlantUml([
      "@startuml",
      "' примечание автора",
      '[A] as Альфа <<cost: 2>>',
      '[B] <<cost: 3>>',
      '[C] <<cost: 4>>',
      '[B] --> [C] : поток',
      '[B] --> [C]',
      '@enduml',
      'мусор после конца',
    ].join('\n'));
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'W-002' && w.message.includes('алиас'))).toBe(true);
    expect(result.model!.blocks).toHaveLength(2); // алиасная строка пропущена: объявлены только B и C
  });

  it('serializePuml: стрелка без подписи и стоимость 0', () => {
    const project = emptyProject();
    project.architecture = {
      blocks: [
        { id: 'b1', name: 'Источник', cost: 0 },
        { id: 'b2', name: 'Приёмник', cost: 2 },
      ],
      edges: [{ id: 'e1', from: 'b1', to: 'b2' }],
    };
    const text = serializePuml(project.architecture);
    expect(text).toContain('[Источник] <<cost: 0>>');
    expect(text).toContain('[Источник] --> [Приёмник]');
    expect(text).not.toContain(' : ');
    const reparsed = parsePlantUml(text);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.model!.blocks[0].cost).toBe(0);
    expect(reparsed.warnings.every((w) => w.code !== 'W-005')).toBe(true);
  });
});
