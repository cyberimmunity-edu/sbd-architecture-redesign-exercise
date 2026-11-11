'use client';

/**
 * Стрелка с обходом доменов — v0.01.07. Форма рассчитывается централизованно
 * в Canvas.tsx (последовательная трассировка в src/engine/edgeRouting.ts):
 * решётка A* вокруг прямоугольников доменов, мягкая развязка коридоров
 * (штрафы за клетки прежних стрелок — линии расходятся параллельными
 * дорожками, как splines в Graphviz), упрощение по прямой видимости,
 * сглаживание (срез углов Чейкина + кубические кривые) и горизонтальные
 * «усики» у портов. Готовая ломаная приходит в data.points; стороны портов
 * (обычные и встречные стрелки) назначает канва по геометрии. Цвет, толщина
 * и маркер задаются из Canvas.tsx как прежде (целостность потоков).
 * Подпись — на плашке в середине пути (EdgeLabelRenderer): фон --popover,
 * контур цвета стрелки; у приглушённой стрелки подпись гаснет так же,
 * как путь (см. .skib-edge--dim в globals.css).
 */

import { memo, useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import {
  polylineMidpoint,
  polylineToRoundedPath,
  type RoutePoint,
} from '../engine/edgeRouting';

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
   * Готовая ломаная стрелки от порта-источника к порту-приёмнику (v0.01.07):
   * трассировка выполняется централизованно в Canvas.tsx с развязкой
   * коридоров и вееров портов. Отсутствие — прямой отрезок по координатам
   * портов (транзитный кадр до пересчёта).
   */
  points?: RoutePoint[];
}

export const RoutingEdge = memo(function RoutingEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const routed = (data ?? {}) as RoutingEdgeData;
  const points = useMemo(
    () => routed.points ?? [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }],
    [routed.points, sourceX, sourceY, targetX, targetY],
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
