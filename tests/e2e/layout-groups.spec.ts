/**
 * E2E-тест учёта геометрии ЛГ при автоматической раскладке (v0.03.01k/l).
 *
 * Два стенда:
 *  1. Большая модель (50 внутренних ДБ, 20 ЛГ, из них 6 вложенных,
 *     5 внешних систем; фикстура perf/large-state.yaml).
 *  2. Файл пользователя state_reg_00.yaml «регламент допусков»
 *     (14 внутренних ДБ, 8 внешних систем, 6 ЛГ — lg-key ⊂ lg-decide,
 *     lg-exec ⊂ lg-tests, несгруппированный blk-journal).
 *
 * После нажатия «Автараскладка»:
 *   - рамки развёрнутых ЛГ не пересекаются между собой, кроме полной
 *     вложенности (рамка потомка внутри рамки предка);
 *   - рамки не накрывают несгруппированные ДБ;
 *   - уплотнение: рамка ЛГ накрывает только членов своего поддерева —
 *     чужие ДБ не попадают в её охват;
 *   - число элементов канвы сохраняется (раскладка ничего не скрывает).
 *
 * Проверки по экранным прямоугольникам (boundingBox): все узлы подвергнуты
 * одному преобразованию канвы, отношения перекрытия сохраняются.
 */

import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const LARGE_STATE = resolve(__dirname, '../fixtures/perf/large-state.yaml');
const REG_STATE = resolve(__dirname, '../fixtures/seq-colors/state_reg_00.yaml');

const NODE_COUNT = 76;
const GROUP_COUNT = 20;
/** Вложенные ЛГ фикстуры: родитель → дети (tests/perf/largeModel.ts). */
const NESTED: Record<string, string[]> = {
  'lg-01': ['lg-15', 'lg-20'],
  'lg-04': ['lg-16'],
  'lg-07': ['lg-17'],
  'lg-10': ['lg-18'],
  'lg-13': ['lg-19'],
};
/** Несгруппированные ДБ фикстуры. */
const LOOSE_BLOCKS = ['blk-17', 'blk-33', 'blk-49'];

// Файл пользователя state_reg_00.yaml «регламент допусков» (v0.03.01l):
// 14 внутренних ДБ + 8 внешних систем + 6 рамок ЛГ + рамка периметра = 29 узлов.
const REG_NODE_COUNT = 29;
const REG_GROUP_COUNT = 6;
/** Вложенные ЛГ фикстуры: родитель → дети. */
const REG_NESTED: Record<string, string[]> = {
  'lg-decide': ['lg-key'],
  'lg-tests': ['lg-exec'],
};
/** Несгруппированный ДБ фикстуры. */
const REG_LOOSE_BLOCKS = ['blk-journal'];
/** Поддеревья ЛГ (прямые члены + члены вложенных потомков): уплотнение —
 *  рамка накрывает только своих. */
const REG_SUBTREE_BLOCKS: Record<string, string[]> = {
  'lg-iface': ['blk-comm', 'blk-req-pub', 'blk-intake'],
  'lg-check': ['blk-payment', 'blk-notice'],
  'lg-decide': ['blk-decision', 'blk-registry', 'blk-esign'],
  'lg-key': ['blk-esign'],
  'lg-tests': ['blk-store', 'blk-test-mgmt', 'blk-result-gate', 'blk-sec-tests', 'blk-func-tests'],
  'lg-exec': ['blk-sec-tests', 'blk-func-tests'],
};
/** Все внутренние ДБ фикстуры (для проверки уплотнения). */
const REG_ALL_BLOCKS = [
  'blk-comm',
  'blk-req-pub',
  'blk-intake',
  'blk-payment',
  'blk-notice',
  'blk-decision',
  'blk-registry',
  'blk-esign',
  'blk-journal',
  'blk-store',
  'blk-test-mgmt',
  'blk-result-gate',
  'blk-sec-tests',
  'blk-func-tests',
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Ожидание стабилизации канвы: раскладка, перетрассировка стрелок, «вместить». */
async function waitCanvasStable(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const a = await readBoxes(page);
        await page.waitForTimeout(300);
        const b = await readBoxes(page);
        return JSON.stringify(a) === JSON.stringify(b);
      },
      { timeout: 20000, intervals: [500, 1000] },
    )
    .toBe(true);
}

