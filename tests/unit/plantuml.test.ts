/**
 * Тесты PlantUML — кейсы T-U-01…T-U-06 раздела 11.2 ТЗ (раздел 6.3).
 */

import { describe, expect, it } from 'vitest';
import { parsePlantUml, serializePuml } from '@/io/plantuml';

describe('PlantUML (раздел 6.3, решение D7)', () => {
  const demoPuml = `@startuml
[Консоль оператора] <<cost: 2>>
[Ядро системы] <<cost: 4>>
[Хранилище] <<cost: 2>>
[Аудит] <<cost: 3>>
[Внешний SIEM] <<cost: 1>>
[Консоль оператора] --> [Ядро системы] : команды
[Ядро системы] --> [Хранилище] : данные
[Ядро системы] --> [Аудит] : события
[Аудит] --> [Внешний SIEM] : журналы
@enduml
`;

  it('T-U-01: базовый разбор — блоки и стрелки распознаны', () => {
    const result = parsePlantUml(demoPuml);
    expect(result.errors).toEqual([]);
    expect(result.model!.blocks).toHaveLength(5);
    expect(result.model!.edges).toHaveLength(4);
    expect(result.model!.blocks.map((b) => b.name)).toEqual([
      'Консоль оператора',
      'Ядро системы',
      'Хранилище',
      'Аудит',
      'Внешний SIEM',
    ]);
  });

  it('T-U-02: стереотип <<cost: 5>> задаёт C_блока = 5', () => {
    const result = parsePlantUml('@startuml\n[Сервер] <<cost: 5>>\n@enduml\n');
    expect(result.model!.blocks[0].cost).toBe(5);
  });

  it('T-U-03: подпись стрелки сохраняется', () => {
    const result = parsePlantUml(
      '@startuml\n[A] <<cost: 1>>\n[B] <<cost: 1>>\n[A] --> [B] : команда\n@enduml\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.model!.edges[0].label).toBe('команда');
  });

  it('T-U-04: некорректная строка — E-301 с номером строки', () => {
    const result = parsePlantUml(
      '@startuml\n[A] <<cost: 1>>\ncomponent Foo\n@enduml\n',
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E-301');
    expect(result.errors[0].line).toBe(3);
  });

  it('T-U-05: дубликат имени компонента — E-302', () => {
    const result = parsePlantUml(
      '@startuml\n[A] <<cost: 1>>\n[A] <<cost: 2>>\n@enduml\n',
    );
    expect(result.errors.some((e) => e.code === 'E-302')).toBe(true);
  });

  it('T-U-06: notes и skinparam пропускаются с W-002, данные разобраны', () => {
    const text = [
      '@startuml',
      'skinparam backgroundColor white',
      'note right of [A] : пояснение',
      '[A] <<cost: 2>>',
      '[B] <<cost: 3>>',
      'package "Группа" {',
      '  title Диаграмма',
      '}',
      '[A] --> [B] : поток',
      'note bottom',
      '  текст',
      'end note',
      '@enduml',
    ].join('\n');
    const result = parsePlantUml(text);
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((w) => w.code === 'W-002')).toHaveLength(3); // skinparam, note, package — по первому вхождению каждого типа (title внутри пропущенного package не учитывается)
    expect(result.model!.blocks).toHaveLength(2);
    expect(result.model!.edges).toHaveLength(1);
  });

  it('E-303: стрелка на необъявленный компонент', () => {
    const result = parsePlantUml(
      '@startuml\n[A] <<cost: 1>>\n[A] --> [Призрак]\n@enduml\n',
    );
    expect(result.errors.some((e) => e.code === 'E-303')).toBe(true);
  });

  it('E-304: отсутствие @startuml или @enduml', () => {
    const noStart = parsePlantUml('[A] <<cost: 1>>\n@enduml\n');
    expect(noStart.errors.some((e) => e.code === 'E-304')).toBe(true);
    const noEnd = parsePlantUml('@startuml\n[A] <<cost: 1>>\n');
    expect(noEnd.errors.some((e) => e.code === 'E-304')).toBe(true);
  });

  it('W-005: компонент без стереотипа получает C_блока = 0 с предупреждением', () => {
    const result = parsePlantUml('@startuml\n[A]\n@enduml\n');
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'W-005')).toBe(true);
    expect(result.model!.blocks[0].cost).toBe(0);
  });

  it('E-104: петля компонента на себя через общую валидацию', () => {
    const result = parsePlantUml('@startuml\n[A] <<cost: 1>>\n[A] --> [A]\n@enduml\n');
    expect(result.errors.some((e) => e.code === 'E-104')).toBe(true);
  });

  it('Round-trip: экспорт PlantUML разбирается обратно эквивалентно (6.6)', () => {
    const first = parsePlantUml(demoPuml);
    expect(first.errors).toEqual([]);
    const second = parsePlantUml(serializePuml(first.model!));
    expect(second.errors).toEqual([]);
    expect(second.model!.blocks.map((b) => [b.name, b.cost])).toEqual(
      first.model!.blocks.map((b) => [b.name, b.cost]),
    );
    expect(second.model!.edges.map((e) => [e.from, e.to, e.label ?? null])).toEqual(
      first.model!.edges.map((e) => [e.from, e.to, e.label ?? null]),
    );
  });

  it('Стрелка "->" также поддерживается грамматикой подмножества', () => {
    const result = parsePlantUml('@startuml\n[A] <<cost: 1>>\n[B] <<cost: 1>>\n[A] -> [B]\n@enduml\n');
    expect(result.errors).toEqual([]);
    expect(result.model!.edges).toHaveLength(1);
  });

  it('3.5 v0.01.01: стереотипы <<external>> и <<external-trusted>> задают внешние системы', () => {
    const result = parsePlantUml(
      [
        '@startuml',
        '[Робот] <<cost: 3>>',
        '[Диспетчер] <<external-trusted>>',
        '[Станция] <<external>>',
        '[Диспетчер] --> [Робот] : команды',
        '[Робот] --> [Станция] : телеметрия',
        '@enduml',
      ].join('\n'),
    );
    expect(result.errors).toEqual([]);
    const dispatcher = result.model!.blocks.find((b) => b.name === 'Диспетчер')!;
    expect(dispatcher).toMatchObject({ external: true, trusted: true, cost: 0 });
    const station = result.model!.blocks.find((b) => b.name === 'Станция')!;
    expect(station.external).toBe(true);
    expect(station.trusted).toBeFalsy();
    expect(station.cost).toBe(0);
  });

  it('3.5 v0.01.01: экспорт внешних систем не содержит стереотипа стоимости', () => {
    const model = {
      blocks: [
        { id: 'a', name: 'Робот', cost: 3 },
        { id: 'ext-1', name: 'Диспетчер', cost: 0, external: true, trusted: true },
        { id: 'ext-2', name: 'Станция', cost: 0, external: true },
      ],
      edges: [],
    };
    const text = serializePuml(model);
    expect(text).toContain('[Робот] <<cost: 3>>');
    expect(text).toContain('[Диспетчер] <<external-trusted>>');
    expect(text).toContain('[Станция] <<external>>');
    expect(text).not.toContain('<<cost: 0>>');
  });

  it('3.5 v0.01.01: неизвестный стереотип пропускается с W-002, компонент разобран', () => {
    const result = parsePlantUml('@startuml\n[A] <<cost: 1>> <<vendor: foo>>\n@enduml\n');
    expect(result.errors).toEqual([]);
    expect(result.model!.blocks[0].cost).toBe(1);
    expect(result.warnings.some((w) => w.code === 'W-002' && w.message.includes('vendor'))).toBe(true);
  });
});
