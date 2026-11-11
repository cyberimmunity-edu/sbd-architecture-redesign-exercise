'use client';

/**
 * Канва — зона «Канва» раздела 5.1: React Flow, узлы-домены, стрелки,
 * масштабирование и панорамирование. Создание стрелки перетаскиванием
 * от порта к порту — Ф-14; удаление выбранной стрелки клавишей Delete — НФ-10.
 * Рамка периметра целевой системы (3.5 v0.01.01) охватывает внутренние домены;
 * внешние системы рисуются вне рамки, при попытке перенести их внутрь —
 * выносятся вправо с предупреждением. Цвета стрелок — по целостности потоков:
 * зелёные из доверенных источников, красные — низкоцелостные.
 * Читаемость стрелок (v0.01.01): при наведении на стрелку или домен (а также
 * при выделении) связанные стрелки подчёркиваются и выводятся над узлами,
 * остальные приглушаются; подписи — на непрозрачной плашке с контуром цвета
 * стрелки, длинные сокращаются (полный текст — на активной стрелке);
 * параллельные стрелки одной пары узлов разведены по кривизне дуги.
 * Вид канвы (v0.01.02): кнопки «Стрелки» (скрыть/показать стрелки-связи) и
 * «Периметр» (фокус на внутреннем периметре — внешние системы и их связи
 * скрываются). Настройки вида не влияют на расчёты стоимости и доверия.
 * Вид канвы (v0.01.03): кнопка «Раскладка» — автоматическая раскладка доменов
 * по слоям связей внутри периметра (как во Flying Logic); кнопки «+/−» у
 * портов домена сворачивают стрелки порта (свёрнутые не отображаются до
 * явного открытия или смены режима); мини-навигатор слева снизу (как в Archi);
 * кнопки масштаба с видимыми иконками справа снизу, включая «вместить»;
 * вид канвы (пан/зум) и ручные позиции доменов запоминаются в localStorage.
 * Стрелки с обходом доменов (v0.01.04): форма стрелок рассчитывается
 * в src/engine/edgeRouting.ts (решётка A* вокруг доменов) — стрелки идут
 * по свободным сторонам, а не сквозь блоки; при перемещении домена
 * форма перестраивается. Связь с таблицей ДВБ (v0.01.04): наведение
 * на строку в «Расширенном анализе ДВБ» подсвечивает домен на диаграмме
 * и в мини-навигаторе (viewStore.highlightedDomainId); клик по строке —
 * фокус на домене (в центр, с укрупнением) и выбор — FocusController
 * ловит событие skib-focus-node и вызывает setCenter; выделение узла
 * синхронизировано с хранилищем (selected-флаги узлов).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Crosshair, Network, Waypoints } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSkibStore } from '../store/projectStore';
import { FOCUS_NODE_EVENT, useViewStore } from '../store/viewStore';
import { recalcCosts } from '../engine/cost';
import { recalcCoverage } from '../engine/coverage';
import { computeAutoLayout } from '../engine/layout';
import {
  frameBounds,
  isInsideFrame,
} from '../engine/trust';
import type { Status } from '../engine/types';
import { DomainNode, type DomainFlowNode, type DomainNodeData } from './DomainNode';
import { CanvasControls } from './CanvasControls';
import { RoutingEdge, type RoutingEdgeData } from './RoutingEdge';
import { ru } from '../i18n/ru';
import { HIGHLIGHT_COLOR, TRUST_COLORS } from './status';
import { canvasBackgroundColor, canvasGridColor, edgeLabelColor, useSkibTheme } from './theme';

/** Данные рамки периметра целевой системы. */
export interface PerimeterNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  height: number;
}

/** Тип рамки периметра. */
export type PerimeterFlowNode = Node<PerimeterNodeData, 'perimeter'>;

/** Узлы канвы: домены и рамка периметра. */
export type CanvasNode = DomainFlowNode | PerimeterFlowNode;

const nodeTypes = { domain: DomainNode, perimeter: PerimeterNode } as const;
const edgeTypes = { routing: RoutingEdge } as const;

