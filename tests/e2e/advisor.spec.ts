/**
 * Проверка диаграммы и советы — v0.01.08. Кнопка «Проверить» сверяет
 * трассировку «цель → функция → домен» по текущему состоянию (E-501/E-502,
 * W-006); панель «Советы по архитектуре» показывает эвристики с оценкой
 * экономии C_системы без автоприменения.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
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

test('v0.01.08: «Проверить» на чистой модели — тост без ошибок', async ({ page }) => {
  await page.getByTestId('check-diagram').click();
  await expect(page.getByText('Проверка диаграммы: ошибок и предупреждений нет').first()).toBeVisible();
  // Панель валидации не открывается: сообщений нет.
  await expect(page.getByTestId('validation-panel')).toHaveCount(0);
});

test('v0.01.08: «Проверить» на примере без размещений — E-501 и W-006', async ({ page }) => {
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);

  await page.getByTestId('check-diagram').click();
  const panel = page.getByTestId('validation-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Ошибки проверки диаграммы');
  await expect(panel).toContainText('E-501');
  await expect(panel).toContainText('обязательные функции не размещены');
  await expect(panel).toContainText('W-006');
  await expect(panel).not.toContainText('файл не применён');

  await panel.getByRole('button', { name: 'Закрыть' }).click();
  await expect(panel).toBeHidden();
});

test('v0.01.08: панель «Советы» показывает цели и экономию, применение вручную', async ({ page }) => {
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);

  const panel = page.getByTestId('advisor-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Советы по архитектуре');
  // Все функции в пуле — цели не покрыты: советы про покрытие.
  await expect(page.locator('[data-testid^="advice-goal-coverage"]').first()).toBeVisible();

  // Размещаем критичные функции: link и plan станут ДДБПЦД с
  // низкоцелостными входами — появятся советы про посредника и
  // декомпозицию с оценкой экономии.
  await dropCard(page, 'fn-auth', 'blk-link');
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  await dropCard(page, 'fn-estop', 'blk-drive');

  const savings = page.getByTestId('advice-saving');
  await expect(savings.first()).toBeVisible();
  // Автоприменения нет: ни один совет не меняет модель — C_системы
  // и состав ДВБ остаются прежними, функции можно снять вручную.
  const costBefore = await page.getByTestId('summary-bar').textContent();
  await page.locator('[data-testid^="advice-"]').first().click();
  await expect(page.getByTestId('summary-bar')).toHaveText(costBefore ?? '');

  // Клик по совету фокусирует домен-адресат: домен становится выделенным.
  await expect(page.locator('[data-block-id][data-highlighted="true"]').first()).toBeVisible();
});
