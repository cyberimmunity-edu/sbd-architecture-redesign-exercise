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
 *   одном домене — цепочка «цель → функция → домен» разорвана;
 * - W-013 — домен введён в ДВБ принудительно (forceTrusted), но принимает
 *   низкоцелостный (красный) поток (v0.03.01b, сверка с независимой
 *   моделью анализатора): исходящие потоки считаются зелёными по флагу,
 *   а не по контролю целостности — признак требует явного обоснования
 *   (например, доверенный датчик в составе ДВБ); иначе контроль
 *   целостности моделируется функцией безопасности.
 *
 * Валидация загрузки файлов (io/validate.ts) проверяет структуру и не
 * дублируется здесь; сообщения не блокируют работу — только информируют.
 * Чистая функция: одинаковый проект — одинаковый список сообщений.
 */

import type { ImportMessage, Project } from './types';
import { computeTrust } from './trust';
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
  // W-013: принудительный ввод в ДВБ при красном входе — флаг маскирует
  // незавершённый контур целостности (v0.03.01b, сверка с анализатором).
  // forceTrusted — полноправный признак модели (доверенные датчики и т.п.),
  // но при красном входе исходящие потоки «зелёные по флагу», поэтому
  // обоснование должно быть явным.
  const trust = computeTrust(project);
  for (let i = 0; i < project.architecture.blocks.length; i++) {
    const block = project.architecture.blocks[i];
    if (block.external || !block.forceTrusted) continue;
    const redIncoming = project.architecture.edges.some(
      (edge) => edge.to === block.id && trust.edges.get(edge.id) === 'red',
    );
    if (!redIncoming) continue;
    messages.push(
      warn(
        WARN.W013,
        `домен ${block.id} («${block.name}») введён в ДВБ принудительно (forceTrusted), но принимает низкоцелостный (красный) поток: исходящие потоки зелёные по флагу, а не по контролю целостности — проверьте обоснование признака`,
        { path: `architecture.blocks[${i}]` },
      ),
    );
  }
  return messages;
}
