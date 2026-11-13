/**
 * Воспроизведение сбоя React #185 при выделении доменов (shift-клик,
 * рамка выбора). Запуск: node scripts/debug_shift_selection.mjs
 * Dev-сервер должен быть запущен на localhost:3000.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('185') || text.includes('Maximum update') || msg.type() === 'error') {
    errors.push(text.slice(0, 3000));
  }
});
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + String(err).slice(0, 3000)));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

// Загрузить пример robot через верхнюю панель
const examples = page.locator('button:has-text("Примеры"), button:has-text("примеры")').first();
if ((await examples.count()) > 0) {
  await examples.click();
  await page.waitForTimeout(600);
  const robot = page.locator('text=Робот').first();
  await robot.click();
  await page.waitForTimeout(2000);
}

const nodes = page.locator('.react-flow__node-domain');
const count = await nodes.count();
console.log('domain nodes:', count);

// 1. Простой клик по домену
if (count > 0) {
  await nodes.nth(0).click({ force: true });
  await page.waitForTimeout(1500);
  console.log('after simple click, errors:', errors.length);
  if (errors.length > 0) {
    for (const e of errors.slice(0, 4)) console.log('---', e);
    await browser.close();
    process.exit(1);
  }
}

// 2. Ctrl-клик по другому домену (мультивыбор)
if (count > 1) {
  await page.keyboard.down('Control');
  await nodes.nth(1).click({ force: true });
  await page.waitForTimeout(1500);
  await page.keyboard.up('Control');
  console.log('after ctrl+click, errors:', errors.length);
  if (errors.length > 0) {
    for (const e of errors.slice(0, 4)) console.log('---', e);
    await browser.close();
    process.exit(1);
  }
}

// 3. Рамка выбора Shift с пустого места
const canvas = page.locator('.react-flow__pane').first();
const cb = await canvas.boundingBox();
if (cb) {
  await page.keyboard.down('Shift');
  await page.mouse.move(cb.x + cb.width - 380, cb.y + 80);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width - 40, cb.y + cb.height - 60, { steps: 10 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(2000);
}
console.log('after shift box, errors:', errors.length);
for (const e of errors.slice(0, 6)) console.log('---', e);
await page.screenshot({ path: '/tmp/repro-shot.png' });
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
