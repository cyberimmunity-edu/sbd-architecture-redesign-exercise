/**
 * Тесты хранилища в части режима ДП — кейсы T-S-09…T-S-12 раздела 9.2
 * ТЗ v0.02.01: «Добавить недостающие связи в ДАП» (направление, дубликаты,
 * атомарность при MAX_EDGES, одна операция истории); каскады deleteDomain,
 * замена ДАП (W-009), loadState, resetProject; блоки (создание из подряд
 * идущих, отказ для несмежных, автоматический выход, роспуск группы,
 * сохранение цикла, ветки условного блока); лимиты Ф-58 (П-12).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useSkibStore } from '@/store/projectStore';
import { MAX_EDGES, MAX_LIFELINES, MAX_SEQ_ARROWS, MAX_SEQ_BLOCKS, MAX_SEQUENCES } from '@/engine/types';
import { parseStateYaml } from '@/io/stateFile';
import { renumberArchitecture } from '@/engine/sequence';

const FIXTURES = resolve(__dirname, '../fixtures');

function loadVesselFull() {
  return parseStateYaml(readFileSync(resolve(FIXTURES, 'vessel-full/state.yaml'), 'utf8')).model!;
}

function setupVessel() {
  const project = loadVesselFull();
  useSkibStore.getState().loadState({
    ...project,
    architecture: renumberArchitecture(project.architecture),
  });
  return useSkibStore.getState().project;
}

describe('Хранилище ДП: создание, линии жизни, стрелки', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
    setupVessel();
  });

  it('Создание ДП: имя уникализируется «Новая ДП», «Новая ДП 2»; лимит 20 (Ф-39, Ф-58)', () => {
    const first = useSkibStore.getState().createSequence();
    expect(first).toBe('seq-1');
    const second = useSkibStore.getState().createSequence();
    expect(useSkibStore.getState().project.sequences!.map((s) => s.name)).toEqual([
      'Новая ДП',
      'Новая ДП 2',
    ]);
    // Наполнение до лимита.
    while (useSkibStore.getState().createSequence() !== null) {
      /* заполняем */
    }
    expect(useSkibStore.getState().project.sequences).toHaveLength(MAX_SEQUENCES);
    expect(useSkibStore.getState().createSequence()).toBeNull();
    void second;
  });

  it('Линии жизни: добавление, повтор блокируется, лимит 24 (П-12, Ф-58); удаление со стрелками', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    let blocks = useSkibStore.getState().project.architecture.blocks;
    // ДАП сценария содержит 22 блока — полное множество помещается в лимит 24 (П-12).
    for (const block of blocks) {
      expect(useSkibStore.getState().addLifeline(seqId, block.id)).not.toBeNull();
    }
    expect(useSkibStore.getState().addLifeline(seqId, blocks[0].id)).toBeNull(); // повтор
    // Лимит линий жизни: ДАП с 26 доменами — 25-я линия жизни не добавляется.
    const many = Array.from({ length: 26 }, (_, i) => ({
      id: `blk-m${i + 1}`,
      name: `Домен ${i + 1}`,
      cost: 1,
    }));
    useSkibStore.getState().loadState({
      ...useSkibStore.getState().project,
      architecture: { blocks: many, edges: [] },
      sequences: [],
    });
    const seq2 = useSkibStore.getState().createSequence()!;
    blocks = useSkibStore.getState().project.architecture.blocks;
    for (let i = 0; i < MAX_LIFELINES; i++) {
      expect(useSkibStore.getState().addLifeline(seq2, blocks[i].id)).not.toBeNull();
    }
    // 25-й домен не помещается — полное множество 26 не влезает в одну ДП (П-12).
    expect(useSkibStore.getState().addLifeline(seq2, blocks[MAX_LIFELINES].id)).toBeNull();
    // Стрелка и её удаление вместе с линией жизни.
    useSkibStore.getState().addSeqArrow(seqId, blocks[0].id, blocks[1].id);
    useSkibStore.getState().removeLifeline(seqId, blocks[1].id);
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.lifelines).toHaveLength(MAX_LIFELINES - 1);
    expect(seq.arrows).toHaveLength(0);
    // Одна операция истории: Ctrl+Z возвращает линию жизни и стрелку.
    useSkibStore.getState().undo();
    const restored = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(restored.lifelines).toHaveLength(MAX_LIFELINES);
    expect(restored.arrows).toHaveLength(1);
  });

  it('Вставка линии жизни в зазор между другими (v0.02.02): addLifeline с индексом', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    const blocks = useSkibStore.getState().project.architecture.blocks;
    const [a, b, c, d] = blocks;
    useSkibStore.getState().addLifeline(seqId, a.id);
    useSkibStore.getState().addLifeline(seqId, c.id);
    // Вставка между a и c — индекс 1 (зазор между линиями 0 и 1).
    expect(useSkibStore.getState().addLifeline(seqId, b.id, 1)).not.toBeNull();
    // Вставка в начало — индекс 0.
    expect(useSkibStore.getState().addLifeline(seqId, d.id, 0)).not.toBeNull();
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.lifelines).toEqual([d.id, a.id, b.id, c.id]);
    // Повторное добавление блокируется независимо от индекса.
    expect(useSkibStore.getState().addLifeline(seqId, a.id, 99)).toBeNull();
    // Некорректный индекс (за границами) — вставка в конец.
    const e = blocks[4];
    expect(useSkibStore.getState().addLifeline(seqId, e.id, 42)).not.toBeNull();
    expect(
      useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!.lifelines,
    ).toEqual([d.id, a.id, b.id, c.id, e.id]);
    // Вставка — одна операция истории: Ctrl+Z убирает последнюю линию жизни.
    useSkibStore.getState().undo();
    const undone = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(undone.lifelines).toEqual([d.id, a.id, b.id, c.id]);
  });

  it('Стрелки: лимит 100, self-стрелка, подпись до 60 символов (Ф-42…Ф-45, П-5)', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    const [a, b] = useSkibStore.getState().project.architecture.blocks;
    useSkibStore.getState().addLifeline(seqId, a.id);
    useSkibStore.getState().addLifeline(seqId, b.id);
    for (let i = 0; i < MAX_SEQ_ARROWS; i++) {
      useSkibStore.getState().addSeqArrow(seqId, a.id, b.id);
    }
    expect(useSkibStore.getState().project.sequences![0].arrows).toHaveLength(MAX_SEQ_ARROWS);
    expect(useSkibStore.getState().addSeqArrow(seqId, a.id, b.id)).toBeNull();
    // Self-стрелка: лимит достигнут — но на пустой ДП она допустима.
    const seq2 = useSkibStore.getState().createSequence()!;
    useSkibStore.getState().addLifeline(seq2, a.id);
    const selfId = useSkibStore.getState().addSeqArrow(seq2, a.id, a.id);
    expect(selfId).not.toBeNull();
    useSkibStore.getState().updateSeqArrow(seq2, selfId!, 'x'.repeat(70));
    const stored = useSkibStore.getState().project.sequences!.find((s) => s.id === seq2)!;
    expect(stored.arrows[0].label).toBeUndefined(); // длиннее 60 — не применено
    useSkibStore.getState().updateSeqArrow(seq2, selfId!, 'короткая подпись');
    expect(
      useSkibStore.getState().project.sequences!.find((s) => s.id === seq2)!.arrows[0].label,
    ).toBe('короткая подпись');
  });

  it('Перенос стрелки по вертикали меняет порядок; не пишется в историю (Ф-44, П-7)', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    const blocks = useSkibStore.getState().project.architecture.blocks;
    useSkibStore.getState().addLifeline(seqId, blocks[0].id);
    useSkibStore.getState().addLifeline(seqId, blocks[1].id);
    for (let i = 0; i < 4; i++) {
      useSkibStore.getState().addSeqArrow(seqId, blocks[0].id, blocks[1].id);
    }
    const pastBefore = useSkibStore.getState().past.length;
    const arrows = useSkibStore.getState().project.sequences![0].arrows;
    // Перенос на визуальную позицию 3 (считая с 0): индекс до удаления — 4.
    useSkibStore.getState().moveSeqArrow(seqId, arrows[0].id, 4);
    const after = useSkibStore.getState().project.sequences![0].arrows;
    expect(after[3].id).toBe(arrows[0].id);
    expect(useSkibStore.getState().past.length).toBe(pastBefore);
  });
});

