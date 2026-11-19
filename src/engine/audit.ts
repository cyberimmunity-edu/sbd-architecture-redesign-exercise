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
 *   целостности моделируется функцией безопасности;
 * - E-601 — стрелка ДП не опирается на связь ДАП с точным направлением
 *   (v0.03.01c: кросс-проверка ДП↔ДАП включена в общий чек «Проверить»;
 *   раньше расхождения находила только кнопка «Проверить ДП» режима ДП —
 *   удаление связи на ДАП, нужной стрелкам ДП, оставалось незамеченным);
 * - W-008 — домен ДАП не используется ни в одной ДП; включается только
 *   при наличии хотя бы одной ДП: в проекте без ДП предупреждение по всем
 *   доменам было бы шумом.
 *
 * Валидация загрузки файлов (io/validate.ts) проверяет структуру и не
 * дублируется здесь; сообщения не блокируют работу — только информируют.
 * Чистая функция: одинаковый проект — одинаковый список сообщений.
 */

import type { ImportMessage, Project } from './types';
import { computeTrust } from './trust';
import { validateSequencesRows } from './sequence';
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

  // Кросс-проверка ДП ↔ ДАП (v0.03.01c): те же правила, что у кнопки
  // «Проверить ДП» режима ДП (6.1). Расхождения связей E-601 — строгий
  // учёт направления (П-3), self-стрелки соответствия не требуют.
  // E-605 (v0.03.01e): структура блоков ДП (подряд идущие стрелки, без
  // пересечений — П-13/П-14) включена в общий чек: разрыв состава,
  // породивший в 0.03.01d файлы, отвергаемые импортом, виден до экспорта.
  // W-008 (домен вне ДП) включается только при наличии хотя бы одной ДП:
  // без ДП предупреждение по каждому домену — шум, а не диагностикой.
  for (const row of validateSequencesRows(project)) {
    if (row.code === ERR.E601) {
      messages.push(err(ERR.E601, row.message));
    } else if (row.code === ERR.E605) {
      messages.push(err(ERR.E605, row.message));
    } else if (row.code === WARN.W008 && (project.sequences?.length ?? 0) > 0) {
      messages.push(warn(WARN.W008, row.message));
    }
  }
  return messages;
}
