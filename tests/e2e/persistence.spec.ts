/**
 * Э-07: восстановление сеанса после перезагрузки страницы (Ф-22, НФ-6).
 * Числа — шаг с размещениями примера 1 (14.4 ТЗ v0.01.01): link 200 +
 * plan 240 + drive 45 + perc 1 → C_системы = 486 (сверено с T-C-09).
 */

import { expect, test } from '@playwright/test';

async function dropCard(page: import('@playwright/test').Page, cardId: string, blockId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра.
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
});

test('Э-07: после перезагрузки состояния, стоимости и статусы идентичны', async ({ page }) => {
  await dropCard(page, 'fn-auth', 'blk-link');
  await dropCard(page, 'fn-sign', 'blk-link');
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  await dropCard(page, 'fn-geofence', 'blk-plan');
  await dropCard(page, 'fn-estop', 'blk-drive');
  // link 200 (ДДБПЦД) + plan 240 (ДДБПЦД) + drive 45 (ДДБ) + perc 1 (НДБ) = 486.
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 486');

  // Автосохранение отложено до 1 с (Ф-22) — даём дебаунсу завершиться.
  await page.waitForTimeout(1300);

  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 486');
  await expect(page.getByTestId('summary-bar')).toContainText('размещено 5 из 7 функций');
  await expect(page.locator('[data-block-id="blk-drive"]')).toContainText('C_домена = 45');
  await expect(page.locator('[data-block-id="blk-drive"]')).toContainText('ДДБ');
  await expect(page.locator('[data-block-id="blk-perc"]')).toContainText('C_домена = 1');
  await expect(page.locator('[data-block-id="blk-perc"]')).toContainText('НДБ');
  await expect(page.getByTestId('pool-card-fn-charge-guard')).toContainText('свободна');
});
