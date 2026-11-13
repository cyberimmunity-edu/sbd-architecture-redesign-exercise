'use client';

/**
 * Узел логической группы (ЛГ) — v0.02.03, Ф-70…Ф-76, по аналогии с группами
 * Flying Logic. Развёрнутая ЛГ — рамка с плашкой имени (цвет ЛГ, П-15):
 * тело рамки прозрачно для курсора — клики и правый клик проходят к доменам
 * и канве, интерактивна только плашка (выбор, переименование двойным
 * кликом, свёртывание, контекстное меню). Свёрнутая ЛГ и пустая ЛГ —
 * небольшие блоки, интерактивные целиком.
 *
 * Связи и рамка (Ф-72): в развёрнутой ЛГ связи идут сквозь границу к ДБ и
 * от них — рамка не препятствие трассировки; у свёрнутой ЛГ все связи её
 * скрытых ДБ ведут к четырёхугольнику ЛГ или от него (перенос концов —
 * Canvas.tsx), поэтому узел несёт невидимые хэндлы, идентичные домену.
 *
 * Рамка не перетаскивается: положение ЛГ выводится из позиций её ДБ.
 * Выделение (store.selection kind «group») подсвечивает рамку контуром.
 */

import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ru } from '../i18n/ru';

export interface GroupFrameNodeData extends Record<string, unknown> {
  groupId: string;
  name: string;
  /** Цвет из палитры LG_COLORS (П-15). */
  color: string;
  /** Отображается свёрнутым блоком. */
  collapsed: boolean;
  /** ЛГ пуста (нет ДБ и вложенных ЛГ). */
  empty: boolean;
  /** Число прямых ДБ-членов. */
  memberCount: number;
  /** Выделена в инспекторе (selection kind «group»). */
  selected: boolean;
  /** Цель перетаскивания домена (подсветка рамки при drag). */
  dropTarget: boolean;
  onToggleCollapse: (groupId: string) => void;
  onOpenMenu: (groupId: string, x: number, y: number) => void;
  onRename: (groupId: string) => void;
}

/** Тип узла канвы React Flow. */
export type GroupFrameFlowNode = Node<GroupFrameNodeData, 'lgframe'>;

/** Скрытые хэндлы узла ЛГ — точки крепления перенесённых стрелок (Ф-72). */
function LgHandles() {
  const hidden = { opacity: 0, pointerEvents: 'none' } as const;
  return (
    <>
      <Handle type="target" position={Position.Right} id="right" isConnectable={false} style={hidden} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={hidden} />
      <Handle type="target" position={Position.Left} isConnectable={false} style={hidden} />
      <Handle type="source" position={Position.Left} id="left" isConnectable={false} style={hidden} />
    </>
  );
}

export const GroupFrameNode = memo(function GroupFrameNode({
  data,
}: NodeProps<GroupFrameFlowNode>) {
  const interactive = data.collapsed || data.empty;
  const alpha = (hex: string, a: string) => `${hex}${a}`;
  const border = `${data.dropTarget || data.selected ? 2.5 : 1.5}px ${
    data.dropTarget || data.selected ? 'solid' : 'dashed'
  } ${alpha(data.color, data.selected || data.dropTarget ? 'FF' : 'AA')}`;
  const background = data.collapsed
    ? alpha(data.color, '2E')
    : alpha(data.color, data.dropTarget ? '22' : '12');

  return (
    <>
      <LgHandles />
      <div
        data-lg-id={data.groupId}
        data-lg-collapsed={data.collapsed ? 'true' : 'false'}
        data-lg-empty={data.empty ? 'true' : 'false'}
        className="relative h-full w-full"
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
        onClick={() => undefined}
        onContextMenu={(event) => {
          event.preventDefault();
          data.onOpenMenu(data.groupId, event.clientX, event.clientY);
        }}
      >
        <div
          className="h-full w-full rounded-xl"
          style={{
            border,
            background,
            boxShadow: data.selected ? `0 0 0 2px ${alpha(data.color, '55')}` : undefined,
          }}
        />
        {/* Плашка имени: выбор кликом, переименование двойным кликом,
            свёртывание кнопкой, контекстное меню правым кликом. */}
        <div
          className="nodrag nopan absolute left-4 top-0 flex max-w-[calc(100%-56px)] -translate-y-1/2 items-center gap-1.5 rounded-md border px-2 py-0.5 shadow-sm"
          data-testid={`lg-chip-${data.groupId}`}
          style={{
            borderColor: alpha(data.color, '99'),
            background: alpha(data.color, '2E'),
            backdropFilter: 'blur(2px)',
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            data.onRename(data.groupId);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onOpenMenu(data.groupId, event.clientX, event.clientY);
          }}
          title={ru.lg.frameTitle(data.name)}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ background: data.color }}
            aria-hidden
          />
          <span className="truncate text-xs font-semibold" title={data.name}>
            {data.name}
          </span>
          {!data.empty && (
            <span className="shrink-0 text-[10px] opacity-70">({data.memberCount})</span>
          )}
          {data.empty && <span className="shrink-0 text-[10px] italic opacity-60">{ru.lg.emptyBadge}</span>}
          {!data.empty && (
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-black/10"
              data-testid={`lg-toggle-${data.groupId}`}
              aria-pressed={data.collapsed}
              aria-label={data.collapsed ? ru.lg.expandTitle : ru.lg.collapseTitle}
              title={data.collapsed ? ru.lg.expandTitle : ru.lg.collapseTitle}
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleCollapse(data.groupId);
              }}
            >
              {data.collapsed ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronUp className="h-3 w-3" aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
});
