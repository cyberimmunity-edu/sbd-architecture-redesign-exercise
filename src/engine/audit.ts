/**
 * Семантическая проверка диаграммы — v0.01.08. Запускается кнопкой
 * «Проверить» верхней панели по текущему состоянию проекта (не по файлу):
 * отличает цель, записанную в спецификации, от цели, реализованной
 * в архитектуре — трассировка «цель → функция → домен».
 *
 * Коды (реестр io/errors.ts):
 * - E-501 — у цели есть обязательные функции, но ни одна из них не размещена
 *   в доменах: цель «бумажная», светофор цели красный;
 * - E-502 — цель ПЛО («при любых обстоятельствах», unconditional) с
 *   неполным размещением обязательных функций: безусловная цель не может
 *   опираться на предположения, пробел недопустим строже обычной цели;
 * - W-006 — функция связана с целями (implements), но не размещена ни в
 *   одном домене — цепочка «цель → функция → домен» разорвана.
 *
 * Валидация загрузки файлов (io/validate.ts) проверяет структуру и не
 * дублируется здесь; сообщения не блокируют работу — только информируют.
 * Чистая функция: одинаковый проект — одинаковый список сообщений.
 */

import type { ImportMessage, Project } from './types';
import { ERR, WARN, err, warn } from '../io/errors';

export function validateProject(project: Project): ImportMessage[] {
  const messages: ImportMessage[] = [];
  const placed = new Set(project.assignments.map((a) => a.function));

  // W-006: функция связана с целями, но не размещена.
  for (let i = 0; i < project.security.functions.length; i++) {
    const fn = project.security.functions[i];
    if ((fn.implements ?? []).length === 0) continue;
    if (placed.has(fn.id)) continue;
    messages.push(
      warn(
        WARN.W006,
        `функция ${fn.id} («${fn.name}») связана с целями, но не размещена ни в одном домене`,
        { path: `functions[${i}]` },
      ),
    );
  }

  // E-501 / E-502: обязательные функции цели не размещены.
  for (let i = 0; i < project.security.goals.length; i++) {
    const goal = project.security.goals[i];
    const mandatory = new Set<string>();
    for (const fn of project.security.functions) {
      for (const link of fn.implements ?? []) {
        if (link.goal === goal.id && link.weight === 'mandatory') mandatory.add(fn.id);
      }
    }
    if (mandatory.size === 0) continue; // цели без функций — зона W-003
    const unplaced = [...mandatory].filter((id) => !placed.has(id));
    if (unplaced.length === 0) continue;
    if (goal.unconditional) {
      messages.push(
        err(
          ERR.E502,
          `цель ПЛО ${goal.id} («${goal.name}») должна выполняться безусловно: обязательные функции не размещены (${unplaced.join(', ')})`,
          { path: `goals[${i}]` },
        ),
      );
    } else {
      messages.push(
        err(
          ERR.E501,
          `цель ${goal.id} («${goal.name}»): обязательные функции не размещены в доменах (${unplaced.join(', ')})`,
          { path: `goals[${i}]` },
        ),
      );
    }
  }
  return messages;
}
