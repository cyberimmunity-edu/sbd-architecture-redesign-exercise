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

/** Функциональная архитектура. */
export interface Architecture {
  blocks: Block[];
  edges: Edge[];
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

/** Проект — полное рабочее состояние инструмента. */
export interface Project {
  architecture: Architecture;
  security: SecuritySpec;
  assignments: Assignment[];
  meta: ProjectMeta;
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
  };
}

/** Версия инструмента — отображается в интерфейсе и документации. */
export const APP_VERSION = '0.01.08';
