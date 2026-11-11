/**
 * Э-06: переходы светофора цели «Достоверность телеметрии» — красная → жёлтая
 * → зелёная; раскраска доверия доменов обновляется автоматически
 * (3.5 v0.01.01). Числа и статусы соответствуют разделу 14.4 ТЗ.
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
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
});

test('Э-06: красная → жёлтая после fn-sanitize → зелёная после fn-sign', async ({ page }) => {
  const goalCard = page.getByTestId('goals-panel').locator('div.rounded.border', { hasText: 'Достоверность телеметрии' });

  // До размещения: красная (крест).
  await expect(goalCard.locator('.lucide-x')).toHaveCount(1);

  // fn-sanitize — одна обязательная из двух → жёлтая (половина круга).
  // Планировщик получает критичную функцию: вход от НДБ красный → ДДБПЦД.
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  await expect(goalCard.locator('.lucide-contrast')).toHaveCount(1);
  const planNode = page.locator('[data-block-id="blk-plan"]');
  await expect(planNode).toContainText('ДДБПЦД');
  await expect(planNode).toContainText('C_домена = 120'); // 4 × 2 × 1.5 × 10

  // fn-sign — обе обязательные размещены → зелёная (галочка).
  await dropCard(page, 'fn-sign', 'blk-link');
  await expect(goalCard.locator('.lucide-check')).toHaveCount(1);
  // perc 1 + plan 120 + drive 1 + link (2 × 2 × 2 × 10 = 80) = 202.
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 202');
  await expect(page.getByTestId('summary-bar')).toContainText('покрыто целей: 1 из 5');
  // Цель «Безопасность зарядки» остаётся красной: её функции не размещены.
  const chargeGoal = page.getByTestId('goals-panel').locator('div.rounded.border', { hasText: 'Безопасность зарядки' });
  await expect(chargeGoal.locator('.lucide-x')).toHaveCount(1);
});

test('Э-06b: раскраска доверия обновляется автоматически при снятии карточки', async ({ page }) => {
  await dropCard(page, 'fn-auth', 'blk-link');
  const linkNode = page.locator('[data-block-id="blk-link"]');
  await expect(linkNode).toContainText('ДДБПЦД');

  // Снятие карточки возвращает домен в НДБ без дополнительных действий (3.5).
  await linkNode.locator('[data-card-id="fn-auth"]').getByTitle('Убрать').click();
  await expect(linkNode).toContainText('НДБ');
  await expect(linkNode).toContainText('C_домена = 1');
});
