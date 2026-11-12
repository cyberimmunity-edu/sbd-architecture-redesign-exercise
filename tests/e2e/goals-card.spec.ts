/**
 * Карточка ЦБ — v0.01.09: клик по цели безопасности открывает её карточку
 * в инспекторе — обеспечивающие механизмы (функции) с весом и размещением,
 * статус распределения и критичные домены с их типами доверия. Критичные
 * домены кратко подсвечиваются на канве (голубое кольцо, остальные домены
 * приглушены — как при подсветке стрелок) и гаснут сами. Клик по домену
 * в карточке — фокус на диаграмме и выбор. Пример 1 загружается без
 * размещений: для подсветки критичного домена функция размещается вручную.
 * Вмещение и фокус — v0.01.10: клик по цели подгоняет масштаб так, чтобы
 * домены всех обеспечивающих механизмов цели помещались в видимую область
 * диаграммы; клик по функции подсвечивает домен размещения и центрирует его;
 * клик по размещённой карточке в пуле — то же.
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
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

/** Размещение карточки функции из пула во внутренний домен (HTML5 DnD). */
async function placeCard(page: import('@playwright/test').Page, fnId: string, blockId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${fnId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

test('v0.01.09: цель без размещённых функций — карточка ЦБ без критичных доменов', async ({ page }) => {
  const inspector = page.getByTestId('inspector-panel');
  // Пример загружается без размещений: g-cmd красная, fn-auth в пуле.
  await page.getByTestId('goal-card-g-cmd').click();
  await expect(inspector).toContainText('Цель безопасности');
  await expect(inspector).toContainText('Достоверность команд');
  await expect(inspector).toContainText('Статус распределения');
  await expect(inspector.getByTestId('goal-status')).toContainText('не покрыто');
  await expect(inspector).toContainText('Обеспечивающие механизмы');
  await expect(inspector.getByTestId('goal-fn-fn-auth')).toContainText('обязательная');
  await expect(inspector.getByTestId('goal-fn-fn-auth')).toContainText('в пуле');
  await expect(inspector.getByTestId('goal-fn-fn-sanitize')).toContainText('необязательная');
  await expect(inspector).toContainText('критичных доменов нет');
  // Подсветки нет: ни один домен не подсвечен и не приглушён.
  const plan = page.locator('[data-block-id="blk-plan"]');
  await expect(plan).toHaveAttribute('data-flash', 'false');
  await expect(plan).not.toHaveAttribute('style', /opacity: 0.4/);
});

test('v0.01.09: размещение обязательной функции — карточка ЦБ показывает критичный домен', async ({ page }) => {
  const inspector = page.getByTestId('inspector-panel');
  // fn-auth (обязательная для g-cmd) → «Модуль связи» (blk-link).
  await placeCard(page, 'fn-auth', 'blk-link');
  await expect(page.getByTestId('summary-bar')).toContainText('размещено 1 из 7');

  await page.getByTestId('goal-card-g-cmd').click();
  await expect(inspector.getByTestId('goal-status')).toContainText('полностью');
  await expect(inspector.getByTestId('goal-fn-fn-auth')).toContainText('размещена');
  await expect(inspector).toContainText('Критичные домены безопасности');
  await expect(inspector.getByTestId('goal-domains')).toContainText('Модуль связи');
  await expect(inspector.getByTestId('goal-domain-blk-link')).toContainText('ДДБ');

  // Критичный домен подсвечен на канве, остальные приглушены (data-flash).
  const link = page.locator('[data-block-id="blk-link"]');
  await expect(link).toHaveAttribute('data-flash', 'true');
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveAttribute('data-flash', 'false');

  // Подсветка гаснет сама (FLASH_DURATION_MS = 2200 мс).
  await expect(link).toHaveAttribute('data-flash', 'false', { timeout: 4000 });
});

test('v0.01.09: клик по домену в карточке ЦБ — фокус, выбор и гашение подсветки', async ({ page }) => {
  await placeCard(page, 'fn-auth', 'blk-link');
  await page.getByTestId('goal-card-g-cmd').click();
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'true');

  await page.getByTestId('goal-domain-blk-link').click();
  // Инспектор переключается на свойства домена.
  await expect(page.getByTestId('inspector-panel')).toContainText('Домен:');
  // Узел выделен на канве (React Flow ставит класс selected).
  await expect(page.locator('.react-flow__node[data-id="blk-link"]')).toHaveClass(/selected/);
  // Краткая подсветка цели погашена выбором домена.
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'false');
});

