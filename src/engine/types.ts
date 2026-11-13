/**
 * Сущности модели предметной области — раздел 3.1 ТЗ «Конструктор СКИБ».
 * Имена полей фиксированы и используются в коде, файлах данных и схемах
 * валидации без изменений.
 */

/** Шаблон идентификаторов сущностей (раздел 3.1). */
export const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** Лимиты модели — Ф-17. */
export const MAX_DOMAINS = 200;
export const MAX_EDGES = 500;

/** Лимиты режима «Диаграммы последовательности» — Ф-58 (v0.02.01). */
export const MAX_SEQUENCES = 20;
export const MAX_LIFELINES = 24;
export const MAX_SEQ_ARROWS = 100;
export const MAX_SEQ_BLOCKS = 10;

/** Лимиты логических групп (ЛГ) на ДАП — Ф-70 (v0.02.03). */
export const MAX_DOMAIN_GROUPS = 20;
/** Максимальная глубина вложенности ЛГ (Ф-71). */
export const MAX_LG_DEPTH = 3;
/** Лимит длины имени ЛГ. */
export const LG_NAME_LIMIT = 60;
/** Цвет ЛГ по умолчанию — серый (П-15).
 *  Красный, жёлтый и зелёный зарезервированы под уровни доверия ДБ
 *  (см. ui/status.tsx TRUST_COLORS) и в палитру ЛГ не входят. */
export const LG_DEFAULT_COLOR = '#607D8B';
/** Палитра цветов ЛГ — 8 фиксированных цветов (П-15): серый по умолчанию
 *  и семь оттенков без красного, жёлтого и зелёного. */
export const LG_COLORS = [
  LG_DEFAULT_COLOR,
  '#1E88E5',
  '#3F51B5',
  '#8E24AA',
  '#D81B60',
  '#00897B',
  '#6D4C41',
  '#455A64',
] as const;
/** Лимит длины имени ДП, имени блока, условия, подписей веток и стрелок. */
export const SEQ_TEXT_LIMIT = 60;
/** Палитра цветов групп и циклов — 8 фиксированных цветов (П-13). */
export const SEQ_BLOCK_COLORS = [
  '#1E88E5',
  '#43A047',
  '#F9A825',
  '#8E24AA',
  '#00897B',
  '#D81B60',
  '#6D4C41',
  '#546E7A',
] as const;

/** Лимит истории операций — Ф-21. */
export const HISTORY_LIMIT = 100;

/** Лимит размера загружаемого файла — НФ-7. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Ключ автосохранения — Ф-22. */
export const STORAGE_KEY = 'skib-lab-state-v1';

/** Версия схемы файлов данных (6.1–6.4). */
export const FILE_VERSION = 1;

/** Функциональный блок / домен безопасности. */
export interface Block {
  id: string;
  name: string;
  /** C_блока — целое число, не меньше 0. Для внешних систем не определяется (0). */
  cost: number;
  position?: { x: number; y: number };
  /** Внешняя (смежная) система — вне периметра целевой системы (3.5 v0.01.01). */
  external?: boolean;
  /** Доверенность внешней системы; по умолчанию недоверенная (false).
   *  Для внутренних доменов не используется — их доверенность выводится
   *  из размещённых функций (engine/trust.ts). */
  trusted?: boolean;
  /** Принудительный ввод внутреннего домена в ДВБ (v0.01.06): домен
   *  считается доверенным (ДДБ/ДДБПЦД) даже без критичной функции
   *  безопасности — например, доверенные датчики в составе системы.
   *  Для внешних систем не используется (их доверенность — trusted). */
  forceTrusted?: boolean;
  /** Логическая группа (ЛГ), в которую входит блок (v0.02.03, Ф-70):
   *  DomainGroup.id; отсутствие — блок несгруппирован. */
  groupId?: string;
}

/** Логическая группа ДБ (ЛГ) на ДАП — по аналогии с группами Flying Logic
 *  (v0.02.03, Ф-70…Ф-76). Прямоугольник ЛГ охватывает свои ДБ и вложенные
 *  ЛГ; позиция рамки выводится из позиций членов и не хранится,
 *  кроме случая пустой ЛГ (position — якорь отображения пустой рамки). */
export interface DomainGroup {
  id: string;
  /** Имя ЛГ, до LG_NAME_LIMIT символов. */
  name: string;
  /** Цвет из палитры LG_COLORS (П-15); по умолчанию серый. */
  color: string;
  /** Свёрнута: члены не отображаются, все связи ведут к рамке ЛГ (Ф-72). */
  collapsed?: boolean;
  /** Родительская ЛГ (вложенность, Ф-71); отсутствие — ЛГ верхнего уровня. */
  parentId?: string;
  /** Якорь отображения пустой ЛГ (без членов); для непустой не используется. */
  position?: { x: number; y: number };
}

/** Стрелка функциональной архитектуры. */
export interface Edge {
  id: string;
  /** Источник стрелки (Block.id). */
  from: string;
  /** Приёмник стрелки (Block.id); from не равно to. */
  to: string;
  /** Подпись стрелки, до 60 символов. */
  label?: string;
}