describe('Хранилище ДП: блоки (П-13, П-14, T-S-11)', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
    setupVessel();
  });

  function seqWithArrows(n: number) {
    const seqId = useSkibStore.getState().createSequence()!;
    const blocks = useSkibStore.getState().project.architecture.blocks;
    useSkibStore.getState().addLifeline(seqId, blocks[0].id);
    useSkibStore.getState().addLifeline(seqId, blocks[1].id);
    for (let i = 0; i < n; i++) {
      useSkibStore.getState().addSeqArrow(seqId, blocks[0].id, blocks[1].id);
    }
    const arrows = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!.arrows;
    return { seqId, arrows: arrows.map((a) => a.id) };
  }

  it('Группа из подряд идущих — создаётся; из несмежных — отказ', () => {
    const { seqId, arrows } = seqWithArrows(4);
    const ok = useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[1], arrows[2]]);
    expect(ok.ok).toBe(true);
    const fail = useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[0], arrows[3]]);
    expect(fail.ok).toBe(false);
    expect(fail.error).toContain('подряд');
    const single = useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[0]]);
    expect(single.ok).toBe(false);
    const loopSingle = useSkibStore.getState().createSeqBlock(seqId, 'loop', [arrows[0]]);
    expect(loopSingle.ok).toBe(true); // цикл из одной стрелки допустим
  });

  it('Лимит 10 блоков; стрелка не входит в два блока', () => {
    const { seqId, arrows } = seqWithArrows(MAX_SEQ_BLOCKS * 2);
    // Блоки по 2 стрелки: 10 блоков заполняют 20 стрелок.
    for (let i = 0; i < MAX_SEQ_BLOCKS; i++) {
      const result = useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[i * 2], arrows[i * 2 + 1]]);
      expect(result.ok).toBe(true);
    }
    expect(useSkibStore.getState().createSeqBlock(seqId, 'loop', [arrows[arrows.length - 1]]).ok).toBe(false);
  });

  it('Перенос за границу блока — автоматический выход; группа из одной стрелки распускается', () => {
    const { seqId, arrows } = seqWithArrows(4);
    useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[0], arrows[1]]);
    // Перенос a-1 (первая) в конец: группа сжимается до одной стрелки и распускается.
    useSkibStore.getState().moveSeqArrow(seqId, arrows[0], 4);
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.blocks).toHaveLength(0);
    expect(seq.arrows.map((a) => a.id)).toEqual([arrows[1], arrows[2], arrows[3], arrows[0]]);
  });

  it('Цикл из одной стрелки сохраняется при переносе соседей', () => {
    const { seqId, arrows } = seqWithArrows(3);
    useSkibStore.getState().createSeqBlock(seqId, 'loop', [arrows[1]]);
    useSkibStore.getState().moveSeqArrow(seqId, arrows[0], 3);
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.blocks).toHaveLength(1);
    expect(seq.blocks[0].arrows).toEqual([arrows[1]]);
  });

  it('Условный блок: обе ветки обязательны в редакторе; else-граница валидируется', () => {
    const { seqId, arrows } = seqWithArrows(4);
    // elseIndex = 0 — ветка «то» пуста: отказ.
    const bad = useSkibStore.getState().createSeqBlock(seqId, 'cond', [arrows[0], arrows[1]], {
      name: 'условие',
      thenLabel: 'то',
      elseLabel: 'иначе',
      elseIndex: 0,
    });
    expect(bad.ok).toBe(false);
    // Пустые подписи веток: отказ.
    const noLabels = useSkibStore.getState().createSeqBlock(seqId, 'cond', [arrows[0], arrows[1]], {
      name: 'условие',
      thenLabel: '',
      elseLabel: 'иначе',
      elseIndex: 1,
    });
    expect(noLabels.ok).toBe(false);
    // Корректный условный блок.
    const ok = useSkibStore.getState().createSeqBlock(seqId, 'cond', [arrows[0], arrows[1], arrows[2]], {
      name: 'условие',
      thenLabel: 'то',
      elseLabel: 'иначе',
      elseIndex: 2,
    });
    expect(ok.ok).toBe(true);
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.blocks[0].elseFrom).toBe(arrows[2]);
    // «Покинуть блок» для стрелки ветки «иначе»: блок остаётся без else.
    useSkibStore.getState().leaveSeqBlock(seqId, seq.blocks[0].id, arrows[2]);
    const after = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(after.blocks[0].elseFrom).toBeUndefined();
    expect(after.blocks[0].arrows).toEqual([arrows[0], arrows[1]]);
    // «Покинуть блок» для стрелки ветки «то» (первой из двух): блок остаётся.
    useSkibStore.getState().leaveSeqBlock(seqId, after.blocks[0].id, arrows[0]);
    const final = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(final.blocks[0].arrows).toEqual([arrows[1]]);
  });

  it('Разгруппировать и «Удалить блок со стрелками»', () => {
    const { seqId, arrows } = seqWithArrows(4);
    const created = useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[0], arrows[1]]);
    useSkibStore.getState().ungroupSeqBlock(seqId, created.id!);
    expect(useSkibStore.getState().project.sequences![0].blocks).toHaveLength(0);
    expect(useSkibStore.getState().project.sequences![0].arrows).toHaveLength(4);
    const created2 = useSkibStore.getState().createSeqBlock(seqId, 'group', [arrows[0], arrows[1]]);
    useSkibStore.getState().deleteSeqBlockWithArrows(seqId, created2.id!);
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.arrows).toHaveLength(2);
    expect(seq.arrows.map((a) => a.id)).toEqual([arrows[2], arrows[3]]);
  });
});

