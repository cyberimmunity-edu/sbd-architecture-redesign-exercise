/**
 * Тесты семантической проверки диаграммы — v0.01.08, W-013 — v0.03.01b,
 * кросс-проверка ДП↔ДАП — v0.03.01c. Трассировка «цель → функция → домен»:
 * E-501 (обязательные функции цели не размещены), E-502 (ПЛО-цель),
 * W-006 (функция с целями без размещения), W-013 (forceTrusted при красном
 * входе — обоснование признака), E-601/W-008 (расхождения связей ДП и ДАП
 * в общем чеке «Проверить»).
 */

import { describe, expect, it } from 'vitest';
import { validateProject } from '../../src/engine/audit';
import type {
  Assignment,
  Block,
  Edge,
  Goal,
  Project,
  SecurityFunction,
  SequenceDiagram,
} from '../../src/engine/types';

function makeProject(options: {
  goals: Goal[];
  functions: SecurityFunction[];
  assignments?: Assignment[];
  blocks?: Block[];
  edges?: Edge[];
  sequences?: SequenceDiagram[];
}): Project {
  return {
    architecture: {
      blocks: options.blocks ?? [{ id: 'd-a', name: 'Домен', cost: 1 }],
      edges: options.edges ?? [],
    },
    security: { goals: options.goals, functions: options.functions },
    assignments: options.assignments ?? [],
    meta: {},
    ...(options.sequences !== undefined ? { sequences: options.sequences } : {}),
  };
}

describe('Проверка диаграммы — трассировка целей (v0.01.08)', () => {
  it('обязательные функции цели не размещены — E-501', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель один' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
    });
    const messages = validateProject(project);
    expect(messages).toHaveLength(2); // E-501 и W-006 об одном пробеле
    expect(messages.map((message) => message.code).sort()).toEqual(['E-501', 'W-006']);
    expect(messages.find((message) => message.code === 'E-501')?.message).toContain('t-1');
  });

  it('цель ПЛО с неполным размещением — E-502', () => {
    const project = makeProject({
      goals: [{ id: 't-plo', name: 'Безусловная цель', unconditional: true }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-plo', weight: 'mandatory' }] },
      ],
    });
    const messages = validateProject(project);
    // Обязательная функция не размещена: E-502 для безусловной цели
    // и W-006 на саму функцию.
    expect(messages.map((message) => message.code).sort()).toEqual(['E-502', 'W-006']);
    expect(messages.find((message) => message.code === 'E-502')!.message).toContain('безусловно');
  });

  it('размещённая обязательная функция — проверка чиста', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
      assignments: [{ function: 'f-1', block: 'd-a' }],
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('цель без функций — зона W-003, E-501 не возникает', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [{ id: 'f-1', name: 'Функция', cost: 1 }],
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('optional-функции не требуются к размещению (E-501/E-502 не возникают)', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'optional' }] },
      ],
    });
    // Цель без обязательных функций не попадает в E-501/E-502; единственное
    // сообщение — W-006 на саму неразмещённую функцию.
    expect(validateProject(project).map((message) => message.code)).toEqual(['W-006']);
  });
});

describe('Проверка диаграммы — обоснование forceTrusted (W-013, v0.03.01b)', () => {
  it('forceTrusted-домен с красным входом — W-013 с указанием места', () => {
    // Ситуация примера пользователя: интерфейсный ДБ (лидар) объявлен
    // доверенным по флагу и принимает красный поток из внешней среды —
    // исходящие потоки «зелёные по флагу», обоснование должно быть явным.
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [],
      blocks: [
        { id: 'ext-env', name: 'Среда', cost: 0, external: true },
        { id: 'd-lidar', name: 'Лидар', cost: 2, forceTrusted: true },
      ],
      edges: [{ id: 'e-env-lidar', from: 'ext-env', to: 'd-lidar' }],
    });
    const messages = validateProject(project);
    const w013 = messages.find((message) => message.code === 'W-013');
    expect(w013).toBeDefined();
    expect(w013!.message).toContain('d-lidar');
    expect(w013!.message).toContain('forceTrusted');
    expect(w013!.path).toBe('architecture.blocks[1]');
  });

  it('forceTrusted без красного входа — предупреждения нет (легитимный ввод в ДВБ)', () => {
    // Доверенный датчик в составе системы: флаг обоснован, красных входов нет.
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [],
      blocks: [
        { id: 'd-sensor', name: 'Датчик', cost: 2, forceTrusted: true },
      ],
      edges: [],
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('красный вход без forceTrusted — обычная картина ДДБПЦД, W-013 нет', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
      blocks: [
        { id: 'ext-env', name: 'Среда', cost: 0, external: true },
        { id: 'd-iface', name: 'Интерфейс', cost: 2 },
      ],
      edges: [{ id: 'e-env-iface', from: 'ext-env', to: 'd-iface' }],
      assignments: [{ function: 'f-1', block: 'd-iface' }],
    });
    expect(validateProject(project)).toEqual([]);
  });
});

