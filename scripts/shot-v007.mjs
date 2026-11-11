/**
 * Визуальная проверка раскладки и трассировки v0.01.07.
 * Запуск: node scripts/shot-v009.mjs (требуется dev-сервер на :3000).
 * Скриншоты: /tmp/edges-v007/*.png — проверка, не поставка.
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
  await page.waitForTimeout(900);
}

// Пример 2 «Безэкипажное судно-доставщик»: начальный вид и после «Раскладки».
await loadSample('demo-vessel');
await page.screenshot({ path: `${OUT}/vessel-initial.png` });
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/vessel-layout.png` });

// Пример 1 «Автономный коммунальный робот»: начальный вид и после «Раскладки».
await loadSample('demo-robot');
await page.screenshot({ path: `${OUT}/robot-initial.png` });
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/robot-layout.png` });

// Перетаскивание домена: форма стрелок перестраивается, развязка работает.
await loadSample('demo-vessel');
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(600);
const node = page.locator('[data-block-id="blk-ai"]');
const box = await node.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y - 120, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}
await page.screenshot({ path: `${OUT}/vessel-dragged.png` });

await browser.close();
console.log('OK:', OUT);
