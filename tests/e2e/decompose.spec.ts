/**
 * Э-05: декомпозиция домена «Планировщик маршрута» на 2 домена (Ф-16).
 * Пример 1 «Автономный коммунальный робот» (14.4 ТЗ v0.01.01); числа
 * согласованы с моделью стоимости 3.3: ДДБПЦД — K = 10, потомки НДБ — 0.1.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра.
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
});

test('Э-05: декомпозировать blk-plan — появляются «Планировщик маршрута.1» и «.2», карточки возвращаются в пул', async ({
  page,
}) => {
  // Сначала размещаем fn-sanitize в «Планировщик маршрута», чтобы проверить возврат в пул (T-D-03).
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId('pool-card-fn-sanitize');
  const planNode = page.locator('[data-block-id="blk-plan"]');
  await card.dispatchEvent('dragstart', { dataTransfer });
  await planNode.dispatchEvent('dragover', { dataTransfer });
  await planNode.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
  // ДДБПЦД: 4 × 2 × M(E = 3 → 1.5) × 10 = 120.
  await expect(planNode).toContainText('C_домена = 120');
  await expect(planNode).toContainText('ДДБПЦД');

  // Кнопка «Декомпозировать» на узле (Ф-12).
  await planNode.getByRole('button', { name: 'Декомпозировать' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Стрелки исходного домена назначаются потомкам: по умолчанию первый потомок.
  await page.getByRole('dialog').getByRole('button', { name: 'Декомпозировать' }).click();

  // Исходный домен удалён, появились два потомка того же уровня (плоская модель D5).
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__node', { hasText: 'Планировщик маршрута.1' })).toHaveCount(1);
  await expect(page.locator('.react-flow__node', { hasText: 'Планировщик маршрута.2' })).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);

  // Функции декомпозированного домена вернулись в пул.
  await expect(page.getByTestId('pool-card-fn-sanitize')).toContainText('свободна');
  // Потомки НДБ без функций стоят ceil(1 × 0.1) = 1; perc 1 + drive 1 + link 1 → 5.
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 5');
  await expect(page.getByTestId('summary-bar')).toContainText('домены: 5');
});