describe('Хранилище ДП: «Добавить недостающие связи в ДАП» (Ф-50, П-4, T-S-09)', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
    setupVessel();
  });

  it('Добавляет связи с направлением из стрелки ДП, без подписей; дубликаты пропускаются', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    const radio = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'blk-radio')!;
    const ota = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'blk-ota')!;
    useSkibStore.getState().addLifeline(seqId, radio.id);
    useSkibStore.getState().addLifeline(seqId, ota.id);
    // Реверс существующей связи radio → ota: ota → radio — расхождение.
    const edgeBefore = useSkibStore.getState().project.architecture.edges.filter(
      (e) => e.from === ota.id && e.to === radio.id,
    );
    expect(edgeBefore).toHaveLength(0);
    const arrowId = useSkibStore.getState().addSeqArrow(seqId, ota.id, radio.id)!;
    useSkibStore.getState().updateSeqArrow(seqId, arrowId, 'реверс с подписью');
    const result = useSkibStore.getState().addMissingEdgesToDap();
    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);
    const edges = useSkibStore.getState().project.architecture.edges;
    const added = edges.filter((e) => e.from === ota.id && e.to === radio.id);
    expect(added).toHaveLength(1);
    expect(added[0].label).toBeUndefined(); // подписи ДП не переносятся
    // Повторное применение — дубликаты пропускаются.
    expect(useSkibStore.getState().addMissingEdgesToDap()).toMatchObject({ ok: true, added: 0 });
    // Одна операция истории: Ctrl+Z отменяет добавленную связь.
    useSkibStore.getState().undo();
    expect(
      useSkibStore.getState().project.architecture.edges.filter((e) => e.from === ota.id && e.to === radio.id),
    ).toHaveLength(0);
  });

  it('Атомарность: при нехватке MAX_EDGES операция целиком отклоняется', () => {
    const project = useSkibStore.getState().project;
    const blocks = project.architecture.blocks;
    // Заполняем лимит связей циклической парой несуществующих направлений.
    const edges = [...project.architecture.edges];
    const ids = new Set(edges.map((e) => e.id));
    let n = 1;
    while (edges.length < MAX_EDGES) {
      const id = `e-fill-${n}`;
      n += 1;
      ids.add(id);
      edges.push({ id, from: blocks[0].id, to: blocks[1].id });
    }
    useSkibStore.setState({
      project: { ...project, architecture: { ...project.architecture, edges } },
    });
    const seqId = useSkibStore.getState().createSequence()!;
    useSkibStore.getState().addLifeline(seqId, blocks[2].id);
    useSkibStore.getState().addLifeline(seqId, blocks[3].id);
    useSkibStore.getState().addSeqArrow(seqId, blocks[2].id, blocks[3].id);
    const result = useSkibStore.getState().addMissingEdgesToDap();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
    expect(result.error).toContain('отклонена целиком');
    // Модель не изменилась.
    expect(useSkibStore.getState().project.architecture.edges).toHaveLength(MAX_EDGES);
  });
});

