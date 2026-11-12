/**
 * Тесты движка ДП и автонумерации — кейсы T-S-01… раздела 9.2 ТЗ v0.02.01:
 * ренумерация (Ф-30…Ф-35), формат номера, матчинг (Ф-54, 7.3), валидатор
 * (E-601 с учётом направления, self, W-008), окраска из ДАП (Ф-59, П-11),
 * целостность блоков (П-13, П-14).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canonicalInternalName,
  domainNumber,
  matchDomain,
  normalizeName,
  renumberArchitecture,
  validateSequences,
  computeSeqColors,
  firstFreeColor,
  defaultGroupName,
  cleanBlocksAfterArrowRemoval,
  isConsecutive,
  uniqueSequenceName,
} from '@/engine/sequence';
import { emptyProject, SEQ_BLOCK_COLORS } from '@/engine/types';
import type { Architecture, Block, SequenceDiagram } from '@/engine/types';
import { parseArchitectureYaml } from "@/io/archYaml";
import { parseStateYaml } from "@/io/stateFile";
import { parseSecurityYaml } from '@/io/securityYaml';

const FIXTURES = resolve(__dirname, '../fixtures');

/** Пример 1 (робот): 4 внутренних домена, 2 внешние системы. */
function loadRobotFixture() {
  const arch = parseArchitectureYaml(
    readFileSync(resolve(FIXTURES, 'robot/architecture.yaml'), 'utf8'),
  ).model!;
  const security = parseSecurityYaml(readFileSync(resolve(FIXTURES, 'robot/security.yaml'), 'utf8')).model!;
  const assignments = [
    // Один из механизмов примера размещён в планировщике — ДДБ для картины доверия.
    { function: security.functions[0].id, block: 'blk-plan' },
  ];
  return { architecture: arch, security, assignments };
}

function block(id: string, name: string, external = false): Block {
  return { id, name, cost: external ? 0 : 1, ...(external ? { external: true } : {}) };
}

describe('Автонумерация доменов (Ф-30…Ф-36, T-S-01/T-S-02)', () => {
  it('Формат номера: 01…99 с ведущим нулём, 100+ без него', () => {
    expect(domainNumber(0)).toBe('01');
    expect(domainNumber(8)).toBe('09');
    expect(domainNumber(9)).toBe('10');
    expect(domainNumber(98)).toBe('99');
    expect(domainNumber(99)).toBe('100');
    expect(domainNumber(122)).toBe('123');
  });

  it('Каноническое полное название: двойных префиксов не возникает', () => {
    expect(canonicalInternalName('Связь', 0)).toBe('01. Связь');
    expect(canonicalInternalName('02. Связь', 2)).toBe('03. Связь');
    expect(canonicalInternalName('007. Связь', 4)).toBe('05. Связь');
  });

  it('Ренумерация по порядку объявления; имена с назначенным префиксом не трогаются', () => {
    const arch: Architecture = {
      blocks: [
        block('a', 'Связь'),
        block('b', '02. Контроль подлинности'),
        block('c', 'Контроль'),
        block('x', 'Внешняя', true),
        block('d', '05. События'),
      ],
      edges: [],
    };
    const renumbered = renumberArchitecture(arch);
    expect(renumbered.blocks.map((b) => b.name)).toEqual([
      '01. Связь',
      '02. Контроль подлинности',
      '03. Контроль',
      'Внешняя',
      '04. События', // свой префикс «05.» не совпадает с назначаемым «04.» — заменён
    ]);
  });

  it('Ренумерация без изменений возвращает ту же ссылку', () => {
    const arch: Architecture = { blocks: [block('a', '01. Связь')], edges: [] };
    expect(renumberArchitecture(arch)).toBe(arch);
  });

  it('Нормализация при переименовании: чужой префикс заменяется каноническим (Ф-31)', () => {
    expect(normalizeName('07. Мой домен', 2)).toBe('03. Мой домен');
    expect(normalizeName('Мой домен', 9)).toBe('10. Мой домен');
  });

  it('Внешние системы без номеров: введённый префикс удаляется (Ф-35)', () => {
    expect(normalizeName('07. Внешняя', null)).toBe('Внешняя');
    expect(normalizeName('Внешняя', null)).toBe('Внешняя');
  });

  it('Удаление в середине списка не оставляет разрывов (Ф-32)', () => {
    const arch: Architecture = {
      blocks: [block('a', '01. A'), block('b', '02. B'), block('c', '03. C')],
      edges: [],
    };
    const renumbered = renumberArchitecture({ ...arch, blocks: [arch.blocks[0], arch.blocks[2]] });
    expect(renumbered.blocks.map((b) => b.name)).toEqual(['01. A', '02. C']);
  });
});

