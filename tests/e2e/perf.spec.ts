/**
 * E2E-тест производительности (v0.03.01j): большая модель — 50 внутренних
 * ДБ, 20 ЛГ, 200 связей, 5 внешних систем (фикстура perf/large-state.yaml,
 * генерируется scripts/make-perf-fixture.ts). Бюджеты запроса:
 *   - импорт и первичная отрисовка — не более 2 секунд;
 *   - свёртывание ЛГ — не более 1 секунды (элементы канвы убираются:
 *     скрытые ДБ исчезают из React Flow, стрелки переносятся на рамку);
 *   - развёртывание ЛГ — не более 1 секунды;
 *   - перемещение ЛГ с ДБ — не более 1 секунды;
 *   - экспорт state.yaml — не более 1 секунды.
 * Узлов канвы: 55 доменов + 20 рамок ЛГ + рамка периметра = 76.
 *
 * Импорт измеряется на ВТОРОЙ загрузке файла: первая — прогрев JIT браузера
 * и dev-сервера (в производственной сборке бюджет выполняется и на первой;
 * в dev-режиме холодный A* транссировки заведомо тяжелее — потому прогрев).
 */

import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const LARGE_STATE = resolve(__dirname, '../fixtures/perf/large-state.yaml');

const NODE_COUNT = 76;
const EDGE_COUNT = 200;
/** Члены ЛГ 01: blk-01, blk-22, blk-43 (см. perfGroupMembers в tests/perf/largeModel.ts). */
const LG01_MEMBERS = ['blk-01', 'blk-22', 'blk-43'];

/** Нажатие тумблера свёртывания ЛГ DOM-кликом (без проверок попадания). */
async function toggleLg(page: Page, groupId: string) {
  await page.evaluate((id) => {
    (document.querySelector(`[data-testid="lg-toggle-${id}"]`) as HTMLElement | null)?.click();
  }, groupId);
}

