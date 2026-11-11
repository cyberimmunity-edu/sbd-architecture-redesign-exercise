/**
 * Тесты трассировки стрелок с обходом доменов — v0.01.04.
 * Форма стрелки обязана: сохранять порты-концы, не пересекать чужие домены
 * (с отступом), быть детерминированной, при невозможности обхода —
 * откатываться к прямой стрелке прежнего поведения.
 */

import { describe, expect, it } from 'vitest';
import {
  accumulateRoutePenalty,
  computeEdgeFans,
  computeRoutePath,
  createRoutePenalty,
  edgeRelationGroups,
  expandRect,
  penaltyAlongSegment,
  polylineMidpoint,
  polylineToRoundedPath,
  portAnchorY,
  segmentIntersectsRect,
  DEFAULT_CELL,
  DEFAULT_PAD,
  PENALTY_MAX,
  PENALTY_STEP,
  type RoutePoint,
  type RouteRect,
} from '../../src/engine/edgeRouting';

/** Все отрезки ломаной не задевают прямоугольник. */
function avoidsRect(points: RoutePoint[], rect: RouteRect): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (segmentIntersectsRect(points[i], points[i + 1], rect)) return false;
  }
  return true;
}

describe('segmentIntersectsRect (Лианг–Барски)', () => {
  const rect: RouteRect = { x: 100, y: 100, width: 50, height: 50 };

  it('отрезок сквозь центр пересекает прямоугольник', () => {
    expect(segmentIntersectsRect({ x: 0, y: 125 }, { x: 300, y: 125 }, rect)).toBe(true);
  });

  it('отрезок мимо прямоугольника не пересекает', () => {
    expect(segmentIntersectsRect({ x: 0, y: 40 }, { x: 300, y: 40 }, rect)).toBe(false);
  });

  it('отрезок целиком внутри — пересечение', () => {
    expect(segmentIntersectsRect({ x: 110, y: 110 }, { x: 140, y: 140 }, rect)).toBe(true);
  });

  it('конец отрезка внутри прямоугольника — пересечение', () => {
    expect(segmentIntersectsRect({ x: 0, y: 125 }, { x: 120, y: 125 }, rect)).toBe(true);
  });

  it('вертикальный отрезок через прямоугольник — пересечение', () => {
    expect(segmentIntersectsRect({ x: 125, y: 0 }, { x: 125, y: 300 }, rect)).toBe(true);
  });

  it('касание границы считается пересечением', () => {
    expect(segmentIntersectsRect({ x: 0, y: 100 }, { x: 300, y: 100 }, rect)).toBe(true);
  });

  it('диагональ через угол — пересечение', () => {
    expect(segmentIntersectsRect({ x: 90, y: 90 }, { x: 115, y: 115 }, rect)).toBe(true);
  });

  it('вырожденный отрезок-точка снаружи — нет пересечения', () => {
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 0, y: 0 }, rect)).toBe(false);
  });
});

describe('expandRect', () => {
  it('расширяет прямоугольник на отступ со всех сторон', () => {
    expect(expandRect({ x: 10, y: 20, width: 100, height: 50 }, 14)).toEqual({
      x: -4,
      y: 6,
      width: 128,
      height: 78,
    });
  });
});

describe('computeRoutePath: без препятствий', () => {
  it('прямая стрелка остаётся прямым отрезком из двух точек', () => {
    const points = computeRoutePath({ x: 0, y: 0 }, { x: 400, y: 0 }, []);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ]);
  });

  it('препятствие в стороне от трассы не искривляет стрелку', () => {
    const points = computeRoutePath({ x: 0, y: 0 }, { x: 400, y: 0 }, [
      { x: 100, y: 300, width: 100, height: 100 },
    ]);
    expect(points).toHaveLength(2);
  });

  it('совпадающие порты возвращаются как есть', () => {
    const points = computeRoutePath({ x: 50, y: 50 }, { x: 50, y: 50 }, [
      { x: 0, y: 0, width: 10, height: 10 },
    ]);
    expect(points).toHaveLength(2);
  });
});