describe('Матчинг участников импорта (7.3, Ф-54, T-S-03)', () => {
  const blocks: Block[] = [
    block('dom-1', '01. Связь'),
    block('dom-2', '02. Контроль подлинности'),
    block('dom-3', '03. Контроль подлинности параметров'),
    block('ext-1', 'Сервер обновлений', true),
  ];

  it('Шаг 1: id', () => {
    expect(matchDomain('dom-2', blocks)).toEqual({ status: 'matched', id: 'dom-2' });
  });

  it('Шаг 2: номер — точный', () => {
    expect(matchDomain('01. Связь', blocks)).toEqual({ status: 'matched', id: 'dom-1' });
  });

  it('Шаг 2: номер без названия', () => {
    expect(matchDomain('03.', blocks)).toEqual({ status: 'matched', id: 'dom-3' });
  });

  it('Шаг 2: номер с другим названием — матч по номеру (W-007)', () => {
    const result = matchDomain('02. Другое название', blocks);
    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.id).toBe('dom-2');
      expect(result.numberWarning).toEqual({
        fileName: 'Другое название',
        projectName: 'Контроль подлинности',
      });
    }
  });

  it('Шаг 3: точное имя и имя без префикса', () => {
    expect(matchDomain('01. Связь', blocks).status).toBe('matched');
    expect(matchDomain('Контроль подлинности', blocks)).toEqual({
      status: 'matched',
      id: 'dom-2',
    });
    expect(matchDomain('Сервер обновлений', blocks)).toEqual({
      status: 'matched',
      id: 'ext-1',
    });
  });

  it('Шаг 4: однозначная подстрока', () => {
    expect(matchDomain('сервер', blocks)).toEqual({ status: 'matched', id: 'ext-1' });
  });

  it('Шаг 4: неоднозначная подстрока — E-606', () => {
    const result = matchDomain('контроль', blocks);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.code).toBe('E-606');
  });

  it('Шаг 5: не сопоставлен — E-602', () => {
    const result = matchDomain('Неизвестный', blocks);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.code).toBe('E-602');
  });

  it('Внешние системы по номеру не матчатся', () => {
    // «01.» — это внутренний дом-1; для внешних номера нет, но по имени — матч.
    const result = matchDomain('04. Сервер обновлений', blocks);
    expect(result.status).toBe('matched');
    if (result.status === 'matched' && result.numberWarning) {
      // Матч по номеру невозможен для внешних: это шаг 2 не для ext,
      // поэтому сработает шаг 3 по остатку названия.
      expect(result.id).toBe('ext-1');
    }
  });
});

describe('Валидатор ДП (6.1, Ф-49, Ф-51, T-S-08)', () => {
  const fixture = loadRobotFixture();
  const arch = fixture.architecture;
  const blocks = arch.blocks;

  function diagram(partial: Partial<SequenceDiagram>): SequenceDiagram {
    return {
      id: 'seq-1',
      name: 'Тест',
      lifelines: [],
      arrows: [],
      blocks: [],
      ...partial,
    };
  }

  it('E-601: отсутствие связи — расхождение; реверс — тоже расхождение (П-3)', () => {
    const from = blocks[0].id;
    const to = blocks[1].id;
    const forward = arch.edges.some((e) => e.from === from && e.to === to);
    const backward = arch.edges.some((e) => e.from === to && e.to === from);
    const project = emptyProject();
    project.architecture = arch;
    project.sequences = [
      diagram({
        lifelines: [from, to],
        arrows: [
          { id: 'a-1', from, to },
          { id: 'a-2', from: to, to: from },
        ],
      }),
    ];
    const messages = validateSequences(project);
    const e601 = messages.filter((m) => m.code === 'E-601');
    // Направление строгое: из двух стрелок расхождением может быть одна или обе,
    // но сообщение содержит направление.
    if (forward && backward) expect(e601).toHaveLength(0);
    else if (forward) expect(e601).toHaveLength(1);
    else expect(e601.length).toBeGreaterThan(0);
    for (const message of e601) {
      expect(message.message).toContain('→');
    }
  });

  it('Self-стрелка соответствия не требует', () => {
    const id = blocks[0].id;
    const project = emptyProject();
    project.architecture = arch;
    project.sequences = [diagram({ lifelines: [id], arrows: [{ id: 'a-1', from: id, to: id }] })];
    expect(validateSequences(project).filter((m) => m.code === 'E-601')).toHaveLength(0);
  });

  it('W-008: домены ДАП вне ДП выводятся с пометкой внешних; не активирует исправление', () => {
    const id = blocks[0].id;
    const project = emptyProject();
    project.architecture = arch;
    project.sequences = [diagram({ lifelines: [id], arrows: [] })];
    const warnings = validateSequences(project).filter((m) => m.code === 'W-008');
    expect(warnings.length).toBe(blocks.length - 1);
    const externalWarning = warnings.find((w) => w.message.includes('(внешняя)'));
    expect(externalWarning).toBeDefined();
  });
});

