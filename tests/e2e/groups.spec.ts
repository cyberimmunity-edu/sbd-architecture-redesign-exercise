/**
 * E2E-тесты логических групп (ЛГ) — v0.02.03, Ф-70…Ф-76.
 * Проверяются: рамка ЛГ в примере робота; создание ЛГ из мультивыбора
 * через тулбар «Правка»; включение/исключение ДБ перетаскиванием;
 * свёртывание (скрытие членов, перенос связей на рамку); раскрытие при
 * подсветке из таблицы ДВБ (Ф-76); удаление ЛГ (ДБ остаются) и отмена;
 * палитра цветов без красного/жёлтого/зелёного; сохранение в localStorage.
 */

import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра + рамка ЛГ.
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  // Пример содержит ЛГ «Контур управления движением» (планировщик + привод).
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('Контур управления движением');
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('(2)');
});

/** Размещение карточки функции в домен (как в table-focus): ДВБ-строка появляется. */
async function dropCard(page: Page, cardId: string, blockId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

/** Мультивыбор двух доменов Ctrl-кликом. */
async function selectPair(page: Page, firstId: string, secondId: string) {
  await page.locator(`.react-flow__node[data-id="${firstId}"]`).click();
  await page.locator(`.react-flow__node[data-id="${secondId}"]`).click({ modifiers: ['Control'] });
}

test('v0.02.03: ЛГ создаются из мультивыбора через тулбар «Правка», имя и состав видны', async ({ page }) => {
  await selectPair(page, 'blk-perc', 'blk-link');
  await page.getByTestId('lg-menu').click();
  await page.getByTestId('lg-create-selected').click();
  await expect(page.getByTestId('lg-name-input')).toBeVisible();
  await page.getByTestId('lg-name-input').fill('Восприятие и связь');
  await page.getByTestId('lg-apply').click();
  // Новая рамка с двумя членами; выбор ЛГ сбрасывает мультивыбор ДБ.
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('Восприятие и связь');
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(2)');
});

test('v0.02.03: ДБ включается в ЛГ перетаскиванием и выносится наружу (Ф-74)', async ({ page }) => {
  await selectPair(page, 'blk-perc', 'blk-link');
  await page.getByTestId('lg-menu').click();
  await page.getByTestId('lg-create-selected').click();
  await page.getByTestId('lg-name-input').fill('Новая ЛГ');
  await page.getByTestId('lg-apply').click();
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);

  // Перетаскивание планировщика в центр рамки — включение в ЛГ.
  const plan = page.locator('.react-flow__node[data-id="blk-plan"]');
  const frame = page.locator('[data-lg-id="lg-2"]');
  const planBox = (await plan.boundingBox())!;
  const frameBox = (await frame.boundingBox())!;
  await page.mouse.move(planBox.x + planBox.width / 2, planBox.y + planBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(3)');

  // Вынос домена на свободное место слева от рамки — исключение из ЛГ.
  const perc = page.locator('.react-flow__node[data-id="blk-perc"]');
  const percBox = (await perc.boundingBox())!;
  await page.mouse.move(percBox.x + percBox.width / 2, percBox.y + percBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x - 250, frameBox.y + frameBox.height + 120, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(2)');
});

test('v0.02.03: свёрнутая ЛГ скрывает члены, связи ведут к рамке (Ф-72)', async ({ page }) => {
  // Делаем планировщик доверенным: появится строка в «Расширенном анализе ДВБ».
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  await expect(page.getByTestId('dvb-row-blk-plan')).toBeVisible();

  await page.getByTestId('lg-toggle-lg-1').click();
  // Члены скрыты, рамка отмечена свёрнутой.
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(0);
  // Стрелки: 6 − внутренняя связь членов свёрнутой ЛГ = 5.
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);

  // Подсветка скрытого ДБ из таблицы ДВБ раскрывает ЛГ (Ф-76).
  await page.getByTestId('dvb-row-blk-plan').hover();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="false"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveAttribute('data-highlighted', 'true');
});

test('v0.02.03: удаление ЛГ оставляет ДБ несгруппированными; отмена возвращает (Ф-73)', async ({ page }) => {
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible();
  await page.getByTestId('lg-ctx-delete').click();
  // Рамка исчезла, домены остались.
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node')).toHaveCount(7);

  await page.getByTestId('undo').click();
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('(2)');
});

test('v0.02.03: палитра цветов ЛГ без красного, жёлтого и зелёного (П-15)', async ({ page }) => {
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible();
  // Восемь цветов палитры; зарезервированные цвета доверия недоступны.
  const swatches = page.locator('[data-testid^="lg-ctx-color-"]');
  await expect(swatches).toHaveCount(8);
  await expect(page.locator('[data-testid="lg-ctx-color-d32f2f"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="lg-ctx-color-f9a825"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="lg-ctx-color-43a047"]')).toHaveCount(0);

  // Перекраска в синий — одна операция истории.
  await page.getByTestId('lg-ctx-color-1e88e5').click();
  await expect(page.getByTestId('canvas-context-menu')).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-testid^="lg-ctx-color-"]')).toHaveCount(0);
});

test('v0.02.03: переименование ЛГ через диалог (двойной клик по плашке)', async ({ page }) => {
  await page.getByTestId('lg-chip-lg-1').dblclick();
  await expect(page.getByTestId('lg-name-input')).toBeVisible();
  await page.getByTestId('lg-name-input').fill('Исполнительный контур');
  await page.getByTestId('lg-apply').click();
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('Исполнительный контур');
  // Отмена возвращает прежнее имя.
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('Контур управления движением');
});

test('v0.02.03: ЛГ сохраняются в автосохранении и восстанавливаются', async ({ page }) => {
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await page.waitForTimeout(600); // дебаунс автосохранения 300 мс
  await page.reload();
  // Свёрнутая ЛГ: 2 скрытых домена не отображаются — 2 домена + 2 внешние
  // системы + рамка периметра + свёрнутая рамка ЛГ.
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  // Развёртывание после перезагрузки возвращает членов.
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
});
