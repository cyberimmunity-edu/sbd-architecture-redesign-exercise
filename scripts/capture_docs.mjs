/* Скриншоты интерфейса v0.01.06 для docs/user-guide.md и docs/teacher-guide.md.
 * Запуск: BASE_URL=http://localhost:4173 node scripts/capture_docs.mjs
 * (нужен собранный out/, обслуживаемый статикой: npx serve out -s -l 4173,
 * либо dev-сервер на localhost:3000).
 */
import { chromium } from '/home/z/my-project/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = '/home/z/my-project/docs/img';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });

async function loadRobot() {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 7);
  await page.waitForTimeout(400);
}

async function drop(cardId, blockId) {
  const dt = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer: dt });
  await node.dispatchEvent('dragover', { dataTransfer: dt });
  await node.dispatchEvent('drop', { dataTransfer: dt });
  await card.dispatchEvent('dragend', { dataTransfer: dt });
  await page.waitForTimeout(250);
}

// 01 — старт (пустое состояние, тёмная тема).
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.evaluate(() => window.localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/01-empty.png` });

// 02 — пример 1 (робот), все НДБ, стрелки красные; на карточках целей —
// полные формулировки инвариантов (v0.01.06).
await loadRobot();
await page.screenshot({ path: `${OUT}/02-demo-red.png` });

// 03 — размещение fn-auth в blk-link: ДДБПЦД, C_домена = 120, стрелки зелёные.
await loadRobot();
await drop('fn-auth', 'blk-link');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-placement-yellow.png` });

// 04 — диалог декомпозиции blk-plan.
await page.locator('[data-block-id="blk-plan"]').getByRole('button', { name: 'Декомпозировать' }).click();
await page.waitForSelector('[role="dialog"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-decompose-dialog.png` });
await page.keyboard.press('Escape');

// 05 — шаг 1 контрольного примера: C_системы = 486.
await loadRobot();
await drop('fn-auth', 'blk-link');
await drop('fn-sign', 'blk-link');
await drop('fn-sanitize', 'blk-plan');
await drop('fn-geofence', 'blk-plan');
await drop('fn-estop', 'blk-drive');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/05-step1-covered.png` });

// 06 — панель валидации: файл с неверной версией схемы не применяется (Ф-6).
await loadRobot();
{
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Загрузить архитектуру…' }).click(),
  ]);
  await chooser.setFiles({
    name: 'architecture-bad.yaml',
    mimeType: 'text/yaml',
    buffer: Buffer.from('version: 9\nblocks: []\nedges: []\n', 'utf8'),
  });
  await page.waitForSelector('[data-testid="validation-panel"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/06-validation-errors.png` });
  await page.getByRole('button', { name: 'Закрыть' }).click();
}

// 07 — принудительный ввод домена в ДВБ (v0.01.06): blk-perc без функций
// становится ДДБ (зелёным), в анализе ДВБ — строка «ДДБ *».
await loadRobot();
await page.locator('[data-block-id="blk-perc"]').click();
await page.waitForTimeout(300);
await page.locator('#domain-dvb').click();
await page.getByRole('option', { name: /принудительно/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/07-force-dvb.png` });

await browser.close();
console.log('OK: скриншоты обновлены (v0.01.06)');
