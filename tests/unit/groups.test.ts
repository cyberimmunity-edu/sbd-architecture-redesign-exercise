/**
 * Тесты логических групп (ЛГ) на ДАП — v0.02.03, Ф-70…Ф-76:
 * вложенность и глубина (Ф-71), видимость и перенос связей свёрнутых ЛГ
 * (Ф-72), нормализация цветов (П-15), геометрия рамок.
 */

import { describe, expect, it } from 'vitest';
import {
  clampDragDelta,
  computeGroupGeometry,
  computeGroupVisibility,
  depthAllowed,
  frameFromRects,
  groupAncestors,
  groupDepths,
  groupSubtree,
  isAllowedGroupColor,
  normalizeGroupColor,
  normalizeGroups,
  remapEdgesForDisplay,
  subtreeBlockIds,
  uniqueGroupName,
  unionRects,
} from '@/engine/groups';
import { LG_COLORS, LG_DEFAULT_COLOR } from '@/engine/types';
import type { Architecture, Block, DomainGroup, Edge } from '@/engine/types';

function arch(
  blocks: Block[],
  edges: Edge[],
  groups: DomainGroup[],
): Architecture {
  return { blocks, edges, groups };
}

const B = (id: string, position = { x: 0, y: 0 }): Block => ({
  id,
  name: id,
  cost: 1,
  position,
});

const G = (id: string, extra: Partial<DomainGroup> = {}): DomainGroup => ({
  id,
  name: id,
  color: LG_DEFAULT_COLOR,
  ...extra,
});

describe('Вложенность ЛГ (Ф-71)', () => {
  const groups = [
    G('lg-1'),
    G('lg-2', { parentId: 'lg-1' }),
    G('lg-3', { parentId: 'lg-2' }),
    G('lg-root2'),
  ];

  it('глубины считаются по цепочке родителей', () => {
    const depths = groupDepths(groups);
    expect(depths.get('lg-1')).toBe(0);
    expect(depths.get('lg-2')).toBe(1);
    expect(depths.get('lg-3')).toBe(2);
    expect(depths.get('lg-root2')).toBe(0);
  });

  it('глубина 3 (родитель на уровне 2) запрещена, 2 — разрешена', () => {
    expect(depthAllowed(groups, 'lg-3')).toBe(false);
    expect(depthAllowed(groups, 'lg-2')).toBe(true);
    expect(depthAllowed(groups, 'lg-1')).toBe(true);
    expect(depthAllowed(groups, null)).toBe(true);
  });

  it('предки и поддерево', () => {
    expect(groupAncestors(groups, 'lg-3')).toEqual(['lg-2', 'lg-1']);
    expect(groupSubtree(groups, 'lg-1')).toEqual(['lg-1', 'lg-2', 'lg-3']);
    expect(groupSubtree(groups, 'lg-root2')).toEqual(['lg-root2']);
  });

  it('повреждённый файл с циклом даёт глубину без зацикливания', () => {
    const cyclic = [
      G('a', { parentId: 'b' }),
      G('b', { parentId: 'a' }),
    ];
    // Цикл разрывается защитно: глубина считается до первого возврата.
    expect(groupDepths(cyclic).get('a')).toBe(1);
    expect(groupAncestors(cyclic, 'a')).toEqual(['b']);
  });
});

