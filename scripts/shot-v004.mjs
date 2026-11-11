/**
 * Скриншоты проверки v0.01.04: стрелки с обходом доменов, подсветка домена
 * из таблицы ДВБ, фокус по клику. Результаты — /tmp/skib-shots/.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:3100';
mkdirSync('/tmp/skib-shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
await page.goto(base);
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-robot').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/skib-shots/01-robot-routed.png' });

// Размещаем функции, чтобы ДВБ наполнилась, и применяем авто-раскладку.
async function dropCard(cardId, blockId) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}
await dropCard('fn-auth', 'blk-link');
await dropCard('fn-sanitize', 'blk-plan');
await dropCard('fn-estop', 'blk-drive');
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/skib-shots/02-layout-routed.png' });

// Подсветка из таблицы ДВБ: наведение на строку «Планировщика».
await page.getByTestId('dvb-row-blk-plan').hover();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/skib-shots/03-row-highlight.png' });

// Фокус по клику: центр на домене, укрупнение, выбор.
await page.getByTestId('dvb-row-blk-plan').click();
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/skib-shots/04-row-focus.png' });

await browser.close();
console.log('shots saved');
