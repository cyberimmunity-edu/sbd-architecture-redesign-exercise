/**
 * Визуальная проверка читаемости стрелок канвы (v0.01.01).
 * Запуск: node scripts/shot-edges.mjs (требуется dev-сервер на :3000).
 * Скриншоты: /tmp/edges/*.png — проверка, не поставка.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/edges';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
  locale: 'ru-RU',
});
const page = await context.newPage();

await page.goto('http://localhost:3000');
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.waitForSelector('[data-testid="demo-project"]');
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-vessel').click();
await page.waitForSelector('.react-flow__edge');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/1-idle.png` });

// Наведение на подпись стрелки: подсветка связи, остальные приглушены.
const edgeLabel = page.locator('.react-flow__edge-text').first();
await edgeLabel.hover({ force: true });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/2-hover-edge.png` });

// Наведение на домен: подсвечены все его стрелки.
await page.mouse.move(5, 5);
await page.waitForTimeout(350);
await page.locator('.react-flow__node').last().hover();
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/3-hover-node.png` });

await browser.close();
console.log('edge screenshots saved to', OUT);
