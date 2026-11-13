/**
 * E2E-сценарии Э-01 и Э-03/Э-04 — старт и пример 1 «Автономный коммунальный
 * робот», размещение и возврат карточки (раздел 11.3 ТЗ, числа 14.4 v0.01.01).
 * В канве узлов на 1 больше доменов: рамка периметра — тоже узел React Flow.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Чистый сеанс для каждого сценария.
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('demo-project')).toBeVisible();
});

async function loadRobot(page: import('@playwright/test').Page) {
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра.
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
}

test('Э-01: старт и пример 1 — 4 внутренних домена, 2 внешние системы, 7 карточек, C_системы = 4, цели красные', async ({
  page,
}) => {
  await loadRobot(page);
  await expect(page.getByTestId(/^pool-card-/)).toHaveCount(7);

  const summary = page.getByTestId('summary-bar');
  await expect(summary).toContainText('C_системы: 4'); // 4 внутренних домена по ceil(C_блока × 0.1)
  await expect(summary).toContainText('домены: 4');
  await expect(summary).toContainText('внешние системы: 2');
  await expect(summary).toContainText('размещено 0 из 7 функций');
  await expect(summary).toContainText('покрыто целей: 0 из 5');
  await expect(summary).toContainText('Обязательные цели не покрыты');

  // Все 5 целей красные (крест — признак-дублёр раздела 5.3); цели — в левой панели.
  await expect(page.locator('[data-testid="goals-panel"] .lucide-x')).toHaveCount(5);
  // Все внутренние домены НДБ — полупрозрачная красная заливка (3.5 v0.01.01).
  const perc = page.locator('[data-block-id="blk-perc"]');
  await expect(perc).toContainText('НДБ');
  await expect(perc).toContainText('C_домена = 1');
});

test('Э-03: размещение fn-auth в blk-link — C_домена 1 → 120, C_системы 4 → 123, домен становится ДДБПЦД', async ({
  page,
}) => {
  await loadRobot(page);
  const linkNode = page.locator('[data-block-id="blk-link"]');
  await expect(linkNode).toContainText('C_домена = 1');

  // HTML5 drag and drop карточки из пула в домен (Ф-8).
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId('pool-card-fn-auth');
  await card.dispatchEvent('dragstart', { dataTransfer });
  await linkNode.dispatchEvent('dragover', { dataTransfer });
  await linkNode.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });

  // ДДБПЦД: 2 × 3 × M(E=4 → 2) × 10 = 120.
  await expect(linkNode).toContainText('C_домена = 120');
  await expect(linkNode).toContainText('ДДБПЦД');
  // perc 1 + plan 1 + drive 1 + link 120 = 123.
  const summary = page.getByTestId('summary-bar');
  await expect(summary).toContainText('C_системы: 123');
  await expect(summary).toContainText('размещено 1 из 7 функций');
  // НДБ: 1 — в сводке.
  await expect(summary).toContainText('НДБ: 3 ×0.1');
  await expect(summary).toContainText('ДДБПЦД: 1 ×10');
});

test('Э-04: возврат карточки кнопкой «Убрать» — C_домена возвращается к 1, домен снова НДБ', async ({
  page,
}) => {
  await loadRobot(page);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId('pool-card-fn-auth');
  const linkNode = page.locator('[data-block-id="blk-link"]');
  await card.dispatchEvent('dragstart', { dataTransfer });
  await linkNode.dispatchEvent('dragover', { dataTransfer });
  await linkNode.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
  await expect(linkNode).toContainText('C_домена = 120');

  await linkNode.locator('[data-card-id="fn-auth"]').getByTitle('Убрать').click();
  await expect(linkNode).toContainText('C_домена = 1');
  await expect(linkNode).toContainText('НДБ');
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
  await expect(page.getByTestId('pool-card-fn-auth')).toContainText('свободна');
});
