/**
 * Хранилище проекта — раздел 8.2 ТЗ (zustand 5). Все мутации проходят через
 * commit() с сохранением снимка в историю операций (Ф-21, глубина 100).
 * Автосохранение в localStorage (Ф-22, ключ skib-lab-state-v1).
 * Слой store не выполняет бизнес-расчётов — они в src/engine.
 */

import { create } from 'zustand';
import type {
  Assignment,
  Block,
  Edge,
  ImportMessage,
  Project,
  SecurityFunction,
  SecuritySpec,
} from '../engine/types';
import { HISTORY_LIMIT, MAX_DOMAINS, MAX_EDGES, STORAGE_KEY, emptyProject } from '../engine/types';
import { decompose } from '../engine/decompose';
import type { DecomposeInput } from '../engine/decompose';
import { snapExternalsOutside } from '../engine/trust';

export type Selection = { kind: 'domain' | 'card' | 'edge'; id: string };

interface Snapshot {
  architecture: Project['architecture'];
  security: Project['security'];
  assignments: Assignment[];
}

interface ValidationState {
  errors: ImportMessage[];
  warnings: ImportMessage[];
  file?: string;
}

interface SkibStore {
  project: Project;
  selection: Selection | null;
  validation: ValidationState | null;
  past: Snapshot[];
  future: Snapshot[];
  hydrated: boolean;

  hydrate: () => void;
  setSelection: (selection: Selection | null) => void;
  setValidation: (validation: ValidationState | null) => void;

  loadArchitecture: (architecture: Project['architecture'], source?: string) => void;
  loadSecurity: (security: SecuritySpec, source?: string) => void;
  loadState: (project: Project) => void;
  placeFunction: (functionId: string, blockId: string) => void;
  unplaceFunction: (functionId: string) => void;
  addDomain: (position?: { x: number; y: number }) => string | null;
  addExternalDomain: (position?: { x: number; y: number }) => string | null;
  updateDomain: (id: string, patch: Partial<Pick<Block, 'name' | 'cost' | 'trusted'>>) => void;
  deleteDomain: (id: string) => void;
  addEdge: (from: string, to: string) => string | null;
  updateEdge: (id: string, patch: Partial<Pick<Edge, 'label'>>) => void;
  deleteEdge: (id: string) => void;
  decomposeBlock: (input: DecomposeInput) => { ok: boolean; errors?: string[] };
  updatePositions: (positions: Record<string, { x: number; y: number }>) => void;
  /** Применение автоматической раскладки — операция с историей (v0.01.03). */
  applyAutoLayout: (positions: Record<string, { x: number; y: number }>) => void;
  undo: () => void;
  redo: () => void;
  resetProject: () => void;
}

/** Глубокий снимок состояния для истории операций. */
function snapshot(project: Project): Snapshot {
  return {
    architecture: structuredClone(project.architecture),
    security: structuredClone(project.security),
    assignments: structuredClone(project.assignments),
  };
}

/** Свободный идентификатор вида <prefix><n>. */
function nextId(prefix: string, existing: Set<string>): string {
  let n = 1;
  while (existing.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Отложенная запись проекта в localStorage — не позднее 1 с после операции (Ф-22). */
function scheduleSave(project: Project): void {
  if (typeof window === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          architecture: project.architecture,
          security: project.security,
          assignments: project.assignments,
          meta: project.meta,
        }),
      );
    } catch {
      // Переполнение localStorage не должно ломать работу (НФ-5).
    }
  }, 300);
}

