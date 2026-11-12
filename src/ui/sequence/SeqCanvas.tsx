'use client';

/**
 * Канва режима «Диаграммы последовательности» — раздел 5.4 ТЗ v0.02.01.
 * React Flow с одним крупным узлом, внутри которого рисуется вся ДП:
 * линии жизни (заголовок + вертикальная полоса), стрелки с автонумерацией
 * 1..N (порядок массива = вертикальный порядок), рамки блоков (группа,
 * цикл, условный блок с разделителем веток). Мини-навигатор и зум — как
 * в ДАП (Ф-47): MiniMap слева снизу, кнопки масштаба справа снизу.
 *
 * Жесты:
 * - перетаскивание домена из «Набора доменов» на канву → линия жизни (Ф-38);
 * - перетаскивание ЦБ из списка левой панели на канву (Ф-65, v0.02.01b):
 *   при отсутствии ДП создаётся ДП с именем ЦБ и линиями жизни критичных
 *   доменов; иначе критичные домены добавляются в текущую ДП;
 * - линии жизни — пунктир до нижней границы экрана (Ф-68, v0.02.01b),
 *   жест создания стрелки доступен по всей длине линии;
 * - перетаскивание заголовка линии жизни по горизонтали → порядок (П-7),
 *   не пишется в историю;
 * - перетаскивание от полосы линии жизни к полосе другой линии жизни →
 *   стрелка; на себя → self-стрелка (Ф-42);
 * - перетаскивание стрелки по вертикали → позиция в порядке, нумерация
 *   пересчитывается сразу (Ф-44);
 * - клик по стрелке → выбор (Shift/Ctrl — мультивыбор для блоков, Ф-46);
 *   клик по заголовку блока → выбор блока; Delete — удалить стрелку (Ф-45).
 *
 * Опция «Цвета из ДАП» (Ф-59, П-11): линии жизни окрашиваются классом
 * доверия домена, стрелки — цветом домена-источника; цвета производные.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type MiniMapNodeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useToast } from '@/hooks/use-toast';
import { useSkibStore } from '../../store/projectStore';
import { useViewStore } from '../../store/viewStore';
import { computeSeqColors } from '../../engine/sequence';
import { TRUST_COLORS } from '../status';
import { CanvasControls } from '../CanvasControls';
import { SeqToolbar } from './SeqToolbar';
import { canvasBackgroundColor, useSkibTheme } from '../theme';
import { ru } from '../../i18n/ru';

/** Ширина колонки линии жизни, px. */
const COLUMN_W = 200;
/** Высота заголовка линии жизни, px. */
const HEADER_H = 64;
/** Высота строки стрелки, px. */
const ROW_H = 46;
/** Отступы диаграммы, px. */
const PAD_X = 24;
const PAD_BOTTOM = 32;
const NEUTRAL_ARROW_COLOR = '#64748B';
/** На сколько пунктир линии жизни продолжается ниже последней строки
 *  стрелок (Ф-68, v0.02.01b): при любом допустимом масштабе (минимум 0.2)
 *  продолжение покрывает видимую область канвы целиком — линия жизни
 *  тянется до нижней границы экрана, как на UML-диаграммах, и жест
 *  создания стрелки доступен по всей её длине. */
const LIFELINE_EXTEND = 6000;

export interface SeqDiagramNodeData extends Record<string, unknown> {
  seqId: string;
  lifelines: Array<{ id: string; name: string; external: boolean }>;
  arrows: Array<{ id: string; from: string; to: string; label?: string; number: number }>;
  blocks: Array<{
    id: string;
    kind: 'group' | 'loop' | 'cond';
    name: string;
    color: string;
    arrows: string[];
    thenLabel?: string;
    elseLabel?: string;
    elseFrom?: string;
  }>;
  selectedArrow: string | null;
  selectedLifeline: string | null;
  selectedBlock: string | null;
  multiArrows: string[];
  colorsLifelines: Record<string, 'red' | 'yellow' | 'green'>;
  colorsArrows: Record<string, 'red' | 'green'>;
  colorsFromDap: boolean;
  onSelectLifeline: (id: string) => void;
  onSelectArrow: (id: string, additive: boolean) => void;
  onSelectBlock: (id: string) => void;
  onReorderLifelines: (from: number, to: number) => void;
  onMoveArrow: (arrowId: string, toIndex: number) => void;
  onCreateArrow: (from: string, to: string) => void;
  onClearSelection: () => void;
}