describe('Видимость и перенос связей (Ф-72)', () => {
  const model = arch(
    [B('a'), B('b'), B('c'), B('out')],
    [
      { id: 'e1', from: 'a', to: 'out' },
      { id: 'e2', from: 'b', to: 'out' },
      { id: 'e3', from: 'a', to: 'b' },
      { id: 'e4', from: 'c', to: 'out' },
    ],
    [G('lg-1'), G('lg-2', { parentId: 'lg-1' })],
  );

  it('развёрнутые ЛГ ничего не скрывают', () => {
    const v = computeGroupVisibility(model);
    expect(v.hiddenBlocks.size).toBe(0);
    expect(v.visibleExpanded.has('lg-1')).toBe(true);
    expect(v.visibleCollapsed.size).toBe(0);
  });

  it('свёрнутая вложенная ЛГ скрывает свои ДБ, связи ведут к её рамке', () => {
    const model2 = arch(
      model.blocks,
      model.edges,
      [G('lg-1'), G('lg-2', { parentId: 'lg-1', collapsed: true })],
    );
    // a и b — члены вложенной ЛГ (см. fixture ниже — задаём groupId).
    const withMembers = arch(
      [
        B('a'),
        B('b'),
        B('c'),
        B('out'),
      ].map((b) => (b.id === 'a' || b.id === 'b' ? { ...b, groupId: 'lg-2' } : b)),
      model.edges,
      model2.groups!,
    );
    const v = computeGroupVisibility(withMembers);
    expect(v.hiddenBlocks.has('a')).toBe(true);
    expect(v.hiddenBlocks.has('b')).toBe(true);
    expect(v.hiddenBlocks.has('out')).toBe(false);
    expect(v.visibleCollapsed.has('lg-2')).toBe(true);
    expect(v.visibleExpanded.has('lg-1')).toBe(true);
    const remapped = remapEdgesForDisplay(withMembers.edges, v);
    const e1 = remapped.find((e) => e.id === 'e1')!;
    expect(e1.from).toBe('lg-2');
    expect(e1.to).toBe('out');
    // Связь внутри одной свёрнутой ЛГ — internal и не отображается.
    const e3 = remapped.find((e) => e.id === 'e3')!;
    expect(e3.internal).toBe(true);
    // ДБ вне ЛГ не переносятся.
    const e4 = remapped.find((e) => e.id === 'e4')!;
    expect(e4.from).toBe('c');
    expect(e4.internal).toBe(false);
  });

  it('свёрнутый родитель скрывает и вложенную ЛГ: цель — ближайшая к корню свёрнутая', () => {
    const withMembers = arch(
      [
        { ...B('a'), groupId: 'lg-2' },
        { ...B('b'), groupId: 'lg-2' },
        B('c'),
        B('out'),
      ],
      [
        { id: 'e1', from: 'a', to: 'out' },
        { id: 'e2', from: 'b', to: 'out' },
        { id: 'e3', from: 'a', to: 'b' },
      ],
      [G('lg-1', { collapsed: true }), G('lg-2', { parentId: 'lg-1', collapsed: true })],
    );
    const v = computeGroupVisibility(withMembers);
    // Вложенная ЛГ под свёрнутым родителем не видна вовсе.
    expect(v.visibleCollapsed.has('lg-2')).toBe(false);
    expect(v.visibleExpanded.has('lg-2')).toBe(false);
    expect(v.collapsedTarget.get('a')).toBe('lg-1');
    const remapped = remapEdgesForDisplay(withMembers.edges, v);
    expect(remapped.find((e) => e.id === 'e1')!.from).toBe('lg-1');
    expect(remapped.find((e) => e.id === 'e3')!.internal).toBe(true);
  });
});

describe('Цвета ЛГ (П-15)', () => {
  it('палитра не содержит красный, жёлтый и зелёный доверия', () => {
    // Цвета уровней доверия: #D32F2F (красный), #F9A825 (жёлтый), #43A047 (зелёный).
    expect((LG_COLORS as readonly string[]).includes('#D32F2F')).toBe(false);
    expect((LG_COLORS as readonly string[]).includes('#F9A825')).toBe(false);
    expect((LG_COLORS as readonly string[]).includes('#43A047')).toBe(false);
    // Близкие оттенки красного/жёлтого/зелёного тоже не допускаются.
    expect(isAllowedGroupColor('#E53935')).toBe(false);
    expect(isAllowedGroupColor('#FDD835')).toBe(false);
    expect(isAllowedGroupColor('#2E7D32')).toBe(false);
    expect(isAllowedGroupColor('#FB8C00')).toBe(false);
  });

  it('недопустимый цвет приводится к серому', () => {
    expect(normalizeGroupColor('#43A047')).toBe(LG_DEFAULT_COLOR);
    expect(normalizeGroupColor('not-a-color')).toBe(LG_DEFAULT_COLOR);
    expect(normalizeGroupColor(undefined)).toBe(LG_DEFAULT_COLOR);
    expect(normalizeGroupColor('#1E88E5')).toBe('#1E88E5');
    expect(normalizeGroupColor(LG_DEFAULT_COLOR)).toBe(LG_DEFAULT_COLOR);
  });

  it('имена уникализуются', () => {
    expect(uniqueGroupName([{ ...G('lg-1'), name: 'База' }], 'База')).toBe('База (2)');
    expect(uniqueGroupName([{ ...G('lg-1'), name: 'База' }], 'Иная')).toBe('Иная');
  });
});

