/**
 * Вид канвы (v0.01.02–v0.01.03): кнопка «Стрелки» скрывает/показывает
 * стрелки-связи, кнопка «Периметр» скрывает внешние системы и их связи,
 * кнопка «Справка» открывает путеводитель по интерфейсу с обозначениями
 * блока (S, M, K). Настройки вида не влияют на расчёты: C_системы остаётся
 * прежней. Новое в v0.01.03: автоматическая раскладка («Раскладка»),
 * свёртка стрелок порта кнопками «+/−», мини-навигатор слева снизу,
 * кнопки масштаба («+», «−», «вместить») и панель расширенного анализа ДВБ.
 * Новое в v0.01.10: высота области «Цели безопасности» в левой панели
 * изменяема по вертикали, пропорции запоминаются в localStorage.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра + рамка ЛГ (v0.02.03).
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
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

/** Трансформация узла канвы «x,y» — для сравнения позиций до/после раскладки. */
async function nodeTransform(page: import('@playwright/test').Page, id: string): Promise<string> {
  const style = (await page.locator(`.react-flow__node[data-id="${id}"]`).getAttribute('style')) ?? '';
  const match = style.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  return match ? `${match[1]},${match[2]}` : '';
}

test('v0.01.02: кнопка «Стрелки» скрывает и показывает стрелки-связи', async ({ page }) => {
  const edges = page.locator('.react-flow__edge');
  // В примере 1 шесть стрелок (3 внутренние + 3 с внешними системами).
  await expect(edges).toHaveCount(6);
  await expect(page.getByTestId('toggle-edges')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('toggle-edges').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.getByTestId('toggle-edges')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('toggle-edges').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);

  // Вид не влияет на расчёты: C_системы = 4 (4 домена без функций, НДБ).
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
});

test('v0.01.02: кнопка «Периметр» скрывает внешние системы и их связи', async ({ page }) => {
  await expect(page.getByTestId('focus-internal')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('focus-internal').click();
  // Остаются 4 внутренних домена, рамка периметра и рамка ЛГ; внешние системы скрыты.
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  // Скрыты 3 связи с внешними системами, остаются 3 внутренние.
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await expect(page.locator('[data-block-id^="ext-"]')).toHaveCount(0);

  await page.getByTestId('focus-internal').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);

  // Расчёты остаются полными: внешние потоки учитываются в C_системы.
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
  await expect(page.getByTestId('summary-bar')).toContainText('внешние системы: 2');
});

test('v0.01.02: справка открывается и объясняет порядок работы и обозначения блока', async ({ page }) => {
  await page.getByTestId('help-button').click();
  const dialog = page.getByTestId('help-dialog');
  await expect(dialog).toBeVisible();

  // Порядок работы.
  await expect(dialog).toContainText('Порядок работы');
  // Обозначения характеристик блока S, M, K и стоимость.
  await expect(dialog).toContainText('Обозначения блока: C_блока, S, M, K');
  await expect(dialog).toContainText('S — сумма стоимостей функций');
  await expect(dialog).toContainText('M — множитель связности');
  await expect(dialog).toContainText('K — коэффициент доверия домена');
  await expect(dialog).toContainText('C_домена — округлённое вверх произведение');
  // ДВБ вместо ТКБ (v0.01.03).
  await expect(dialog).toContainText('ДВБ (доверенная вычислительная база)');
  // Новое в v0.01.03: раскладка, порты, мини-навигатор, запоминание вида.
  await expect(dialog).toContainText('«Раскладка» — автоматическая раскладка доменов по слоям связей');
  await expect(dialog).toContainText('Кнопки «−» и «+» у портов домена');
  await expect(dialog).toContainText('Мини-навигатор слева снизу');
  await expect(dialog).toContainText('Положение доменов, подписи стрелок и вид канвы запоминаются');
  // Самопроверка.
  await expect(dialog).toContainText('Как себя проверять');

  await page.getByTestId('help-close').click();
  await expect(dialog).toBeHidden();
});

test('v0.01.03: мини-навигатор и кнопки масштаба с видимыми иконками', async ({ page }) => {
  // Мини-навигатор слева снизу (как в Archi).
  const minimap = page.locator('.react-flow__minimap');
  await expect(minimap).toBeVisible();

  // Кнопки масштаба: «+», «−» и «вместить всю диаграмму».
  await expect(page.getByTestId('zoom-in')).toBeVisible();
  await expect(page.getByTestId('zoom-out')).toBeVisible();
  await expect(page.getByTestId('fit-view')).toBeVisible();
  // Иконки отрисованы: внутри каждой кнопки есть svg.
  for (const testId of ['zoom-in', 'zoom-out', 'fit-view']) {
    await expect(page.getByTestId(testId).locator('svg')).toHaveCount(1);
  }

  // «+» меняет масштаб канвы, «вместить» возвращает общий вид.
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await page.getByTestId('zoom-in').click();
  await page.waitForTimeout(400);
  const after = await viewport.getAttribute('style');
  expect(after).not.toBe(before);
  await page.getByTestId('fit-view').click();
  await page.waitForTimeout(450);
  await expect(viewport).toBeVisible();
});