type SeqFlowNode = Node<SeqDiagramNodeData, 'seqDiagram'>;

const xOf = (index: number): number => PAD_X + index * COLUMN_W + COLUMN_W / 2;

/* ------------------------------------------------------------------ */
/* Узел диаграммы                                                      */
/* ------------------------------------------------------------------ */

function SeqDiagramNode({ data }: NodeProps<SeqFlowNode>) {
  const {
    lifelines,
    arrows,
    blocks,
    selectedArrow,
    selectedLifeline,
    selectedBlock,
    multiArrows,
    colorsLifelines,
    colorsArrows,
    colorsFromDap,
    onSelectLifeline,
    onSelectArrow,
    onSelectBlock,
    onReorderLifelines,
    onMoveArrow,
    onCreateArrow,
    onClearSelection,
  } = data;

  const indexOfLifeline = useMemo(() => {
    const map = new Map<string, number>();
    lifelines.forEach((l, i) => map.set(l.id, i));
    return map;
  }, [lifelines]);

  const width = Math.max(lifelines.length * COLUMN_W + PAD_X * 2, 480);
  const arrowsHeight = arrows.length * ROW_H;
  const height = HEADER_H + arrowsHeight + PAD_BOTTOM;

  // Состояния жестов.
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const [hoverLifeline, setHoverLifeline] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const headerDrag = useRef<{ id: string; startX: number; index: number; pxPerCol: number } | null>(null);
  const arrowDrag = useRef<{ id: string; startY: number; index: number; moved: boolean; pxPerRow: number } | null>(null);

  /** Начало жеста создания стрелки на полосе линии жизни (Ф-42). */
  const bandPointerDown = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setCreatingFrom(id);
    setHoverLifeline(id);
  };

  useEffect(() => {
    if (!creatingFrom) return;
    const finish = () => {
      if (creatingFrom && hoverLifeline) onCreateArrow(creatingFrom, hoverLifeline);
      setCreatingFrom(null);
      setHoverLifeline(null);
    };
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  }, [creatingFrom, hoverLifeline, onCreateArrow]);

  /** Перетаскивание заголовка линии жизни по горизонтали (П-7).
   *  Шаг колонки пересчитывается из текущего масштаба канвы. */
  const headerPointerDown = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    headerDrag.current = {
      id,
      startX: event.clientX,
      index: indexOfLifeline.get(id) ?? 0,
      pxPerCol: rect.width / (COLUMN_W - 12),
    };
  };
  const headerPointerMove = (event: React.PointerEvent) => {
    const drag = headerDrag.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const desired = Math.max(
      0,
      Math.min(lifelines.length - 1, drag.index + Math.round(dx / drag.pxPerCol)),
    );
    const current = lifelines.findIndex((l) => l.id === drag.id);
    if (desired !== current && current >= 0) {
      onReorderLifelines(current, desired);
      headerDrag.current = { ...drag, index: desired };
    }
  };
  const headerPointerUp = () => {
    headerDrag.current = null;
  };

  /** Перетаскивание стрелки по вертикали (Ф-44): вставка перед/после соседней.
   *  Шаг строки пересчитывается из текущего масштаба канвы. */
  const arrowPointerDown = (event: React.PointerEvent, id: string, index: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    arrowDrag.current = {
      id,
      startY: event.clientY,
      index,
      moved: false,
      pxPerRow: rect.height / ROW_H,
    };
  };
  const arrowPointerMove = (event: React.PointerEvent) => {
    const drag = arrowDrag.current;
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 8) return;
    drag.moved = true;
    // Вверх (dy < 0) — стрелка поднимается к началу порядка (Ф-44).
    const desired = Math.max(0, Math.min(arrows.length - 1, drag.index + Math.round(dy / drag.pxPerRow)));
    setDragOverIndex(desired === drag.index ? null : desired);
    const current = arrows.findIndex((a) => a.id === drag.id);
    if (desired !== current && current >= 0) {
      onMoveArrow(drag.id, desired > current ? desired + 1 : desired);
      arrowDrag.current = { ...drag, index: desired };
    }
  };
  const arrowPointerUp = () => {
    arrowDrag.current = null;
    setDragOverIndex(null);
  };

  const lifelineColor = (id: string): string | undefined => {
    if (!colorsFromDap) return undefined;
    const color = colorsLifelines[id];
    return color ? TRUST_COLORS[color].border : undefined;
  };
  const lifelineFill = (id: string): string | undefined => {
    if (!colorsFromDap) return undefined;
    const color = colorsLifelines[id];
    return color ? TRUST_COLORS[color].fill : undefined;
  };
  const arrowColor = (id: string): string => {
    if (!colorsFromDap) return NEUTRAL_ARROW_COLOR;
    const color = colorsArrows[id];
    return color === 'green' ? '#43A047' : color === 'red' ? '#D32F2F' : NEUTRAL_ARROW_COLOR;
  };

  return (
    <div className="relative" style={{ width, height }} data-testid="seq-diagram-node">
      {/* Заголовки линий жизни. */}
      {lifelines.map((lifeline, index) => {
        const selected = selectedLifeline === lifeline.id;
        const color = lifelineColor(lifeline.id);
        const fill = lifelineFill(lifeline.id);
        return (
          <div
            key={lifeline.id}
            className="nodrag nopan absolute flex cursor-grab flex-col items-center justify-center rounded-md border px-2 text-center select-none"
            style={{
              left: xOf(index) - COLUMN_W / 2 + 6,
              top: 4,
              width: COLUMN_W - 12,
              height: HEADER_H - 12,
              background: fill ?? 'var(--card)',
              borderColor: selected ? '#38BDF8' : color ?? 'var(--border)',
              borderWidth: selected || color ? 2 : 1,
              zIndex: 30,
              // React Flow отключает события слоя узлов — включаем явно.
              pointerEvents: 'auto',
            }}
            data-testid={`seq-lifeline-header-${lifeline.id}`}
            title={lifeline.name}
            onPointerDown={(e) => headerPointerDown(e, lifeline.id)}
            onPointerMove={headerPointerMove}
            onPointerUp={headerPointerUp}
            onClick={(e) => {
              e.stopPropagation();
              onSelectLifeline(lifeline.id);
            }}
          >
            <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
              {lifeline.name}
            </span>
            {lifeline.external && (
              <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {ru.seq.externalBadge}
              </span>
            )}
          </div>
        );
      })}

      {/* Полосы линий жизни (зона жестов создания стрелок). Пунктир
          продолжается ниже последней строки стрелок до нижней границы
          экрана (Ф-68): полоса жеста следует за линией. */}
      <div
        className="absolute left-0 w-full"
        style={{ top: HEADER_H, height: Math.max(arrowsHeight, 80) }}
      >
        {lifelines.map((lifeline, index) => {
          const selected = selectedLifeline === lifeline.id;
          const hovered = creatingFrom !== null && hoverLifeline === lifeline.id;
          return (
            <div
              key={`band-${lifeline.id}`}
              className="nodrag nopan absolute cursor-crosshair"
              style={{
                left: xOf(index) - 14,
                width: 28,
                top: 0,
                height: Math.max(arrowsHeight, 80) + LIFELINE_EXTEND,
                // Полоса выше строк стрелок: жест с полосы всегда создаёт
                // стрелку, даже поверх сегмента существующей строки (Ф-42).
                zIndex: 25,
                background: hovered ? 'rgba(56, 189, 248, 0.25)' : undefined,
                borderRadius: 4,
                pointerEvents: 'auto',
              }}
              data-testid={`seq-lifeline-band-${lifeline.id}`}
              onPointerDown={(e) => bandPointerDown(e, lifeline.id)}
              onPointerEnter={() => {
                if (creatingFrom) setHoverLifeline(lifeline.id);
              }}
            >
              <div
                className="absolute left-1/2 h-full w-px -translate-x-1/2"
                style={{
                  borderLeft: `1px dashed ${selected ? '#38BDF8' : 'var(--border)'}`,
                  boxShadow: selected ? '0 0 6px rgba(56,189,248,0.6)' : undefined,
                }}
              />
            </div>
          );
        })}

        {/* Рамки блоков (под стрелками). */}
        {blocks.map((block) => {
          const positions = block.arrows
            .map((id) => arrows.findIndex((a) => a.id === id))
            .filter((p) => p >= 0)
            .sort((a, b) => a - b);
          if (positions.length === 0) return null;
          const involved = new Set<string>();
          for (const arrowId of block.arrows) {
            const arrow = arrows.find((a) => a.id === arrowId);
            if (arrow) {
              involved.add(arrow.from);
              involved.add(arrow.to);
            }
          }
          const lifelineIndexes = [...involved]
            .map((id) => indexOfLifeline.get(id) ?? -1)
            .filter((i) => i >= 0);
          const leftIndex = lifelineIndexes.length > 0 ? Math.min(...lifelineIndexes) : 0;
          const rightIndex =
            lifelineIndexes.length > 0 ? Math.max(...lifelineIndexes) : lifelines.length - 1;
          const left = xOf(leftIndex) - COLUMN_W / 2;
          const right = xOf(rightIndex) + COLUMN_W / 2;
          const top = positions[0] * ROW_H - 8;
          const bottom = (positions[positions.length - 1] + 1) * ROW_H + 8;
          const elseRow = block.elseFrom ? arrows.findIndex((a) => a.id === block.elseFrom) : -1;
          const isCond = block.kind === 'cond';
          const frameColor = isCond ? 'var(--border)' : block.color;
          const selected = selectedBlock === block.id;
          return (
            <div
              key={`block-${block.id}`}
              className="absolute rounded-md"
              style={{
                left: left - 10,
                width: right - left + 20,
                top,
                height: bottom - top,
                border: `2px ${selected ? 'solid' : isCond ? 'dashed' : 'solid'} ${selected ? '#38BDF8' : frameColor}`,
                background: isCond ? 'transparent' : `${block.color}0F`,
                // Рамка выше полос жестов (25): кликабельные заголовки блоков
                // не перекрываются полосами линий жизни; сам прямоугольник не
                // перехватывает события (pointerEvents: none) — стрелки под
                // ним кликабельны.
                zIndex: 26,
                pointerEvents: 'none',
              }}
              data-testid={`seq-block-frame-${block.id}`}
              data-block-kind={block.kind}
            >
              {/* Заголовок блока (клик — выбор блока). */}
              <div
                className="nodrag nopan absolute -top-3 left-2 flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background: isCond ? 'var(--popover)' : block.color,
                  color: isCond ? 'var(--foreground)' : '#FFFFFF',
                  border: isCond ? `1px solid ${frameColor}` : undefined,
                  pointerEvents: 'auto',
                }}
                data-testid={`seq-block-label-${block.id}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBlock(block.id);
                }}
              >
                {block.kind === 'loop'
                  ? `${ru.seq.loopTitlePrefix}${block.name}`
                  : block.kind === 'group'
                    ? `${ru.seq.groupTitlePrefix}${block.name}`
                    : `${ru.seq.condTitlePrefix}${block.name}`}
              </div>
              {/* Разделитель веток условного блока. */}
              {isCond && elseRow > 0 && (
                <div
                  className="absolute left-0 w-full"
                  style={{
                    top: elseRow * ROW_H - top + 2,
                    borderTop: `2px dotted ${selected ? '#38BDF8' : frameColor}`,
                  }}
                  data-testid={`seq-block-else-divider-${block.id}`}
                >
                  <span
                    className="absolute -top-2.5 right-1 rounded bg-popover px-1 text-[10px] text-muted-foreground"
                    style={{ border: `1px solid ${frameColor}` }}
                  >
                    {ru.seq.elseBranch}
                    {block.elseLabel ?? ''}
                  </span>
                </div>
              )}
              {isCond && block.thenLabel && (
                <span
                  className="absolute right-1 rounded bg-popover px-1 text-[10px] text-muted-foreground"
                  style={{ top: -2, border: `1px solid ${frameColor}` }}
                >
                  {ru.seq.thenBranch}
                  {block.thenLabel}
                </span>
              )}
            </div>
          );
        })}

        {/* Стрелки. */}
        {arrows.map((arrow, index) => {
          const fromIdx = indexOfLifeline.get(arrow.from) ?? 0;
          const toIdx = indexOfLifeline.get(arrow.to) ?? 0;
          const x1 = xOf(fromIdx);
          const x2 = xOf(toIdx);
          const color = arrowColor(arrow.id);
          const highlighted =
            selectedArrow === arrow.id || multiArrows.includes(arrow.id) || dragOverIndex === index;
          const isSelf = arrow.from === arrow.to;
          const rowTop = index * ROW_H;
          const label = arrow.label ?? '';
          // Сегмент строки: область клика/перетаскивания вокруг линии.
          const segLeft = isSelf ? x1 + 6 : Math.min(x1, x2) - 30;
          const segWidth = isSelf ? 92 : Math.abs(x2 - x1) + 60;
          return (
            <div
              key={arrow.id}
              className="nodrag nopan absolute cursor-pointer"
              style={{
                left: segLeft,
                top: rowTop,
                width: segWidth,
                height: ROW_H,
                zIndex: 20,
                borderRadius: 4,
                background: highlighted ? 'rgba(56, 189, 248, 0.14)' : undefined,
                pointerEvents: 'auto',
              }}
              data-testid={`seq-arrow-${arrow.id}`}
              data-arrow-number={arrow.number}
              onPointerDown={(e) => arrowPointerDown(e, arrow.id, index)}
              onPointerMove={arrowPointerMove}
              onPointerUp={arrowPointerUp}
              onClick={(e) => {
                e.stopPropagation();
                onSelectArrow(arrow.id, e.shiftKey || e.ctrlKey || e.metaKey);
              }}
            >
              <svg
                width={segWidth}
                height={ROW_H}
                className="pointer-events-none absolute left-0 top-0 overflow-visible"
              >
                {isSelf ? (
                  // Self-стрелка: петля справа от полосы линии жизни (Ф-43).
                  <path
                    d={`M ${x1 - segLeft} ${ROW_H / 2 - 6} h 52 a 9 9 0 0 1 9 9 a 9 9 0 0 1 -9 9 h -42`}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    markerEnd="url(#seq-arrowhead)"
                  />
                ) : (
                  <line
                    x1={x1 - segLeft}
                    y1={ROW_H / 2}
                    x2={x2 - segLeft}
                    y2={ROW_H / 2}
                    stroke={color}
                    strokeWidth={highlighted ? 3 : 2}
                    markerEnd="url(#seq-arrowhead)"
                  />
                )}
              </svg>
              {/* Номер-бейдж у начала стрелки (Ф-43). */}
              <span
                className="pointer-events-none absolute flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{
                  background: color,
                  left: isSelf ? x1 - segLeft + 58 : x1 < x2 ? x1 - segLeft - 14 : x2 - segLeft + 4,
                  top: ROW_H / 2 - 20,
                  zIndex: 25,
                }}
              >
                {arrow.number}
              </span>
              {/* Подпись над стрелкой (П-5). */}
              {label && (
                <span
                  className="pointer-events-none absolute truncate rounded bg-popover/90 px-1.5 py-0.5 text-[11px] text-foreground"
                  style={{
                    left: isSelf ? 40 : Math.abs(x2 - x1) / 2 + (x1 < x2 ? 0 : 0),
                    transform: 'translateX(-50%)',
                    top: ROW_H / 2 - 21,
                    zIndex: 24,
                    maxWidth: isSelf ? 130 : Math.abs(x2 - x1) + 40,
                  }}
                  title={label}
                >
                  {label}
                </span>
              )}
            </div>
          );
        })}

        {/* Индикатор позиции при переносе стрелки. */}
        {dragOverIndex !== null && (
          <div
            className="pointer-events-none absolute left-0 w-full"
            style={{ top: dragOverIndex * ROW_H - 1, height: 2, background: '#38BDF8', zIndex: 40 }}
          />
        )}

        {/* Подсказка пустой ДП (5.4) — не перехватывает жесты полос. */}
        {lifelines.length === 0 && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 w-[440px] -translate-x-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground"
            style={{ zIndex: 50 }}
            data-testid="seq-empty-canvas"
          >
            {ru.seq.emptyCanvas}
          </div>
        )}
        {lifelines.length > 0 && arrows.length === 0 && (
          <div
            className="pointer-events-none absolute left-1/2 top-16 w-[440px] -translate-x-1/2 text-center text-sm text-muted-foreground"
            style={{ zIndex: 50 }}
          >
            {ru.seq.emptyCanvas}
          </div>
        )}
      </div>

      {/* Маркер стрелки — общий для всех линий. */}
      <svg width={0} height={0} className="absolute">
        <defs>
          <marker
            id="seq-arrowhead"
            markerWidth="9"
            markerHeight="7"
            refX="8"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 9 3.5, 0 7" fill={NEUTRAL_ARROW_COLOR} />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

const nodeTypes = { seqDiagram: SeqDiagramNode } as const;

/** Собственный узел мини-навигатора (v0.02.01b): поверх прямоугольника
 *  диаграммы рисуются заголовки линий жизни и стрелки — мини-карта ДП
 *  показывает состав диаграммы, а не пустой прямоугольник. */
function SeqMiniMapNode({ x, y, width, height, color }: MiniMapNodeProps) {
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const sequences = useSkibStore((s) => s.project.sequences);
  const sequence = (sequences ?? []).find((s) => s.id === activeSequenceId) ?? null;
  const logicalW = Math.max((sequence?.lifelines.length ?? 0) * COLUMN_W + PAD_X * 2, 480);
  const logicalH = HEADER_H + (sequence?.arrows.length ?? 0) * ROW_H + PAD_BOTTOM;
  const lineIdx = (id: string) => (sequence ? sequence.lifelines.indexOf(id) : -1);
  return (
    <>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={4} />
      {sequence && width > 0 && height > 0 && (
        <svg
          x={x}
          y={y}
          width={width}
          height={height}
          viewBox={`0 0 ${logicalW} ${logicalH}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none' }}
        >
          {sequence.lifelines.map((id, i) => (
            <rect
              key={`mm-${id}`}
              x={xOf(i) - COLUMN_W / 2 + 6}
              y={4}
              width={COLUMN_W - 12}
              height={HEADER_H - 12}
              rx={4}
              fill="#E4E4E7"
              opacity={0.85}
            />
          ))}
          {sequence.arrows.map((arrow, i) => {
            const from = lineIdx(arrow.from);
            const to = lineIdx(arrow.to);
            if (from < 0 || to < 0) return null;
            const rowY = HEADER_H + i * ROW_H + ROW_H / 2;
            return (
              <line
                key={`mm-${arrow.id}`}
                x1={xOf(from)}
                y1={rowY}
                x2={xOf(to)}
                y2={rowY}
                stroke="#FAFAFA"
                strokeWidth={4}
              />
            );
          })}
        </svg>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Контроллер «вместить»                                               */
/* ------------------------------------------------------------------ */

function SeqFitController() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const handler = () => void fitView({ padding: 0.12, duration: 320 });
    window.addEventListener('skib-seq-fit-view', handler);
    return () => window.removeEventListener('skib-seq-fit-view', handler);
  }, [fitView]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Канва                                                               */
/* ------------------------------------------------------------------ */

function SeqCanvasInner() {
  const project = useSkibStore((s) => s.project);
  const addLifeline = useSkibStore((s) => s.addLifeline);
  const reorderLifelines = useSkibStore((s) => s.reorderLifelines);
  const addSeqArrow = useSkibStore((s) => s.addSeqArrow);
  const moveSeqArrow = useSkibStore((s) => s.moveSeqArrow);
  const createSequenceFromGoal = useSkibStore((s) => s.createSequenceFromGoal);
  const addGoalDomains = useSkibStore((s) => s.addGoalDomains);
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const setActiveSequence = useViewStore((s) => s.setActiveSequence);
  const seqSelection = useViewStore((s) => s.seqSelection);
  const setSeqSelection = useViewStore((s) => s.setSeqSelection);
  const seqSelectedArrows = useViewStore((s) => s.seqSelectedArrows);
  const setSeqSelectedArrows = useViewStore((s) => s.setSeqSelectedArrows);
  const seqColorsFromDap = useViewStore((s) => s.seqColorsFromDap);
  const { toast } = useToast();

  const sequences = project.sequences ?? [];
  const active = sequences.find((s) => s.id === activeSequenceId) ?? null;

  const [dropHint, setDropHint] = useState(false);

  const colors = useMemo(
    () =>
      seqColorsFromDap
        ? computeSeqColors(project)
        : { lifelines: new Map<string, 'red' | 'yellow' | 'green'>(), arrows: new Map<string, 'red' | 'green'>() },
    [project, seqColorsFromDap],
  );

  const data: SeqDiagramNodeData = useMemo(() => {
    const blockById = new Map(project.architecture.blocks.map((b) => [b.id, b]));
    return {
      seqId: active?.id ?? '',
      lifelines: (active?.lifelines ?? []).map((id) => ({
        id,
        name: blockById.get(id)?.name ?? id,
        external: blockById.get(id)?.external ?? false,
      })),
      arrows: (active?.arrows ?? []).map((a, i) => ({
        id: a.id,
        from: a.from,
        to: a.to,
        ...(a.label ? { label: a.label } : {}),
        number: i + 1,
      })),
      blocks: active?.blocks ?? [],
      selectedArrow: seqSelection?.kind === 'arrow' ? seqSelection.id : null,
      selectedLifeline: seqSelection?.kind === 'lifeline' ? seqSelection.id : null,
      selectedBlock: seqSelection?.kind === 'block' ? seqSelection.id : null,
      multiArrows: seqSelectedArrows,
      colorsLifelines: Object.fromEntries(colors.lifelines) as Record<string, 'red' | 'yellow' | 'green'>,
      colorsArrows: Object.fromEntries(colors.arrows) as Record<string, 'red' | 'green'>,
      colorsFromDap: seqColorsFromDap,
      onSelectLifeline: (id) => setSeqSelection({ kind: 'lifeline', id }),
      onSelectArrow: (id, additive) => {
        setSeqSelection({ kind: 'arrow', id });
        const set = new Set(seqSelectedArrows);
        if (additive) {
          if (set.has(id)) set.delete(id);
          else set.add(id);
        } else {
          set.clear();
          set.add(id);
        }
        setSeqSelectedArrows([...set]);
      },
      onSelectBlock: (id) => setSeqSelection({ kind: 'block', id }),
      onReorderLifelines: (from, to) => {
        if (active) reorderLifelines(active.id, from, to);
      },
      onMoveArrow: (arrowId, toIndex) => {
        if (active) moveSeqArrow(active.id, arrowId, toIndex);
      },
      onCreateArrow: (from, to) => {
        if (!active) return;
        const created = addSeqArrow(active.id, from, to);
        if (!created) {
          toast({ title: ru.seq.limitArrows(100), variant: 'destructive' });
        }
      },
      onClearSelection: () => setSeqSelection(null),
    };
  }, [active, project.architecture.blocks, seqSelection, seqSelectedArrows, seqColorsFromDap, colors, addSeqArrow, moveSeqArrow, reorderLifelines, setSeqSelection, setSeqSelectedArrows, toast]);

  const width = Math.max((active?.lifelines.length ?? 0) * COLUMN_W + PAD_X * 2, 480);
  const height = HEADER_H + (active?.arrows.length ?? 0) * ROW_H + PAD_BOTTOM;

  const nodes = useMemo<SeqFlowNode[]>(() => {
    if (!active) return [];
    return [
      {
        id: `seq-node-${active.id}`,
        type: 'seqDiagram' as const,
        position: { x: 0, y: 0 },
        data,
        draggable: false,
        selectable: false,
        // Явные размеры узла: мини-навигатор строит прямоугольник диаграммы
        // из node.width/height (управляемый nodes без onNodesChange не
        // получает dimension-изменения — measured у узла не заполняется).
        width,
        height,
        style: { width, height },
      },
    ];
  }, [active, data, width, height]);

  // Автоподбор масштаба при смене активной ДП или существенной смене размера.
  const seqId = active?.id ?? '';
  const arrowCount = active?.arrows.length ?? 0;
  useEffect(() => {
    if (!seqId) return;
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('skib-seq-fit-view'));
    }, 80);
    return () => clearTimeout(timer);
  }, [seqId, arrowCount]);

  // HTML5 DnD: сброс домена из набора на канву → линия жизни (Ф-38, П-12).
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('text/plain')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropHint(true);
    }
  }, []);
  const handleDragLeave = useCallback(() => setDropHint(false), []);
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDropHint(false);
      const payload = event.dataTransfer.getData('text/plain');
      // Набрасывание ЦБ (Ф-65, v0.02.01b): при отсутствии ДП создаётся ДП
      // с именем ЦБ и линиями жизни критичных доменов; иначе критичные
      // домены добавляются в текущую ДП. Можно набросить несколько ЦБ.
      if (payload.startsWith('skib-goal:')) {
        const goalId = payload.slice('skib-goal:'.length);
        const goal = project.security.goals.find((g) => g.id === goalId);
        if (!goal) return;
        if (sequences.length === 0) {
          const result = createSequenceFromGoal(goalId);
          if (!result.ok) {
            toast({ title: result.error ?? 'Ошибка', variant: 'destructive' });
            return;
          }
          if (result.seqId) setActiveSequence(result.seqId);
          toast({
            title: (result.added ?? 0) > 0
              ? ru.seq.goalCreated(goal.name, result.added ?? 0)
              : ru.seq.goalCreatedNoDomains(goal.name),
          });
          return;
        }
        const target = active ?? sequences[0];
        const result = addGoalDomains(target.id, goalId);
        if (!result.ok) {
          toast({ title: result.error ?? 'Ошибка', variant: 'destructive' });
          return;
        }
        toast({ title: (result.added ?? 0) > 0 ? ru.seq.goalAdded(result.added ?? 0) : ru.seq.goalNothingToAdd });
        return;
      }
      if (!payload.startsWith('skib-domain:')) return;
      if (!active) {
        if (sequences.length === 0) toast({ title: ru.seq.emptyList });
        else toast({ title: ru.seq.noSequenceSelected });
        return;
      }
      const blockId = payload.slice('skib-domain:'.length);
      const block = project.architecture.blocks.find((b) => b.id === blockId);
      if (!block) return; // домен вне ДАП недобавляем (П-12)
      if (active.lifelines.includes(blockId)) {
        toast({ title: ru.seq.duplicateLifeline });
        return;
      }
      if (active.lifelines.length >= 24) {
        toast({ title: ru.seq.limitLifelines(24), variant: 'destructive' });
        return;
      }
      addLifeline(active.id, blockId);
    },
    [active, addGoalDomains, addLifeline, createSequenceFromGoal, project.architecture.blocks, project.security.goals, sequences, setActiveSequence, toast],
  );

  const backgroundColor = canvasBackgroundColor(useSkibTheme()[0]);

  return (
    <div className="relative h-full w-full" data-testid="seq-canvas" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edges={[]}
        edgesFocusable={false}
        panOnScroll
        selectionOnDrag={false}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: backgroundColor }}
        onPaneClick={() => setSeqSelection(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <SeqToolbar />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          aria-label={ru.canvas.minimap}
          nodeColor={() => '#71717A'}
          nodeComponent={SeqMiniMapNode}
          className="hidden md:block"
        />
        <CanvasControls />
        <SeqFitController />
      </ReactFlow>
      {dropHint && (
        <div className="pointer-events-none absolute inset-4 z-50 rounded-lg border-2 border-dashed border-sky-400 bg-sky-400/5" />
      )}
      {!active && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <p className="max-w-md rounded-md border border-border bg-popover px-4 py-3 text-center text-sm text-muted-foreground">
            {sequences.length === 0 ? ru.seq.emptyList : ru.seq.noSequenceSelected}
          </p>
        </div>
      )}
      <AutoSelectSequence />
    </div>
  );
}

/** Автовыбор первой ДП, если активная не задана или удалена. */
function AutoSelectSequence() {
  const sequences = useSkibStore((s) => s.project.sequences);
  const activeSequenceId = useViewStore((s) => s.activeSequenceId);
  const setActiveSequence = useViewStore((s) => s.setActiveSequence);
  useEffect(() => {
    if (sequences && sequences.length > 0) {
      if (!activeSequenceId || !sequences.some((s) => s.id === activeSequenceId)) {
        setActiveSequence(sequences[0].id);
      }
    }
  }, [sequences, activeSequenceId, setActiveSequence]);
  return null;
}

/** Канва режима ДП с провайдером React Flow. */
export function SeqCanvas() {
  return (
    <ReactFlowProvider>
      <SeqCanvasInner />
    </ReactFlowProvider>
  );
}