/**
 * Фокус на домене по событию FOCUS_NODE_EVENT (v0.01.04) — клик по строке
 * в таблице «Расширенный анализ ДВБ»: диаграмма центрируется на домене,
 * укрупняется (но не отдаляется, если пользователь уже ближе) и домен
 * выделяется. Хук useReactFlow действует только внутри ReactFlowProvider.
 */
function FocusController() {
  const { setCenter, getNodes, getZoom } = useReactFlow();
  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      const node = getNodes().find((n) => n.id === id);
      if (!node) return;
      const width = node.measured?.width ?? 240;
      const height = node.measured?.height ?? 120;
      // Центр домена: все узлы канвы — верхнего уровня, позиция абсолютная.
      const x = node.position.x + width / 2;
      const y = node.position.y + height / 2;
      const zoom = Math.min(Math.max(getZoom(), 1.25), 2);
      void setCenter(x, y, { zoom, duration: 420 });
    };
    window.addEventListener(FOCUS_NODE_EVENT, handler);
    return () => window.removeEventListener(FOCUS_NODE_EVENT, handler);
  }, [setCenter, getNodes, getZoom]);
  return null;
}

/** Подписи стрелок длиннее этого предела сокращаются; полный текст — на активной стрелке. */
const EDGE_LABEL_LIMIT = 28;

/* Запоминание вида канвы (v0.01.03): пан/зум сохраняются в localStorage и
   восстанавливаются при следующем открытии — ручная конфигурация не теряется. */
const VIEWPORT_KEY = 'skib-viewport-v1';

function readStoredViewport(): Viewport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.zoom === 'number' &&
      parsed.zoom > 0
    ) {
      return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
    }
  } catch {
    // Повреждённый вид игнорируется — канва откроется «вместить».
  }
  return null;
}

function saveViewport(viewport: Viewport): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
  } catch {
    // Переполнение хранилища не должно ломать работу (НФ-5).
  }
}

function truncateLabel(label: string): string {
  return `${label.slice(0, EDGE_LABEL_LIMIT - 1).trimEnd()}…`;
}

/** Рамка периметра целевой системы — неинтерактивный узел под доменами. */
function PerimeterNode({ data }: NodeProps<PerimeterFlowNode>) {
  return (
    <div
      className="pointer-events-none flex h-full w-full items-start justify-start rounded-lg"
      style={{
        border: '2px dashed rgba(113, 113, 122, 0.55)',
        background: 'rgba(113, 113, 122, 0.05)',
      }}
      aria-label={data.label}
    >
      <span
        className="absolute left-3 top-1.5 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        style={{ transform: 'translateY(-2px)' }}
      >
        {data.label}
      </span>
    </div>
  );
}