describe('computeRoutePath: обход препятствий', () => {
  const source: RoutePoint = { x: 200, y: 200 };
  const target: RoutePoint = { x: 800, y: 200 };
  const box: RouteRect = { x: 380, y: 120, width: 240, height: 160 };

  it('стрелка обходит домен по свободной стороне', () => {
    const points = computeRoutePath(source, target, [box]);
    // Концы сохранены — стрелка по-прежнему выходит из порта и входит в порт.
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
    // Форма обошла домен: ни один отрезок не задевает сам домен
    // и его расширенный контур (порог упрощения — pad − 4).
    expect(points.length).toBeGreaterThan(2);
    expect(avoidsRect(points, box)).toBe(true);
    expect(avoidsRect(points, expandRect(box, DEFAULT_PAD - 4))).toBe(true);
  });

  it('обход детерминирован: одинаковые входы — одинаковая форма', () => {
    const a = computeRoutePath(source, target, [box]);
    const b = computeRoutePath(source, target, [box]);
    expect(a).toEqual(b);
  });

  it('вертикальная стрелка обходит домен', () => {
    const points = computeRoutePath({ x: 500, y: 0 }, { x: 500, y: 600 }, [box]);
    expect(points[0]).toEqual({ x: 500, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 500, y: 600 });
    expect(avoidsRect(points, box)).toBe(true);
  });

  it('коридор между двумя доменами проходит свободно', () => {
    const top: RouteRect = { x: 380, y: 40, width: 240, height: 100 };
    const bottom: RouteRect = { x: 380, y: 260, width: 240, height: 100 };
    const points = computeRoutePath(source, target, [top, bottom]);
    expect(avoidsRect(points, top)).toBe(true);
    expect(avoidsRect(points, bottom)).toBe(true);
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
  });

  it('встречная стрелка обходит собственный блок (selfRects)', () => {
    // Источник правее приёмника: прямой отрезок сквозь собственный домен.
    const ownBox: RouteRect = { x: 300, y: 150, width: 240, height: 100 };
    const src: RoutePoint = { x: 540, y: 200 }; // правый порт своего домена
    const dst: RoutePoint = { x: 60, y: 200 }; // левый порт чужого домена
    const points = computeRoutePath(src, dst, [], { selfRects: [ownBox] });
    expect(points[0]).toEqual(src);
    expect(points[points.length - 1]).toEqual(dst);
    // Форма обошла собственный блок: внутрь не заходит (касание границы
    // в порту допустимо — стрелка стартует с контура домена).
    expect(points.length).toBeGreaterThan(2);
    expect(avoidsRect(points, expandRect(ownBox, -1))).toBe(true);
  });

  it('свои блоки не мешают обычным стрелкам: порт на границе — не пересечение', () => {
    // Прямая стрелка вправо от собственного порта: свой домен не учитывается.
    const ownBox: RouteRect = { x: 180, y: 150, width: 240, height: 100 };
    const points = computeRoutePath({ x: 420, y: 200 }, { x: 800, y: 200 }, [], {
      selfRects: [ownBox],
    });
    expect(points).toHaveLength(2);
  });

  it('стена поперёк трассы обходится по краю области поиска', () => {
    const wall: RouteRect = { x: 300, y: -600, width: 400, height: 1600 };
    const points = computeRoutePath(source, target, [wall], { margin: 60 });
    expect(points.length).toBeGreaterThan(2);
    expect(avoidsRect(points, wall)).toBe(true);
  });

  it('полностью заблокированная область — откат к прямой стрелке', () => {
    // Препятствие больше любой области поиска: свободных клеток нет.
    const world: RouteRect = { x: -5000, y: -5000, width: 10000, height: 10000 };
    const points = computeRoutePath(source, target, [world]);
    expect(points).toEqual([source, target]);
  });
});

describe('computeRoutePath: горизонтальные «усики» у портов', () => {
  const box: RouteRect = { x: 380, y: 120, width: 240, height: 160 };
  const source: RoutePoint = { x: 200, y: 200 };
  const target: RoutePoint = { x: 800, y: 200 };
  const hints = { sourceExit: { x: 16, y: 0 }, targetEntry: { x: -16, y: 0 } };

  it('усик добавляется у обоих портов, если не задевает домены', () => {
    const points = computeRoutePath(source, target, [box], hints);
    // Выход из правого порта — короткий горизонтальный участок вправо.
    expect(points[0]).toEqual(source);
    expect(points[1]).toEqual({ x: 216, y: 200 });
    // Вход в левый порт приёмника — горизонтальный участок слева от него.
    expect(points[points.length - 2]).toEqual({ x: 784, y: 200 });
    expect(points[points.length - 1]).toEqual(target);
  });

  it('усик не добавляется, если упирается в соседний домен', () => {
    // Препятствие сразу справа от порта-источника блокирует усик.
    const near: RouteRect = { x: 208, y: 192, width: 16, height: 16 };
    const points = computeRoutePath(source, target, [near, box], hints);
    expect(points[1]).not.toEqual({ x: 216, y: 200 });
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
  });

  it('входной усик не добавляется, если упирается в соседний домен', () => {
    // Препятствие сразу слева от порта-приёмника блокирует входной усик.
    const near: RouteRect = { x: 776, y: 192, width: 16, height: 16 };
    const points = computeRoutePath(source, target, [near, box], hints);
    expect(points[points.length - 2]).not.toEqual({ x: 784, y: 200 });
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
  });
});

