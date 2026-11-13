/**
 * UX связей — v0.01.08: направление стрелки задаёт жест соединения
 * (откуда начали перетаскивание — тот и источник), прилепиться можно
 * к любой точке домена; режим автоматических размеров доменов меняет
 * габариты узлов и не влияет на расчёты.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра.
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

/** БoundingBox после остановки начальной подгонки вида (fitView). */
async function stableBox(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
  let prev = await locator.boundingBox();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.waitForTimeout(150);
    const next = await locator.boundingBox();
    if (
      prev && next &&
      Math.abs(prev.x - next.x) < 0.5 &&
      Math.abs(prev.y - next.y) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5
    ) {
      return next;
    }
    prev = next;
  }
  return prev;
}

async function dragFromHandleToNode(
  page: import('@playwright/test').Page,
  handleNode: string,
  handleSide: 'left' | 'right',
  targetNode: string,
): Promise<void> {
  const handle = page
    .locator(`.react-flow__node[data-id="${handleNode}"]`)
    .locator(`.react-flow__handle.source.react-flow__handle-${handleSide}`);
  const target = page.locator(`.react-flow__node[data-id="${targetNode}"]`);
  const from = (await stableBox(page, handle))!;
  const to = (await stableBox(page, target))!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

test('v0.01.08: жест «от точки выхода к домену» даёт стрелку от начального домена', async ({ page }) => {
  // Тянем от правой точки blk-perc к телу blk-drive (пару perc → drive
  // в примере ещё нет): источник — blk-perc.
  await dragFromHandleToNode(page, 'blk-perc', 'right', 'blk-drive');
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect(page.getByTestId('inspector-panel')).toContainText(
    'Из: 01. Подсистема восприятия → В: 03. Привод движения',
  );
});

test('v0.01.08: жест «назад» (слева направо по экрану) тоже сохраняет направление', async ({ page }) => {
  // Тянем от левой точки blk-link к телу blk-perc: источник — blk-link,
  // приёмник — blk-perc (стрелка «назад» относительно колонок).
  await dragFromHandleToNode(page, 'blk-link', 'left', 'blk-perc');
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect(page.getByTestId('inspector-panel')).toContainText(
    'Из: 04. Модуль связи → В: 01. Подсистема восприятия',
  );
});

test('v0.01.08: дроп мимо доменов не создаёт стрелку', async ({ page }) => {
  const handle = page
    .locator('.react-flow__node[data-id="blk-perc"]')
    .locator('.react-flow__handle.source.react-flow__handle-right');
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y - 200, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

test('v0.01.08: режим «Размеры» растягивает домены по стоимости и не меняет расчёты', async ({ page }) => {
  const sizeButton = page.getByTestId('toggle-size-mode');
  await expect(sizeButton).toContainText('Размеры: выкл');
  await expect(sizeButton).toHaveAttribute('aria-pressed', 'false');

  // Размещаем функцию: Планировщик станет ДДБПЦД со стоимостью 120,
  // остальные домены останутся дешёвыми НДБ (по 1).
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId('pool-card-fn-sanitize');
  const node = page.locator('[data-block-id="blk-plan"]');
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 123');

  await sizeButton.click(); // off → cost
  await expect(sizeButton).toContainText('Размеры: стоимость');
  await expect(sizeButton).toHaveAttribute('aria-pressed', 'true');
  // Планировщик — самый дорогой: минимальная ширина 240 × 1.8 = 432 px;
  // остальные домены — базовые 240 px.
  const planStyle = (await page
    .locator('.react-flow__node[data-id="blk-plan"] [data-block-id="blk-plan"]')
    .getAttribute('style')) ?? '';
  expect(planStyle).toContain('min-width: 432px');
  const percStyle = (await page
    .locator('.react-flow__node[data-id="blk-perc"] [data-block-id="blk-perc"]')
    .getAttribute('style')) ?? '';
  expect(percStyle).toContain('min-width: 240px');

  await sizeButton.click(); // cost → block
  await expect(sizeButton).toContainText('Размеры: C_блока');

  await sizeButton.click(); // block → off
  await expect(sizeButton).toContainText('Размеры: выкл');
  const planStyleOff = (await page
    .locator('.react-flow__node[data-id="blk-plan"] [data-block-id="blk-plan"]')
    .getAttribute('style')) ?? '';
  expect(planStyleOff).not.toContain('min-width');

  // Вид не влияет на расчёты: C_системы прежняя, стрелки на месте.
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 123');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});
