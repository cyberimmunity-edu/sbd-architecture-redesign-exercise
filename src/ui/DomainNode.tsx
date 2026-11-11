'use client';

/**
 * Узел домена — раздел 5.2 ТЗ: прямоугольник не менее 240×120 px, заголовок
 * с именем, точкой статуса покрытия и классом доверия, строка
 * «Блок: C_блока · S · M · K», строка «Домен: C_домена» полужирным,
 * кнопка «Декомпозировать» (только внутренние домены), карточки размещённых
 * функций с кнопкой «Убрать». Приём перетаскиваемых карточек — Ф-8, только
 * внутренние домены (3.5 v0.01.01). Заливка — по классу доверия:
 * НДБ красная полупрозрачная, ДДБ зелёная, ДДБПЦД жёлтая.
 * Свёртка стрелок порта (v0.01.03): у каждого порта, к которому идёт хотя бы
 * одна стрелка, кнопка «−» (свернуть стрелки порта) / «+» (развернуть);
 * свёрнутые стрелки не отображаются на диаграмме, пока пользователь явно
 * не откроет их или не сменит режим вида (см. viewStore).
 * Подсветка из таблиц (v0.01.04): наведение на строку домена в таблице
 * «Расширенный анализ ДВБ» подсвечивает этот домен на диаграмме (голубая
 * рамка-кольцо) и в мини-навигаторе; клик по строке — фокус и выбор (Canvas.tsx).
 */

import { memo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewStore } from '../store/viewStore';
import { ru } from '../i18n/ru';
import type { SecurityFunction, Status } from '../engine/types';
import type { DomainCostResult } from '../engine/cost';
import type { DomainTrustClass } from '../engine/trust';
import { HIGHLIGHT_COLOR, STATUS_COLORS, TRUST_COLORS, StatusDot } from './status';

export interface DomainNodeData extends Record<string, unknown> {
  blockId: string;
  name: string;
  blockCost: number;
  cost: DomainCostResult;
  status: Status;
  /** Класс доверия домена (3.5 v0.01.01). */
  trustClass: DomainTrustClass;
  /** Внешняя (смежная) система. */
  external: boolean;
  /** Доверенность внешней системы; для внутренних игнорируется. */
  externalTrusted: boolean;
  functions: SecurityFunction[];
  /** Число стрелок на портах входа/выхода — для кнопок «+/−» (v0.01.03). */
  portCounts: { in: number; out: number };
  goalStatusOf: (fn: SecurityFunction) => Status[];
  onPlace: (functionId: string, blockId: string) => void;
  onUnplace: (functionId: string) => void;
  onDecompose: (blockId: string) => void;
  onCardSelect: (functionId: string) => void;
  selectedCardId: string | null;
}

/** Тип узла канвы React Flow. */
export type DomainFlowNode = Node<DomainNodeData, 'domain'>;