describe('polylineToRoundedPath', () => {
  it('меньше двух точек — пустая строка', () => {
    expect(polylineToRoundedPath([])).toBe('');
    expect(polylineToRoundedPath([{ x: 1, y: 2 }])).toBe('');
  });

  it('две точки — прямая линия M/L (срез Чейкина не меняет её)', () => {
    const d = polylineToRoundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(d).toBe('M 0 0 L 100 0');
  });

  it('ломаная с углом содержит кубическую кривую и сохраняет концы (v0.01.05)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
    ];
    const d = polylineToRoundedPath(points);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('L 200 150')).toBe(true);
    expect(d).toContain('C');
  });

  it('форма детерминирована и сглажена: лестница из трёх углов даёт кривые, а не изломы', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    const first = polylineToRoundedPath(points);
    expect(first).toBe(polylineToRoundedPath(points));
    expect(first).toContain('C');
  });
});

describe('computeEdgeFans (развязка портов, v0.01.05)', () => {
  const positions = {
    a: { x: 0, y: 100 },
    b: { x: 400, y: 50 },
    c: { x: 400, y: 150 },
    d: { x: 400, y: 250 },
    e: { x: 800, y: 100 },
  };

  it('стрелки с общим портом расходятся веером: верхняя цель — верхний слот', () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'c' },
      { id: 'e2', from: 'a', to: 'b' },
      { id: 'e3', from: 'a', to: 'd' },
    ];
    const fans = computeEdgeFans(edges, positions);
    // Порядок по вертикали приёмников: b (50) — верхний слот, d (250) — нижний.
    expect(fans.get('e2')).toEqual({ sourceFan: -9, targetFan: 0 });
    expect(fans.get('e1')).toEqual({ sourceFan: 0, targetFan: 0 });
    expect(fans.get('e3')).toEqual({ sourceFan: 9, targetFan: 0 });
  });

  it('стрелки с общим приёмником разводятся у входа по вертикали источников', () => {
    const edges = [
      { id: 'f1', from: 'b', to: 'e' },
      { id: 'f2', from: 'd', to: 'e' },
    ];
    const fans = computeEdgeFans(edges, positions);
    expect(fans.get('f1')).toEqual({ sourceFan: 0, targetFan: -4.5 });
    expect(fans.get('f2')).toEqual({ sourceFan: 0, targetFan: 4.5 });
  });

  it('одиночные стрелки и пары узлов без общих портов не сдвигаются', () => {
    const edges = [
      { id: 'g1', from: 'a', to: 'e' },
      { id: 'g2', from: 'b', to: 'c' },
    ];
    const fans = computeEdgeFans(edges, positions);
    expect(fans.get('g1')).toEqual({ sourceFan: 0, targetFan: 0 });
    expect(fans.get('g2')).toEqual({ sourceFan: 0, targetFan: 0 });
  });

  it('сдвиг ограничен maxOffset и детерминирован', () => {
    const edges = Array.from({ length: 9 }, (_, i) => ({
      id: `h${i + 1}`,
      from: 'a',
      to: `t${i + 1}`,
    }));
    const manyPositions: Record<string, { x: number; y: number }> = { a: { x: 0, y: 0 } };
    for (let i = 0; i < 9; i += 1) manyPositions[`t${i + 1}`] = { x: 400, y: i * 10 };
    const fans = computeEdgeFans(edges, manyPositions);
    const values = [...fans.values()].map((f) => f.sourceFan);
    expect(Math.min(...values)).toBe(-30);
    expect(Math.max(...values)).toBe(30);
    expect(computeEdgeFans(edges, manyPositions)).toEqual(fans);
  });
});