/** Экранные прямоугольники рамок ЛГ (обёртки узлов React Flow) и ДБ. */
async function readBoxes(page: Page): Promise<{ frames: Record<string, Box>; blocks: Record<string, Box> }> {
  return page.evaluate(() => {
    const read = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const frames: Record<string, Box> = {};
    for (const el of document.querySelectorAll('[data-lg-id]')) {
      const node = el.closest('.react-flow__node');
      if (node) frames[el.getAttribute('data-lg-id') as string] = read(node);
    }
    const blocks: Record<string, Box> = {};
    for (const el of document.querySelectorAll('[data-block-id]')) {
      const node = el.closest('.react-flow__node');
      if (node) blocks[el.getAttribute('data-block-id') as string] = read(node);
    }
    return { frames, blocks };
  });
}

test('автараскладка учитывает ЛГ: рамки без пересечений, чужие ДБ не накрыты', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('demo-project')).toBeVisible();

  // Большая модель: 55 доменов + 20 рамок ЛГ + рамка периметра = 76 узлов.
  await page.getByTestId('file-state').setInputFiles(LARGE_STATE);
  const confirm = page.getByRole('button', { name: 'Продолжить' });
  await confirm.click({ timeout: 3000 }).catch(() => {
    // пустой проект — замена без подтверждения
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(NODE_COUNT, { timeout: 30000 });
  await expect(page.locator('[data-testid^="lg-chip-lg-"]')).toHaveCount(GROUP_COUNT);

  // Автоматическая раскладка; вид подстраивается («вместить»).
  await page.getByTestId('auto-layout').click();
  await waitCanvasStable(page);

  // Раскладка ничего не скрывает: все узлы и все ЛГ на месте, развёрнуты.
  await expect(page.locator('.react-flow__node')).toHaveCount(NODE_COUNT);
  await expect(page.locator('[data-lg-collapsed="true"]')).toHaveCount(0);

  const { frames, blocks } = await readBoxes(page);
  const frameIds = Object.keys(frames).sort();
  expect(frameIds).toHaveLength(GROUP_COUNT);

  const isNestedPair = (a: string, b: string): boolean =>
    NESTED[a]?.includes(b) === true || NESTED[b]?.includes(a) === true;

  // 1. Рамки ЛГ не пересекаются, кроме полной вложенности.
  for (let i = 0; i < frameIds.length; i += 1) {
    for (let j = i + 1; j < frameIds.length; j += 1) {
      const a = frames[frameIds[i]];
      const b = frames[frameIds[j]];
      if (isNestedPair(frameIds[i], frameIds[j])) {
        // Полная вложенность: рамка потомка внутри рамки предка.
        const parent = NESTED[frameIds[i]]?.includes(frameIds[j]) ? a : b;
        const child = parent === a ? b : a;
        expect(parent.x, `${frameIds[i]} ⊃ ${frameIds[j]}: x`).toBeLessThanOrEqual(child.x);
        expect(parent.y, `${frameIds[i]} ⊃ ${frameIds[j]}: y`).toBeLessThanOrEqual(child.y);
        expect(
          parent.x + parent.width,
          `${frameIds[i]} ⊃ ${frameIds[j]}: right`,
        ).toBeGreaterThanOrEqual(child.x + child.width);
        expect(
          parent.y + parent.height,
          `${frameIds[i]} ⊃ ${frameIds[j]}: bottom`,
        ).toBeGreaterThanOrEqual(child.y + child.height);
        continue;
      }
      expect(overlap(a, b), `${frameIds[i]} × ${frameIds[j]} пересекаются`).toBe(false);
    }
  }

  // 2. Рамки не накрывают несгруппированные ДБ.
  for (const id of LOOSE_BLOCKS) {
    const loose = blocks[id];
    expect(loose, `${id} на канве`).toBeTruthy();
    for (const [groupId, frame] of Object.entries(frames)) {
      expect(overlap(frame, loose), `${groupId} накрывает ${id}`).toBe(false);
    }
  }
});

