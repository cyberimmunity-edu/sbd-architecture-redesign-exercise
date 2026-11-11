/**
 * Скриншоты интерфейса для документации (v0.01.07).
 * Запуск: node scripts/screenshot.mjs (требуется запущенный dev-сервер
 * на http://localhost:3000). Скриншоты: docs/img/*.png.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/img';
mkdirSync(OUT, { recursive: true });

const CHROMIUM = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

async function dropCard(page, cardId, blockId) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
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

// 2. Пример 1 (робот): цели красные, функции в пуле, C_системы = 4.
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-robot').click();
await page.waitForSelector('.react-flow__node');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/02-demo-red.png` });

// 3. Размещение fn-auth в «Модуль связи» — цель «Достоверность команд» жёлтая.
await dropCard(page, 'fn-auth', 'blk-link');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-placement-yellow.png` });

// 4. Диалог декомпозиции домена «Модуль связи».
await page.locator('[data-block-id="blk-link"]').getByRole('button', { name: 'Декомпозировать' }).click();
await page.waitForSelector('[role="dialog"]');
await page.screenshot({ path: `${OUT}/04-decompose-dialog.png` });
await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();

// 5. Контрольный пример, шаг 1: C_системы = 486, четыре зелёные цели.
await dropCard(page, 'fn-sign', 'blk-link');
await dropCard(page, 'fn-sanitize', 'blk-plan');
await dropCard(page, 'fn-geofence', 'blk-plan');
await dropCard(page, 'fn-estop', 'blk-drive');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/05-step1-covered.png` });

// 6. Панель ошибок при загрузке некорректного файла (E-102).
await page
  .getByTestId('file-architecture')
  .setInputFiles('tests/fixtures/invalid/e102-negative-cost.yaml');
await page.waitForSelector('[data-testid="validation-panel"]');
await page.screenshot({ path: `${OUT}/06-validation-errors.png` });
// Панель «файл не применён» закрываем — иначе она перекрывает кнопку примеров.
await page.getByRole('button', { name: 'Закрыть' }).click();
await page.waitForTimeout(400);

// 7. Принудительный ввод домена в ДВБ (v0.01.06): инспектор домена без функций.
// Проект не пуст — пример загружается после подтверждения замены («Да»).
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-vessel').click();
const confirmYes = page.getByRole('button', { name: 'Продолжить' });
if (await confirmYes.isVisible().catch(() => false)) {
  await confirmYes.click();
}
await page.waitForSelector('[data-block-id="blk-gps-ins"]');
await page.waitForTimeout(900);
await page.locator('[data-block-id="blk-gps-ins"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/07-force-dvb.png` });

await browser.close();
console.log('screenshots saved to', OUT);
