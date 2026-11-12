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
  SeqArrow,
  SeqBlock,
  SequenceDiagram,
} from '../engine/types';
import {
  HISTORY_LIMIT,
  MAX_DOMAINS,
  MAX_EDGES,
  MAX_LIFELINES,
  MAX_SEQ_ARROWS,
  MAX_SEQ_BLOCKS,
  MAX_SEQUENCES,
  SEQ_TEXT_LIMIT,
  STORAGE_KEY,
  emptyProject,
} from '../engine/types';
import { decompose } from '../engine/decompose';
import type { DecomposeInput } from '../engine/decompose';
import { goalDistribution } from '../engine/coverage';
import { snapExternalsOutside } from '../engine/trust';
import {
  canonicalInternalName,
  cleanBlocksAfterArrowRemoval,
  defaultGroupName,
  defaultLoopName,
  firstFreeColor,
  isConsecutive,
  normalizeName,
  renumberArchitecture,
  uniqueSequenceName,
} from '../engine/sequence';

/** Выбор объекта интерфейса: домен, карточка функции, стрелка
 *  или цель безопасности (v0.01.09 — карточка ЦБ в инспекторе). */
export type Selection = { kind: 'domain' | 'card' | 'edge' | 'goal'; id: string };

interface Snapshot {
  architecture: Project['architecture'];
  security: Project['security'];
  assignments: Assignment[];
  sequences: SequenceDiagram[];
}

/** Источник сообщений панели валидации: файл при загрузке или проверка диаграммы (v0.01.08). */
export interface ValidationState {
  errors: ImportMessage[];
  warnings: ImportMessage[];
  file?: string;
  /** «diagram» — кнопка «Проверить»; заголовки панели другие (v0.01.08). */
  context?: 'import' | 'diagram';
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

  loadArchitecture: (architecture: Project['architecture'], source?: string) => CascadeResult;
  loadSecurity: (security: SecuritySpec, source?: string) => void;
  loadState: (project: Project) => void;
  placeFunction: (functionId: string, blockId: string) => void;
  unplaceFunction: (functionId: string) => void;
  addDomain: (position?: { x: number; y: number }) => string | null;
  addExternalDomain: (position?: { x: number; y: number }) => string | null;
  /** Сброс карточки на свободное место канвы (v0.01.06): создаётся новый
   *  домен безопасности с функцией внутри — одной операцией с историей. */
  dropFunctionAsNewDomain: (
    functionId: string,
    position: { x: number; y: number },
  ) => string | null;
  updateDomain: (
    id: string,
    patch: Partial<Pick<Block, 'name' | 'cost' | 'trusted' | 'forceTrusted'>>,
  ) => void;
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

  /* ---- Режим «Диаграммы последовательности» (v0.02.01) ---- */
  /** Создание ДП (имя по умолчанию «Новая ДП» уникализируется; имя можно задать —
   *  например, имя наброшенной ЦБ, Ф-65); возвращает id или null (лимит 20). */
  createSequence: (name?: string) => string | null;
  /** «Очистить ДП» (Ф-66): линии жизни, стрелки и блоки активной ДП
   *  удаляются; одна операция истории. */
  clearSequence: (id: string) => void;
  /** Набрасывание ЦБ на канву (Ф-65): если ДП ещё нет — создаётся ДП с
   *  именем ЦБ и линиями жизни критичных доменов; один шаг истории. */
  createSequenceFromGoal: (goalId: string) => { ok: boolean; seqId?: string; added?: number; error?: string };
  /** Добавление критичных доменов ЦБ в существующую ДП (Ф-65); один шаг истории. */
  addGoalDomains: (seqId: string, goalId: string) => { ok: boolean; added?: number; error?: string };
  /** Удаление ДП — одна операция истории. */
  deleteSequence: (id: string) => void;
  /** Переименование ДП (до 60 символов). */
  renameSequence: (id: string, name: string) => void;
  /** Добавление линии жизни из набора доменов ДАП (П-12): домен вне ДАП недобавляем. */
  addLifeline: (seqId: string, blockId: string) => string | null;
  /** Убрать линию жизни: удаляются её стрелки, блоки чистятся (одна операция). */
  removeLifeline: (seqId: string, blockId: string) => void;
  /** Порядок линий жизни (перетаскивание — без истории, П-7). */
  reorderLifelines: (seqId: string, from: number, to: number) => void;
  /** Новая стрелка ДП (from == to — self); добавляется в конец. */
  addSeqArrow: (seqId: string, from: string, to: string) => string | null;
  /** Правка подписи стрелки (до 60 символов, П-5). */
  updateSeqArrow: (seqId: string, arrowId: string, label: string | undefined) => void;
  /** Удаление стрелки — одна операция истории. */
  deleteSeqArrow: (seqId: string, arrowId: string) => void;
  /** Перенос стрелки по вертикали (без истории); блоки следуют за стрелками (П-6). */
  moveSeqArrow: (seqId: string, arrowId: string, toIndex: number) => void;
  /** Создание блока из подряд идущих стрелок (П-13): group ≥ 2, loop ≥ 1, cond — с границей else. */
  createSeqBlock: (
    seqId: string,
    kind: 'group' | 'loop' | 'cond',
    arrowIds: string[],
    extra?: { name?: string; thenLabel?: string; elseLabel?: string; elseIndex?: number },
  ) => { ok: boolean; error?: string; id?: string };
  /** Правка имени/цвета/условия/подписей веток блока. */
  updateSeqBlock: (
    seqId: string,
    blockId: string,
    patch: Partial<Pick<SeqBlock, 'name' | 'color' | 'thenLabel' | 'elseLabel' | 'elseFrom'>>,
  ) => void;
  /** Разгруппировать (без подтверждения): стрелки остаются. */
  ungroupSeqBlock: (seqId: string, blockId: string) => void;
  /** «Покинуть блок» (инспектор стрелки): стрелка выходит из состава блока;
   *  опустевшая ветка «иначе» оставляет блок без else, опустевшая ветка
   *  «то» распускает блок, группа из одной стрелки распускается (5.4). */
  leaveSeqBlock: (seqId: string, blockId: string, arrowId: string) => void;
  /** Удалить блок вместе со стрелками (одна операция истории). */
  deleteSeqBlockWithArrows: (seqId: string, blockId: string) => void;
  /** Замена всех ДП (импорт sequences.yaml, одна операция истории). */
  replaceSequences: (sequences: SequenceDiagram[]) => void;
  /** Добавление одной ДП (импорт PlantUML, одна операция истории). */
  addSequenceFromPuml: (diagram: SequenceDiagram) => string | null;
  /** «Добавить недостающие связи в ДАП» (Ф-50, П-4): глобально, атомарно, один шаг истории. */
  addMissingEdgesToDap: () => { ok: boolean; added?: number; error?: string };
}

