/**
 * Реестр кодов ошибок и предупреждений валидации — раздел 6.5 ТЗ.
 * Каждый код имеет единственное место возникновения; сообщения формируются
 * из таблицы кодов без конкатенации произвольных технических текстов.
 */

import type { ImportMessage } from '../engine/types';

/** Ошибки (E) блокируют применение файла (Ф-6, Ф-27). */
export const ERR = {
  E001: 'E-001',
  E002: 'E-002',
  E101: 'E-101',
  E102: 'E-102',
  E103: 'E-103',
  E104: 'E-104',
  E105: 'E-105',
  E106: 'E-106',
  E201: 'E-201',
  E202: 'E-202',
  E203: 'E-203',
  E204: 'E-204',
  E205: 'E-205',
  E206: 'E-206',
  E207: 'E-207',
  E208: 'E-208',
  E301: 'E-301',
  E302: 'E-302',
  E303: 'E-303',
  E304: 'E-304',
  E401: 'E-401',
  E402: 'E-402',
  E403: 'E-403',
  // Семантическая проверка диаграммы (v0.01.08): трассировка
  // «цель → функция → домен» по кнопке «Проверить».
  E501: 'E-501',
  E502: 'E-502',
  // Режим «Диаграммы последовательности» (v0.02.01, раздел 7.5 ТЗ).
  E601: 'E-601',
  E602: 'E-602',
  E603: 'E-603',
  E604: 'E-604',
  E605: 'E-605',
  E606: 'E-606',
  E607: 'E-607',
  E608: 'E-608',
  E609: 'E-609',
} as const;

/** Предупреждения (W) не блокируют загрузку (Ф-27). */
export const WARN = {
  W001: 'W-001',
  W002: 'W-002',
  W003: 'W-003',
  W004: 'W-004',
  W005: 'W-005',
  W006: 'W-006',
  // Режим «Диаграммы последовательности» (v0.02.01, раздел 7.5 ТЗ).
  W007: 'W-007',
  W008: 'W-008',
  W009: 'W-009',
} as const;

export function err(
  code: string,
  message: string,
  extra?: { path?: string; line?: number },
): ImportMessage {
  return { code, message, ...extra };
}

export function warn(
  code: string,
  message: string,
  extra?: { path?: string; line?: number },
): ImportMessage {
  return { code, message, ...extra };
}

export function hasErrors(result: { errors: ImportMessage[] }): boolean {
  return result.errors.length > 0;
}