export const useSkibStore = create<SkibStore>((set, get) => ({
  project: emptyProject(),
  selection: null,
  validation: null,
  past: [],
  future: [],
  hydrated: false,

  /** Восстановление сеанса при повторном открытии страницы (Ф-22, НФ-6). */
  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<Project>;
        if (data.architecture && data.security && Array.isArray(data.assignments)) {
          const restored = {
            architecture: snapExternalsOutside(data.architecture),
            security: data.security,
            assignments: data.assignments,
            meta: data.meta ?? {},
          };
          set({
            project: restored,
            past: [],
            future: [],
          });
        }
      }
    } catch {
      // Повреждённое локальное состояние игнорируется — старт с пустого проекта.
    }
    set({ hydrated: true });
  },

  setSelection: (selection) => set({ selection }),

  setValidation: (validation) => set({ validation }),

  /** Загрузка архитектуры (Ф-1, Ф-3): замена, размещения сбрасываются в пул.
   *  Внешние системы с координатами внутри периметра выносятся за рамку (3.5). */
  loadArchitecture: (architecture, source) => {
    const { project, past } = get();
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        architecture: snapExternalsOutside(architecture),
        security: project.security,
        assignments: [],
        meta: { ...project.meta, source: source ?? project.meta.source },
      },
      selection: null,
    });
    scheduleSave(get().project);
  },

  /** Загрузка security.yaml (Ф-2): пул перечитывается, совместимые размещения сохраняются. */
  loadSecurity: (security, source) => {
    const { project, past } = get();
    const functionIds = new Set(security.functions.map((fn) => fn.id));
    const blockIds = new Set(project.architecture.blocks.map((b) => b.id));
    const assignments = project.assignments.filter(
      (a) => functionIds.has(a.function) && blockIds.has(a.block),
    );
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        architecture: project.architecture,
        security,
        assignments,
        meta: { ...project.meta, source: source ?? project.meta.source },
      },
      selection: null,
    });
    scheduleSave(get().project);
  },

  /** Полная замена проекта из state.yaml (Ф-4, Ф-25).
   *  Внешние системы выносятся за рамку периметра, если попали внутрь (3.5). */
  loadState: (project) => {
    const { past } = get();
    const normalized = { ...project, architecture: snapExternalsOutside(project.architecture) };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(get().project)],
      future: [],
      project: normalized,
      selection: null,
    });
    scheduleSave(normalized);
  },

  /** Размещение или перемещение функции — всегда перемещение, не копирование (3.2).
   *  Функции размещаются только во внутренних доменах: внешние системы
   *  не входят в ДВБ (3.5 v0.01.01) — попытка игнорируется. */
  placeFunction: (functionId, blockId) => {
    const { project, past } = get();
    if (!project.security.functions.some((fn) => fn.id === functionId)) return;
    const target = project.architecture.blocks.find((b) => b.id === blockId);
    if (!target || target.external) return;
    const assignments: Assignment[] = [
      ...project.assignments.filter((a) => a.function !== functionId),
      { function: functionId, block: blockId },
    ];
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, assignments },
    });
    scheduleSave(get().project);
  },

  /** Кнопка «Убрать» — возврат функции в пул (Ф-10). */
  unplaceFunction: (functionId) => {
    const { project, past } = get();
    const assignments = project.assignments.filter((a) => a.function !== functionId);
    if (assignments.length === project.assignments.length) return;
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, assignments },
    });
    scheduleSave(get().project);
  },

  /** «+ Домен» (Ф-13): C_блока по умолчанию 1, имя «Новый домен». */
  addDomain: (position) => {
    const { project, past } = get();
    if (project.architecture.blocks.length >= MAX_DOMAINS) return null;
    const ids = new Set(project.architecture.blocks.map((b) => b.id));
    const id = nextId('dom-', ids);
    const block: Block = {
      id,
      name: 'Новый домен',
      cost: 1,
      position: position ?? { x: 120, y: 120 },
    };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        ...project,
        architecture: { ...project.architecture, blocks: [...project.architecture.blocks, block] },
      },
      selection: { kind: 'domain', id },
    });
    scheduleSave(get().project);
    return id;
  },

  /** «+ Внешняя система» (3.5 v0.01.01): недоверенная по умолчанию, C_блока = 0
   *  (стоимость внешних систем не определяется и не отображается). */
  addExternalDomain: (position) => {
    const { project, past } = get();
    if (project.architecture.blocks.length >= MAX_DOMAINS) return null;
    const ids = new Set(project.architecture.blocks.map((b) => b.id));
    const id = nextId('ext-', ids);
    const block: Block = {
      id,
      name: 'Внешняя система',
      cost: 0,
      external: true,
      trusted: false,
      position: position ?? { x: 120, y: 120 },
    };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        ...project,
        architecture: { ...project.architecture, blocks: [...project.architecture.blocks, block] },
      },
      selection: { kind: 'domain', id },
    });
    scheduleSave(get().project);
    return id;
  },

  /** Правка имени, стоимости и доверенности внешней системы (Ф-21). */
  updateDomain: (id, patch) => {
    const { project, past } = get();
    if (!project.architecture.blocks.some((b) => b.id === id)) return;
    const blocks = project.architecture.blocks.map((b) =>
      b.id === id ? { ...b, ...patch } : b,
    );
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { ...project.architecture, blocks } },
    });
    scheduleSave(get().project);
  },

  /** Удаление домена (Ф-15): стрелки удаляются, функции возвращаются в пул. */
  deleteDomain: (id) => {
    const { project, past } = get();
    if (!project.architecture.blocks.some((b) => b.id === id)) return;
    const blocks = project.architecture.blocks.filter((b) => b.id !== id);
    const edges = project.architecture.edges.filter(
      (e) => e.from !== id && e.to !== id,
    );
    const assignments = project.assignments.filter((a) => a.block !== id);
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { blocks, edges }, assignments },
      selection: null,
    });
    scheduleSave(get().project);
  },

  /** Новая стрелка из порта в порт (Ф-14). */
  addEdge: (from, to) => {
    const { project, past } = get();
    if (from === to) return null;
    if (
      !project.architecture.blocks.some((b) => b.id === from) ||
      !project.architecture.blocks.some((b) => b.id === to)
    ) {
      return null;
    }
    if (project.architecture.edges.length >= MAX_EDGES) return null;
    const duplicate = project.architecture.edges.some(
      (e) => e.from === from && e.to === to,
    );
    if (duplicate) return null;
    const ids = new Set(project.architecture.edges.map((e) => e.id));
    const id = nextId('e-', ids);
    const edge: Edge = { id, from, to };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        ...project,
        architecture: { ...project.architecture, edges: [...project.architecture.edges, edge] },
      },
      selection: { kind: 'edge', id },
    });
    scheduleSave(get().project);
    return id;
  },

  /** Правка подписи стрелки (Ф-14, Ф-21). */
  updateEdge: (id, patch) => {
    const { project, past } = get();
    const edges = project.architecture.edges.map((e) =>
      e.id === id ? { ...e, ...patch } : e,
    );
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { ...project.architecture, edges } },
    });
    scheduleSave(get().project);
  },

  /** Удаление стрелки: Delete или инспектор (Ф-14). */
  deleteEdge: (id) => {
    const { project, past } = get();
    const edges = project.architecture.edges.filter((e) => e.id !== id);
    if (edges.length === project.architecture.edges.length) return;
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { ...project.architecture, edges } },
      selection: null,
    });
    scheduleSave(get().project);
  },

  /** Декомпозиция (Ф-16): транзакционная — при отказе модель не меняется. */
  decomposeBlock: (input) => {
    const { project, past } = get();
    if (project.architecture.blocks.length + input.children.length > MAX_DOMAINS) {
      return { ok: false, errors: [`Достигнут лимит доменов (${MAX_DOMAINS})`] };
    }
    const result = decompose(project, input);
    if (!result.ok) {
      return { ok: false, errors: result.errors };
    }
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: result.project,
      selection: null,
    });
    scheduleSave(result.project);
    return { ok: true };
  },

  /** Перемещение узлов канвы — без записи в историю (Ф-21 не требует). */
  updatePositions: (positions) => {
    const { project } = get();
    const blocks = project.architecture.blocks.map((b) =>
      positions[b.id] ? { ...b, position: positions[b.id] } : b,
    );
    set({ project: { ...project, architecture: { ...project.architecture, blocks } } });
    scheduleSave(get().project);
  },

  /** Автоматическая раскладка (v0.01.03): замена позиций всех блоков —
   *  с записью в историю операций: Ctrl+Z возвращает ручную раскладку.
   *  Позиции попадают в автосохранение (Ф-22) и восстанавливаются
   *  при следующем открытии — ручная конфигурация не теряется. */
  applyAutoLayout: (positions) => {
    const { project, past } = get();
    const blocks = project.architecture.blocks.map((b) =>
      positions[b.id] ? { ...b, position: positions[b.id] } : b,
    );
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { ...project.architecture, blocks } },
    });
    scheduleSave(get().project);
  },

  /** Отмена операции (Ф-21, НФ-10). */
  undo: () => {
    const { past, future, project } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [...future.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      project: { ...previous, meta: project.meta },
      selection: null,
    });
    scheduleSave(get().project);
  },

  /** Повтор операции (Ф-21, НФ-10). */
  redo: () => {
    const { past, future, project } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: future.slice(0, -1),
      project: { ...next, meta: project.meta },
      selection: null,
    });
    scheduleSave(get().project);
  },

  /** Сброс проекта (Ф-23): очистка localStorage и возврат к пустому состоянию. */
  resetProject: () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // игнорируется
      }
    }
    set({
      project: emptyProject(),
      selection: null,
      validation: null,
      past: [],
      future: [],
    });
  },
}));

/** Селектор: функция по идентификатору. */
export function selectFunction(
  security: SecuritySpec,
  id: string,
): SecurityFunction | undefined {
  return security.functions.find((fn) => fn.id === id);
}
