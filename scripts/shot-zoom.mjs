/**
 * Приближённые скриншоты канвы после «Раскладки» (v0.01.07).
 * Запуск: node scripts/shot-zoom.mjs (требуется dev-сервер на :3000).
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/edges-v007';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
  locale: 'ru-RU',
});
const page = await context.newPage();

async function loadSample(demoButton) {
  await page.goto('http://localhost:3000');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="demo-project"]');
  await page.getByTestId('demo-project').click();
  await page.getByTestId(demoButton).click();
  await page.waitForSelector('.react-flow__edge');
  await page.waitForTimeout(800);
}

async function zoomAtCenter(steps) {
  // Приближение колесом в центре канвы.
  const section = page.locator('section[aria-label]').first();
  const box = await section.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
}

await loadSample('demo-vessel');
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(700);
await zoomAtCenter(7);
await page.screenshot({ path: `${OUT}/vessel-zoom-center.png` });
// Сдвиг влево к СУДС.
const section = page.locator('section[aria-label]').first();
const box = await section.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 500, box.y + box.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/vessel-zoom-left.png` });

await loadSample('demo-robot');
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(700);
await zoomAtCenter(7);
await page.screenshot({ path: `${OUT}/robot-zoom.png` });

await browser.close();
console.log('OK');