test('v0.01.03: кнопка «+/−» у порта сворачивает и разворачивает стрелки порта', async ({ page }) => {
  const edges = page.locator('.react-flow__edge');
  await expect(edges).toHaveCount(6);

  // У входного порта «Планировщика» две стрелки (perc→plan, link→plan).
  const planIn = page.getByTestId('port-toggle-blk-plan-in');
  await expect(planIn).toHaveAttribute('aria-pressed', 'false');
  await planIn.click();
  // Свёрнутые стрелки не отображаются: 6 − 2 = 4.
  await expect(edges).toHaveCount(4);
  await expect(planIn).toHaveAttribute('aria-pressed', 'true');

  // Явное открытие кнопкой «+» возвращает стрелки.
  await planIn.click();
  await expect(edges).toHaveCount(6);

  // Смена режима вида («Стрелки» скрыть/показать) тоже возвращает стрелки.
  await planIn.click();
  await expect(edges).toHaveCount(4);
  await page.getByTestId('toggle-edges').click();
  await expect(edges).toHaveCount(0);
  await page.getByTestId('toggle-edges').click();
  await expect(edges).toHaveCount(6);
  await expect(planIn).toHaveAttribute('aria-pressed', 'false');

  // Расчёты не зависят от вида: свёрнутые потоки учитываются в M.
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
});

test('v0.01.03: кнопка «Раскладка» выстраивает домены по слоям связей и отменяется', async ({ page }) => {
  const before = await nodeTransform(page, 'blk-perc');

  await page.getByTestId('auto-layout').click();
  await expect(page.getByText('Раскладка применена').first()).toBeVisible();
  // Все узлы и стрелки на месте, расчёты не изменились.
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');

  // Позиции изменились: домены выстроены слоями слева направо.
  const after = await nodeTransform(page, 'blk-perc');
  expect(after).not.toBe(before);

  // Раскладка — операция с историей: Ctrl+Z возвращает ручную раскладку.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => nodeTransform(page, 'blk-perc'), { timeout: 3000 })
    .toBe(before);
});

test('v0.01.03: панель расширенного анализа ДВБ показывает доверенные домены по стоимости', async ({ page }) => {
  const panel = page.getByTestId('dvb-panel');
  await expect(panel).toBeVisible();
  // Пока доверенных доменов нет — пустое состояние с подсказкой.
  await expect(panel).toContainText('ДВБ пуста: нет доверенных доменов');

  // Размещаем критичные функции: link, plan и drive входят в ДВБ.
  await dropCard(page, 'fn-auth', 'blk-link');
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  await dropCard(page, 'fn-estop', 'blk-drive');

  // link: 2 × 3 × M2 × K10 (ДДБПЦД) → 120; plan: 4 × 2 × M1.5 × K10 (ДДБПЦД) → 120;
  // drive: 3 × 3 × M1 × K5 (ДДБ — все входы от доверенного plan) → 45.
  await expect(panel).toContainText('Расширенный анализ ДВБ');
  await expect(page.getByTestId('dvb-row-blk-link')).toContainText('ДДБПЦД');
  await expect(page.getByTestId('dvb-row-blk-link')).toContainText('120');
  await expect(page.getByTestId('dvb-row-blk-plan')).toContainText('ДДБПЦД');
  await expect(page.getByTestId('dvb-row-blk-plan')).toContainText('120');
  await expect(page.getByTestId('dvb-row-blk-drive')).toContainText('ДДБ');
  await expect(page.getByTestId('dvb-row-blk-drive')).toContainText('45');

  // Сортировка по стоимости: самые дорогие сверху, самый дешёвый — внизу.
  const rows = page.locator('[data-testid^="dvb-row-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('120');
  await expect(rows.last()).toHaveAttribute('data-testid', 'dvb-row-blk-drive');
});

test('v0.01.10: высота области «Цели безопасности» изменяема по вертикали', async ({ page }) => {
  // Разделитель между пулом и целями — как у области «Расчёт и статус».
  const handle = page.locator('[aria-label="Разделитель панелей: потяните, чтобы изменить высоту области «Цели безопасности» в левой панели"]');
  await expect(handle).toBeVisible();

  const goalsPanel = page.getByTestId('goals-panel');
  await expect(goalsPanel).toBeVisible();
  const heightBefore = (await goalsPanel.boundingBox())?.height ?? 0;
  expect(heightBefore).toBeGreaterThan(0);

  // Тянем разделитель вниз — цели сжимаются, пул растёт (и наоборот).
  // Плавный драг: react-resizable-panels отслеживает последовательные
  // pointermove — рывок из одной точки не даёт размера.
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 160, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const heightAfter = (await goalsPanel.boundingBox())?.height ?? 0;
  expect(heightAfter).toBeLessThan(heightBefore);

  // Пропорции запоминаются: после перезагрузки области остаются сжатыми.
  await page.reload();
  await expect(goalsPanel).toBeVisible();
  await page.waitForTimeout(300);
  const heightReloaded = (await goalsPanel.boundingBox())?.height ?? 0;
  expect(Math.abs(heightReloaded - heightAfter)).toBeLessThanOrEqual(6);
});
