/**
 * Скриншот автораскладки на фикстуре state_reg_00.yaml (визуальная проверка).
 * Запуск: node scripts/shot-layout-reg00.mjs (dev-сервер на 3000).
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';

const execPath = process.env.SKIB_CHROMIUM_PATH;
const browser = await chromium.launch({
  ...(execPath ? { executablePath: execPath, args: ['--no-sandbox'] } : {}),
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:3000/');
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').waitFor({ timeout: 30000 });

await page.getByTestId('file-state').setInputFiles(
  resolve('tests/fixtures/seq-colors/state_reg_00.yaml'),
);
const confirm = page.getByRole('button', { name: 'Продолжить' });
await confirm.click({ timeout: 3000 }).catch(() => {});
await page.waitForFunction(
  () => document.querySelectorAll('.react-flow__node').length === 29,
  { timeout: 30000 },
);
await page.getByTestId('auto-layout').click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'scripts/out-layout-reg00.png' });
console.log('ok: scripts/out-layout-reg00.png');
await browser.close();