/** Глубокий снимок состояния для истории операций (включая ДП — v0.02.01). */
function snapshot(project: Project): Snapshot {
  return {
    architecture: structuredClone(project.architecture),
    security: structuredClone(project.security),
    assignments: structuredClone(project.assignments),
    sequences: structuredClone(project.sequences ?? []),
  };
}

/** Свободный идентификатор вида <prefix><n>. */
function nextId(prefix: string, existing: Set<string>): string {
  let n = 1;
  while (existing.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Итог каскада ДП при замене ДАП — источник W-009 (5.6). */
export interface CascadeResult {
  removedLifelines: number;
  removedArrows: number;
}

/** Число внутренних блоков архитектуры. */
function internalCount(blocks: Block[]): number {
  return blocks.filter((b) => !b.external).length;
}

/**
 * Каскад по всем ДП при замене ДАП (5.6): домен, отсутствующий в новой
 * архитектуре, снимается из линий жизни; его стрелки удаляются; блоки
 * чистятся. Возвращает счётчики для W-009.
 */
function cascadeSequences(
  sequences: SequenceDiagram[],
  blockIds: Set<string>,
): CascadeResult & { sequences: SequenceDiagram[] } {
  let removedLifelines = 0;
  let removedArrows = 0;
  const next = sequences.map((seq) => {
    const lifelines = seq.lifelines.filter((id) => blockIds.has(id));
    removedLifelines += seq.lifelines.length - lifelines.length;
    const arrows = seq.arrows.filter(
      (a) => lifelines.includes(a.from) && lifelines.includes(a.to),
    );
    removedArrows += seq.arrows.length - arrows.length;
    const remaining = arrows.map((a) => a.id);
    const blocks = cleanBlocksAfterArrowRemoval(seq.blocks, remaining);
    return { ...seq, lifelines, arrows, blocks };
  });
  return { sequences: next, removedLifelines, removedArrows };
}

/** Хелпер мутации одной ДП с записью в историю. */
function updateSequence(
  set: (state: Partial<SkibStore>) => void,
  get: () => SkibStore,
  seqId: string,
  mutate: (seq: SequenceDiagram) => SequenceDiagram | null,
): void {
  const { project, past } = get();
  const sequences = project.sequences ?? [];
  const seq = sequences.find((s) => s.id === seqId);
  if (!seq) return;
  const next = mutate(seq);
  if (!next) return;
  set({
    past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
    future: [],
    project: { ...project, sequences: sequences.map((s) => (s.id === seqId ? next : s)) },
  });
  scheduleSave(get().project);
}

/** Тот же хелпер без записи в историю (перемещения, П-7). */
function updateSequenceSilent(
  set: (state: Partial<SkibStore>) => void,
  get: () => SkibStore,
  seqId: string,
  mutate: (seq: SequenceDiagram) => SequenceDiagram | null,
): void {
  const { project } = get();
  const sequences = project.sequences ?? [];
  const seq = sequences.find((s) => s.id === seqId);
  if (!seq) return;
  const next = mutate(seq);
  if (!next) return;
  set({
    project: { ...project, sequences: sequences.map((s) => (s.id === seqId ? next : s)) },
  });
  scheduleSave(get().project);
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
          // ДП сохраняются в составе проекта (Ф-22, v0.02.01).
          ...(project.sequences && project.sequences.length > 0
            ? { sequences: project.sequences }
            : {}),
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
            // ДП восстанавливаются из автосохранения (Ф-22, v0.02.01).
            ...(Array.isArray(data.sequences) ? { sequences: data.sequences } : { sequences: [] }),
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
   *  Внешние системы с координатами внутри периметра выносятся за рамку (3.5).
   *  v0.02.01: внутренние домены перенумеровываются (Ф-34); ДП каскадируются
   *  по новой архитектуре (5.6) — счётчики для W-009 возвращаются вызывающему. */
  loadArchitecture: (architecture, source) => {
    const { project, past } = get();
    const renumbered = renumberArchitecture(snapExternalsOutside(architecture));
    const blockIds = new Set(renumbered.blocks.map((b) => b.id));
    const cascade = cascadeSequences(project.sequences ?? [], blockIds);
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        architecture: renumbered,
        security: project.security,
        assignments: [],
        meta: { ...project.meta, source: source ?? project.meta.source },
        sequences: cascade.sequences,
      },
      selection: null,
    });
    scheduleSave(get().project);
    return { removedLifelines: cascade.removedLifelines, removedArrows: cascade.removedArrows };
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
   *  Внешние системы выносятся за рамку периметра, если попали внутрь (3.5).
   *  v0.02.01: внутренние домены перенумеровываются (Ф-34); sequences
   *  заменяются данными файла (7.4, уже согласованы с его архитектурой). */
  loadState: (project) => {
    const { past } = get();
    const normalized = {
      ...project,
      architecture: renumberArchitecture(snapExternalsOutside(project.architecture)),
      sequences: project.sequences ?? [],
    };
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

  /** «+ Домен» (Ф-13): C_блока по умолчанию 1; добавляется в конец списка
   *  и получает очередной номер — «NN. Новый домен» (Ф-31, v0.02.01). */
  addDomain: (position) => {
    const { project, past } = get();
    if (project.architecture.blocks.length >= MAX_DOMAINS) return null;
    const ids = new Set(project.architecture.blocks.map((b) => b.id));
    const id = nextId('dom-', ids);
    const block: Block = {
      id,
      name: canonicalInternalName('Новый домен', internalCount(project.architecture.blocks)),
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

  /** Сброс карточки на свободное место канвы (v0.01.06): создаётся новый
   *  домен безопасности (Ф-13, «NN. Новый домен», C_блока = 1) с функцией внутри.
   *  Одна операция истории: Ctrl+Z убирает и домен, и размещение.
   *  Размещать функции во внешние системы нельзя (3.5 v0.01.01) — внешние
   *  системы отсекаются на уровне канвы до вызова действия. */
  dropFunctionAsNewDomain: (functionId, position) => {
    const { project, past } = get();
    const fn = project.security.functions.find((f) => f.id === functionId);
    if (!fn) return null;
    if (project.architecture.blocks.length >= MAX_DOMAINS) return null;
    const ids = new Set(project.architecture.blocks.map((b) => b.id));
    const id = nextId('dom-', ids);
    const block: Block = {
      id,
      name: canonicalInternalName('Новый домен', internalCount(project.architecture.blocks)),
      cost: 1,
      position: position ?? { x: 120, y: 120 },
    };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        ...project,
        architecture: { ...project.architecture, blocks: [...project.architecture.blocks, block] },
        assignments: [...project.assignments, { function: functionId, block: id }],
      },
      selection: { kind: 'domain', id },
    });
    scheduleSave(get().project);
    return id;
  },

  /** Правка имени, стоимости, доверенности внешней системы и принудительного
   *  ввода внутреннего домена в ДВБ (Ф-21, v0.01.06).
   *  v0.02.01: имя нормализуется — внутренний домен получает канонический
   *  префикс своей позиции (введённый пользователем «NN. » заменяется);
   *  у внешней системы префикс удаляется (Ф-31…Ф-35). */
  updateDomain: (id, patch) => {
    const { project, past } = get();
    if (!project.architecture.blocks.some((b) => b.id === id)) return;
    const normalizedPatch = { ...patch };
    if (patch.name !== undefined) {
      const target = project.architecture.blocks.find((b) => b.id === id)!;
      if (target.external) {
        normalizedPatch.name = normalizeName(patch.name, null);
      } else {
        let index = 0;
        for (const b of project.architecture.blocks) {
          if (b.id === id) break;
          if (!b.external) index += 1;
        }
        normalizedPatch.name = normalizeName(patch.name, index);
      }
    }
    const blocks = project.architecture.blocks.map((b) =>
      b.id === id ? { ...b, ...normalizedPatch } : b,
    );
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { ...project.architecture, blocks } },
    });
    scheduleSave(get().project);
  },

  /** Удаление домена (Ф-15): стрелки удаляются, функции возвращаются в пул.
   *  v0.02.01: каскад в той же операции истории — домен снимается из линий
   *  жизни всех ДП, его стрелки ДП удаляются, блоки чистятся (5.6); после
   *  удаления внутренние домены перенумеровываются без разрывов (Ф-32). */
  deleteDomain: (id) => {
    const { project, past } = get();
    if (!project.architecture.blocks.some((b) => b.id === id)) return;
    const blocks = renumberArchitecture({
      ...project.architecture,
      blocks: project.architecture.blocks.filter((b) => b.id !== id),
    }).blocks;
    const edges = project.architecture.edges.filter(
      (e) => e.from !== id && e.to !== id,
    );
    const assignments = project.assignments.filter((a) => a.block !== id);
    const cascade = cascadeSequences(project.sequences ?? [], new Set(blocks.map((b) => b.id)));
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: {
        ...project,
        architecture: { blocks, edges },
        assignments,
        sequences: cascade.sequences,
      },
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

  /** Декомпозиция (Ф-16): транзакционная — при отказе модель не меняется.
   *  v0.02.01: дочерние домены добавляются в конец и нумеруются со
   *  следующего номера; затем инвариант восстанавливается полной
   *  перенумерацией (Ф-33). */
  decomposeBlock: (input) => {
    const { project, past } = get();
    if (project.architecture.blocks.length + input.children.length > MAX_DOMAINS) {
      return { ok: false, errors: [`Достигнут лимит доменов (${MAX_DOMAINS})`] };
    }
    const result = decompose(project, input);
    if (!result.ok) {
      return { ok: false, errors: result.errors };
    }
    const renumbered = {
      ...result.project,
      architecture: renumberArchitecture(result.project.architecture),
    };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: renumbered,
      selection: null,
    });
    scheduleSave(renumbered);
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

  /** Сброс проекта (Ф-23): очистка localStorage и возврат к пустому состоянию.
   *  v0.02.01: sequences очищаются (5.6). */
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

  /* ---------------------------------------------------------------- */
  /* Действия режима «Диаграммы последовательности» (v0.02.01)          */
  /* ---------------------------------------------------------------- */

  /** «Создать ДП» (Ф-39, Ф-65): имя по умолчанию «Новая ДП» или заданное
   *  (например, имя ЦБ) с уникализацией; лимит 20 ДП (Ф-58). */
  createSequence: (name) => {
    const { project, past } = get();
    const sequences = project.sequences ?? [];
    if (sequences.length >= MAX_SEQUENCES) return null;
    const id = nextId('seq-', new Set(sequences.map((s) => s.id)));
    const trimmed = (name ?? '').trim();
    const base = trimmed.length > 0 ? trimmed.slice(0, SEQ_TEXT_LIMIT) : undefined;
    const diagram: SequenceDiagram = {
      id,
      name: uniqueSequenceName(sequences, base),
      lifelines: [],
      arrows: [],
      blocks: [],
    };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, sequences: [...sequences, diagram] },
    });
    scheduleSave(get().project);
    return id;
  },

  /** «Очистить ДП» (Ф-66): содержимое ДП (линии жизни, стрелки, блоки)
   *  удаляется целиком — одна операция истории. */
  clearSequence: (id) => {
    updateSequence(set, get, id, (seq) => {
      if (seq.lifelines.length === 0 && seq.arrows.length === 0 && seq.blocks.length === 0) {
        return null; // нечего очищать — история не пишется
      }
      return { ...seq, lifelines: [], arrows: [], blocks: [] };
    });
  },

  /** Набрасывание ЦБ на канву (Ф-65): при отсутствии ДП создаётся ДП с
   *  именем ЦБ и критичными доменами; один шаг истории (Ctrl+Z отменяет
   *  целиком); лимиты ДП и линий жизни соблюдаются. */
  createSequenceFromGoal: (goalId) => {
    const { project, past } = get();
    const sequences = project.sequences ?? [];
    if (sequences.length >= MAX_SEQUENCES) {
      return { ok: false, error: `Достигнут лимит ДП (${MAX_SEQUENCES})` };
    }
    const goal = project.security.goals.find((g) => g.id === goalId);
    if (!goal) return { ok: false, error: 'Цель не найдена' };
    const critical = goalDistribution(project, goalId)
      .criticalDomains.map((row) => row.id)
      .filter((id) => project.architecture.blocks.some((b) => b.id === id))
      .slice(0, MAX_LIFELINES);
    const id = nextId('seq-', new Set(sequences.map((s) => s.id)));
    const diagram: SequenceDiagram = {
      id,
      name: uniqueSequenceName(sequences, goal.name.trim().slice(0, SEQ_TEXT_LIMIT) || undefined),
      lifelines: critical,
      arrows: [],
      blocks: [],
    };
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, sequences: [...sequences, diagram] },
    });
    scheduleSave(get().project);
    return { ok: true, seqId: id, added: critical.length };
  },

  /** Добавление критичных доменов ЦБ в существующую ДП (Ф-65): дубликаты
   *  пропускаются, лимит линий жизни соблюдается; один шаг истории. */
  addGoalDomains: (seqId, goalId) => {
    const { project } = get();
    const seq = (project.sequences ?? []).find((s) => s.id === seqId);
    if (!seq) return { ok: false, error: 'ДП не найдена' };
    const goal = project.security.goals.find((g) => g.id === goalId);
    if (!goal) return { ok: false, error: 'Цель не найдена' };
    const incoming = goalDistribution(project, goalId)
      .criticalDomains.map((row) => row.id)
      .filter((id) => !seq.lifelines.includes(id));
    if (incoming.length === 0) return { ok: true, added: 0 };
    const capacity = MAX_LIFELINES - seq.lifelines.length;
    if (capacity <= 0) {
      return { ok: false, error: `Достигнут лимит линий жизни ДП (${MAX_LIFELINES})` };
    }
    const add = incoming.slice(0, capacity);
    updateSequence(set, get, seqId, (current) => ({
      ...current,
      lifelines: [...current.lifelines, ...add],
    }));
    return { ok: true, added: add.length };
  },

  /** «Удалить ДП» (Ф-39) — одна операция истории. */
  deleteSequence: (id) => {
    const { project, past } = get();
    const sequences = project.sequences ?? [];
    if (!sequences.some((s) => s.id === id)) return;
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, sequences: sequences.filter((s) => s.id !== id) },
    });
    scheduleSave(get().project);
  },

  /** Переименование ДП (до 60 символов, Ф-58). */
  renameSequence: (id, name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > SEQ_TEXT_LIMIT) return;
    updateSequence(set, get, id, (seq) => ({ ...seq, name: trimmed }));
  },

  /** Перетаскивание домена из набора на канву → линия жизни (Ф-38, П-12).
   *  Домен вне ДАП недобавляем; повторное добавление блокируется; лимит 24. */
  addLifeline: (seqId, blockId) => {
    const { project } = get();
    const seq = (project.sequences ?? []).find((s) => s.id === seqId);
    const block = project.architecture.blocks.find((b) => b.id === blockId);
    if (!seq || !block) return null;
    if (seq.lifelines.includes(blockId)) return null;
    if (seq.lifelines.length >= MAX_LIFELINES) return null;
    let newId: string | null = null;
    updateSequence(set, get, seqId, (current) => {
      newId = blockId;
      return { ...current, lifelines: [...current.lifelines, blockId] };
    });
    return newId;
  },

  /** «Убрать из ДП» (Ф-40): линия жизни и её стрелки удаляются, блоки
   *  чистятся — одна операция истории. */
  removeLifeline: (seqId, blockId) => {
    updateSequence(set, get, seqId, (seq) => {
      if (!seq.lifelines.includes(blockId)) return null;
      const lifelines = seq.lifelines.filter((id) => id !== blockId);
      const arrows = seq.arrows.filter((a) => a.from !== blockId && a.to !== blockId);
      const remaining = arrows.map((a) => a.id);
      return {
        ...seq,
        lifelines,
        arrows,
        blocks: cleanBlocksAfterArrowRemoval(seq.blocks, remaining),
      };
    });
  },

  /** Перетаскивание заголовка по горизонтали меняет порядок линий жизни
   *  (П-7); стрелки следуют; не пишется в историю, сохраняется автосохранением. */
  reorderLifelines: (seqId, from, to) => {
    updateSequenceSilent(set, get, seqId, (seq) => {
      if (from === to || from < 0 || to < 0 || from >= seq.lifelines.length) return null;
      const lifelines = [...seq.lifelines];
      const [moved] = lifelines.splice(from, 1);
      lifelines.splice(Math.min(to, lifelines.length), 0, moved);
      return { ...seq, lifelines };
    });
  },

  /** Новая стрелка (Ф-42): направленность любая; from == to — self; лимит 100. */
  addSeqArrow: (seqId, from, to) => {
    const { project } = get();
    const seq = (project.sequences ?? []).find((s) => s.id === seqId);
    if (!seq) return null;
    if (!seq.lifelines.includes(from) || !seq.lifelines.includes(to)) return null;
    if (seq.arrows.length >= MAX_SEQ_ARROWS) return null;
    let created: string | null = null;
    updateSequence(set, get, seqId, (current) => {
      const id = nextId('a-', new Set(current.arrows.map((a) => a.id)));
      created = id;
      return { ...current, arrows: [...current.arrows, { id, from, to }] };
    });
    return created;
  },

  /** Правка подписи стрелки (П-5): до 60 символов; пустая строка убирает подпись. */
  updateSeqArrow: (seqId, arrowId, label) => {
    updateSequence(set, get, seqId, (seq) => {
      const arrows = seq.arrows.map((a) => {
        if (a.id !== arrowId) return a;
        const trimmed = label?.trim() ?? '';
        if (trimmed.length === 0) {
          const { label: _omit, ...rest } = a;
          return rest as SeqArrow;
        }
        if (trimmed.length > SEQ_TEXT_LIMIT) return a;
        return { ...a, label: trimmed };
      });
      return { ...seq, arrows };
    });
  },

  /** Удаление стрелки (Delete или инспектор, Ф-45): блоки чистятся (5.4). */
  deleteSeqArrow: (seqId, arrowId) => {
    updateSequence(set, get, seqId, (seq) => {
      const arrows = seq.arrows.filter((a) => a.id !== arrowId);
      if (arrows.length === seq.arrows.length) return null;
      return {
        ...seq,
        arrows,
        blocks: cleanBlocksAfterArrowRemoval(seq.blocks, arrows.map((a) => a.id)),
      };
    });
  },

  /** Перенос стрелки по вертикали (Ф-44): вставка перед/после соседней по
   *  позиции; автонумерация пересчитывается сразу; не пишется в историю.
   *  Стрелка, вышедшая за границу блока, автоматически его покидает (П-6);
   *  внутрь чужого блока вставка невозможна — позиция сдвигается к границе. */
  moveSeqArrow: (seqId, arrowId, toIndex) => {
    updateSequenceSilent(set, get, seqId, (seq) => {
      const from = seq.arrows.findIndex((a) => a.id === arrowId);
      if (from < 0) return null;
      const arrows = [...seq.arrows];
      const [moved] = arrows.splice(from, 1);
      // Запрещённые интервалы вставки: внутри чужих блоков.
      const order = arrows.map((a) => a.id);
      const ownBlocks = seq.blocks.filter((b) => b.arrows.includes(arrowId));
      const foreignSpans: Array<[number, number]> = [];
      for (const block of seq.blocks) {
        if (block.arrows.includes(arrowId)) continue;
        const positions = block.arrows
          .map((id) => order.indexOf(id))
          .filter((p) => p >= 0)
          .sort((a, b) => a - b);
        if (positions.length > 0) foreignSpans.push([positions[0], positions[positions.length - 1]]);
      }
      let target = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, arrows.length));
      // Внутри своего условного блока стрелка переставляется в пределах своей ветки (5.4).
      const ownCond = ownBlocks.find((b) => b.kind === 'cond');
      if (ownCond) {
        const branchStart = ownCond.elseFrom && ownCond.arrows.includes(ownCond.elseFrom)
          ? order.indexOf(ownCond.elseFrom)
          : -1;
        const inElse = branchStart >= 0 && order.indexOf(arrowId) >= branchStart;
        const blockStart = Math.min(...ownCond.arrows.map((id) => order.indexOf(id)).filter((p) => p >= 0));
        const blockEnd = Math.max(...ownCond.arrows.map((id) => order.indexOf(id)).filter((p) => p >= 0));
        if (target > blockStart && target <= blockEnd + 1) {
          // Вставка в пределах блока: зажимаем к ветке.
          if (inElse) target = Math.max(target, branchStart);
          else target = Math.min(target, branchStart >= 0 ? branchStart : blockEnd + 1);
        }
      }
      for (const [start, end] of foreignSpans) {
        if (target > start && target <= end) {
          // К ближайшей границе чужого блока.
          target = target - start <= end + 1 - target ? start : end + 1;
        }
      }
      arrows.splice(target, 0, moved);
      // Обслуживание блоков: стрелка, вышедшая за границу блока, покидает его.
      const newOrder = arrows.map((a) => a.id);
      const newIdx = newOrder.indexOf(arrowId);
      let blocks = seq.blocks.map((block) => {
        if (!block.arrows.includes(arrowId)) return block;
        const positions = block.arrows
          .map((id) => newOrder.indexOf(id))
          .filter((p) => p >= 0)
          .sort((a, b) => a - b);
        if (positions.length > 0 && positions[positions.length - 1] - positions[0] + 1 === positions.length) {
          return block; // блок остался подряд идущим
        }
        return { ...block, arrows: block.arrows.filter((id) => id !== arrowId) };
      });
      blocks = cleanBlocksAfterArrowRemoval(blocks, newOrder);
      return { ...seq, arrows, blocks, ...(newIdx >= 0 ? {} : {}) };
    });
  },

  /** Создание блока (Ф-46, П-13): только из подряд идущих стрелок без
   *  пересечений с существующими блоками; group ≥ 2, loop ≥ 1, cond ≥ 2
   *  (обе ветки непусты — П-14); лимит 10 блоков. */
  createSeqBlock: (seqId, kind, arrowIds, extra) => {
    const { project } = get();
    const seq = (project.sequences ?? []).find((s) => s.id === seqId);
    if (!seq) return { ok: false, error: 'ДП не найдена' };
    if (seq.blocks.length >= MAX_SEQ_BLOCKS) {
      return { ok: false, error: `Достигнут лимит блоков ДП (${MAX_SEQ_BLOCKS})` };
    }
    if (!isConsecutive(seq, arrowIds)) {
      return { ok: false, error: 'Блок можно создать только из подряд идущих стрелок' };
    }
    if (seq.blocks.some((b) => arrowIds.some((id) => b.arrows.includes(id)))) {
      return { ok: false, error: 'Стрелка уже входит в другой блок' };
    }
    if (kind === 'group' && arrowIds.length < 2) {
      return { ok: false, error: 'Группа должна содержать не менее двух стрелок' };
    }
    if (arrowIds.length === 0) {
      return { ok: false, error: 'Блок не может быть пустым' };
    }
    const name = (
      extra?.name ??
      (kind === 'cond' ? 'условие' : kind === 'loop' ? defaultLoopName(seq) : defaultGroupName(seq))
    ).trim();
    if (name.length === 0 || name.length > SEQ_TEXT_LIMIT) {
      return { ok: false, error: `Имя блока должно быть от 1 до ${SEQ_TEXT_LIMIT} символов` };
    }
    let elseFrom: string | undefined;
    if (kind === 'cond') {
      const elseIndex = extra?.elseIndex ?? -1;
      if (elseIndex < 1 || elseIndex >= arrowIds.length) {
        return { ok: false, error: 'Обе ветки условного блока должны быть непустыми' };
      }
      elseFrom = arrowIds[elseIndex];
      const thenLabel = (extra?.thenLabel ?? '').trim();
      const elseLabel = (extra?.elseLabel ?? '').trim();
      if (thenLabel.length === 0 || elseLabel.length === 0 || thenLabel.length > SEQ_TEXT_LIMIT || elseLabel.length > SEQ_TEXT_LIMIT) {
        return { ok: false, error: `Подписи веток должны быть от 1 до ${SEQ_TEXT_LIMIT} символов` };
      }
      const blockId = nextId('g-', new Set(seq.blocks.map((b) => b.id)));
      updateSequence(set, get, seqId, (current) => ({
        ...current,
        blocks: [
          ...current.blocks,
          {
            id: blockId,
            kind,
            name,
            color: '',
            arrows: [...arrowIds],
            thenLabel,
            elseLabel,
            elseFrom: elseFrom!,
          },
        ],
      }));
      return { ok: true, id: blockId };
    }
    const blockId = nextId('g-', new Set(seq.blocks.map((b) => b.id)));
    updateSequence(set, get, seqId, (current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        { id: blockId, kind, name, color: firstFreeColor(seq), arrows: [...arrowIds] },
      ],
    }));
    return { ok: true, id: blockId };
  },

  /** Правка имени/цвета/условия/подписей веток блока (5.4). */
  updateSeqBlock: (seqId, blockId, patch) => {
    updateSequence(set, get, seqId, (seq) => {
      const blocks = seq.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const next = { ...block, ...patch };
        if (next.name.trim().length === 0 || next.name.trim().length > SEQ_TEXT_LIMIT) {
          return block;
        }
        next.name = next.name.trim();
        // Граница else должна быть внутри блока и не первой стрелкой (П-14).
        if (next.kind === 'cond' && patch.elseFrom !== undefined) {
          const idx = next.arrows.indexOf(patch.elseFrom);
          if (idx < 1) return block;
        }
        return next;
      });
      return { ...seq, blocks };
    });
  },

  /** «Разгруппировать» — блок удаляется, стрелки остаются (без подтверждения). */
  ungroupSeqBlock: (seqId, blockId) => {
    updateSequence(set, get, seqId, (seq) => {
      if (!seq.blocks.some((b) => b.id === blockId)) return null;
      return { ...seq, blocks: seq.blocks.filter((b) => b.id !== blockId) };
    });
  },

  /** «Покинуть блок» (5.4): состав блока сокращается на стрелку; правила
   *  роспуска — как при автоматическом выходе за границу блока. */
  leaveSeqBlock: (seqId, blockId, arrowId) => {
    updateSequence(set, get, seqId, (seq) => {
      const block = seq.blocks.find((b) => b.id === blockId);
      if (!block || !block.arrows.includes(arrowId)) return null;
      const remaining = block.arrows.filter((id) => id !== arrowId);
      if (remaining.length === 0) {
        return { ...seq, blocks: seq.blocks.filter((b) => b.id !== blockId) };
      }
      if (block.kind === 'cond') {
        const elseIndex = block.elseFrom ? remaining.indexOf(block.elseFrom) : -1;
        if (block.elseFrom && elseIndex === -1) {
          // Ветка «иначе» опустела — блок без else (П-14).
          return {
            ...seq,
            blocks: seq.blocks.map((b) =>
              b.id === blockId
                ? { ...b, arrows: remaining, elseFrom: undefined, elseLabel: undefined }
                : b,
            ),
          };
        }
        if (block.elseFrom && elseIndex === 0) {
          // Ветка «то» опустела — блок распускается.
          return { ...seq, blocks: seq.blocks.filter((b) => b.id !== blockId) };
        }
        return {
          ...seq,
          blocks: seq.blocks.map((b) => (b.id === blockId ? { ...b, arrows: remaining } : b)),
        };
      }
      if (block.kind === 'group' && remaining.length < 2) {
        return { ...seq, blocks: seq.blocks.filter((b) => b.id !== blockId) };
      }
      return {
        ...seq,
        blocks: seq.blocks.map((b) => (b.id === blockId ? { ...b, arrows: remaining } : b)),
      };
    });
  },

  /** «Удалить блок со стрелками» — одна операция истории. */
  deleteSeqBlockWithArrows: (seqId, blockId) => {
    updateSequence(set, get, seqId, (seq) => {
      const block = seq.blocks.find((b) => b.id === blockId);
      if (!block) return null;
      const removed = new Set(block.arrows);
      const arrows = seq.arrows.filter((a) => !removed.has(a.id));
      return {
        ...seq,
        arrows,
        blocks: seq.blocks.filter((b) => b.id !== blockId),
      };
    });
  },

  /** Замена всех ДП данными sequences.yaml (7.1) — одна операция истории. */
  replaceSequences: (sequences) => {
    const { project, past } = get();
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, sequences },
    });
    scheduleSave(get().project);
  },

  /** Добавление одной ДП из PlantUML (7.2) — одна операция истории; лимит 20. */
  addSequenceFromPuml: (diagram) => {
    const { project, past } = get();
    const sequences = project.sequences ?? [];
    if (sequences.length >= MAX_SEQUENCES) return null;
    if (diagram.lifelines.length > MAX_LIFELINES || diagram.arrows.length > MAX_SEQ_ARROWS) {
      return null;
    }
    const id = nextId('seq-', new Set(sequences.map((s) => s.id)));
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, sequences: [...sequences, { ...diagram, id }] },
    });
    scheduleSave(get().project);
    return id;
  },

  /** «Добавить недостающие связи в ДАП» (Ф-50, П-4): все расхождения E-601
   *  по всем ДП глобально; дубликаты пропускаются; атомарно при нехватке
   *  MAX_EDGES; одна операция истории (Ctrl+Z отменяет все добавленные связи). */
  addMissingEdgesToDap: () => {
    const { project, past } = get();
    const sequences = project.sequences ?? [];
    const edgeSet = new Set(project.architecture.edges.map((e) => `${e.from}>${e.to}`));
    const pairs: Array<{ from: string; to: string }> = [];
    for (const seq of sequences) {
      for (const arrow of seq.arrows) {
        if (arrow.from === arrow.to) continue;
        const key = `${arrow.from}>${arrow.to}`;
        if (!edgeSet.has(key) && !pairs.some((p) => `${p.from}>${p.to}` === key)) {
          pairs.push({ from: arrow.from, to: arrow.to });
        }
      }
    }
    if (pairs.length === 0) return { ok: true, added: 0 };
    if (project.architecture.edges.length + pairs.length > MAX_EDGES) {
      return { ok: false, error: `Превышен лимит стрелок ДАП (${MAX_EDGES}): операция отклонена целиком` };
    }
    const ids = new Set(project.architecture.edges.map((e) => e.id));
    const edges = [...project.architecture.edges];
    for (const pair of pairs) {
      const id = nextId('e-', ids);
      ids.add(id);
      edges.push({ id, from: pair.from, to: pair.to });
    }
    set({
      past: [...past.slice(-HISTORY_LIMIT + 1), snapshot(project)],
      future: [],
      project: { ...project, architecture: { ...project.architecture, edges } },
    });
    scheduleSave(get().project);
    return { ok: true, added: pairs.length };
  },
}));

/** Селектор: функция по идентификатору. */
export function selectFunction(
  security: SecuritySpec,
  id: string,
): SecurityFunction | undefined {
  return security.functions.find((fn) => fn.id === id);
}