/**
 * Кросс-проверка ДП ↔ ДАП в общем чеке «Проверить» (v0.03.01c).
 * Регрессия пользовательского сценария: удаление связи ДАП, на которую
 * опираются стрелки ДП, должно обнаруживаться кнопкой «Проверить» (E-601),
 * а не только кнопкой «Проверить ДП» режима ДП.
 */
describe('Кросс-проверка ДП ↔ ДАП в «Проверить» (v0.03.01c)', () => {
  /** Модель: два домена, связь d-src → d-dst, ДП со стрелкой по этой связи. */
  function linkedProject(): Project {
    return makeProject({
      goals: [],
      functions: [],
      blocks: [
        { id: 'd-src', name: '01. Источник', cost: 1 },
        { id: 'd-dst', name: '02. Приёмник', cost: 1 },
      ],
      edges: [{ id: 'e-1', from: 'd-src', to: 'd-dst' }],
      sequences: [
        {
          id: 'seq-1',
          name: 'Диаграмма сцепления',
          lifelines: ['d-src', 'd-dst'],
          arrows: [{ id: 'a-1', from: 'd-src', to: 'd-dst', label: 'запрос' }],
          blocks: [],
        },
      ],
    });
  }

  it('удаление связи ДАП, нужной стрелке ДП, — E-601 в общем чеке (сценарий пользователя)', () => {
    const project = linkedProject();
    expect(validateProject(project)).toEqual([]); // до удаления — чисто

    // Связь удаляется (как в ДАП: инспектор или Delete) — модель ДП не трогается.
    project.architecture.edges = [];
    const messages = validateProject(project);
    const e601 = messages.filter((m) => m.code === 'E-601');
    expect(e601).toHaveLength(1);
    expect(e601[0].message).toContain('1 (01. Источник → 02. Приёмник)');
    expect(e601[0].message).toContain('Диаграмма сцепления');

    // Связь восстановлена — чек снова чист.
    project.architecture.edges = [{ id: 'e-2', from: 'd-src', to: 'd-dst' }];
    expect(validateProject(project)).toEqual([]);
  });

  it('реверс связи — тоже расхождение: направление строгое (П-3)', () => {
    const project = makeProject({
      goals: [],
      functions: [],
      blocks: [
        { id: 'd-src', name: '01. Источник', cost: 1 },
        { id: 'd-dst', name: '02. Приёмник', cost: 1 },
      ],
      edges: [{ id: 'e-1', from: 'd-src', to: 'd-dst' }],
      sequences: [
        {
          id: 'seq-1',
          name: 'Реверс',
          lifelines: ['d-src', 'd-dst'],
          arrows: [{ id: 'a-1', from: 'd-dst', to: 'd-src' }],
          blocks: [],
        },
      ],
    });
    const e601 = validateProject(project).filter((m) => m.code === 'E-601');
    expect(e601).toHaveLength(1);
    expect(e601[0].message).toContain('02. Приёмник → 01. Источник');
  });

  it('self-стрелка соответствия не требует (6.1)', () => {
    const project = makeProject({
      goals: [],
      functions: [],
      blocks: [{ id: 'd-solo', name: '01. Автономный', cost: 1 }],
      edges: [],
      sequences: [
        {
          id: 'seq-1',
          name: 'Self',
          lifelines: ['d-solo'],
          arrows: [{ id: 'a-1', from: 'd-solo', to: 'd-solo' }],
          blocks: [],
        },
      ],
    });
    expect(validateProject(project).filter((m) => m.code === 'E-601')).toEqual([]);
  });

  it('W-008: домен вне ДП — предупреждение при наличии ДП', () => {
    const project = linkedProject();
    project.architecture.blocks.push({ id: 'd-idle', name: '03. Простой', cost: 1 });
    const w008 = validateProject(project).filter((m) => m.code === 'W-008');
    expect(w008).toHaveLength(1);
    expect(w008[0].message).toContain('03. Простой');
  });

  it('проект без ДП не заливается W-008 по всем доменам (шум исключён)', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
      blocks: [
        { id: 'd-a', name: '01. Один', cost: 1 },
        { id: 'd-b', name: '02. Два', cost: 1 },
      ],
      assignments: [{ function: 'f-1', block: 'd-a' }],
      // sequences отсутствует (undefined) — проект v0.01.x без ДП.
    });
    expect(validateProject(project)).toEqual([]);
  });

  it('разрыв ДП и цели проверяются независимо: E-501/W-006 и E-601 в одном чеке', () => {
    const project = makeProject({
      goals: [{ id: 't-1', name: 'Цель' }],
      functions: [
        { id: 'f-1', name: 'Функция', cost: 1, implements: [{ goal: 't-1', weight: 'mandatory' }] },
      ],
      blocks: [
        { id: 'd-src', name: '01. Источник', cost: 1 },
        { id: 'd-dst', name: '02. Приёмник', cost: 1 },
      ],
      edges: [], // связь удалена — расхождение ДП
      sequences: [
        {
          id: 'seq-1',
          name: 'Разрыв',
          lifelines: ['d-src', 'd-dst'],
          arrows: [{ id: 'a-1', from: 'd-src', to: 'd-dst' }],
          blocks: [],
        },
      ],
    });
    const codes = validateProject(project).map((m) => m.code).sort();
    expect(codes).toEqual(['E-501', 'E-601', 'W-006']);
  });
});

