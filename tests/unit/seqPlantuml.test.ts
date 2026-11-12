/**
 * Тесты подмножества PlantUML для ДП — кейсы T-S-04/T-S-05 раздела 9.2
 * ТЗ v0.02.01: объявления участников, стрелки всех поддержанных видов и
 * реверсы, self, group/loop…end, if…then…else…end (с else и без),
 * игнорируемые конструкции, W-002, E-603/E-606/E-607/E-608/E-609,
 * вложенные блоки, сериализация и круговая проверка экспорт → импорт.
 */

import { describe, expect, it } from 'vitest';
import { parseSeqPlantUml, serializeSeqPuml } from '@/io/seqPlantuml';
import { parseSequencesYaml } from '@/io/sequencesYaml';
import { parseStateYaml } from '@/io/stateFile';
import { renumberArchitecture } from '@/engine/sequence';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Block } from '@/engine/types';

const FIXTURES = resolve(__dirname, '../fixtures');

/** ДАП сквозного сценария: 22 блока, 18 внутренних с номерами 01…18 (после перенумерации). */
function dapBlocks(): Block[] {
  const project = parseStateYaml(readFileSync(resolve(FIXTURES, 'vessel-full/state.yaml'), 'utf8')).model!;
  return renumberArchitecture(project.architecture).blocks;
}

describe('Парсер PlantUML ДП: участники (Ф-54, П-9)', () => {
  const blocks = dapBlocks();

  it('participant "Полное название" as алиас; actor; <<external>>; участник вне ДАП — E-602', () => {
    const text = [
      '@startuml',
      'participant "10. Радиосвязь" as r',
      'actor "Береговой пост (СУДС)" as shore <<external>>',
      'participant "Сервер обновлений (внешняя)" as srv',
      'r -> r : ping',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    // «Сервер обновлений (внешняя)» в этой ДАП нет — участник не сопоставлен.
    expect(result.errors.map((e) => e.code)).toEqual(['E-602']);
    expect(result.errors[0].message).toContain('Сервер обновлений');
  });

  it('Матчинг по номеру и подстроке; дубликат алиаса — E-603', () => {
    const base = ['@startuml', 'participant "10. Радиосвязь" as r', 'r -> r : a'];
    const ok = parseSeqPlantUml([...base, '@enduml'].join('\n'), blocks);
    expect(ok.errors).toEqual([]);
    expect(ok.model!.lifelines).toEqual(['blk-radio']);

    const duplicate = parseSeqPlantUml(
      [
        '@startuml',
        'participant "10. Радиосвязь" as r',
        'participant "Радиосвязь" as r',
        '@enduml',
      ].join('\n'),
      blocks,
    );
    expect(duplicate.errors.map((e) => e.code)).toContain('E-603');
  });

  it('Участник вне ДАП — E-602; два участника, сопоставленных с одним доменом — E-603', () => {
    const unknown = parseSeqPlantUml(
      ['@startuml', 'participant "Инопланетянин" as x', 'x -> x : a', '@enduml'].join('\n'),
      blocks,
    );
    expect(unknown.errors.map((e) => e.code)).toContain('E-602');

    const same = parseSeqPlantUml(
      [
        '@startuml',
        'participant "10. Радиосвязь" as r1',
        'participant "Радиосвязь" as r2',
        '@enduml',
      ].join('\n'),
      blocks,
    );
    expect(same.errors.map((e) => e.code)).toContain('E-603');
  });
});

describe('Парсер PlantUML ДП: стрелки (7.2)', () => {
  const blocks = dapBlocks();
  const head = [
    '@startuml',
    'participant "Береговой пост (СУДС)" as shore',
    'participant "Радиоэфир" as air',
    'participant "10. Радиосвязь" as r',
  ];

  it('Стрелки ->, ->>, -->, реверсы <- и <--, self, подписи', () => {
    const text = [
      ...head,
      'shore -> air : команда',
      'air ->> r',
      'r --> shore : ответ',
      'shore <- r : реверс',
      'r <-- air',
      'r -> r : самообработка',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors).toEqual([]);
    const arrows = result.model!.arrows;
    expect(arrows).toHaveLength(6);
    expect(arrows[0]).toMatchObject({ from: 'ext-shore', to: 'ext-2', label: 'команда' });
    expect(arrows[1]).toMatchObject({ from: 'ext-2', to: 'blk-radio' });
    expect(arrows[2]).toMatchObject({ from: 'blk-radio', to: 'ext-shore', label: 'ответ' });
    // Реверс A <- B означает B → A.
    expect(arrows[3]).toMatchObject({ from: 'blk-radio', to: 'ext-shore' });
    expect(arrows[4]).toMatchObject({ from: 'ext-2', to: 'blk-radio' });
    expect(arrows[5]).toMatchObject({ from: 'blk-radio', to: 'blk-radio' });
  });

  it('Стрелка на необъявленного участника — E-604', () => {
    const text = [...head, 'shore -> ghost : ?','@enduml'].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors.map((e) => e.code)).toContain('E-604');
  });
});

