/**
 * Скриншоты интерфейса для документации и отчёта.
 * Запуск: bunx playwright test --config нет — отдельный скрипт:
 *   node scripts/screenshot.mjs
 * Требуется запущенный dev-сервер на http://localhost:3000.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/img';
mkdirSync(OUT, { recursive: true });

async function dropCard(page, cardId, blockId) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

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

// 1. Пустое состояние.
await page.screenshot({ path: `${OUT}/01-empty.png` });

// 2. Демо-проект: все цели красные, C_системы = 12.
await page.getByTestId('demo-project').click();
await page.waitForSelector('.react-flow__node');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-demo-red.png` });

// 3. Размещение fn-hashing в «Ядро системы» — переход цели в жёлтый.
await dropCard(page, 'fn-hashing', 'blk-core');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-placement-yellow.png` });

// 4. Диалог декомпозиции домена «Аудит».
await page.locator('[data-block-id="blk-audit"]').getByRole('button', { name: 'Декомпозировать' }).click();
await page.waitForSelector('[role="dialog"]');
await page.screenshot({ path: `${OUT}/04-decompose-dialog.png` });
await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();

// 5. Контрольный пример, шаг 1: C_системы = 67, четыре зелёные цели.
await dropCard(page, 'fn-mfa', 'blk-core');
await dropCard(page, 'fn-encrypt', 'blk-store');
await dropCard(page, 'fn-backup', 'blk-store');
await dropCard(page, 'fn-auditlog', 'blk-audit');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/05-step1-covered.png` });

// 6. Панель ошибок при загрузке некорректного файла (E-102).
await page
  .getByTestId('file-architecture')
  .setInputFiles('tests/fixtures/invalid/e102-negative-cost.yaml');
await page.waitForSelector('[data-testid="validation-panel"]');
await page.screenshot({ path: `${OUT}/06-validation-errors.png` });

await browser.close();
console.log('screenshots saved to', OUT);