describe('Развязка коридоров — мягкие штрафы (v0.01.08)', () => {
  const corridor: RouteRect = { x: 0, y: 0, width: 800, height: 400 };
  const straight = [{ x: 0, y: 200 }, { x: 800, y: 200 }];

  it('чужой коридор не отклоняет прямую трассу (v0.01.08)', () => {
    const penalty = createRoutePenalty([corridor], []);
    const first = computeRoutePath(straight[0], straight[1], [], { penalty });
    expect(first).toEqual(straight);
    accumulateRoutePenalty(penalty, first);
    const second = computeRoutePath(straight[0], straight[1], [], { penalty });
    // Прямая трасса бракуется только доменами (v0.01.08): незнакомые
    // стрелки не отклоняются от чужих коридоров — «необъяснимых изломов» нет.
    expect(second).toEqual(straight);
  });

  it('родственная стрелка расходится с занятым коридором обхода (v0.01.08)', () => {
    const box: RouteRect = { x: 380, y: 120, width: 40, height: 160 };
    const penalty = createRoutePenalty([box], []);
    const first = computeRoutePath(straight[0], straight[1], [box], { penalty });
    // Прямая заблокирована доменом — обход через решётку.
    expect(first.length).toBeGreaterThan(2);
    expect(avoidsRect(first, box)).toBe(true);
    accumulateRoutePenalty(penalty, first);
    const second = computeRoutePath(straight[0], straight[1], [box], { penalty });
    expect(second[0]).toEqual(straight[0]);
    expect(second[second.length - 1]).toEqual(straight[1]);
    expect(avoidsRect(second, box)).toBe(true);
    // Вторая обошла по другой стороне, а не легла на коридор первой:
    // внутри родственной группы развязка сохраняется.
    const midFirst = polylineMidpoint(first);
    const midSecond = polylineMidpoint(second);
    expect(Math.abs(midSecond.y - midFirst.y)).toBeGreaterThanOrEqual(DEFAULT_CELL - 1);
  });

  it('развязка детерминирована: одинаковая последовательность — одинаковые формы', () => {
    const run = (): RoutePoint[][] => {
      const penalty = createRoutePenalty([corridor], []);
      const a = computeRoutePath(straight[0], straight[1], [], { penalty });
      accumulateRoutePenalty(penalty, a);
      const b = computeRoutePath(straight[0], straight[1], [], { penalty });
      accumulateRoutePenalty(penalty, b);
      const c = computeRoutePath(straight[0], straight[1], [], { penalty });
      return [a, b, c];
    };
    expect(run()).toEqual(run());
  });

  it('зоны портов не штрафуются: у порта стрелки могут начинаться вместе', () => {
    const penalty = createRoutePenalty([corridor], straight);
    accumulateRoutePenalty(penalty, straight);
    // Первые 24 px трассы от порта свободны (граница клетки — 20 px),
    // дальше коридор занят.
    expect(penaltyAlongSegment(penalty, { x: 0, y: 200 }, { x: 19, y: 200 })).toBe(false);
    expect(penaltyAlongSegment(penalty, { x: 30, y: 200 }, { x: 100, y: 200 })).toBe(true);
    // Симметрично у приёмника.
    expect(penaltyAlongSegment(penalty, { x: 781, y: 200 }, { x: 800, y: 200 })).toBe(false);
  });

  it('штраф клетки насыщается PENALTY_MAX и детерминирован', () => {
    const penalty = createRoutePenalty([{ x: 0, y: 0, width: 400, height: 40 }], straight);
    for (let i = 0; i < 10; i += 1) accumulateRoutePenalty(penalty, straight);
    expect(Math.max(...penalty.values)).toBeLessThanOrEqual(PENALTY_MAX + 1e-9);
    expect(Math.max(...penalty.values)).toBeGreaterThan(0);
    const snapshot = [...penalty.values];
    accumulateRoutePenalty(penalty, straight);
    expect([...penalty.values]).toEqual(snapshot);
  });

  it('штраф не искажает стрелку с мешающим доменом: обход остаётся обходом', () => {
    const box: RouteRect = { x: 380, y: 120, width: 240, height: 160 };
    const penalty = createRoutePenalty([box, corridor], []);
    const source: RoutePoint = { x: 200, y: 200 };
    const target: RoutePoint = { x: 800, y: 200 };
    accumulateRoutePenalty(penalty, [source, { x: 300, y: 200 }, target]);
    const points = computeRoutePath(source, target, [box], { penalty });
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
    expect(avoidsRect(points, box)).toBe(true);
    expect(avoidsRect(points, expandRect(box, DEFAULT_PAD - 4))).toBe(true);
  });
});

