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
 * форма перестраивается. Читаемость стрелок (v0.01.05): сглаживание формы
 * (срез углов Чейкина + кубические кривые) и развязка портов — стрелки
 * с общим портом расходятся веером (computeEdgeFans), чтобы линии
 * не сливались в неразличимый пучок.
 * Централизованная трассировка (v0.01.07): формы всех стрелок канвы
 * рассчитываются здесь, последовательно по идентификаторам — клетки
 * коридоров прежних стрелок дорожают (мягкая развязка, как splines=true
 * в Graphviz), линии расходятся параллельными дорожками вместо слияния
 * в пучки; встречные стрелки (приёмник левее источника) выходят из левого
 * порта источника и входят в правый порт приёмника. Автоматическая
 * раскладка (v0.01.07) учитывает измеренные габариты узлов.
 * Связь с таблицей ДВБ (v0.01.04): наведение
 * на строку в «Расширенном анализе ДВБ» подсвечивает домен на диаграмме
 * и в мини-навигаторе (viewStore.highlightedDomainId); клик по строке —
 * фокус на домене (в центр, с укрупнением) и выбор — FocusController
 * ловит событие skib-focus-node и вызывает setCenter; выделение узла
 * синхронизировано с хранилищем (selected-флаги узлов). Клик по цели
 * безопасности подгоняет масштаб под все критичные для неё домены
 * (событие skib-focus-rect, v0.01.10); клик по функции — фокус на домене
 * её размещения.
 * Сброс карточки на свободное место канвы (v0.01.06): сразу создаётся новый
 * домен безопасности с этой функцией внутри (dropFunctionAsNewDomain — одна
 * операция с историей); сброс на внешний системный блок отклоняется
 * с подсказкой. Для координат сброса канва обёрнута в ReactFlowProvider
 * (screenToFlowPosition пересчитывает экранные координаты в координаты модели).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  getViewportForBounds,
  MiniMap,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Crosshair, Network, Scaling, Waypoints } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSkibStore } from '../store/projectStore';
import { FOCUS_NODE_EVENT, FOCUS_RECT_EVENT, useViewStore } from '../store/viewStore';
import { recalcCosts } from '../engine/cost';
import { recalcCoverage } from '../engine/coverage';
import { computeAutoLayout } from '../engine/layout';
import {
  routeEdges,
  type RoutePoint,
  type RouteRect,
} from '../engine/edgeRouting';
import { domainSizeFactors, sizeForFactor } from '../engine/sizing';
import {
  frameBounds,
  isInsideFrame,
  NODE_ESTIMATED_HEIGHT,
  NODE_ESTIMATED_WIDTH,
} from '../engine/trust';
import { MAX_DOMAINS } from '../engine/types';
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
 * в таблице «Расширенный анализ ДВБ» или по функции безопасности (v0.01.10):
 * диаграмма центрируется на домене, укрупняется (но не отдаляется, если
 * пользователь уже ближе) и домен выделяется.
 * Вмещение доменов по событию FOCUS_RECT_EVENT (v0.01.10) — клик по цели
 * безопасности: масштаб подбирается так, чтобы все перечисленные домены
 * (критичные для цели) помещались в видимую область диаграммы.
 * Хук useReactFlow действует только внутри ReactFlowProvider.
 */
function FocusController() {
  const { setCenter, setViewport, getNodes, getZoom } = useReactFlow();
  useEffect(() => {
    const focusNode = (id: string): void => {
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
    const fitDomains = (ids: string[]): void => {
      const nodes = getNodes().filter((node) => ids.includes(node.id));
      if (nodes.length === 0) return;
      // Охватывающий прямоугольник перечисленных доменов (measured — точные
      // габариты, без них — оценка из движка).
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of nodes) {
        const width = node.measured?.width ?? NODE_ESTIMATED_WIDTH;
        const height = node.measured?.height ?? NODE_ESTIMATED_HEIGHT;
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + width);
        maxY = Math.max(maxY, node.position.y + height);
      }
      // Размер видимой области — сам контейнер канвы.
      const container = document.querySelector<HTMLElement>('.react-flow');
      const width = container?.clientWidth ?? 0;
      const height = container?.clientHeight ?? 0;
      if (width < 40 || height < 40) return;
      const viewport = getViewportForBounds(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        width,
        height,
        0.25,
        2,
        0.12,
      );
      void setViewport(viewport, { duration: 420 });
    };
    const handleFocusNode = (event: Event) => {
      focusNode((event as CustomEvent<string>).detail);
    };
    const handleFocusRect = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail;
      if (Array.isArray(ids) && ids.length > 0) fitDomains(ids);
    };
    window.addEventListener(FOCUS_NODE_EVENT, handleFocusNode);
    window.addEventListener(FOCUS_RECT_EVENT, handleFocusRect);
    return () => {
      window.removeEventListener(FOCUS_NODE_EVENT, handleFocusNode);
      window.removeEventListener(FOCUS_RECT_EVENT, handleFocusRect);
    };
  }, [setCenter, setViewport, getNodes, getZoom]);
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

