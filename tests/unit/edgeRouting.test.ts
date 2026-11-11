/**
 * Тесты трассировки стрелок с обходом доменов — v0.01.04.
 * Форма стрелки обязана: сохранять порты-концы, не пересекать чужие домены
 * (с отступом), быть детерминированной, при невозможности обхода —
 * откатываться к прямой стрелке прежнего поведения.
 */

import { describe, expect, it } from 'vitest';
import {
  computeRoutePath,
  expandRect,
  polylineMidpoint,
  polylineToRoundedPath,
  segmentIntersectsRect,
  DEFAULT_PAD,
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

  it('две точки — прямая линия M/L', () => {
    const d = polylineToRoundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(d).toBe('M 0 0 L 100 0');
  });

  it('ломаная с углом содержит квадратичную кривую и сохраняет концы', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
    ];
    const d = polylineToRoundedPath(points);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('L 200 150')).toBe(true);
    expect(d).toContain('Q');
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