describe('Хранилище ДП: каскады и совместимость (5.6, W-009, T-S-10)', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
  });

  it('loadState: sequences заменяются данными файла; отсутствие секции — пусто', () => {
    const withSeq = setupVessel();
    expect(withSeq.sequences).toEqual([]);
    // Замена на файл без секции — sequences пусты.
    const robot = JSON.parse(JSON.stringify(useSkibStore.getState().project));
    useSkibStore.getState().loadState({ ...robot, sequences: undefined });
    expect(useSkibStore.getState().project.sequences).toEqual([]);
  });

  it('Удаление домена на ДАП: каскад в той же операции истории (линии жизни, стрелки, блоки)', () => {
    setupVessel();
    const seqId = useSkibStore.getState().createSequence()!;
    const radio = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'blk-radio')!;
    const ota = useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'blk-ota')!;
    useSkibStore.getState().addLifeline(seqId, radio.id);
    useSkibStore.getState().addLifeline(seqId, ota.id);
    useSkibStore.getState().addSeqArrow(seqId, radio.id, ota.id);
    const groupId = useSkibStore.getState().createSeqBlock(seqId, 'loop', [
      useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!.arrows[0].id,
    ]).id!;
    expect(useSkibStore.getState().project.sequences![0].blocks).toHaveLength(1);
    useSkibStore.getState().deleteDomain(radio.id);
    const seq = useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq.lifelines).toEqual([ota.id]);
    expect(seq.arrows).toHaveLength(0);
    expect(seq.blocks).toHaveLength(0);
    void groupId;
    // Один шаг истории: Ctrl+Z возвращает и домен, и содержимое ДП.
    useSkibStore.getState().undo();
    expect(useSkibStore.getState().project.architecture.blocks.some((b) => b.id === radio.id)).toBe(true);
    expect(useSkibStore.getState().project.sequences![0].lifelines).toEqual([radio.id, ota.id]);
    expect(useSkibStore.getState().project.sequences![0].arrows).toHaveLength(1);
    // После удаления внутреннего домена остальные перенумерованы без разрывов (Ф-32).
  });

  it('Замена ДАП: каскад и счётчики для W-009', () => {
    setupVessel();
    const seqId = useSkibStore.getState().createSequence()!;
    const blocks = useSkibStore.getState().project.architecture.blocks;
    useSkibStore.getState().addLifeline(seqId, blocks[0].id);
    useSkibStore.getState().addLifeline(seqId, blocks[1].id);
    useSkibStore.getState().addSeqArrow(seqId, blocks[0].id, blocks[1].id);
    // Новая архитектура без этих доменов.
    const cascade = useSkibStore.getState().loadArchitecture(
      { blocks: [{ id: 'dom-other', name: 'Другой', cost: 1 }], edges: [] },
      'architecture.yaml',
    );
    expect(cascade.removedLifelines).toBe(2);
    expect(cascade.removedArrows).toBe(1);
    expect(useSkibStore.getState().project.sequences![0]).toMatchObject({
      lifelines: [],
      arrows: [],
    });
  });

  it('resetProject очищает sequences', () => {
    setupVessel();
    useSkibStore.getState().createSequence();
    expect(useSkibStore.getState().project.sequences).toHaveLength(1);
    useSkibStore.getState().resetProject();
    expect(useSkibStore.getState().project.sequences).toEqual([]);
  });

  it('Переименование домена нормализует префикс; внешняя система — без номера (Ф-31, Ф-35)', () => {
    setupVessel();
    useSkibStore.getState().updateDomain('blk-radio', { name: '07. Связь с берегом' });
    expect(
      useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'blk-radio')!.name,
    ).toBe('10. Связь с берегом');
    useSkibStore.getState().updateDomain('ext-shore', { name: '01. Береговой пост' });
    expect(
      useSkibStore.getState().project.architecture.blocks.find((b) => b.id === 'ext-shore')!.name,
    ).toBe('Береговой пост');
  });
});