function CanvasInner() {
  const project = useSkibStore((s) => s.project);
  const selection = useSkibStore((s) => s.selection);
  const setSelection = useSkibStore((s) => s.setSelection);
  const placeFunction = useSkibStore((s) => s.placeFunction);
  const unplaceFunction = useSkibStore((s) => s.unplaceFunction);
  const dropFunctionAsNewDomain = useSkibStore((s) => s.dropFunctionAsNewDomain);
  const addEdgeToStore = useSkibStore((s) => s.addEdge);
  const deleteEdge = useSkibStore((s) => s.deleteEdge);
  const updatePositions = useSkibStore((s) => s.updatePositions);
  const applyAutoLayout = useSkibStore((s) => s.applyAutoLayout);
  // Настройки вида канвы (v0.01.02): показ стрелок и фокус на периметре.
  // Свёрнутые порты стрелок (v0.01.03): ключ `${blockId}:in|out` → свёрнут.
  // Подсветка из таблицы ДВБ (v0.01.04): идентификатор домена под курсором.
  // Краткая подсветка критичных доменов цели (v0.01.09).
  const showEdges = useViewStore((s) => s.showEdges);
  const focusInternal = useViewStore((s) => s.focusInternal);
  const collapsedPorts = useViewStore((s) => s.collapsedPorts);
  const highlightedDomainId = useViewStore((s) => s.highlightedDomainId);
  const flashDomainIds = useViewStore((s) => s.flashDomainIds);
  const toggleShowEdges = useViewStore((s) => s.toggleShowEdges);
  const toggleFocusInternal = useViewStore((s) => s.toggleFocusInternal);
  const expandAllPorts = useViewStore((s) => s.expandAllPorts);
  // Автоматические размеры доменов (v0.01.08): off → cost → block.
  const sizeMode = useViewStore((s) => s.sizeMode);
  const cycleSizeMode = useViewStore((s) => s.cycleSizeMode);
  const { toast } = useToast();
  const [theme] = useSkibTheme();
  // Координаты сброса карточки на свободное место канвы (v0.01.06).
  const { screenToFlowPosition, getNodes } = useReactFlow();
  // Наведение на стрелку или домен — временная подсветка связей (без истории операций).
  const [hoverFocus, setHoverFocus] = useState<{ kind: 'edge' | 'node'; id: string } | null>(null);
  // Вид канвы: восстановление сохранённого пан/зум; при отсутствии — «вместить».
  const initialViewport = useMemo(() => readStoredViewport(), []);

  const { costs, trust } = useMemo(() => recalcCosts(project), [project]);
  const { goalStatuses, domainStatuses } = useMemo(() => recalcCoverage(project), [project]);
  // Факторы роста узлов для режима «Размеры» (v0.01.08): площадь домена
  // пропорциональна стоимости или C_блока; на расчёты не влияет.
  const sizeFactors = useMemo(
    () => domainSizeFactors(project, costs, sizeMode),
    [project, costs, sizeMode],
  );

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
          forceTrusted: !block.external && (block.forceTrusted ?? false),
          functions: block.external ? [] : (functionsByBlock.get(block.id) ?? []),
          portCounts: portCounts.get(block.id) ?? { in: 0, out: 0 },
          // Автоматические размеры (v0.01.08): габариты только в режимах cost/block.
          size: sizeMode === 'off' ? undefined : sizeForFactor(sizeFactors.get(block.id) ?? 1),
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
    // Автоматические размеры доменов (v0.01.08).
    sizeMode,
    sizeFactors,
  ]);

  // Состояние узлов канвы: живёт до трассировки — routing читает актуальные
  // позиции и измеренные габариты (в том числе во время перетаскивания).
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<CanvasNode>(nodes);

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

  // Видимые стрелки: фильтр по режимам вида — модель и расчёты остаются
  // полными (v0.01.02, v0.01.03).
  const modelEdges = useMemo(
    () =>
      project.architecture.edges.filter(
        (edge) =>
          // Фокус на периметре: связи с внешними системами скрыты (v0.01.02).
          (!focusInternal || (!externalIds.has(edge.from) && !externalIds.has(edge.to))) &&
          // Свёрнутые порты: стрелки не отображаются до явного открытия (v0.01.03).
          !collapsedPorts[`${edge.from}:out`] &&
          !collapsedPorts[`${edge.to}:in`],
      ),
    [project.architecture.edges, externalIds, focusInternal, collapsedPorts],
  );

  // Централизованная трассировка стрелок (v0.01.07–v0.01.09): готовые
  // ломаные для каждой видимой стрелки и стороны портов. С v0.01.09 весь
  // цикл трассировки живёт в движке (routeEdges в src/engine/edgeRouting.ts):
  // канва передаёт габариты доменов и видимые стрелки — там считаются
  // стороны портов, веера, скользящие якоря, родственные группы штрафов
  // и формы стрелок; направление стрелки задаётся жестом соединения
  // (см. handleConnectStart/End).
  const routing = useMemo<{
    paths: Map<string, RoutePoint[]>;
    sides: Map<string, { source: 'left' | 'right'; target: 'left' | 'right' }>;
  }>(() => {
    if (!showEdges || modelEdges.length === 0) {
      return { paths: new Map(), sides: new Map() };
    }
    // Прямоугольники доменов — по узлам канвы (актуальны во время drag).
    const rects = new Map<string, RouteRect>();
    for (const node of rfNodes) {
      if (node.type !== 'domain') continue;
      rects.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? NODE_ESTIMATED_WIDTH,
        height: node.measured?.height ?? NODE_ESTIMATED_HEIGHT,
      });
    }
    return routeEdges({ rects, edges: modelEdges });
  }, [rfNodes, modelEdges, showEdges]);

  const edges = useMemo<Edge[]>(() => {
    if (!showEdges) return [];
    return modelEdges.map((edge) => {
      // Цвет стрелки — целостность потока: зелёная из доверенного источника,
      // красная — низкоцелостный поток (3.5 v0.01.01).
      const color = trust.edges.get(edge.id) === 'green' ? TRUST_COLORS.green.border : TRUST_COLORS.red.border;
      const isFocused = focusedEdgeIds?.has(edge.id) ?? false;
      const dimmed = focusedEdgeIds !== null && !isFocused;
      const label = edge.label ?? '';
      const side = routing.sides.get(edge.id);
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: 'routing' as const,
        // Стороны портов от трассировки (v0.01.07): встречные стрелки
        // подключаются к левому выходу источника и правому входу приёмника.
        sourceHandle: side?.source === 'left' ? 'left' : undefined,
        targetHandle: side?.target === 'right' ? 'right' : undefined,
        data: {
          label: isFocused || label.length <= EDGE_LABEL_LIMIT ? label || undefined : truncateLabel(label),
          color,
          labelColor: edgeLabelColor(theme),
          focused: isFocused,
          dimmed,
          points: routing.paths.get(edge.id),
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
  }, [modelEdges, routing, showEdges, trust, theme, focusedEdgeIds]);

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

  // Соединение доменов — направление задаёт жест (v0.01.08): React Flow
  // больше не решает направление по типу хэндла (стековые точки ввода/вывода
  // переворачивали стрелку). onConnectStart запоминает узел-старт,
  // onConnectEnd находит домен под курсором (прилепиться можно к любой
  // точке домена, не только к точке) и создаёт стрелку старт → цель.
  const connectStartRef = useRef<string | null>(null);
  const handleConnect = useCallback(() => {
    // Намеренно пусто: создание стрелки — только в handleConnectEnd (v0.01.08).
  }, []);
  const handleConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: { nodeId?: string | null }) => {
      connectStartRef.current = params.nodeId ?? null;
    },
    [],
  );
  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const startId = connectStartRef.current;
      connectStartRef.current = null;
      if (!startId) return;
      // Мышь или касание: точка отпускания — последняя изменённая позиция.
      const point =
        'changedTouches' in event
          ? (event.changedTouches[0] ?? event.touches[0] ?? null)
          : event;
      if (!point) return;
      const flowPoint = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      // Домен под курсором (с допуском 8 px за границу для удобства попадания).
      for (const node of getNodes()) {
        if (node.id === '__perimeter' || node.type !== 'domain') continue;
        const width = node.measured?.width ?? NODE_ESTIMATED_WIDTH;
        const height = node.measured?.height ?? NODE_ESTIMATED_HEIGHT;
        const inside =
          flowPoint.x >= node.position.x - 8 &&
          flowPoint.x <= node.position.x + width + 8 &&
          flowPoint.y >= node.position.y - 8 &&
          flowPoint.y <= node.position.y + height + 8;
        if (!inside) continue;
        if (node.id !== startId) addEdgeToStore(startId, node.id);
        return;
      }
    },
    [addEdgeToStore, getNodes, screenToFlowPosition],
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => deleteEdge(edgeId),
    [deleteEdge],
  );

  // Автоматическая раскладка (v0.01.03, v0.01.07): слои по связям внутри
  // периметра, внешние системы по сторонам рамки (источники — слева,
  // приёмники — справа), зазоры — по измеренным габаритам узлов; свёрнутые
  // порты раскрываются (смена режима), вид — «вместить». Отмена — Ctrl+Z
  // (операция в истории).
  const handleAutoLayout = useCallback(() => {
    const architecture = useSkibStore.getState().project.architecture;
    // Измеренные габариты узлов канвы (v0.01.07): вертикальные зазоры и
    // ширины колонок учитывают фактическую высоту доменов с функциями.
    const sizes = new Map<string, { width: number; height: number }>();
    for (const node of getNodes()) {
      if (node.type !== 'domain') continue;
      sizes.set(node.id, {
        width: node.measured?.width ?? NODE_ESTIMATED_WIDTH,
        height: node.measured?.height ?? NODE_ESTIMATED_HEIGHT,
      });
    }
    const positions = computeAutoLayout(architecture, { sizes });
    if (positions.size === 0) return;
    const record: Record<string, { x: number; y: number }> = {};
    positions.forEach((position, id) => {
      record[id] = position;
    });
    applyAutoLayout(record);
    expandAllPorts();
    window.dispatchEvent(new CustomEvent('skib-fit-view'));
    toast({ title: ru.canvas.layoutApplied });
  }, [applyAutoLayout, expandAllPorts, toast, getNodes]);

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

  // Сброс карточки функции на канву (v0.01.06): на свободном месте сразу
  // создаётся новый домен безопасности с функцией внутри; на внутреннем
  // домене — обычное размещение (узел обрабатывает сам и гасит событие);
  // на внешней системе — подсказка. Разрешаем сброс только для карточек пула.
  const handleCanvasDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes('application/x-skib-function')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [],
  );

  const handleCanvasDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const functionId = event.dataTransfer.getData('application/x-skib-function');
      if (!functionId) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Узел под курсором: внутренний домен уже обработал размещение
      // (stopPropagation в DomainNode); внешняя система отклоняет сброс.
      for (const node of getNodes()) {
        if (node.id === '__perimeter') continue;
        const width = node.measured?.width ?? NODE_ESTIMATED_WIDTH;
        const height = node.measured?.height ?? NODE_ESTIMATED_HEIGHT;
        const inside =
          point.x >= node.position.x &&
          point.x <= node.position.x + width &&
          point.y >= node.position.y &&
          point.y <= node.position.y + height;
        if (!inside) continue;
        if ((node.data as DomainNodeData).external) {
          toast({ title: ru.canvas.dropExternalHint });
        }
        return;
      }
      const fn = useSkibStore
        .getState()
        .project.security.functions.find((f) => f.id === functionId);
      if (!fn) return;
      // Новый домен центрируется на точке сброса.
      const id = dropFunctionAsNewDomain(functionId, {
        x: point.x - NODE_ESTIMATED_WIDTH / 2,
        y: point.y - NODE_ESTIMATED_HEIGHT / 2,
      });
      if (id === null) {
        toast({ title: ru.errors.limitsDomains(MAX_DOMAINS), variant: 'destructive' });
        return;
      }
      toast({ title: ru.canvas.domainCreated(fn.name) });
    },
    [dropFunctionAsNewDomain, getNodes, screenToFlowPosition, toast],
  );

  return (
    <section
      className="relative min-w-0 flex-1"
      aria-label={ru.pool.dragHint}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        connectionMode={ConnectionMode.Loose}
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
          // Подсветка домена из таблицы ДВБ (v0.01.04) и краткая подсветка
          // критичных доменов цели (v0.01.09): голубой контур узла в
          // мини-навигаторе — как на самой диаграмме.
          nodeStrokeColor={(node) =>
            node.id === highlightedDomainId || flashDomainIds?.has(node.id)
              ? HIGHLIGHT_COLOR
              : 'transparent'
          }
          nodeStrokeWidth={highlightedDomainId || flashDomainIds ? 2 : 1}
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
          <Button
            size="sm"
            variant={sizeMode !== 'off' ? 'secondary' : 'outline'}
            className="h-8 bg-popover/95 shadow-sm"
            data-testid="toggle-size-mode"
            aria-pressed={sizeMode !== 'off'}
            title={
              sizeMode === 'cost'
                ? ru.canvas.sizeCostTitle
                : sizeMode === 'block'
                  ? ru.canvas.sizeBlockTitle
                  : ru.canvas.sizeOffTitle
            }
            onClick={cycleSizeMode}
          >
            <Scaling className="mr-1 h-3.5 w-3.5" aria-hidden />
            {ru.canvas.labelSize}: {ru.canvas.sizeModeLabel(sizeMode)}
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

/**
 * Канва внутри ReactFlowProvider (v0.01.06): обработчику сброса карточки
 * на свободное место нужен useReactFlow (screenToFlowPosition) — он действует
 * только внутри провайдера. FocusController внутри ReactFlow сохраняет
 * прежнее поведение.
 */
export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
