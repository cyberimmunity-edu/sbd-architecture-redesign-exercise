/**
 * E2E-тесты верхней зоны тулбаров и адаптивности — v0.02.02: пять тулбаров
 * («Правка», «Режим», «Файлы и примеры», «Валидация», «Настройки»); скрытие
 * и показ тулбаров через меню ≡ и правый клик; режим «Только значки»
 * (подписи скрыты, название кнопки — в подсказке); автоскрытие тулбаров
 * (сворачивание в полоску, разворачивание наведением); автоскрытие боковых
 * панелей (рейки у краёв, разворачивание наведением, закрепление);
 * перетаскивание тулбара меняет порядок и сохраняется между перезагрузками.
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
});

test('v0.02.02: пять тулбаров на месте; скрытие через меню ≡ и показ обратно', async ({ page }) => {
  for (const id of ['edit', 'mode', 'io', 'validate', 'settings']) {
    await expect(page.getByTestId(`toolbar-${id}`)).toBeVisible();
  }
  // Скрыть тулбар «Файлы и примеры» через меню ≡ (чекбокс остаётся нажатым,
  // меню не закрывается — можно вернуть тулбар тем же кликом).
  await page.getByTestId('toolbars-menu').click();
  const item = page.getByRole('menuitemcheckbox', { name: 'Файлы и примеры' });
  await expect(item).toBeChecked();
  await item.click();
  await expect(page.getByTestId('toolbar-io')).toHaveCount(0);
  await expect(page.getByTestId('load-architecture')).toHaveCount(0);
  // Показать обратно и закрыть меню.
  await page.getByRole('menuitemcheckbox', { name: 'Файлы и примеры' }).click();
  await expect(page.getByTestId('toolbar-io')).toBeVisible();
  await page.keyboard.press('Escape');
  // Другие тулбары не пострадали.
  await expect(page.getByTestId('toolbar-edit')).toBeVisible();
  await expect(page.getByTestId('undo')).toBeEnabled();
});

test('v0.02.02: правый клик по зоне тулбаров открывает меню скрытия', async ({ page }) => {
  await page.getByTestId('top-toolbar-zone').click({ button: 'right' });
  await page.getByRole('menuitemcheckbox', { name: 'Валидация' }).click();
  await expect(page.getByTestId('toolbar-validate')).toHaveCount(0);
  await expect(page.getByTestId('check-diagram')).toHaveCount(0);
  // Возврат: правый клик снова.
  await page.getByTestId('top-toolbar-zone').click({ button: 'right' });
  await page.getByRole('menuitemcheckbox', { name: 'Валидация' }).click();
  await expect(page.getByTestId('check-diagram')).toBeVisible();
});

test('v0.02.02: «Только значки» — подписи скрыты, название кнопки в подсказке', async ({ page }) => {
  const button = page.getByTestId('add-domain');
  await expect(button).toContainText('+ Домен');
  await expect(button.locator('span')).toHaveCount(1);
  await page.getByTestId('toolbars-icononly').click();
  // Подписи убраны из DOM, кнопка стала компактной, название — в подсказке.
  await expect(button.locator('span')).toHaveCount(0);
  await expect(button).toHaveAttribute('title', '+ Домен');
  await expect(button).toHaveAttribute('aria-label', '+ Домен');
  // Переключатель обратно возвращает подписи.
  await page.getByTestId('toolbars-icononly').click();
  await expect(button.locator('span')).toHaveCount(1);
  await expect(button).toContainText('+ Домен');
});

test('v0.02.02: автоскрытие тулбаров — сворачивание в полоску и разворачивание наведением', async ({ page }) => {
  const zone = page.getByTestId('top-toolbar-zone');
  await expect(zone).not.toHaveAttribute('data-collapsed', 'true');
  await page.getByTestId('toolbars-autohide').click();
  // Курсор остаётся над зоной после клика — уводим его, зона сворачивается.
  await page.mouse.move(640, 420);
  await expect(zone).toHaveAttribute('data-collapsed', 'true');
  // Анимация сворачивания 200 мс — ждём завершения до замера высоты.
  await page.waitForTimeout(350);
  // Без наведения зона свёрнута в полоску ~12 px, тулбары не видны.
  const collapsed = (await zone.boundingBox())!;
  expect(collapsed.height).toBeLessThan(20);
  // Наведение разворачивает зону: тулбары видны.
  await zone.hover();
  await expect(zone).not.toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('toolbar-edit')).toBeVisible();
  // Увод курсора сворачивает зону обратно.
  await page.mouse.move(640, 420);
  await expect(zone).toHaveAttribute('data-collapsed', 'true');
  // Повторное включение-выключение настройки возвращает закреплённый вид.
  await zone.hover();
  await page.getByTestId('toolbars-autohide').click();
  await page.mouse.move(640, 420);
  await expect(zone).not.toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByTestId('toolbar-mode')).toBeVisible();
});

test('v0.02.02: автоскрытие боковых панелей — рейки, разворачивание наведением, закрепление', async ({ page }) => {
  // По умолчанию панели закреплены.
  await expect(page.getByTestId('goals-panel')).toBeVisible();
  await page.getByTestId('panels-autohide').click();
  // Обе панели свернулись в рейки у краёв.
  await expect(page.getByTestId('panel-rail-left')).toBeVisible();
  await expect(page.getByTestId('panel-rail-right')).toBeVisible();
  await expect(page.getByTestId('goals-panel')).toHaveCount(0);
  // Наведение на левую рейку разворачивает панель с её содержимым.
  await page.getByTestId('panel-rail-left').hover();
  await expect(page.getByTestId('goals-panel')).toBeVisible();
  // Увод курсора — панель сворачивается снова (задержка 350 мс).
  await page.mouse.move(640, 420);
  await expect(page.getByTestId('panel-rail-left')).toBeVisible({ timeout: 2000 });
  // Правая рейка по-прежнему на месте, правая панель разворачивается.
  await page.getByTestId('panel-rail-right').hover();
  await expect(page.getByTestId('summary-bar')).toBeVisible();
  // Выключение настройки закрепляет панели.
  await page.getByTestId('panels-autohide').click();
  await expect(page.getByTestId('goals-panel')).toBeVisible();
  await expect(page.getByTestId('panel-rail-left')).toHaveCount(0);
  await expect(page.getByTestId('panel-rail-right')).toHaveCount(0);
});

test('v0.02.02: перетаскивание тулбара меняет порядок и сохраняется между перезагрузками', async ({ page }) => {
  const firstToolbar = page.locator('[data-testid^="toolbar-"]').first();
  await expect(firstToolbar).toHaveAttribute('data-testid', 'toolbar-edit');
  // Перетащить «Правку» на позицию правее — клавиатурное перетаскивание
  // dnd-kit (Space — захват, стрелка — сдвиг, Space — сброс).
  const grip = page.locator('[data-testid="toolbar-edit"] [title="Перетащите, чтобы переместить тулбар"]');
  await grip.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await expect(firstToolbar).toHaveAttribute('data-testid', 'toolbar-mode');
  // Раскладка сохранена в localStorage и восстанавливается после перезагрузки.
  const stored = await page.evaluate(() => window.localStorage.getItem('skib-appearance-v1'));
  expect(stored).toBeTruthy();
  await page.reload();
  const firstAfter = page.locator('[data-testid^="toolbar-"]').first();
  await expect(firstAfter).toHaveAttribute('data-testid', 'toolbar-mode');
  // «Сбросить раскладку» возвращает исходный порядок.
  await page.getByTestId('toolbars-menu').click();
  await page.getByRole('menuitem', { name: 'Сбросить раскладку' }).click();
  await expect(firstToolbar).toHaveAttribute('data-testid', 'toolbar-edit');
});