test('автараскладка на файле пользователя (state_reg_00.yaml): рамки без пересечений, члены уплотнены', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('demo-project')).toBeVisible();

  // Регламент допусков: 22 домена + 6 рамок ЛГ + периметр = 29 узлов.
  await page.getByTestId('file-state').setInputFiles(REG_STATE);
  const confirm = page.getByRole('button', { name: 'Продолжить' });
  await confirm.click({ timeout: 3000 }).catch(() => {
    // пустой проект — замена без подтверждения
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(REG_NODE_COUNT, { timeout: 30000 });
  await expect(page.locator('[data-testid^="lg-chip-lg-"]')).toHaveCount(REG_GROUP_COUNT);

  await page.getByTestId('auto-layout').click();
  await waitCanvasStable(page);

  // Раскладка ничего не скрывает: все узлы и все ЛГ на месте, развёрнуты.
  await expect(page.locator('.react-flow__node')).toHaveCount(REG_NODE_COUNT);
  await expect(page.locator('[data-lg-collapsed="true"]')).toHaveCount(0);

  const { frames, blocks } = await readBoxes(page);
  const frameIds = Object.keys(frames).sort();
  expect(frameIds).toEqual(Object.keys(REG_SUBTREE_BLOCKS).sort());
  for (const id of [...REG_ALL_BLOCKS, ...frameIds]) {
    expect(blocks[id] ?? frames[id], `${id} на канве`).toBeTruthy();
  }

  const isNestedPair = (a: string, b: string): boolean =>
    REG_NESTED[a]?.includes(b) === true || REG_NESTED[b]?.includes(a) === true;

  // 1. Рамки ЛГ не пересекаются, кроме полной вложенности.
  for (let i = 0; i < frameIds.length; i += 1) {
    for (let j = i + 1; j < frameIds.length; j += 1) {
      const a = frames[frameIds[i]];
      const b = frames[frameIds[j]];
      if (isNestedPair(frameIds[i], frameIds[j])) {
        // Полная вложенность: рамка потомка внутри рамки предка.
        const parent = REG_NESTED[frameIds[i]]?.includes(frameIds[j]) ? a : b;
        const child = parent === a ? b : a;
        expect(parent.x, `${frameIds[i]} ⊃ ${frameIds[j]}: x`).toBeLessThanOrEqual(child.x);
        expect(parent.y, `${frameIds[i]} ⊃ ${frameIds[j]}: y`).toBeLessThanOrEqual(child.y);
        expect(
          parent.x + parent.width,
          `${frameIds[i]} ⊃ ${frameIds[j]}: right`,
        ).toBeGreaterThanOrEqual(child.x + child.width);
        expect(
          parent.y + parent.height,
          `${frameIds[i]} ⊃ ${frameIds[j]}: bottom`,
        ).toBeGreaterThanOrEqual(child.y + child.height);
        continue;
      }
      expect(overlap(a, b), `${frameIds[i]} × ${frameIds[j]} пересекаются`).toBe(false);
    }
  }

  // 2. Рамки не накрывают несгруппированный blk-journal.
  for (const id of REG_LOOSE_BLOCKS) {
    const loose = blocks[id];
    expect(loose, `${id} на канве`).toBeTruthy();
    for (const [groupId, frame] of Object.entries(frames)) {
      expect(overlap(frame, loose), `${groupId} накрывает ${id}`).toBe(false);
    }
  }

  // 3. Уплотнение: рамка ЛГ накрывает только членов своего поддерева —
  //    чужие ДБ (другая ЛГ или несгруппированный) не попадают в охват.
  for (const [groupId, frame] of Object.entries(frames)) {
    const own = new Set(REG_SUBTREE_BLOCKS[groupId]);
    for (const blockId of REG_ALL_BLOCKS) {
      if (own.has(blockId)) continue;
      const rect = blocks[blockId];
      expect(rect, `${blockId} на канве`).toBeTruthy();
      expect(overlap(frame, rect), `${groupId} накрывает ${blockId}`).toBe(false);
    }
  }
});