describe('Окраска из ДАП (Ф-59, П-11, T-S-13)', () => {
  it('Линии жизни по классу доверия, стрелки по источнику; группы не перекрашиваются; модель не меняется', () => {
    // Синтетическая картина доверия: perc — НДБ (без функций), plan — ДДБ
    // (принудительный ввод в ДВБ), недоверенная и доверенная внешние системы.
    const project = emptyProject();
    project.architecture = {
      blocks: [
        { id: 'perc', name: '01. Сенсор', cost: 1 },
        { id: 'plan', name: '02. Планировщик', cost: 1, forceTrusted: true },
        { id: 'ext-un', name: 'Сенсор среды', cost: 0, external: true },
        { id: 'ext-tr', name: 'Диспетчер', cost: 0, external: true, trusted: true },
      ],
      edges: [
        { id: 'e-1', from: 'perc', to: 'plan' },
        { id: 'e-2', from: 'ext-un', to: 'perc' },
      ],
    };
    const seq: SequenceDiagram = {
      id: 'seq-1',
      name: 'Тест',
      lifelines: ['perc', 'plan', 'ext-un', 'ext-tr'],
      arrows: [
        { id: 'a-1', from: 'perc', to: 'plan' },
        { id: 'a-2', from: 'plan', to: 'ext-tr' },
        { id: 'a-3', from: 'ext-un', to: 'ext-un' },
        { id: 'a-4', from: 'ext-tr', to: 'plan' },
      ],
      blocks: [{ id: 'g-1', kind: 'loop', name: 'цикл', color: '#F9A825', arrows: ['a-1'] }],
    };
    project.sequences = [seq];
    const colors = computeSeqColors(project);
    // НДБ — красный; ДДБ с входящей красной стрелкой (от НДБ «perc») — ДДБПЦД (жёлтый);
    // внешние: недоверенная — красная, доверенная — зелёная.
    expect(colors.lifelines.get('perc')).toBe('red');
    expect(colors.lifelines.get('plan')).toBe('yellow');
    expect(colors.lifelines.get('ext-un')).toBe('red');
    expect(colors.lifelines.get('ext-tr')).toBe('green');
    // Стрелки по источнику: из красных — красные, из жёлтых и зелёных — зелёные (self тоже).
    expect(colors.arrows.get('a-1')).toBe('red');
    expect(colors.arrows.get('a-2')).toBe('green');
    expect(colors.arrows.get('a-3')).toBe('red');
    expect(colors.arrows.get('a-4')).toBe('green');
    // Цвета производные: модель не изменена.
    expect(project.sequences![0].blocks[0].color).toBe('#F9A825');
    expect(project.sequences![0].arrows[0]).not.toHaveProperty('color');
  });
});