/** Цель безопасности. */
export interface Goal {
  id: string;
  name: string;
  /** Пояснение, до 500 символов. */
  description?: string;
  /** ПЛО — цель «при любых обстоятельствах» (v0.01.05): обозначается (*)
   *  и должна выполняться безусловно, вне зависимости от предположений. */
  unconditional?: boolean;
}

/** Предположение безопасности (v0.01.05): свойство среды, принимаемое
 *  как данность при формулировании целей; выводится в панели целей. */
export interface Assumption {
  id: string;
  /** Формулировка предположения, до 500 символов. */
  text: string;
}

/** Вес связи «функция — цель» (решение D4). */
export type LinkWeight = 'mandatory' | 'optional';

/** Связь «функция — цель». */
export interface ImplementLink {
  goal: string;
  weight: LinkWeight;
}

/** Функция безопасности (содержимое карточки). */
export interface SecurityFunction {
  id: string;
  name: string;
  /** C_функции — целое число, не меньше 0. */
  cost: number;
  /** Связи «функция — цель»; отсутствие связей — предупреждение W-004. */
  implements?: ImplementLink[];
}

/** Размещение: функция находится ровно в одном домене (правило 3.2). */
export interface Assignment {
  function: string;
  block: string;
}

/** Функциональная архитектура.
 *  groups (v0.02.03, Ф-70) — опциональное поле: файлы и проекты
 *  v0.01.x–v0.02.02 без ЛГ читаются без изменений (обратная совместимость). */
export interface Architecture {
  blocks: Block[];
  edges: Edge[];
  groups?: DomainGroup[];
}

/** Цели и функции безопасности (с предположениями — v0.01.05). */
export interface SecuritySpec {
  goals: Goal[];
  functions: SecurityFunction[];
  /** Предположения безопасности; отсутствие — раздел не выводится. */
  assumptions?: Assumption[];
}

/** Метаданные рабочего состояния (6.4). */
export interface ProjectMeta {
  savedAt?: string;
  source?: string;
}

/** Стрелка ДП. from == to допустимо (self-стрелка) — раздел 5.2 ТЗ v0.02.01. */
export interface SeqArrow {
  id: string;
  /** Источник — Block.id из lifelines своей ДП. */
  from: string;
  /** Приёмник — Block.id из lifelines своей ДП; from == to — self-стрелка. */
  to: string;
  /** Подпись стрелки, до 60 символов (П-5). */
  label?: string;
}

/** Блок ДП: группа (group), цикл (loop) или условный блок (cond).
 *  Покрывает подряд идущие стрелки одной ДП; блоки не пересекаются
 *  и не вкладываются (П-13). */
export interface SeqBlock {
  id: string;
  kind: 'group' | 'loop' | 'cond';
  /** Группа/цикл — имя; условный блок — условие. */
  name: string;
  /** Группа/цикл — цвет палитры; у cond не используется. */
  color: string;
  /** Подряд идущие стрелки (по порядку arrows). */
  arrows: string[];
  /** cond: подпись ветки «то». */
  thenLabel?: string;
  /** cond: подпись ветки «иначе». */
  elseLabel?: string;
  /** cond: id первой стрелки ветки «иначе»; без него ветки else нет (П-14). */
  elseFrom?: string;
}

/** Диаграмма последовательности (v0.02.01, раздел 5.2 ТЗ). */
export interface SequenceDiagram {
  id: string;
  /** До 60 символов, по умолчанию «Новая ДП». */
  name: string;
  /** Block.id, без повторов; порядок = слева направо. */
  lifelines: string[];
  /** Порядок массива = вертикальный порядок = нумерация 1..N. */
  arrows: SeqArrow[];
  blocks: SeqBlock[];
}

/** Проект — полное рабочее состояние инструмента.
 *  sequences (v0.02.01) — опциональное поле: файлы и проекты v0.01.x
 *  без ДП читаются без изменений (обратная совместимость, W-001). */
export interface Project {
  architecture: Architecture;
  security: SecuritySpec;
  assignments: Assignment[];
  meta: ProjectMeta;
  sequences?: SequenceDiagram[];
}

/** Статус светофора (раздел 3.4, 5.3). */
export type Status = 'red' | 'yellow' | 'green' | 'neutral';

/** Сообщение валидации входного файла (6.5). */
export interface ImportMessage {
  code: string;
  message: string;
  path?: string;
  line?: number;
}

/** Результат валидации входного файла (6.5). */
export interface ValidationResult {
  errors: ImportMessage[];
  warnings: ImportMessage[];
}

/** Пустой проект (Ф-23): минимум 1 блок, 1 цель и 1 функция (раздел 3.1). */
export function emptyProject(): Project {
  return {
    architecture: { blocks: [], edges: [] },
    security: { goals: [], functions: [] },
    assignments: [],
    meta: {},
    sequences: [],
  };
}

/** Версия инструмента — отображается в интерфейсе и документации.
 *  Синхронизируется с package.json (раздел 10 ТЗ v0.02.01). */
export const APP_VERSION = '0.02.03b';