export function Canvas() {
  const project = useSkibStore((s) => s.project);
  const selection = useSkibStore((s) => s.selection);
  const setSelection = useSkibStore((s) => s.setSelection);
  const placeFunction = useSkibStore((s) => s.placeFunction);
  const unplaceFunction = useSkibStore((s) => s.unplaceFunction);
  const addEdgeToStore = useSkibStore((s) => s.addEdge);
  const deleteEdge = useSkibStore((s) => s.deleteEdge);
  const updatePositions = useSkibStore((s) => s.updatePositions);
  const applyAutoLayout = useSkibStore((s) => s.applyAutoLayout);
  // Настройки вида канвы (v0.01.02): показ стрелок и фокус на периметре.
  // Свёрнутые порты стрелок (v0.01.03): ключ `${blockId}:in|out` → свёрнут.
  // Подсветка из таблицы ДВБ (v0.01.04): идентификатор домена под курсором.
  const showEdges = useViewStore((s) => s.showEdges);
  const focusInternal = useViewStore((s) => s.focusInternal);
  const collapsedPorts = useViewStore((s) => s.collapsedPorts);
  const highlightedDomainId = useViewStore((s) => s.highlightedDomainId);
  const toggleShowEdges = useViewStore((s) => s.toggleShowEdges);
  const toggleFocusInternal = useViewStore((s) => s.toggleFocusInternal);
  const expandAllPorts = useViewStore((s) => s.expandAllPorts);
  const { toast } = useToast();
  const [theme] = useSkibTheme();
  // Наведение на стрелку или домен — временная подсветка связей (без истории операций).
  const [hoverFocus, setHoverFocus] = useState<{ kind: 'edge' | 'node'; id: string } | null>(null);
  // Вид канвы: восстановление сохранённого пан/зум; при отсутствии — «вместить».
  const initialViewport = useMemo(() => readStoredViewport(), []);

  const { costs, trust } = useMemo(() => recalcCosts(project), [project]);
  const { goalStatuses, domainStatuses } = useMemo(() => recalcCoverage(project), [project]);

  const goalStatusOf = useCallback(
    (fn: { id: string }): Status[] => {
      const links = project.security.functions.find((f) => f.id === fn.id)?.implements ?? [];
      return links.map((link) => goalStatuses.get(link.goal) ?? 'red');
    },
    [project.security.functions, goalStatuses],
  );

  const functionsByBlock = useMemo(() => {
    const map = new Map<string, typeof project.security.functions>();
    for (const block of project.architecture.blocks) map.set(block.id, []);
    const byId = new Map(project.security.functions.map((fn) => [fn.id, fn]));
    for (const assignment of project.assignments) {
      const fn = byId.get(assignment.function);
      const list = map.get(assignment.block);
      if (fn && list) list.push(fn);
    }
    return map;
  }, [project]);

  // Число стрелок на каждом порту (вход/выход) — для кнопок «+/−» (v0.01.03).
  const portCounts = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    for (const block of project.architecture.blocks) map.set(block.id, { in: 0, out: 0 });
    for (const edge of project.architecture.edges) {
      const from = map.get(edge.from);
      if (from) from.out += 1;
      const to = map.get(edge.to);
      if (to) to.in += 1;
    }
    return map;
  }, [project.architecture]);

  // Рамка периметра строится по внутренним доменам; внешние — вне рамки.
  const frame = useMemo(() => frameBounds(project.architecture), [project.architecture]);

  // Фокус на внутреннем периметре (v0.01.02): внешние системы скрыты.
  const visibleBlocks = useMemo(
    () =>
      focusInternal
        ? project.architecture.blocks.filter((b) => !b.external)
        : project.architecture.blocks,
    [project.architecture.blocks, focusInternal],
  );

  // Внешние системы и их связи скрыты в режиме фокуса (v0.01.02).
  const externalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const block of project.architecture.blocks) {
      if (block.external) ids.add(block.id);
    }
    return ids;
  }, [project.architecture.blocks]);

  const nodes = useMemo<CanvasNode[]>(() => {
    const list: CanvasNode[] = [];
    if (frame) {
      list.push({
        id: '__perimeter',
        type: 'perimeter' as const,
        position: { x: frame.x, y: frame.y },
        draggable: false,
        selectable: false,
        deletable: false,
        zIndex: -1,
        data: {
          label: ru.canvas.perimeter,
          width: frame.width,
          height: frame.height,
        },
        style: { width: frame.width, height: frame.height },
      });
    }
    for (const block of visibleBlocks) {
      list.push({
        id: block.id,
        type: 'domain' as const,
        position: block.position ?? { x: 0, y: 0 },
        // Выделение синхронизировано с хранилищем (v0.01.04): клик по строке
        // таблицы ДВБ выбирает домен и на канве, не только в инспекторе.
        selected: selection?.kind === 'domain' && selection.id === block.id,
        data: {
          blockId: block.id,
          name: block.name,
          blockCost: block.cost,
          cost: costs.get(block.id) ?? {
            blockCost: block.cost,
            functionsCost: 0,
            edgeCount: 0,
            multiplier: 1,
            trustCoefficient: 0.1,
            domainCost: Math.ceil(block.cost * 0.1),
            external: block.external ?? false,
          },
          status: domainStatuses.get(block.id) ?? 'neutral',
          trustClass: trust.internal.get(block.id) ?? 'ndb',
          external: block.external ?? false,
          externalTrusted: block.trusted ?? false,
          functions: block.external ? [] : (functionsByBlock.get(block.id) ?? []),
          portCounts: portCounts.get(block.id) ?? { in: 0, out: 0 },
          goalStatusOf,
          onPlace: placeFunction,
          onUnplace: unplaceFunction,
          onDecompose: (blockId: string) => {
            window.dispatchEvent(new CustomEvent('skib-decompose', { detail: blockId }));
          },
          onCardSelect: (functionId: string) =>
            setSelection({ kind: 'card', id: functionId }),
          selectedCardId: selection?.kind === 'card' ? selection.id : null,
        } satisfies DomainNodeData,
      });
    }
    return list;
  }, [
    visibleBlocks,
    costs,
    trust,
    domainStatuses,
    functionsByBlock,
    portCounts,
    goalStatusOf,
    placeFunction,
    unplaceFunction,
    selection,
    setSelection,
    frame,
  ]);

  // Источник подсветки: наведение приоритетнее выделения из хранилища.
  const focus = useMemo<{ kind: 'edge' | 'node'; id: string } | null>(() => {
    if (hoverFocus) return hoverFocus;
    if (!selection) return null;
    if (selection.kind === 'edge') return { kind: 'edge', id: selection.id };
    if (selection.kind === 'domain') return { kind: 'node', id: selection.id };
    return null;
  }, [hoverFocus, selection]);

  // Стрелки, связанные с источником подсветки; null — подсветки нет.
  const focusedEdgeIds = useMemo(() => {
    if (!focus) return null;
    if (focus.kind === 'edge') return new Set([focus.id]);
    const connected = new Set<string>();
    for (const edge of project.architecture.edges) {
      if (edge.from === focus.id || edge.to === focus.id) connected.add(edge.id);
    }
    return connected;
  }, [focus, project.architecture.edges]);

  const edges = useMemo<Edge[]>(() => {
    // Скрытие стрелок, фокус на периметре и свёрнутые порты — только вид:
    // модель и расчёты остаются полными (v0.01.02, v0.01.03).
    if (!showEdges) return [];
    const modelEdges = project.architecture.edges.filter(
      (edge) =>
        // Фокус на периметре: связи с внешними системами скрыты (v0.01.02).
        (!focusInternal || (!externalIds.has(edge.from) && !externalIds.has(edge.to))) &&
        // Свёрнутые порты: стрелки не отображаются до явного открытия (v0.01.03).
        !collapsedPorts[`${edge.from}:out`] &&
        !collapsedPorts[`${edge.to}:in`],
    );
    // Параллельные стрелки одной пары узлов разводятся перпендикулярным
    // сдвигом (вместо кривизны v0.01.01–v0.01.03 — форма теперь общая
    // для пары, обходящая домены; RoutingEdge применит сдвиг к точкам).
    const pairIndex = new Map<string, number>();
    const pairCount = new Map<string, number>();
    for (const edge of modelEdges) {
      const pairKey = [edge.from, edge.to].sort().join('~');
      pairCount.set(pairKey, (pairCount.get(pairKey) ?? 0) + 1);
    }
    return modelEdges.map((edge) => {
      // Цвет стрелки — целостность потока: зелёная из доверенного источника,
      // красная — низкоцелостный поток (3.5 v0.01.01).
      const color = trust.edges.get(edge.id) === 'green' ? TRUST_COLORS.green.border : TRUST_COLORS.red.border;
      const pairKey = [edge.from, edge.to].sort().join('~');
      const nth = pairIndex.get(pairKey) ?? 0;
      pairIndex.set(pairKey, nth + 1);
      // Разводка параллельных стрелок: ±8 px вокруг оси пары.
      const shift = (nth - ((pairCount.get(pairKey) ?? 1) - 1) / 2) * 8;
      const isFocused = focusedEdgeIds?.has(edge.id) ?? false;
      const dimmed = focusedEdgeIds !== null && !isFocused;
      const label = edge.label ?? '';
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: 'routing' as const,
        data: {
          label: isFocused || label.length <= EDGE_LABEL_LIMIT ? label || undefined : truncateLabel(label),
          color,
          labelColor: edgeLabelColor(theme),
          focused: isFocused,
          dimmed,
          shift,
        } satisfies RoutingEdgeData,
        animated: false,
        style: { stroke: color, strokeWidth: isFocused ? 3 : 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: isFocused ? 20 : 16,
          height: isFocused ? 20 : 16,
        },
        // Активная стрелка выводится над узлами — связь читается сквозь
        // полупрозрачные заливки доменов.
        zIndex: isFocused ? 5 : 0,
        className: dimmed ? 'skib-edge skib-edge--dim' : 'skib-edge',
      } as Edge;
    });
  }, [project.architecture.edges, externalIds, showEdges, focusInternal, collapsedPorts, trust, theme, focusedEdgeIds]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<CanvasNode>(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(edges);

  // Синхронизация канвы с хранилищем проекта.
  useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);
  useEffect(() => {
    setRfEdges(edges);
  }, [edges, setRfEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      onNodesChange(changes);
      // Перемещение узлов применяется к модели при завершении перетаскивания.
      const positionChanges = changes.filter(
        (change) => change.type === 'position' && change.dragging === false,
      ) as Array<{ type: 'position'; id: string; position?: { x: number; y: number } }>;
      if (positionChanges.length === 0) return;

      const positions: Record<string, { x: number; y: number }> = {};
      for (const change of positionChanges) {
        if (change.position && change.id !== '__perimeter') positions[change.id] = change.position;
      }
      // Внешняя система не может находиться внутри рамки периметра (3.5 v0.01.01):
      // при попытке она выносится вправо за рамку с предупреждением.
      const currentFrame = frameBounds(useSkibStore.getState().project.architecture);
      if (currentFrame) {
        for (const block of useSkibStore.getState().project.architecture.blocks) {
          if (!block.external) continue;
          const position = positions[block.id] ?? block.position;
          if (position && isInsideFrame(position, currentFrame)) {
            positions[block.id] = { x: currentFrame.x + currentFrame.width + 80, y: position.y };
            toast({ title: ru.canvas.externalInsideFrame });
          }
        }
      }
      if (Object.keys(positions).length > 0) updatePositions(positions);
    },
    [onNodesChange, updatePositions, toast],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
      // Выделение стрелки синхронизируется с инспектором.
      for (const change of changes) {
        if (change.type === 'select') {
          if (change.selected) setSelection({ kind: 'edge', id: change.id });
        }
      }
    },
    [onEdgesChange, setSelection],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdgeToStore(connection.source, connection.target);
      }
    },
    [addEdgeToStore],
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => deleteEdge(edgeId),
    [deleteEdge],
  );

  // Автоматическая раскладка (v0.01.03): слои по связям внутри периметра,
  // внешние системы — правее рамки; свёрнутые порты раскрываются (смена
  // режима), вид — «вместить». Отмена — Ctrl+Z (операция в истории).
  const handleAutoLayout = useCallback(() => {
    const architecture = useSkibStore.getState().project.architecture;
    const positions = computeAutoLayout(architecture);
    if (positions.size === 0) return;
    const record: Record<string, { x: number; y: number }> = {};
    positions.forEach((position, id) => {
      record[id] = position;
    });
    applyAutoLayout(record);
    expandAllPorts();
    window.dispatchEvent(new CustomEvent('skib-fit-view'));
    toast({ title: ru.canvas.layoutApplied });
  }, [applyAutoLayout, expandAllPorts, toast]);

  // Delete удаляет только выбранную стрелку (НФ-10); домены удаляются из инспектора (Ф-15).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const current = useSkibStore.getState().selection;
      if (current?.kind === 'edge') {
        event.preventDefault();
        deleteEdge(current.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteEdge]);

  return (
    <section className="relative min-w-0 flex-1" aria-label={ru.pool.dragHint}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onEdgesDelete={(deleted) => deleted.forEach((edge) => handleEdgeDelete(edge.id))}
        onNodeClick={(_, node) => {
          if (node.id === '__perimeter') return;
          setSelection({ kind: 'domain', id: node.id });
        }}
        onPaneClick={() => setSelection(null)}
        onEdgeMouseEnter={(_, edge) => setHoverFocus({ kind: 'edge', id: edge.id })}
        onEdgeMouseLeave={() => setHoverFocus((current) => (current?.kind === 'edge' ? null : current))}
        onNodeMouseEnter={(_, node) => {
          if (node.id !== '__perimeter') setHoverFocus({ kind: 'node', id: node.id });
        }}
        onNodeMouseLeave={() => setHoverFocus((current) => (current?.kind === 'node' ? null : current))}
        // Вид канвы (v0.01.03): сохранённый пан/зум восстанавливается;
        // без сохранённого вида диаграмма открывается «вместить».
        defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!initialViewport}
        fitViewOptions={{ padding: 0.12 }}
        onMoveEnd={(_, viewport) => saveViewport(viewport)}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        style={{ background: canvasBackgroundColor(theme) }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color={canvasGridColor(theme)}
        />
        {/* Кнопки масштаба с видимыми иконками (v0.01.03): «+», «−», «вместить». */}
        <CanvasControls />
        {/* Фокус на домене по клику на строку таблицы ДВБ (v0.01.04). */}
        <FocusController />
        {/* Мини-навигатор слева снизу (v0.01.03, как в Archi): вся диаграмма
            целиком, перемещение и масштабирование по ней. */}
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          ariaLabel={ru.canvas.minimap}
          style={{
            width: 184,
            height: 132,
            backgroundColor: theme === 'dark' ? '#1C1C21' : '#FFFFFF',
          }}
          maskColor={theme === 'dark' ? 'rgba(24, 24, 27, 0.72)' : 'rgba(250, 250, 250, 0.72)'}
          nodeColor={(node) => {
            if (node.id === '__perimeter') return 'transparent';
            const data = node.data as DomainNodeData;
            if (data.external) return data.externalTrusted ? TRUST_COLORS.green.border : TRUST_COLORS.red.border;
            if (data.trustClass === 'ddbpcd') return TRUST_COLORS.yellow.border;
            return data.trustClass === 'ddb' ? TRUST_COLORS.green.border : TRUST_COLORS.red.border;
          }}
          // Подсветка домена из таблицы ДВБ (v0.01.04): голубой контур
          // узла в мини-навигаторе — как на самой диаграмме.
          nodeStrokeColor={(node) => (node.id === highlightedDomainId ? HIGHLIGHT_COLOR : 'transparent')}
          nodeStrokeWidth={highlightedDomainId ? 2 : 1}
        />
        {/* Кнопки вида канвы (v0.01.02–v0.01.03): стрелки, периметр, раскладка. */}
        <Panel position="top-left" className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={showEdges ? 'secondary' : 'outline'}
            className="h-8 bg-popover/95 shadow-sm"
            data-testid="toggle-edges"
            aria-pressed={showEdges}
            title={showEdges ? ru.canvas.edgesShownTitle : ru.canvas.edgesHiddenTitle}
            onClick={toggleShowEdges}
          >
            <Waypoints className="mr-1 h-3.5 w-3.5" aria-hidden />
            {ru.canvas.labelEdges}
          </Button>
          <Button
            size="sm"
            variant={focusInternal ? 'secondary' : 'outline'}
            className="h-8 bg-popover/95 shadow-sm"
            data-testid="focus-internal"
            aria-pressed={focusInternal}
            title={focusInternal ? ru.canvas.focusOnTitle : ru.canvas.focusOffTitle}
            onClick={toggleFocusInternal}
          >
            <Crosshair className="mr-1 h-3.5 w-3.5" aria-hidden />
            {ru.canvas.labelFocus}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 bg-popover/95 shadow-sm"
            data-testid="auto-layout"
            title={ru.canvas.layoutTitle}
            onClick={handleAutoLayout}
          >
            <Network className="mr-1 h-3.5 w-3.5" aria-hidden />
            {ru.canvas.labelLayout}
          </Button>
        </Panel>
      </ReactFlow>
      {project.architecture.blocks.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-border bg-popover/95 px-6 py-4 text-sm text-muted-foreground">
            {ru.canvas.empty}
          </div>
        </div>
      )}
    </section>
  );
}