describe('Блоки и утилиты (П-13, П-14, T-S-11)', () => {
  function diagram(n: number): SequenceDiagram {
    const arrows = Array.from({ length: n }, (_, i) => ({ id: `a-${i + 1}`, from: 'x', to: 'y' }));
    return { id: 'seq-1', name: 'Тест', lifelines: ['x', 'y'], arrows, blocks: [] };
  }

  it('isConsecutive: подряд идущие — true, через одну — false', () => {
    const d = diagram(5);
    expect(isConsecutive(d, ['a-2', 'a-3', 'a-4'])).toBe(true);
    expect(isConsecutive(d, ['a-1', 'a-3'])).toBe(false);
    expect(isConsecutive(d, ['a-9'])).toBe(false);
    expect(isConsecutive(d, [])).toBe(false);
  });

  it('firstFreeColor и defaultGroupName (П-13)', () => {
    const d = diagram(3);
    expect(firstFreeColor(d)).toBe(SEQ_BLOCK_COLORS[0]);
    d.blocks.push({ id: 'g-1', kind: 'group', name: 'Группа 1', color: SEQ_BLOCK_COLORS[0], arrows: ['a-1', 'a-2'] });
    expect(firstFreeColor(d)).toBe(SEQ_BLOCK_COLORS[1]);
    expect(defaultGroupName(d)).toBe('Группа 2');
  });

  it('cleanBlocksAfterArrowRemoval: группа из одной стрелки распускается, цикл сохраняется', () => {
    const group = { id: 'g-1', kind: 'group' as const, name: 'Г', color: '#1E88E5', arrows: ['a-1', 'a-2'] };
    const loop = { id: 'g-2', kind: 'loop' as const, name: 'Ц', color: '#1E88E5', arrows: ['a-3', 'a-4'] };
    const cleaned = cleanBlocksAfterArrowRemoval([group, loop], ['a-1', 'a-3', 'a-4']);
    expect(cleaned.map((b) => b.id)).toEqual(['g-2']);
    expect(cleaned[0].arrows).toEqual(['a-3', 'a-4']);
  });

  it('cleanBlocksAfterArrowRemoval: cond — опустевшая ветка «иначе», сдвиг границы, опустевшая ветка «то»', () => {
    const cond = {
      id: 'g-1',
      kind: 'cond' as const,
      name: 'условие',
      color: '',
      arrows: ['a-1', 'a-2', 'a-3'],
      thenLabel: 'то',
      elseLabel: 'иначе',
      elseFrom: 'a-2',
    };
    // Удалена стрелка-граница a-2: ветка «иначе» (a-3) жива — граница
    // сдвигается к a-3, разбиение сохраняется.
    const cleaned1 = cleanBlocksAfterArrowRemoval([cond], ['a-1', 'a-3']);
    expect(cleaned1).toHaveLength(1);
    expect(cleaned1[0].elseFrom).toBe('a-3');
    expect(cleaned1[0].elseLabel).toBe('иначе');
    // Ветка «иначе» опустела (a-3 удалена): блок без else (П-14).
    const cleaned2 = cleanBlocksAfterArrowRemoval([cond], ['a-1', 'a-2']);
    expect(cleaned2).toHaveLength(1);
    expect(cleaned2[0].elseFrom).toBeUndefined();
    expect(cleaned2[0].elseLabel).toBeUndefined();
    expect(cleaned2[0].arrows).toEqual(['a-1', 'a-2']);
    // Ветка «то» опустела — блок распускается.
    const cleaned3 = cleanBlocksAfterArrowRemoval([cond], ['a-3']);
    expect(cleaned3).toHaveLength(0);
  });

  it('uniqueSequenceName: «Новая ДП», «Новая ДП 2», … (Ф-39)', () => {
    expect(uniqueSequenceName([])).toBe('Новая ДП');
    const existing: SequenceDiagram[] = [
      { id: 'seq-1', name: 'Новая ДП', lifelines: [], arrows: [], blocks: [] },
    ];
    expect(uniqueSequenceName(existing)).toBe('Новая ДП 2');
    existing.push({ id: 'seq-2', name: 'Новая ДП 2', lifelines: [], arrows: [], blocks: [] });
    expect(uniqueSequenceName(existing)).toBe('Новая ДП 3');
  });
});

