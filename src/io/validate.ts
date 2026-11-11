/**
 * Семантическая валидация моделей архитектуры и спецификации безопасности —
 * шаг 3–4 валидации раздела 6.5 ТЗ. Выдаёт точные коды ошибок E-101…E-207
 * и предупреждений W-003/W-004; используется парсерами architecture.yaml,
 * security.yaml, state.yaml и PlantUML.
 */

import { ID_PATTERN } from '../engine/types';
import type { Architecture, Block, Edge, Goal, ImportMessage, SecurityFunction, SecuritySpec } from '../engine/types';
import { ERR, WARN, err, warn } from './errors';

const MAX_NAME = 80;
const MAX_FN_NAME = 100;
const MAX_DESC = 500;
const MAX_LABEL = 60;

function pushIdErrors(
  messages: ImportMessage[],
  id: string,
  kind: string,
  path: string,
): void {
  if (!ID_PATTERN.test(id)) {
    messages.push(
      err(ERR.E106, `id «${id}» ${kind} не соответствует шаблону ^[a-z][a-z0-9-]{0,63}$`, { path }),
    );
  }
}

/** Валидация модели архитектуры (blocks + edges). */
export function validateArchitecture(arch: Architecture): ImportMessage[] {
  const messages: ImportMessage[] = [];
  const blocks = arch.blocks;
  if (blocks.length === 0) {
    messages.push(err(ERR.E105, 'список blocks пуст'));
    return messages;
  }
  const ids = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const path = `blocks[${i}]`;
    if (ids.has(block.id)) {
      messages.push(err(ERR.E101, `дубликат id блока ${block.id}`, { path: `${path}.id` }));
    }
    ids.add(block.id);
    pushIdErrors(messages, block.id, 'блока', `${path}.id`);
    if (!Number.isInteger(block.cost) || block.cost < 0) {
      messages.push(
        err(ERR.E102, `стоимость блока ${block.id} отрицательная или не целое число`, {
          path: `${path}.cost`,
        }),
      );
    }
    if (typeof block.name !== 'string' || block.name.length < 1 || block.name.length > MAX_NAME) {
      messages.push(
        err(ERR.E002, `имя блока ${block.id} должно быть строкой от 1 до ${MAX_NAME} символов`, {
          path: `${path}.name`,
        }),
      );
    }
  }
  const edgeIds = new Set<string>();
  for (let i = 0; i < arch.edges.length; i++) {
    const edge = arch.edges[i];
    const path = `edges[${i}]`;
    if (edgeIds.has(edge.id)) {
      messages.push(err(ERR.E101, `дубликат id стрелки ${edge.id}`, { path: `${path}.id` }));
    }
    edgeIds.add(edge.id);
    pushIdErrors(messages, edge.id, 'стрелки', `${path}.id`);
    if (edge.from === edge.to) {
      messages.push(err(ERR.E104, `петля: стрелка ${edge.id} ведёт из ${edge.from} в себя`, { path }));
    }
    if (!ids.has(edge.from)) {
      messages.push(err(ERR.E103, `стрелка ${edge.id} ссылается на несуществующий блок ${edge.from}`, { path: `${path}.from` }));
    }
    if (!ids.has(edge.to)) {
      messages.push(err(ERR.E103, `стрелка ${edge.id} ссылается на несуществующий блок ${edge.to}`, { path: `${path}.to` }));
    }
    if (edge.label !== undefined && edge.label.length > MAX_LABEL) {
      messages.push(
        err(ERR.E002, `подпись стрелки ${edge.id} длиннее ${MAX_LABEL} символов`, { path: `${path}.label` }),
      );
    }
  }
  return messages;
}