function formatMultiplier(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

/** Метка класса доверия для заголовка узла. */
function trustLabel(data: DomainNodeData): string {
  if (data.external) {
    return data.externalTrusted ? ru.canvas.externalTrusted : ru.canvas.externalUntrusted;
  }
  if (data.trustClass === 'ndb') return ru.canvas.trustNdb;
  if (data.trustClass === 'ddb') return ru.canvas.trustDdb;
  return ru.canvas.trustDdbPcd;
}

export const DomainNode = memo(function DomainNode({
  data,
  selected,
}: NodeProps<DomainFlowNode>) {
  const [dropHint, setDropHint] = useState(false);
  const isDropTarget = dropHint && !data.external;
  // Свёртка стрелок порта (v0.01.03): состояние — в хранилище вида.
  const collapsedPorts = useViewStore((s) => s.collapsedPorts);
  const togglePort = useViewStore((s) => s.togglePort);
  // Подсветка из таблиц правой панели (v0.01.04).
  const highlighted = useViewStore((s) => s.highlightedDomainId) === data.blockId;
  const inKey = `${data.blockId}:in`;
  const outKey = `${data.blockId}:out`;
  const inCollapsed = collapsedPorts[inKey] ?? false;
  const outCollapsed = collapsedPorts[outKey] ?? false;
  const { in: inCount, out: outCount } = data.portCounts ?? { in: 0, out: 0 };

  // Заливка по доверию: НДБ — полупрозрачная красная; ДДБПЦД — жёлтая; ДДБ — зелёная.
  // Внешние системы: недоверенная — красная, доверенная — зелёная; пунктирный контур.
  const color = data.external
    ? data.externalTrusted
      ? TRUST_COLORS.green
      : TRUST_COLORS.red
    : data.trustClass === 'ndb'
      ? TRUST_COLORS.red
      : data.trustClass === 'ddbpcd'
        ? TRUST_COLORS.yellow
        : TRUST_COLORS.green;

  return (
    <div
      data-block-id={data.blockId}
      data-highlighted={highlighted ? 'true' : 'false'}
      className="relative min-w-[240px] min-h-[120px] max-w-[320px] rounded-md shadow-sm bg-[var(--sk-node-bg,transparent)]"
      style={{
        background: color.fill,
        borderStyle: data.external ? 'dashed' : 'solid',
        borderColor: selected ? 'var(--foreground)' : dropHint ? TRUST_COLORS.green.border : color.border,
        borderWidth: selected || dropHint ? 2 : 1.5,
        padding: '10px 12px',
        color: 'var(--foreground)',
        // Подсветка из таблицы ДВБ (v0.01.04): голубое кольцо вокруг домена.
        boxShadow: highlighted
          ? `0 0 0 3px ${HIGHLIGHT_COLOR}, 0 0 16px ${HIGHLIGHT_COLOR}66`
          : undefined,
        zIndex: highlighted ? 1 : undefined,
      }}
      onDragOver={(event) => {
        if (data.external) return; // функции размещаются только во внутренние домены
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (!dropHint) setDropHint(true);
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropHint(false);
        if (data.external) return;
        const functionId = event.dataTransfer.getData('application/x-skib-function');
        if (functionId) data.onPlace(functionId, data.blockId);
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable aria-label="Входящая стрелка" />
      <Handle type="source" position={Position.Right} isConnectable aria-label="Исходящая стрелка" />

      {/* Кнопки свёртки стрелок порта (v0.01.03): только если к порту идёт
          хотя бы одна стрелка; клик не выделяет узел и не тащит его. */}
      {inCount > 0 && (
        <button
          type="button"
          className="nodrag nopan absolute z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-popover text-foreground shadow-sm hover:bg-accent"
          style={{ left: -9, top: 'calc(50% - 30px)' }}
          data-testid={`port-toggle-${data.blockId}-in`}
          aria-pressed={inCollapsed}
          aria-label={inCollapsed ? ru.canvas.portExpandTitle(inCount) : ru.canvas.portCollapseTitle(inCount)}
          title={inCollapsed ? ru.canvas.portExpandTitle(inCount) : ru.canvas.portCollapseTitle(inCount)}
          onClick={(event) => {
            event.stopPropagation();
            togglePort(inKey);
          }}
        >
          {inCollapsed ? <Plus className="h-2.5 w-2.5" aria-hidden /> : <Minus className="h-2.5 w-2.5" aria-hidden />}
        </button>
      )}
      {outCount > 0 && (
        <button
          type="button"
          className="nodrag nopan absolute z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-popover text-foreground shadow-sm hover:bg-accent"
          style={{ right: -9, top: 'calc(50% - 30px)' }}
          data-testid={`port-toggle-${data.blockId}-out`}
          aria-pressed={outCollapsed}
          aria-label={outCollapsed ? ru.canvas.portExpandTitle(outCount) : ru.canvas.portCollapseTitle(outCount)}
          title={outCollapsed ? ru.canvas.portExpandTitle(outCount) : ru.canvas.portCollapseTitle(outCount)}
          onClick={(event) => {
            event.stopPropagation();
            togglePort(outKey);
          }}
        >
          {outCollapsed ? <Plus className="h-2.5 w-2.5" aria-hidden /> : <Minus className="h-2.5 w-2.5" aria-hidden />}
        </button>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={data.status} />
            <span className="truncate text-sm font-semibold" title={data.name}>
              {data.name}
            </span>
          </div>
          <span
            className="mt-0.5 w-fit rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              border: `1px dashed ${color.border}`,
              color: 'var(--foreground)',
            }}
            title={trustLabel(data)}
          >
            {data.external
              ? `${ru.canvas.externalBadge}: ${trustLabel(data)}`
              : trustLabel(data)}
          </span>
        </div>
        {!data.external && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 shrink-0 px-2 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              data.onDecompose(data.blockId);
            }}
          >
            {ru.canvas.decompose}
          </Button>
        )}
      </div>

      {data.external ? (
        <div className="mt-1.5 text-xs opacity-75">{ru.canvas.noCostExternal}</div>
      ) : (
        <>
          <div className="mt-1.5 text-xs opacity-80">
            {ru.canvas.blockLabel}: C_блока = {data.blockCost} · S: {data.cost.functionsCost} · M:{' '}
            {formatMultiplier(data.cost.multiplier)} · K: {data.cost.trustCoefficient}
          </div>
          <div className="mt-0.5 text-sm font-bold">
            {ru.canvas.domainLabel}: C_домена = {data.cost.domainCost}
          </div>
        </>
      )}

      {!data.external && (
        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto" data-testid={`cards-${data.blockId}`}>
          {data.functions.length === 0 && (
            <div className="text-xs italic opacity-60">{ru.canvas.statusNeutral}</div>
          )}
          {data.functions.map((fn) => (
            <div
              key={fn.id}
              className="flex items-center gap-1.5 rounded border border-current/20 px-2 py-1"
              style={{ background: 'var(--background)' }}
              data-card-id={fn.id}
              onClick={(event) => {
                event.stopPropagation();
                data.onCardSelect(fn.id);
              }}
              title={`${fn.name} — стоимость ${fn.cost}`}
            >
              <span className="flex shrink-0 -space-x-1">
                {data.goalStatusOf(fn).map((status, index) => (
                  <span
                    key={index}
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                    aria-label={ru.goals.placed}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{fn.name}</span>
              <span className="shrink-0 text-xs opacity-70">{fn.cost}</span>
              <button
                type="button"
                className="shrink-0 rounded px-1 text-xs opacity-70 hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onUnplace(fn.id);
                }}
                aria-label={`${ru.canvas.remove}: ${fn.name}`}
                title={ru.canvas.remove}
              >
                ×
              </button>
            </div>
          ))}
          {isDropTarget && <div className="sr-only">Целевой домен</div>}
        </div>
      )}
    </div>
  );
});
