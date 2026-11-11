/**
 * Скриншоты проверки v0.01.02: кнопки вида «Стрелки»/«Периметр», крупные
 * метрики правой панели, диалог «Справка».
 * Запуск: BASE_URL=http://127.0.0.1:4173 node scripts/shot-v002.mjs
 * Требуется запущенный сервер собранной версии (make preview).
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = '/tmp/render';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1.5,
  locale: 'ru-RU',
});
const page = await context.newPage();

await page.goto(BASE);
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-robot').click();
await expectNodeCount(7);

async function expectNodeCount(n) {
  await page.waitForFunction(
    (count) => document.querySelectorAll('.react-flow__node').length === count,
    n,
  );
  await page.waitForTimeout(400);
}

// 1. Канва с кнопками вида и крупными метриками.
await page.screenshot({ path: `${OUT}/v002-canvas.png` });

// 2. Стрелки скрыты.
await page.getByTestId('toggle-edges').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/v002-edges-hidden.png` });
await page.getByTestId('toggle-edges').click();

// 3. Фокус на внутреннем периметре.
await page.getByTestId('focus-internal').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/v002-focus.png` });
await page.getByTestId('focus-internal').click();

// 4. Диалог справки.
await page.getByTestId('help-button').click();
await page.waitForSelector('[data-testid="help-dialog"]');
await page.screenshot({ path: `${OUT}/v002-help.png` });

await browser.close();
console.log('screenshots saved to', OUT);