describe('Хранилище ДП v0.02.01b: имя создания, очистка, цели безопасности', () => {
  beforeEach(() => {
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [], validation: null, selection: null });
    // Детерминированный мини-проект: blk-a, blk-b, внешняя ext-x;
    // g-1 — обязательный механизм в blk-a и необязательный в blk-b;
    // g-2 — без размещённых механизмов.
    useSkibStore.getState().loadState({
      architecture: {
        blocks: [
          { id: 'blk-a', name: '01. Домен А', cost: 1 },
          { id: 'blk-b', name: '02. Домен Б', cost: 1 },
          { id: 'ext-x', name: 'Внешняя система', cost: 1, external: true },
        ],
        edges: [],
      },
      security: {
        goals: [
          { id: 'g-1', name: 'Цель качества', description: 'инвариант качества' },
          { id: 'g-2', name: 'Цель без механизмов' },
        ],
        functions: [
          { id: 'fn-1', name: 'Механизм 1', cost: 2, implements: [{ goal: 'g-1', weight: 'mandatory' }] },
          { id: 'fn-2', name: 'Механизм 2', cost: 1, implements: [{ goal: 'g-1', weight: 'optional' }] },
        ],
        assumptions: [],
      },
      assignments: [
        { function: 'fn-1', block: 'blk-a' },
        { function: 'fn-2', block: 'blk-b' },
      ],
      meta: { source: 'test' },
      sequences: [],
    });
  });

  it('createSequence(name): имя задаётся явно и уникализируется; длинное имя обрезается до 60 (Ф-65, Ф-58)', () => {
    expect(useSkibStore.getState().createSequence('Цель качества')).toBe('seq-1');
    expect(useSkibStore.getState().createSequence('  Цель качества  ')).toBe('seq-2');
    expect(useSkibStore.getState().project.sequences!.map((s) => s.name)).toEqual([
      'Цель качества',
      'Цель качества 2',
    ]);
    const long = useSkibStore.getState().createSequence('Ж'.repeat(80));
    expect(long).toBe('seq-3');
    expect(useSkibStore.getState().project.sequences![2].name).toHaveLength(60);
    // Без имени — прежнее поведение.
    expect(useSkibStore.getState().createSequence()).toBe('seq-4');
    expect(useSkibStore.getState().project.sequences![3].name).toBe('Новая ДП');
  });

  it('clearSequence: содержимое удаляется целиком одним шагом истории; пустая ДП не создаёт шага (Ф-64)', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    useSkibStore.getState().addLifeline(seqId, 'blk-a');
    useSkibStore.getState().addLifeline(seqId, 'blk-b');
    useSkibStore.getState().addSeqArrow(seqId, 'blk-a', 'blk-b');
    const seq = () => useSkibStore.getState().project.sequences!.find((s) => s.id === seqId)!;
    expect(seq().arrows).toHaveLength(1);
    const historyBefore = useSkibStore.getState().past.length;
    useSkibStore.getState().clearSequence(seqId);
    expect(seq().lifelines).toEqual([]);
    expect(seq().arrows).toEqual([]);
    expect(seq().blocks).toEqual([]);
    // Одна операция истории: Ctrl+Z возвращает всё содержимое.
    useSkibStore.getState().undo();
    expect(seq().lifelines).toEqual(['blk-a', 'blk-b']);
    expect(seq().arrows).toHaveLength(1);
    // Пустая ДП: очистка не пишет в историю.
    const emptyId = useSkibStore.getState().createSequence()!;
    const pastBeforeEmptyClear = useSkibStore.getState().past.length;
    useSkibStore.getState().clearSequence(emptyId);
    expect(useSkibStore.getState().past.length).toBe(pastBeforeEmptyClear);
    void historyBefore;
  });

  it('createSequenceFromGoal: ДП с именем ЦБ и критичными доменами; один шаг истории (Ф-65)', () => {
    const result = useSkibStore.getState().createSequenceFromGoal('g-1');
    expect(result.ok).toBe(true);
    const seq = useSkibStore.getState().project.sequences![0];
    expect(seq.name).toBe('Цель качества');
    // Только обязательные механизмы: критичный домен — blk-a (blk-b — необязательный).
    expect(seq.lifelines).toEqual(['blk-a']);
    expect(result.added).toBe(1);
    // Один шаг истории: Ctrl+Z отменяет и ДП, и линии жизни.
    useSkibStore.getState().undo();
    expect(useSkibStore.getState().project.sequences).toEqual([]);
    // Цель без размещённых обязательных механизмов — ДП без линий жизни.
    const empty = useSkibStore.getState().createSequenceFromGoal('g-2');
    expect(empty.ok).toBe(true);
    expect(empty.added).toBe(0);
    expect(useSkibStore.getState().project.sequences![0].name).toBe('Цель без механизмов');
    // Лимит ДП: 19 существующих + новая — 20-я создаётся, 21-я нет (Ф-58).
    useSkibStore.getState().resetProject();
    useSkibStore.setState({ past: [], future: [] });
    useSkibStore.getState().loadState({
      architecture: { blocks: [{ id: 'blk-a', name: '01. Домен А', cost: 1 }], edges: [] },
      security: { goals: [{ id: 'g-1', name: 'Цель' }], functions: [], assumptions: [] },
      assignments: [],
      meta: { source: 'test' },
      sequences: [],
    });
    while (useSkibStore.getState().createSequence() !== null) { /* до лимита */ }
    const exceeded = useSkibStore.getState().createSequenceFromGoal('g-1');
    expect(exceeded.ok).toBe(false);
    expect(exceeded.error).toContain('лимит ДП');
  });

  it('addGoalDomains: критичные домены добавляются в существующую ДП; дубликаты пропускаются (Ф-65)', () => {
    const seqId = useSkibStore.getState().createSequence()!;
    const first = useSkibStore.getState().addGoalDomains(seqId, 'g-1');
    expect(first.ok).toBe(true);
    expect(first.added).toBe(1);
    expect(useSkibStore.getState().project.sequences![0].lifelines).toEqual(['blk-a']);
    // Повторное набрасывание той же ЦБ ничего не добавляет.
    const second = useSkibStore.getState().addGoalDomains(seqId, 'g-1');
    expect(second.ok).toBe(true);
    expect(second.added).toBe(0);
    // Лимит линий жизни: заполнить до 24 — добавление отклоняется.
    const many = Array.from({ length: 24 }, (_, i) => ({
      id: `blk-m${i + 1}`,
      name: `Домен ${i + 1}`,
      cost: 1,
    }));
    useSkibStore.getState().loadState({
      architecture: {
        blocks: [...many, { id: 'blk-a', name: '01. Домен А', cost: 1 }],
        edges: [],
      },
      security: {
        goals: [{ id: 'g-1', name: 'Цель' }],
        functions: [
          { id: 'fn-1', name: 'Механизм', cost: 1, implements: [{ goal: 'g-1', weight: 'mandatory' }] },
        ],
        assumptions: [],
      },
      assignments: [{ function: 'fn-1', block: 'blk-a' }],
      meta: { source: 'test' },
      sequences: [],
    });
    const full = useSkibStore.getState().createSequence()!;
    for (const block of many) {
      useSkibStore.getState().addLifeline(full, block.id);
    }
    const denied = useSkibStore.getState().addGoalDomains(full, 'g-1');
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('лимит линий жизни');
  });
});
