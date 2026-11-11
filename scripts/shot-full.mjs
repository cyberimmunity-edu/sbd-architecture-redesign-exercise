/** Полноканвные скриншоты в крупном вьюпорте (v0.01.07). */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/edges-v007';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 2560, height: 1400 },
  deviceScaleFactor: 1,
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

async function shot(name) {
  const section = page.locator('section[aria-label]').first();
  const box = await section.boundingBox();
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: box.x, y: box.y, width: Math.min(box.width, 2560 - box.x), height: box.height },
  });
}

await loadSample('demo-vessel');
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(700);
await shot('vessel-full');

await loadSample('demo-robot');
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(700);
await shot('robot-full');

await browser.close();
console.log('OK');
