'use client';

/**
 * Стрелка с обходом доменов — v0.01.05. Форма рассчитывается в
 * src/engine/edgeRouting.ts: решётка A* вокруг прямоугольников доменов
 * (кроме соединяемых) с упрощением по прямой видимости, сглаживанием
 * (срез углов Чейкина + кубические кривые) и горизонтальными «усиками»
 * у портов — стрелки идут между доменами по свободным сторонам, а не
 * сквозь них. Вертикальная развязка портов (v0.01.05): стрелки с общим
 * портом расходятся веером (sourceFan/targetFan), параллельные стрелки
 * одной пары доменов — перпендикулярным сдвигом (shift). Цвет, толщина
 * и маркер задаются из Canvas.tsx как прежде (целостность потоков).
 * Подпись — на плашке в середине пути (EdgeLabelRenderer): фон --popover,
 * контур цвета стрелки; у приглушённой стрелки подпись гаснет так же,
 * как путь (см. .skib-edge--dim в globals.css).
 */

import { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  useStore,
  type EdgeProps,
} from '@xyflow/react';
import {
  computeRoutePath,
  polylineMidpoint,
  polylineToRoundedPath,
  type RouteRect,
} from '../engine/edgeRouting';
import type { DomainFlowNode } from './DomainNode';

/** Данные стрелки с обходом доменов — заполняются в Canvas.tsx. */
export interface RoutingEdgeData extends Record<string, unknown> {
  /** Подпись потока; пустая — плашка не рисуется. */
  label?: string;
  /** Цвет стрелки — целостность потока (зелёная/красная). */
  color: string;
  /** Цвет текста подписи по теме интерфейса. */
  labelColor: string;
  /** Активная стрелка (наведение/выделение) — полный текст и акцент. */
  focused?: boolean;
  /** Приглушённая стрелка — есть другой источник подсветки. */
  dimmed?: boolean;
  /**
   * Перпендикулярный сдвиг параллельной стрелки одной пары доменов, px
   * (вместо кривизны v0.01.01–v0.01.03): ±8 px вокруг оси, чтобы
   * встречные и параллельные потоки не сливались. Для одиночной — 0.
   */
  shift?: number;
  /** Вертикальная развязка у порта источника (v0.01.05), px: стрелки
   *  с общим портом расходятся веером. Для одиночной — 0. */
  sourceFan?: number;
  /** Вертикальная развязка у порта приёмника (v0.01.05), px. */
  targetFan?: number;
}

/** Габариты всех доменов канвы: препятствия и соединяемые блоки. */
interface DomainRects {
  /** Чужие домены — всегда препятствия. */
  obstacles: RouteRect[];
  /** Соединяемые домены (источник/приёмник) — препятствия при встречной геометрии. */
  selfRects: RouteRect[];
}

function useDomainRects(source: string, target: string): DomainRects {
  const nodes = useStore((s) => s.nodes);
  return useMemo(() => {
    const obstacles: RouteRect[] = [];
    const selfRects: RouteRect[] = [];
    for (const node of nodes) {
      // Рамка периметра — не препятствие: связи с внешними системами
      // законно пересекают её пунктирную границу.
      if (node.type !== 'domain') continue;
      const domain = node as DomainFlowNode;
      const width = domain.measured?.width ?? 240;
      const height = domain.measured?.height ?? 120;
      const rect: RouteRect = { x: domain.position.x, y: domain.position.y, width, height };
      if (node.id === source || node.id === target) selfRects.push(rect);
      else obstacles.push(rect);
    }
    return { obstacles, selfRects };
  }, [nodes, source, target]);
}

export const RoutingEdge = memo(function RoutingEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const routed = (data ?? {}) as RoutingEdgeData;
  const { obstacles, selfRects } = useDomainRects(source, target);

  const points = useMemo(
    () => {
      // Перпендикулярный сдвиг параллельных стрелок одной пары — порты
      // остаются на местах, разводится форма (0 у одиночной стрелки).
      const shift = typeof routed.shift === 'number' ? routed.shift : 0;
      // Вертикальная развязка общих портов (v0.01.05): старт/финал стрелки
      // смещаются вдоль границы домена, чтобы линии не сливались в пучок.
      const sourceFan = typeof routed.sourceFan === 'number' ? routed.sourceFan : 0;
      const targetFan = typeof routed.targetFan === 'number' ? routed.targetFan : 0;
      let from = { x: sourceX, y: sourceY + sourceFan };
      let to = { x: targetX, y: targetY + targetFan };
      if (shift !== 0) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = (-dy / length) * shift;
        const ny = (dx / length) * shift;
        from = { x: from.x + nx, y: from.y + ny };
        to = { x: to.x + nx, y: to.y + ny };
      }
      return computeRoutePath(from, to, obstacles, {
        // Горизонтальные «усики»: из правого порта — вправо, в левый — слева.
        sourceExit:
          sourcePosition === Position.Left ? { x: -16, y: 0 } : { x: 16, y: 0 },
        targetEntry:
          targetPosition === Position.Left ? { x: -16, y: 0 } : { x: 16, y: 0 },
        // Встречные стрелки обходят и свой блок (см. useDomainRects).
        selfRects,
      });
    },
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, obstacles, selfRects, routed.shift, routed.sourceFan, routed.targetFan],
  );
  const path = useMemo(() => polylineToRoundedPath(points), [points]);
  const labelPoint = useMemo(() => polylineMidpoint(points), [points]);

  const label = routed.label;
  const color = routed.color ?? '#D32F2F';
  const focused = routed.focused ?? false;
  const dimmed = routed.dimmed ?? false;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={20} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
              pointerEvents: 'all',
              fontSize: 11,
              fontWeight: focused ? 600 : 500,
              color: focused ? color : routed.labelColor,
              background: 'var(--popover)',
              border: `1px solid ${focused ? color : `${color}88`}`,
              borderRadius: 6,
              padding: '3px 6px',
              opacity: dimmed ? 0.15 : 1,
              transition: 'opacity 0.18s ease',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
