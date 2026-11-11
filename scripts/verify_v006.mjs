/**
 * Самопроверка v0.01.06 на собранной сборке (out/ обслуживается на :4173):
 * 1) полный текст цели на карточках; 2) горизонтальный разделитель области
 * «Расчёт и статус системы»; 3) сброс карточки на свободное место канвы —
 * новый домен с функцией; 4) принудительный ввод домена в ДВБ.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4173';
const shot = (name) => `test-artifacts/v006-${name}.png`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fails = [];
const check = (name, cond) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};

await page.goto(BASE);
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-vessel').click();
await page.waitForTimeout(1200);

// 1. Полный текст цели под кратким названием (пример 2 — 9 целей ПЛО).
const descCount = await page.locator('[data-testid^="goal-desc-"]').count();
check('полный текст цели: 9 карточек с описанием', descCount === 9);
const missionDesc = await page
  .locator('[data-testid="goal-desc-g-mission-auth"]')
  .textContent();
check(
  'формулировка «При любых обстоятельствах…» видна',
  (missionDesc ?? '').includes('При любых обстоятельствах'),
);
const goalsBox = page.getByTestId('goals-panel');
await goalsBox.screenshot({ path: shot('goals-full-text') });

// 2. Разделитель высоты области «Расчёт и статус системы».
const handles = await page
  .locator('[data-panel-group-direction="vertical"] > [data-panel-resize-handle-enabled]')
  .count();
check('вертикальный разделитель в правой панели присутствует', handles >= 1);
// Потянуть разделитель вверх: drag на 120 px вверх.
const handle = page
  .locator('[data-panel-group-direction="vertical"] > [data-panel-resize-handle-enabled]')
  .first();
const hb = await handle.boundingBox();
if (hb) {
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 120, { steps: 8 });
  await page.mouse.up();
}
const summaryBox = await page.getByTestId('summary-bar').boundingBox();
check(
  'после перетаскивания вверх область расчёта стала выше (>= 380 px)',
  !!summaryBox && summaryBox.height >= 380,
);
await page.screenshot({ path: shot('summary-resized') });

// 3. Сброс карточки на свободное место канвы → новый домен с функцией.
// События шлём на панель React Flow (.react-flow__pane) — они всплывают
// в секцию канвы с обработчиками v0.01.06.
const nodesBefore = await page.locator('.react-flow__node').count();
const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
const card = page.getByTestId('pool-card-fn-cmd-auth');
await card.dispatchEvent('dragstart', { dataTransfer });
const pane = page.locator('.react-flow__pane').first();
await pane.dispatchEvent('dragover', { dataTransfer, clientX: 720, clientY: 300 });
await pane.dispatchEvent('drop', { dataTransfer, clientX: 720, clientY: 300 });
await card.dispatchEvent('dragend', { dataTransfer });
await page.waitForTimeout(600);
const nodesAfter = await page.locator('.react-flow__node').count();
const dropWorked = nodesAfter === nodesBefore + 1;
check('появился новый узел домена', dropWorked);
const cardInNewDomain = await page.locator('[data-card-id="fn-cmd-auth"]').count();
check('функция внутри нового домена', cardInNewDomain === 1);
const newDomainText = await page
  .locator('.react-flow__node', { hasText: 'Новый домен' })
  .count();
check('узел называется «Новый домен»', newDomainText >= 1);
await page.screenshot({ path: shot('drop-new-domain') });
// Ctrl+Z — одна операция истории убирает домен и размещение.
if (dropWorked) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const nodesUndo = await page.locator('.react-flow__node').count();
  check('Ctrl+Z убирает домен и размещение', nodesUndo === nodesBefore);
}

// 4. Принудительный ввод домена в ДВБ.
await page.locator('[data-block-id="blk-gps-ins"]').click();
await page.waitForTimeout(300);
const dvbTrigger = page.locator('#domain-dvb');
await dvbTrigger.click();
await page.getByRole('option', { name: /принудительно/ }).click();
await page.waitForTimeout(400);
const gpsBadge = await page
  .locator('[data-block-id="blk-gps-ins"]')
  .locator('span')
  .filter({ hasText: 'ДДБ' })
  .first()
  .textContent();
check('домен GPS/INS стал ДДБ', (gpsBadge ?? '').startsWith('ДДБ'));
const dvbRow = await page.locator('[data-testid="dvb-row-blk-gps-ins"]').count();
check('домен появился в таблице ДВБ со звёздочкой', dvbRow === 1);
const rowBadge = await page
  .locator('[data-testid="dvb-row-blk-gps-ins"]')
  .locator('td')
  .nth(1)
  .textContent();
check('метка «ДДБ *» в таблице ДВБ', (rowBadge ?? '').includes('*'));
await page.screenshot({ path: shot('force-dvb') });

await browser.close();
if (fails.length > 0) {
  console.error(`\nПровалено проверок: ${fails.length}: ${fails.join('; ')}`);
  process.exit(1);
}
console.log('\nВсе проверки v0.01.06 пройдены.');