describe('Парсер PlantUML ДП: блоки (Ф-61, П-13, П-14)', () => {
  const blocks = dapBlocks();
  const head = [
    '@startuml',
    'participant "Береговой пост (СУДС)" as shore',
    'participant "Радиоэфир" as air',
    'participant "10. Радиосвязь" as r',
    'participant "06. Подсистема OTA-обновления" as ota',
  ];

  it('group/loop с #цветом; if…then…else…end с границей ветки', () => {
    const text = [
      ...head,
      'loop до получения полного образа #F9A825',
      'r -> ota : пакеты',
      'end',
      'group подготовка #1E88E5',
      'ota -> ota : проверка',
      'ota -> ota : применение',
      'end',
      'if (подлинность подтверждена) then (нормальное обновление)',
      'ota -> ota : ввод в работу',
      'else (нарушение подлинности)',
      'ota -> ota : отклонение',
      'end',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors).toEqual([]);
    expect(result.model!.blocks).toHaveLength(3);
    const [loop, group, cond] = result.model!.blocks;
    expect(loop).toMatchObject({ kind: 'loop', name: 'до получения полного образа', color: '#F9A825' });
    expect(loop.arrows).toEqual(['a-1']);
    expect(group).toMatchObject({ kind: 'group', name: 'подготовка', color: '#1E88E5' });
    expect(group.arrows).toEqual(['a-2', 'a-3']);
    expect(cond).toMatchObject({ kind: 'cond', name: 'подлинность подтверждена', thenLabel: 'нормальное обновление', elseLabel: 'нарушение подлинности' });
    expect(cond.arrows).toEqual(['a-4', 'a-5']);
    expect(cond.elseFrom).toBe('a-5');
  });

  it('if без else: ветка «то» покрывает все стрелки блока (П-14)', () => {
    const text = [
      ...head,
      'if (проверка пройдена) then (продолжаем)',
      'ota -> ota : ввод в работу',
      'end',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors).toEqual([]);
    const cond = result.model!.blocks[0];
    expect(cond.elseFrom).toBeUndefined();
    expect(cond.thenLabel).toBe('продолжаем');
  });

  it('Вложенный блок — W-002, стрелки относятся к внешнему блоку', () => {
    const text = [
      ...head,
      'loop внешний #1E88E5',
      'r -> ota : шаг 1',
      'group вложенный',
      'ota -> ota : шаг 2',
      'end',
      'r -> ota : шаг 3',
      'end',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain('W-002');
    expect(result.model!.blocks).toHaveLength(1);
    expect(result.model!.blocks[0].arrows).toEqual(['a-1', 'a-2', 'a-3']);
  });

  it('alt вне подмножества — W-002, стрелки плоские; end его закрывает', () => {
    const text = [
      ...head,
      'alt успех',
      'r -> ota : шаг',
      'else неудача',
      'r -> ota : шаг',
      'end',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain('W-002');
    expect(result.model!.blocks).toHaveLength(0);
    expect(result.model!.arrows).toHaveLength(2);
  });

  it('else/end вне открытого блока — E-609', () => {
    const bare = parseSeqPlantUml([...head, 'else (ветка)', '@enduml'].join('\n'), blocks);
    expect(bare.errors.map((e) => e.code)).toContain('E-609');
    const bareEnd = parseSeqPlantUml([...head, 'end', '@enduml'].join('\n'), blocks);
    expect(bareEnd.errors.map((e) => e.code)).toContain('E-609');
  });
});

describe('Парсер PlantUML ДП: игнорируемые и нераспознанные строки', () => {
  const blocks = dapBlocks();
  const head = ['@startuml', 'participant "10. Радиосвязь" as r'];

  it('autonumber, title, skinparam, == … ==, activate, комментарии — молча; note/box/! — W-002', () => {
    const text = [
      ...head,
      "' комментарий",
      'autonumber',
      'title Обновление прошивки',
      'skinparam backgroundColor white',
      '== Инициализация ==',
      'activate r',
      'note left: примечание',
      'box Внешний контур',
      'participant "06. Подсистема OTA-обновления" as ota',
      'end box',
      '!include something.iuml',
      'r -> r : работа',
      'deactivate r',
      '@enduml',
    ].join('\n');
    const result = parseSeqPlantUml(text, blocks);
    expect(result.errors).toEqual([]);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('W-002');
    expect(result.model!.arrows).toHaveLength(1);
    // Блок box пропускается целиком: участник внутри него не объявлен (7.2).
    expect(result.model!.lifelines).toHaveLength(1);
  });

  it('Нераспознанная строка — E-607; отсутствие @startuml/@enduml — E-608', () => {
    const unknown = parseSeqPlantUml([...head, 'рефлексия непонятная', '@enduml'].join('\n'), blocks);
    expect(unknown.errors.map((e) => e.code)).toContain('E-607');
    const noStart = parseSeqPlantUml('participant "10. Радиосвязь" as r\n@enduml\n', blocks);
    expect(noStart.errors.map((e) => e.code)).toContain('E-608');
    const noEnd = parseSeqPlantUml('@startuml\nparticipant "10. Радиосвязь" as r\n', blocks);
    expect(noEnd.errors.map((e) => e.code)).toContain('E-608');
  });
});

describe('Сериализация PlantUML ДП и круговая проверка (T-S-05)', () => {
  const blocks = dapBlocks();

  function buildSample() {
    const yaml = readFileSync(resolve(FIXTURES, 'vessel/sequences.yaml'), 'utf8');
    const parsed = parseSequencesYaml(yaml, blocks);
    expect(parsed.errors).toEqual([]);
    return parsed.model!;
  }

  it('Экспорт: полное название с номером, алиасы-идентификаторы, <<external>>, autonumber', () => {
    const [seq1] = buildSample();
    const text = serializeSeqPuml(seq1, blocks);
    expect(text).toContain('@startuml');
    expect(text).toContain('autonumber');
    expect(text).toContain('participant "10. Радиосвязь" as blk-radio');
    expect(text).toContain('participant "Береговой пост (СУДС)" as ext-shore <<external>>');
    expect(text).toContain('loop до получения полного образа #1E88E5');
    expect(text).toContain('if (подлинность прошивки подтверждена) then (нормальное обновление)');
    expect(text).toContain('else (нарушение подлинности)');
    expect(text).toContain('blk-ota -> blk-nav : ввод прошивки в работу');
    expect(text).toContain('dom-5 -> dom-5 : проверка подписи образа');
    expect(text.trim().endsWith('@enduml')).toBe(true);
  });

  it('Круговая проверка seq-1: экспорт → импорт → полная структурная эквивалентность', () => {
    const [seq1, seq2] = buildSample();
    for (const original of [seq1, seq2]) {
      const text = serializeSeqPuml(original, blocks);
      const reparsed = parseSeqPlantUml(text, blocks);
      expect(reparsed.errors).toEqual([]);
      const model = reparsed.model!;
      expect(model.lifelines).toEqual(original.lifelines);
      expect(model.arrows).toHaveLength(original.arrows.length);
      model.arrows.forEach((arrow, index) => {
        expect(arrow.from).toBe(original.arrows[index].from);
        expect(arrow.to).toBe(original.arrows[index].to);
        expect(arrow.label).toBe(original.arrows[index].label);
      });
      expect(model.blocks).toHaveLength(original.blocks.length);
      model.blocks.forEach((block, index) => {
        expect(block.kind).toBe(original.blocks[index].kind);
        expect(block.name).toBe(original.blocks[index].name);
        expect(block.arrows).toEqual(original.blocks[index].arrows);
        expect(block.thenLabel).toBe(original.blocks[index].thenLabel);
        expect(block.elseLabel).toBe(original.blocks[index].elseLabel);
        expect(block.elseFrom).toBe(original.blocks[index].elseFrom);
      });
    }
  });

  it('Круговая проверка cond без else: экспорт не выводит else, импорт сохраняет состав', () => {
    const diagram = {
      id: 'seq-x',
      name: 'Без ветки',
      lifelines: ['blk-radio', 'blk-ota'],
      arrows: [
        { id: 'a-1', from: 'blk-radio', to: 'blk-ota', label: 'шаг' },
        { id: 'a-2', from: 'blk-ota', to: 'blk-ota', label: 'проверка' },
      ],
      blocks: [
        {
          id: 'g-1',
          kind: 'cond' as const,
          name: 'проверка пройдена',
          color: '',
          arrows: ['a-1', 'a-2'],
          thenLabel: 'продолжаем',
        },
      ],
    };
    const text = serializeSeqPuml(diagram, blocks);
    expect(text).not.toContain('else');
    const reparsed = parseSeqPlantUml(text, blocks);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.model!.blocks[0].elseFrom).toBeUndefined();
    expect(reparsed.model!.blocks[0].arrows).toEqual(['a-1', 'a-2']);
  });
});