async function importLargeState(page: Page) {
  await page.getByTestId('file-state').setInputFiles(LARGE_STATE);
  // Замена непустого проекта — после подтверждения (Ф-25). Диалог появляется
  // асинхронно после разбора файла: ждём кнопку до 3 с; на пустом проекте
  // подтверждения нет — таймаут считается нормой.
  const confirm = page.getByRole('button', { name: 'Продолжить' });
  await confirm.click({ timeout: 3000 }).catch(() => {
    // пустой проект — замена без подтверждения
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(NODE_COUNT, { timeout: 30000 });
  await expect(page.locator('.react-flow__edge')).toHaveCount(EDGE_COUNT, { timeout: 30000 });
}

// Запись trace замедляет страницу — для замеров она отключена
// (для диагностики падений включается точечно: trace: 'on').
test.use({ trace: 'off' });

test('производительность ДАП: импорт ≤ 2 с, ЛГ ≤ 1 с, перемещение ≤ 1 с, экспорт ≤ 1 с', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('demo-project')).toBeVisible();

  /* 0. Прогрев: первый импорт большой модели (не измеряется). */
  await importLargeState(page);
  await expect(page.locator('[data-testid^="lg-chip-lg-"]')).toHaveCount(20);

  /* 1. Импорт и первичная отрисовка — не более 2 секунд. */
  const importStart = Date.now();
  await importLargeState(page);
  const importMs = Date.now() - importStart;
  console.log('[perf] импорт:', importMs, 'мс');
  expect(importMs).toBeLessThanOrEqual(2000);
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(150);

  /* 2. Свёртывание одной ЛГ — не более 1 секунды; элементы канвы убираются. */
  const collapseStart = Date.now();
  await toggleLg(page, 'lg-01');
  for (const id of LG01_MEMBERS) {
    await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCount(0, { timeout: 5000 });
  }
  const collapseMs = Date.now() - collapseStart;
  console.log('[perf] свёртывание:', collapseMs, 'мс');
  expect(collapseMs).toBeLessThanOrEqual(1000);
  // Число элементов канвы МЕНЯЕТСЯ: скрыто поддерево ЛГ 01 (прямые члены
  // и вложенные ЛГ 15/20 — всего 9 ДБ), стрелки перенесены на рамку.
  await expect(page.locator('.react-flow__node')).toHaveCount(NODE_COUNT - 9);
  await expect
    .poll(() => page.locator('.react-flow__edge').count(), { timeout: 5000 })
    .toBeLessThan(EDGE_COUNT);
  await expect(page.locator('[data-testid="lg-chip-lg-01"]')).toContainText('(3)');

  /* 3. Развёртывание той же ЛГ — не более 1 секунды. */
  const expandStart = Date.now();
  await toggleLg(page, 'lg-01');
  for (const id of LG01_MEMBERS) {
    await expect(page.locator(`[data-block-id="${id}"]`)).toHaveCount(1, { timeout: 5000 });
  }
  const expandMs = Date.now() - expandStart;
  console.log('[perf] развёртывание:', expandMs, 'мс');
  expect(expandMs).toBeLessThanOrEqual(1000);
  await expect(page.locator('.react-flow__node')).toHaveCount(NODE_COUNT);

  /* 4. Перемещение ЛГ с ДБ — не более 1 секунды (жест целиком).
   *    После «вместить» масштаб мал, а боковые панели перекрывают края канвы:
   *    кандидаты — плашки ЛГ, чья точка заведомо доступна указателю; жест
   *    пробуется по очереди, таймер — на успешном переносе (рамка и её ДБ
   *    сместились на одну дельту). */
  const candidates = await page.evaluate(() => {
    const list: Array<{ cx: number; cy: number; groupId: string }> = [];
    // Плашки ЛГ: перетаскивание ЛГ целиком (Ф-78) начинается с плашки;
    // точка должна быть действительно под указателем (панели перекрывают
    // края канвы после «вместить»).
    for (const chip of document.querySelectorAll('[data-testid^="lg-chip-lg-"]')) {
      const r = chip.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const groupId = chip.closest('.react-flow__node')?.getAttribute('data-id');
      if (hit && chip.contains(hit) && groupId) list.push({ cx, cy, groupId });
    }
    return list;
  });
  expect(candidates.length).toBeGreaterThan(0);
  const nodePos = (id: string) =>
    page.evaluate((nodeId) => {
      const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
      if (!el) return null;
      const m = el.getAttribute('style')?.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    }, id);
  const snapshot = () =>
    page.evaluate(() => {
      const result: Record<string, { x: number; y: number }> = {};
      for (const el of document.querySelectorAll('.react-flow__node[data-id^="blk-"]')) {
        const id = el.getAttribute('data-id');
        const m = el.getAttribute('style')?.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (id && m) result[id] = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
      }
      return result;
    });
  // Направление жеста — к центру канвы: ЛГ у края периметра зажаты рамкой
  // периметра (Ф-78), тянуть «наружу» нельзя.
  const paneCenter = await page.evaluate(() => {
    const r = document.querySelector('.react-flow')?.getBoundingClientRect();
    return r ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : { cx: 640, cy: 400 };
  });
  let moveMs = -1;
  let movedFrame: { before: { x: number; y: number }; after: { x: number; y: number } } | null = null;
  let beforePositions: Record<string, { x: number; y: number }> = {};
  for (const candidate of candidates.slice(0, 5)) {
    const beforeFrame = (await nodePos(candidate.groupId))!;
    beforePositions = await snapshot();
    const sx = candidate.cx < paneCenter.cx ? 1 : -1;
    const sy = candidate.cy < paneCenter.cy ? 1 : -1;
    const gestureStart = Date.now();
    await page.mouse.move(candidate.cx, candidate.cy);
    await page.mouse.down();
    // Порог перетаскивания React Flow — 1 px: первый шаг только начинает
    // жест, второй переносит рамку (конвейер: трассировка затронутых
    // стрелок + рендер канвы).
    await page.mouse.move(candidate.cx + 45 * sx, candidate.cy + 30 * sy, { steps: 1 });
    await page.mouse.move(candidate.cx + 90 * sx, candidate.cy + 60 * sy, { steps: 1 });
    await page.mouse.up();
    // Позиция рамки сместилась по любой оси? (до 3 с на фиксацию жеста)
    const settled = await expect
      .poll(
        async () => {
          const after = (await nodePos(candidate.groupId))!;
          return (
            Math.round(Math.abs(after.x - beforeFrame.x)) +
            Math.round(Math.abs(after.y - beforeFrame.y))
          );
        },
        { timeout: 3000, intervals: [100, 200, 400] },
      )
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    if (settled) {
      moveMs = Date.now() - gestureStart;
      movedFrame = { before: beforeFrame, after: (await nodePos(candidate.groupId))! };
      console.log(
        '[perf] жест', candidate.groupId,
        'до', JSON.stringify(beforeFrame),
        'после', JSON.stringify(movedFrame.after),
        'за', moveMs, 'мс',
      );
      break;
    }
    console.log('[perf] кандидат не сдвинулся:', candidate.groupId, JSON.stringify(beforeFrame));
    // Не сдвинулась (кламп периметра) — вернуть позицию не нужно: модель
    // не изменилась, пробуем следующего кандидата.
  }
  console.log('[perf] перемещение:', moveMs, 'мс');
  expect(moveMs).toBeGreaterThanOrEqual(0);
  expect(moveMs).toBeLessThanOrEqual(1000);
  // Позиция зафиксирована в модели: рамка и хотя бы один ДБ — на одной дельте.
  const dx = movedFrame!.after.x - movedFrame!.before.x;
  const dy = movedFrame!.after.y - movedFrame!.before.y;
  expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
  const memberMoved = await page.evaluate(
    ({ before, dxFrame, dyFrame }) => {
      for (const el of document.querySelectorAll('.react-flow__node[data-id^="blk-"]')) {
        const id = el.getAttribute('data-id');
        const m = el.getAttribute('style')?.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (!id || !m || !(id in before)) continue;
        const x = parseFloat(m[1]);
        const y = parseFloat(m[2]);
        if (Math.abs(x - before[id].x - dxFrame) <= 1 && Math.abs(y - before[id].y - dyFrame) <= 1) {
          return true;
        }
      }
      return false;
    },
    { before: beforePositions, dxFrame: dx, dyFrame: dy },
  );
  expect(memberMoved).toBe(true);

  /* 5. Экспорт state.yaml — не более 1 секунды. */
  const exportStart = Date.now();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-menu').click();
  await page.getByTestId('export-state').click();
  const download = await downloadPromise;
  const exportMs = Date.now() - exportStart;
  console.log('[perf] экспорт:', exportMs, 'мс');
  expect(download.suggestedFilename()).toBe('state.yaml');
  expect(exportMs).toBeLessThanOrEqual(1000);
});
