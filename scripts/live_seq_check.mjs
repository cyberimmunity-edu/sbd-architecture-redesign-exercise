/**
 * Быстрая живая проверка режима ДП v0.02.01: загрузка сквозной ДАП,
 * переключение режима, создание ДП, drag линий жизни, стрелка, блок,
 * опция «Цвета из ДАП», скриншоты в /tmp/seq-live/.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/seq-live';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300));
});
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 400)));

await page.goto('http://localhost:3000/');
await page.waitForSelector('[data-testid="mode-sequence"]', { timeout: 30000 });

// Загрузка сквозной ДАП (22 блока) через инпут файла.
const input = page.locator('[data-testid="file-state"]');
await input.setInputFiles('tests/fixtures/vessel-full/state.yaml');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-dap.png` });
console.log('ДАП загружена');

// Переключение в режим ДП.
await page.click('[data-testid="mode-sequence"]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-seq-mode.png` });
console.log('Режим ДП открыт');

// Создание ДП.
await page.click('[data-testid="seq-create"]');
await page.waitForTimeout(500);
// Drag домена из набора на канву (точки внутри канвы: ширина ~860px).
const canvasBox = await page.locator('[data-testid="seq-canvas"]').boundingBox();
console.log('canvas box:', JSON.stringify(canvasBox));
const dropX = Math.min(450, Math.floor((canvasBox?.width ?? 800) / 2) - 100);
const card = page.locator('[data-testid="seq-domain-card-blk-radio"]');
await card.dragTo(page.locator('[data-testid="seq-canvas"]'), { targetPosition: { x: dropX, y: 300 } });
await page.waitForTimeout(600);
const card2 = page.locator('[data-testid="seq-domain-card-blk-ota"]');
await card2.dragTo(page.locator('[data-testid="seq-canvas"]'), { targetPosition: { x: dropX + 220, y: 300 } });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/03-lifelines.png` });
const lifelines = await page.locator('[data-testid="seq-lifeline-header-blk-radio"]').count();
console.log('линия жизни blk-radio:', lifelines);

// Полосы линии жизни для жестов стрелок.
const band1 = page.locator('[data-testid="seq-lifeline-band-blk-radio"]');
const band2 = page.locator('[data-testid="seq-lifeline-band-blk-ota"]');
const b1 = await band1.boundingBox();
const b2 = await band2.boundingBox();

// Стрелки жестом: radio→ota, self на ota, ещё две radio→ota (всего 4).
if (b1 && b2) {
  const gesture = async (fromBox, toBox) => {
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + 30);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
  await gesture(b1, b2);
  await page.mouse.move(b2.x + b2.width / 2, b2.y + 40);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  await gesture(b1, b2);
  await gesture(b1, b2);
}
console.log('стрелок:', await page.locator('[data-testid^="seq-arrow-"]').count());
await page.screenshot({ path: `${OUT}/04-arrows.png` });

// Выделение двух первых стрелок и создание цикла.
const arrowLocators = page.locator('[data-testid^="seq-arrow-"]');
if ((await arrowLocators.count()) >= 4) {
  await arrowLocators.nth(0).click();
  await page.waitForTimeout(150);
  await arrowLocators.nth(1).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  await page.click('[data-testid="seq-toolbar-loop"]');
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/06-loop.png` });
console.log('блоков после loop:', await page.locator('[data-testid^="seq-block-frame-"]').count());

// Условный блок из третьей и четвёртой стрелок (вне цикла).
if ((await arrowLocators.count()) >= 4) {
  await arrowLocators.nth(2).click();
  await page.waitForTimeout(150);
  await arrowLocators.nth(3).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  await page.click('[data-testid="seq-toolbar-cond"]');
  await page.waitForTimeout(400);
  await page.fill('[data-testid="seq-cond-condition"]', 'подлинность подтверждена');
  await page.fill('[data-testid="seq-cond-then"]', 'нормальный ход');
  await page.fill('[data-testid="seq-cond-else"]', 'нарушение');
  await page.screenshot({ path: `${OUT}/07-cond-dialog.png` });
  await page.click('[data-testid="seq-cond-apply"]');
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/08-cond.png` });
console.log('блоков после cond:', await page.locator('[data-testid^="seq-block-frame-"]').count());

// Опция «Цвета из ДАП».
await page.click('[data-testid="seq-colors-toggle"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/09-colors.png` });
await page.click('[data-testid="seq-colors-toggle"]');
await page.waitForTimeout(400);

// Валидация.
await page.click('[data-testid="seq-check"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/10-validation.png` });
const clean = await page.locator('[data-testid="seq-validation-clean"]').count();
console.log('валидация чисто:', clean > 0);

// Обратно в ДАП.
await page.click('[data-testid="mode-architecture"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/11-back-dap.png` });
console.log('возврат в ДАП ок');

await browser.close();
console.log('LIVE CHECK DONE');
