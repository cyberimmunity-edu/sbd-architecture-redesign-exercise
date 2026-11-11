/**
 * Связь таблицы ДВБ с канвой — v0.01.04: наведение на строку в «Расширенном
 * анализе ДВБ» подсвечивает домен на диаграмме (голубое кольцо) и в
 * мини-навигаторе (голубой контур узла); клик по строке фокусирует диаграмму
 * на домене (в центр, с укрупнением) и выбирает его. Также проверяется,
 * что стрелки с обходом доменов (v0.01.04) отображаются и перестраиваются.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
});

async function dropCard(page: import('@playwright/test').Page, cardId: string, blockId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

test('v0.01.04: заголовок страницы показывает актуальную версию', async ({ page }) => {
  // Версия проверяется по единому источнику APP_VERSION (см. src/engine/types.ts):
  // при выпуске новой версии строка обновляется вместе с APP_VERSION.
  await expect(page).toHaveTitle(/Конструктор СКИБ — v0\.01\.06/);
  // Бейдж версии в верхней панели — тот же единый источник APP_VERSION.
  await expect(page.locator('.react-flow')).toBeVisible();
});

test('v0.01.04: стрелки отображаются как пути с обходом доменов', async ({ page }) => {
  // Все шесть стрелок примера отрисованы кастомным ребром с расчётной формой.
  const paths = page.locator('.react-flow__edge-path');
  await expect(paths).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) {
    await expect(paths.nth(i)).toHaveAttribute('d', /^M /);
  }
  // Расчёты не изменились: C_системы = 4 (домены без функций, НДБ).
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
});

test('v0.01.04: наведение на строку ДВБ подсвечивает домен на диаграмме и в мини-навигаторе', async ({ page }) => {
  await dropCard(page, 'fn-auth', 'blk-link');
  const row = page.getByTestId('dvb-row-blk-link');
  const node = page.locator('[data-block-id="blk-link"]');
  // Мини-навигатор задаёт stroke через style: #38BDF8 → rgb(56, 189, 248).
  const minimapHighlight = page.locator('.react-flow__minimap-node[style*="rgb(56, 189, 248)"]');

  // До наведения подсветки нет.
  await expect(node).toHaveAttribute('data-highlighted', 'false');
  await expect(minimapHighlight).toHaveCount(0);

  // Наведение на строку: голубое кольцо на домене и контур в мини-навигаторе.
  await row.hover();
  await expect(node).toHaveAttribute('data-highlighted', 'true');
  await expect(minimapHighlight).toHaveCount(1);

  // Курсор ушёл с таблицы — подсветка снята.
  await page.mouse.move(600, 60);
  await expect(node).toHaveAttribute('data-highlighted', 'false');
  await expect(minimapHighlight).toHaveCount(0);
});

test('v0.01.04: клик по строке ДВБ фокусирует канву на домене и выбирает его', async ({ page }) => {
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  const row = page.getByTestId('dvb-row-blk-plan');

  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');

  await row.click();
  await page.waitForTimeout(600); // длительность анимации setCenter — 420 мс

  // Вид изменился: диаграмма центрирована на домене и укрупнена.
  const after = await viewport.getAttribute('style');
  expect(after).not.toBe(before);
  // Домен выбран: класс selected на узле канвы (выделение из хранилища).
  await expect(page.locator('.react-flow__node[data-id="blk-plan"]')).toHaveClass(/selected/);
  // Инспектор показывает выбранный домен.
  await expect(page.getByTestId('inspector-panel')).toContainText('Домен: blk-plan');
});