describe('Проверка диаграммы — структура блоков ДП (E-605, v0.03.01e)', () => {
  it('разрыв состава блока и пересечение блоков видны в общем чеке «Проверить»', () => {
    const project = makeProject({
      goals: [],
      functions: [],
      blocks: [
        { id: 'd-a', name: '01. Один', cost: 1 },
        { id: 'd-b', name: '02. Два', cost: 1 },
        { id: 'd-c', name: '03. Три', cost: 1 },
      ],
      edges: [
        { id: 'e-1', from: 'd-a', to: 'd-b' },
        { id: 'e-2', from: 'd-b', to: 'd-c' },
        { id: 'e-3', from: 'd-c', to: 'd-a' },
      ],
      sequences: [
        {
          id: 'seq-1',
          name: 'Структура',
          lifelines: ['d-a', 'd-b', 'd-c'],
          arrows: [
            { id: 'a-1', from: 'd-a', to: 'd-b' },
            { id: 'a-2', from: 'd-b', to: 'd-c' },
            { id: 'a-3', from: 'd-c', to: 'd-a' },
          ],
          blocks: [
            // Разрыв: a-2 внутри рамки a-1…a-3, но не в составе (баг 0.03.01d).
            { id: 'g-1', kind: 'loop', name: 'разрыв', color: '#1E88E5', arrows: ['a-1', 'a-3'] },
          ],
        },
      ],
    });
    const e605 = validateProject(project).filter((m) => m.code === 'E-605');
    expect(e605).toHaveLength(1);
    expect(e605[0].message).toContain('разрыв');

    // Пересечение блоков — второй случай E-605.
    project.sequences![0].blocks = [
      { id: 'g-1', kind: 'loop', name: 'первый', color: '#1E88E5', arrows: ['a-1', 'a-2'] },
      { id: 'g-2', kind: 'loop', name: 'второй', color: '#43A047', arrows: ['a-2', 'a-3'] },
    ];
    expect(validateProject(project).filter((m) => m.code === 'E-605')).toHaveLength(1);

    // Корректное состояние — E-605 нет.
    project.sequences![0].blocks = [
      { id: 'g-1', kind: 'loop', name: 'целиком', color: '#1E88E5', arrows: ['a-1', 'a-2'] },
    ];
    expect(validateProject(project).filter((m) => m.code === 'E-605')).toEqual([]);
  });
});