test('v0.01.09: клик по функции в карточке ЦБ открывает её карточку', async ({ page }) => {
  const inspector = page.getByTestId('inspector-panel');
  await page.getByTestId('goal-card-g-cmd').click();
  await page.getByTestId('goal-fn-fn-auth').click();
  // Инспектор переключается на карточку функции.
  await expect(inspector).toContainText('Карточка функции');
  await expect(inspector).toContainText('Аутентификация команд диспетчера');
});

test('v0.01.10: клик по цели подгоняет масштаб — критичный домен виден целиком', async ({ page }) => {
  // fn-auth (обязательная для g-cmd) → «Модуль связи» (blk-link).
  await placeCard(page, 'fn-auth', 'blk-link');

  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');

  await page.getByTestId('goal-card-g-cmd').click();
  await page.waitForTimeout(600); // длительность анимации setViewport — 420 мс

  // Вид изменился: масштаб подогнан под охватывающий прямоугольник
  // критичных доменов цели.
  const after = await viewport.getAttribute('style');
  expect(after).not.toBe(before);
  // Карточка ЦБ открылась, домен подсвечен (вмещение сопровождает подсветку).
  await expect(page.getByTestId('goal-inspector')).toBeVisible();
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'true');

  // Цель без размещённых обязательных функций масштаб не меняет
  // (g-safe: обязательная fn-estop осталась в пуле — критичных доменов нет).
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(600);
  const fitStyle = await viewport.getAttribute('style');
  await page.getByTestId('goal-card-g-safe').click();
  await page.waitForTimeout(600);
  expect(await viewport.getAttribute('style')).toBe(fitStyle);
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'false');
});

test('v0.01.10: клик по функции в карточке ЦБ — фокус на домене размещения', async ({ page }) => {
  await placeCard(page, 'fn-auth', 'blk-link');
  await page.getByTestId('goal-card-g-cmd').click();
  // Ждём завершения вмещения — иначе «до» поймает промежуточный кадр анимации.
  await page.waitForTimeout(600);
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'true');

  // После вмещения домен уже в центре — уводим вид кнопкой «−»,
  // чтобы фокус по функции был заметен.
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('zoom-out').click();
  await page.waitForTimeout(500);

  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await page.getByTestId('goal-fn-fn-auth').click();
  await page.waitForTimeout(600);

  // Карточка функции открылась, домен размещения в центре диаграммы
  // (вид изменился) и подсвечен голубым кольцом.
  await expect(page.getByTestId('inspector-panel')).toContainText('Карточка функции');
  expect(await viewport.getAttribute('style')).not.toBe(before);
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'true');

  // Функция в пуле домена не имеет — фокус не уводится, карточка открывается.
  await page.getByTestId('goal-card-g-cmd').click();
  await page.waitForTimeout(600);
  await page.getByTestId('goal-fn-fn-sanitize').click();
  await expect(page.getByTestId('inspector-panel')).toContainText('Карточка функции');
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveAttribute('data-flash', 'false');
});

test('v0.01.10: клик по размещённой карточке в пуле — фокус на домене размещения', async ({ page }) => {
  await placeCard(page, 'fn-auth', 'blk-link');

  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await page.getByTestId('pool-card-fn-auth').click();
  await page.waitForTimeout(600);

  // Карточка выбрана (инспектор), домен в центре и подсвечен.
  await expect(page.getByTestId('inspector-panel')).toContainText('Карточка функции');
  expect(await viewport.getAttribute('style')).not.toBe(before);
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'true');

  // Подсветка гаснет сама (FLASH_DURATION_MS = 2200 мс).
  await expect(page.locator('[data-block-id="blk-link"]')).toHaveAttribute('data-flash', 'false', { timeout: 4000 });

  // Клик по карточке из пула (не размещённой) — без подсветки и без фокуса.
  const untouched = await viewport.getAttribute('style');
  await page.getByTestId('pool-card-fn-estop').click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('inspector-panel')).toContainText('Карточка функции');
  expect(await viewport.getAttribute('style')).toBe(untouched);
});