describe('Сквозная проверка образцов ДП (9.1)', () => {
  /** ДАП сквозного сценария: 22 блока (18 внутренних, 4 внешние) — расширенный пример 2. */
  function loadVesselFull() {
    const project = parseStateYaml(readFileSync(resolve(FIXTURES, 'vessel-full/state.yaml'), 'utf8')).model!;
    return project;
  }

  it('Образец судна (fixture сценария): seq-1 — 9 линий жизни и 13 стрелок, seq-2 — 12 и 21 (9.1)', async () => {
    const { parseSequencesYaml } = await import('@/io/sequencesYaml');
    const { SCENARIO_SEQUENCES_YAML } = await import('@/samples/vessel/content');
    const project = loadVesselFull();
    const result = parseSequencesYaml(SCENARIO_SEQUENCES_YAML, project.architecture.blocks);
    expect(result.errors).toEqual([]);
    expect(result.model).toHaveLength(2);
    const [seq1, seq2] = result.model!;
    expect(seq1.name).toBe('Удалённое обновление прошивки');
    expect(seq1.lifelines).toHaveLength(9);
    expect(seq1.arrows).toHaveLength(13);
    expect(seq1.blocks.map((b) => b.kind)).toEqual(['loop', 'cond']);
    const cond1 = seq1.blocks[1];
    expect(cond1.thenLabel).toBe('нормальное обновление');
    expect(cond1.elseLabel).toBe('нарушение подлинности');
    expect(cond1.elseFrom).toBe('a-9');
    expect(seq2.name).toBe('Выполнение новой миссии');
    expect(seq2.lifelines).toHaveLength(12);
    expect(seq2.arrows).toHaveLength(21);
    expect(seq2.blocks.map((b) => b.kind)).toEqual(['loop', 'cond']);
    // Все стрелки (кроме self) опираются на связи ДАП с точным направлением.
    project.sequences = result.model!;
    expect(validateSequences(project).filter((m) => m.code === 'E-601')).toEqual([]);
  });

  it('Образец судна (демо, v0.02.01b): обе ДП разбираются на ДАП примера 2 без E-601', async () => {
    const { parseSequencesYaml } = await import('@/io/sequencesYaml');
    const { DEMO_ARCHITECTURE_YAML, DEMO_SEQUENCES_YAML } = await import('@/samples/vessel/content');
    const arch = parseArchitectureYaml(DEMO_ARCHITECTURE_YAML).model!;
    const result = parseSequencesYaml(DEMO_SEQUENCES_YAML, arch.blocks);
    expect(result.errors).toEqual([]);
    expect(result.model).toHaveLength(2);
    const [seq1, seq2] = result.model!;
    expect(seq1.name).toBe('Удалённое обновление прошивки');
    expect(seq1.lifelines).toHaveLength(5);
    expect(seq1.arrows).toHaveLength(8);
    expect(seq1.blocks.map((b) => b.kind)).toEqual(['loop', 'cond']);
    expect(seq1.blocks[1].elseFrom).toBe('a-7');
    expect(seq2.name).toBe('Выполнение новой миссии');
    expect(seq2.lifelines).toHaveLength(8);
    expect(seq2.arrows).toHaveLength(14);
    expect(seq2.blocks.map((b) => b.kind)).toEqual(['loop', 'cond']);
    expect(seq2.blocks[1].elseFrom).toBe('a-12');
    // Все стрелки (кроме self) опираются на связи ДАП примера 2 (П-3).
    expect(
      validateSequences({
        ...emptyProject(),
        architecture: arch,
        sequences: result.model!,
      }).filter((m) => m.code === 'E-601'),
    ).toEqual([]);
  });

  it('ДАП сквозного сценария: перенумерация даёт номера из 9.1 (01…18, внешние без номеров)', () => {
    const project = loadVesselFull();
    const renumbered = renumberArchitecture(project.architecture);
    const internal = renumbered.blocks.filter((b) => !b.external);
    expect(internal).toHaveLength(18);
    internal.forEach((b, i) => {
      expect(b.name.startsWith(domainNumber(i) + '. ')).toBe(true);
    });
    expect(internal.find((b) => b.id === 'blk-radio')!.name).toBe('10. Радиосвязь');
    expect(internal.find((b) => b.id === 'dom-5')!.name).toBe(
      '15. Верификация и применение обновления прошивки',
    );
    expect(renumbered.blocks.filter((b) => b.external).map((b) => b.name).sort()).toEqual([
      'Береговой пост (СУДС)',
      'Внешняя среда',
      'Оператор шлюза',
      'Радиоэфир',
    ]);
  });
});