describe('Г-образные кандидаты, группы и якоря (v0.01.08)', () => {
  it('обход препятствия Г-образным кандидатом — без решётки и «ступенек»', () => {
    const source: RoutePoint = { x: 0, y: 150 };
    const target: RoutePoint = { x: 800, y: 250 };
    const box: RouteRect = { x: 60, y: 130, width: 30, height: 30 };
    // Прямая задевает домен; горизонт-первый кандидат тоже, вертикаль-первый
    // свободен: путь из двух поворотов через середины зазоров.
    const points = computeRoutePath(source, target, [box]);
    expect(points).toEqual([
      { x: 0, y: 150 },
      { x: 0, y: 200 },
      { x: 800, y: 200 },
      { x: 800, y: 250 },
    ]);
  });

  it('родственные группы: стрелки с общим доменом — вместе, чужие — отдельно', () => {
    const groups = edgeRelationGroups([
      { from: 'a', to: 'b' },
      { from: 'c', to: 'b' }, // общий приёмник с первой
      { from: 'd', to: 'e' }, // чужая пара
      { from: 'e', to: 'f' }, // общий домен с предыдущей
    ]);
    expect(groups).toEqual([0, 0, 1, 1]);
  });

  it('скользящий якорь тянется к собеседнику и зажимается в своём домене', () => {
    const own: RouteRect = { x: 0, y: 0, width: 240, height: 120 };
    const below: RouteRect = { x: 400, y: 500, width: 240, height: 120 }; // центр Y = 560
    expect(portAnchorY(own, below)).toBe(96); // y + 120 − 24 — нижний зажим
    const above: RouteRect = { x: 400, y: -300, width: 240, height: 120 }; // центр Y = −240
    expect(portAnchorY(own, above)).toBe(24); // верхний зажим
    const aligned: RouteRect = { x: 400, y: 0, width: 240, height: 120 }; // центр Y = 60
    expect(portAnchorY(own, aligned)).toBe(60); // на одной высоте — центр порта
    expect(portAnchorY(own, aligned, 4.5)).toBe(64.5); // веер поверх якоря
  });
});

describe('Вееры портов по сторонам (v0.01.07)', () => {
  const positions = {
    a: { x: 0, y: 100 },
    b: { x: -400, y: 50 },
    c: { x: -400, y: 150 },
    d: { x: 400, y: 100 },
  };

  it('встречные выходы (слева) не смешиваются с обычными (справа)', () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'd' }, // обычный выход — справа
      { id: 'e2', from: 'a', to: 'b', sourceSide: 'left' as const }, // встречный
    ];
    const fans = computeEdgeFans(edges, positions);
    // Разные стороны порта источника — отдельные группы, сдвигов нет.
    expect(fans.get('e1')).toEqual({ sourceFan: 0, targetFan: 0 });
    expect(fans.get('e2')).toEqual({ sourceFan: 0, targetFan: 0 });
  });

  it('встречные выходы одной стороны расходятся веером как обычно', () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'b', sourceSide: 'left' as const },
      { id: 'e2', from: 'a', to: 'c', sourceSide: 'left' as const },
    ];
    const fans = computeEdgeFans(edges, positions);
    // Порядок по вертикали приёмников: b (50) — верхний слот, c (150) — нижний.
    expect(fans.get('e1')!.sourceFan).toBe(-4.5);
    expect(fans.get('e2')!.sourceFan).toBe(4.5);
  });

  it('встречные входы (справа) образуют отдельный веер у приёмника', () => {
    const edges = [
      { id: 'e1', from: 'b', to: 'a', targetSide: 'right' as const },
      { id: 'e2', from: 'c', to: 'a', targetSide: 'right' as const },
    ];
    const fans = computeEdgeFans(edges, positions);
    // Порядок по вертикали источников: b (50) — верхний слот.
    expect(fans.get('e1')!.targetFan).toBe(-4.5);
    expect(fans.get('e2')!.targetFan).toBe(4.5);
  });
});

describe('polylineMidpoint', () => {
  it('середина отрезка', () => {
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 40 }])).toEqual({ x: 50, y: 20 });
  });

  it('середина ломаной — по длине, а не по числу точек', () => {
    // Длины сегментов 100 и 300, середина общей длины — 200 px от старта:
    // это второй сегмент, 100 px в него.
    const mid = polylineMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 400, y: 0 },
    ]);
    expect(mid).toEqual({ x: 200, y: 0 });
  });
});