describe('Нормализация файла с ЛГ (W-010…W-012)', () => {
  it('неизвестные ссылки удаляются, цвет заменяется, цикл разрывается', () => {
    const model = arch(
      [
        { ...B('a'), groupId: 'no-such' },
        { ...B('b'), groupId: 'lg-1' },
      ],
      [],
      [
        { id: 'lg-1', name: 'x', color: '#43A047', parentId: 'no-such' },
        { id: 'c1', name: 'y', color: LG_DEFAULT_COLOR, parentId: 'c2' },
        { id: 'c2', name: 'z', color: LG_DEFAULT_COLOR, parentId: 'c1' },
      ],
    );
    const result = normalizeGroups(model);
    const kinds = result.issues.map((i) => i.kind).sort();
    // Два неизвестных ref: блок «a» и родитель lg-1; два cycle: c1 и c2.
    expect(kinds).toEqual(['badColor', 'cycle', 'cycle', 'unknownRef', 'unknownRef']);
    // Блок без существующей группы — несгруппирован.
    expect(result.architecture.blocks.find((b) => b.id === 'a')?.groupId).toBeUndefined();
    expect(result.architecture.blocks.find((b) => b.id === 'b')?.groupId).toBe('lg-1');
    // Цвет приведён к серому; ссылка на несуществующего родителя удалена.
    const lg1 = result.architecture.groups!.find((g) => g.id === 'lg-1')!;
    expect(lg1.color).toBe(LG_DEFAULT_COLOR);
    expect(lg1.parentId).toBeUndefined();
    // Цикл разорван: хотя бы одна связь с родителем удалена.
    const c1 = result.architecture.groups!.find((g) => g.id === 'c1')!;
    const c2 = result.architecture.groups!.find((g) => g.id === 'c2')!;
    expect(c1.parentId === undefined || c2.parentId === undefined).toBe(true);
  });

  it('корректный файл не даёт замечаний и сохраняет данные', () => {
    const model = arch(
      [{ ...B('b'), groupId: 'lg-1' }],
      [],
      [{ id: 'lg-1', name: 'Группа', color: '#1E88E5' }],
    );
    const result = normalizeGroups(model);
    expect(result.issues).toEqual([]);
    expect(result.architecture.groups).toEqual(model.groups);
  });
});