/** Валидация спецификации безопасности (goals + functions). */
export function validateSecurity(security: SecuritySpec): ImportMessage[] {
  const messages: ImportMessage[] = [];
  if (security.goals.length === 0) {
    messages.push(err(ERR.E203, 'список goals пуст'));
  }
  if (security.functions.length === 0) {
    messages.push(err(ERR.E204, 'список functions пуст'));
  }
  const goalIds = new Set<string>();
  for (let i = 0; i < security.goals.length; i++) {
    const goal = security.goals[i];
    const path = `goals[${i}]`;
    if (goalIds.has(goal.id)) {
      messages.push(err(ERR.E201, `дубликат id цели ${goal.id}`, { path: `${path}.id` }));
    }
    goalIds.add(goal.id);
    pushIdErrors(messages, goal.id, 'цели', `${path}.id`);
    if (goal.name.length < 1 || goal.name.length > MAX_NAME) {
      messages.push(
        err(ERR.E002, `имя цели ${goal.id} должно быть строкой от 1 до ${MAX_NAME} символов`, { path: `${path}.name` }),
      );
    }
    if (goal.description !== undefined && goal.description.length > MAX_DESC) {
      messages.push(
        err(ERR.E002, `описание цели ${goal.id} длиннее ${MAX_DESC} символов`, { path: `${path}.description` }),
      );
    }
  }
  // Предположения безопасности (v0.01.05): уникальные id по шаблону,
  // непустой текст до MAX_DESC символов.
  const assumptionIds = new Set<string>();
  for (let i = 0; i < (security.assumptions ?? []).length; i++) {
    const assumption = security.assumptions![i];
    const path = `assumptions[${i}]`;
    if (assumptionIds.has(assumption.id)) {
      messages.push(err(ERR.E208, `дубликат id предположения ${assumption.id}`, { path: `${path}.id` }));
    }
    assumptionIds.add(assumption.id);
    pushIdErrors(messages, assumption.id, 'предположения', `${path}.id`);
    if (assumption.text.length < 1 || assumption.text.length > MAX_DESC) {
      messages.push(
        err(ERR.E002, `текст предположения ${assumption.id} должен быть строкой от 1 до ${MAX_DESC} символов`, { path: `${path}.text` }),
      );
    }
  }
  const fnIds = new Set<string>();
  for (let i = 0; i < security.functions.length; i++) {
    const fn = security.functions[i];
    const path = `functions[${i}]`;
    if (fnIds.has(fn.id)) {
      messages.push(err(ERR.E202, `дубликат id функции ${fn.id}`, { path: `${path}.id` }));
    }
    fnIds.add(fn.id);
    pushIdErrors(messages, fn.id, 'функции', `${path}.id`);
    if (!Number.isInteger(fn.cost) || fn.cost < 0) {
      messages.push(
        err(ERR.E207, `стоимость функции ${fn.id} отрицательная или не целое число`, { path: `${path}.cost` }),
      );
    }
    if (fn.name.length < 1 || fn.name.length > MAX_FN_NAME) {
      messages.push(
        err(ERR.E002, `имя функции ${fn.id} должно быть строкой от 1 до ${MAX_FN_NAME} символов`, { path: `${path}.name` }),
      );
    }
    for (let j = 0; j < (fn.implements ?? []).length; j++) {
      const link = fn.implements![j];
      const linkPath = `${path}.implements[${j}]`;
      if (!goalIds.has(link.goal)) {
        messages.push(
          err(ERR.E205, `связь implements функции ${fn.id} ссылается на несуществующую цель ${link.goal}`, { path: linkPath }),
        );
      }
      if (link.weight !== 'mandatory' && link.weight !== 'optional') {
        messages.push(
          err(ERR.E206, `вес связи функции ${fn.id} отличен от mandatory и optional`, { path: `${linkPath}.weight` }),
        );
      }
    }
    if ((fn.implements ?? []).length === 0) {
      messages.push(warn(WARN.W004, `функция ${fn.id} не имеет связей с целями`, { path: `${path}.implements` }));
    }
  }
  // W-003: цель без реализующих функций (всегда красная).
  const implemented = new Set<string>();
  for (const fn of security.functions) {
    for (const link of fn.implements ?? []) implemented.add(link.goal);
  }
  for (const goal of security.goals) {
    if (!implemented.has(goal.id)) {
      messages.push(warn(WARN.W003, `цель ${goal.id} не имеет реализующих функций`, { path: `goals[${security.goals.indexOf(goal)}].id` }));
    }
  }
  return messages;
}

/** Сериализация не нужна валидации, но типы полезны парсерам. */
export type { Block, Edge, Goal, SecurityFunction };