describe('Геометрия рамок ЛГ (Ф-70, Ф-72)', () => {
  it('охватывающий прямоугольник и объединение', () => {
    const cover = unionRects([
      { x: 100, y: 100, width: 100, height: 50 },
      { x: 250, y: 60, width: 80, height: 120 },
    ]);
    expect(cover).toEqual({ x: 100, y: 60, width: 230, height: 120 });
    expect(unionRects([])).toBeNull();
  });

  it('развёрнутая рамка охватывает членов с отступом; свёрнутая — блок в углу охвата', () => {
    const model = arch(
      [
        { ...B('a', { x: 100, y: 100 }), groupId: 'lg-1' },
        { ...B('b', { x: 500, y: 200 }), groupId: 'lg-1' },
        B('c', { x: 900, y: 300 }),
      ],
      [],
      [G('lg-1')],
    );
    const v = computeGroupVisibility(model);
    const geo = computeGroupGeometry(model, null, v);
    const frame = geo.get('lg-1')!;
    expect(frame.collapsed).toBe(false);
    expect(frame.empty).toBe(false);
    // Члены: a (100..400, 100..270), b (500..800, 200..370) с оценкой 300×170.
    expect(frame.rect.x).toBe(100 - 24);
    expect(frame.rect.y).toBe(100 - 24);
    expect(frame.rect.width).toBe(800 - 100 + 48);
    expect(frame.rect.height).toBe(370 - 100 + 48);

    const collapsedModel = arch(
      model.blocks,
      [],
      [G('lg-1', { collapsed: true })],
    );
    const collapsedGeo = computeGroupGeometry(collapsedModel, null, computeGroupVisibility(collapsedModel));
    const box = collapsedGeo.get('lg-1')!;
    expect(box.collapsed).toBe(true);
    expect(box.rect.x).toBe(100);
    expect(box.rect.y).toBe(100);
    expect(box.rect.width).toBe(230);
    expect(box.rect.height).toBe(46);
  });

  it('пустая ЛГ занимает якорь position; ДБ поддерева учитываются при свёртывании', () => {
    const emptyModel = arch([B('c')], [], [
      G('lg-1', { position: { x: 400, y: 500 } }),
    ]);
    const emptyGeo = computeGroupGeometry(emptyModel, null, computeGroupVisibility(emptyModel));
    const empty = emptyGeo.get('lg-1')!;
    expect(empty.empty).toBe(true);
    expect(empty.rect.x).toBe(400);
    expect(empty.rect.y).toBe(500);

    // Свёрнутая родительская ЛГ: ДБ вложенной ЛГ учитываются в якоре охвата.
    const nested = arch(
      [
        { ...B('a', { x: 200, y: 300 }), groupId: 'lg-2' },
        { ...B('b', { x: 600, y: 400 }), groupId: 'lg-1' },
      ],
      [],
      [G('lg-1', { collapsed: true }), G('lg-2', { parentId: 'lg-1' })],
    );
    expect(subtreeBlockIds(nested, 'lg-1').sort()).toEqual(['a', 'b']);
    const nestedGeo = computeGroupGeometry(nested, null, computeGroupVisibility(nested));
    // ДБ вложенной ЛГ скрыты родителем; рамка lg-2 не отображается.
    expect(nestedGeo.has('lg-2')).toBe(false);
    const box = nestedGeo.get('lg-1')!;
    expect(box.rect.x).toBe(200);
    expect(box.rect.y).toBe(300);
  });
});

describe('Перемещение ЛГ целиком и ограничение периметром (v0.02.03b, Ф-78)', () => {
  const rect = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height });

  it('frameFromRects строит охват с отступом; без прямоугольников — null', () => {
    expect(frameFromRects([], 60)).toBeNull();
    const frame = frameFromRects([rect(100, 200), rect(300, 80)], 60)!;
    expect(frame.x).toBe(40);
    expect(frame.y).toBe(20);
    // Охват 100..400 × 80..250 + отступ 60 с каждой стороны.
    expect(frame.width).toBe(420);
    expect(frame.height).toBe(290);
  });

  it('clampDragDelta не выпускает прямоугольники за рамку периметра', () => {
    const bounds = rect(40, 20, 420, 290);
    const moved = [rect(100, 200)];
    // Влево: левая грань ДБ упирается в левую грань рамки.
    expect(clampDragDelta({ x: -200, y: 0 }, moved, bounds)).toEqual({ x: -60, y: 0 });
    // Вверх: верхняя грань упирается в верхнюю грань рамки.
    expect(clampDragDelta({ x: 0, y: -500 }, moved, bounds)).toEqual({ x: 0, y: -180 });
    // Внутри рамки — приращение не меняется.
    expect(clampDragDelta({ x: 30, y: 10 }, moved, bounds)).toEqual({ x: 30, y: 10 });
  });

  it('clampDragDelta: набор прямоугольников ограничен охватом, а не одним ДБ', () => {
    const bounds = rect(40, 20, 420, 290);
    const moved = [rect(100, 80), rect(300, 200)];
    // Охват набора 100..400 × 80..250: вправо можно на 60 (до правой грани),
    // вниз — на 60; один ДБ позволил бы больше.
    expect(clampDragDelta({ x: 200, y: 200 }, moved, bounds)).toEqual({ x: 60, y: 60 });
  });

  it('clampDragDelta: без рамки (переносится вся система) приращение без ограничений', () => {
    const moved = [rect(100, 80)];
    expect(clampDragDelta({ x: 500, y: -900 }, moved, null)).toEqual({ x: 500, y: -900 });
    // Пустой набор — тоже без ограничений.
    expect(clampDragDelta({ x: 10, y: 20 }, [], { x: 0, y: 0, width: 10, height: 10 })).toEqual({
      x: 10,
      y: 20,
    });
  });
});
