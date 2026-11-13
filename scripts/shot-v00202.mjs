import { chromium } from 'playwright';

// Визуальная проверка v0.02.02: тулбары, «Только значки», автоскрытие
// тулбаров и панелей, индикатор вставки линии жизни, узкое окно.
const OUT = '/home/z/my-project/test-artifacts-v00202';
const browser = await chromium.launch();
const PORT = process.env.SHOT_PORT ?? '3111';
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').click();
await page.getByTestId('demo-vessel').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-toolbars-dap.png` });

// «Только значки».
await page.getByTestId('toolbars-icononly').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-icon-only.png` });
await page.getByTestId('toolbars-icononly').click();

// Автоскрытие тулбаров: курсор уведён — зона свёрнута.
await page.getByTestId('toolbars-autohide').click();
await page.mouse.move(800, 500);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-toolbars-collapsed.png` });
// Наведение — зона развёрнута.
await page.mouse.move(800, 8);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-toolbars-expanded-hover.png` });
await page.mouse.move(800, 500);
await page.getByTestId('toolbars-autohide').click();
await page.waitForTimeout(200);

// Автоскрытие панелей: рейки у краёв.
await page.getByTestId('panels-autohide').click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/05-panel-rails.png` });
// Наведение на левую рейку — панель развёрнута.
const rail = await page.getByTestId('panel-rail-left').boundingBox();
await page.mouse.move(rail.x + rail.width / 2, rail.y + 300);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/06-panel-expanded-hover.png` });
await page.getByTestId('panels-autohide').click();
await page.waitForTimeout(300);

// ДП: две линии жизни, перетаскивание третьей — индикатор зазора.
await page.getByTestId('mode-sequence').click();
await page.waitForTimeout(400);
await page.getByTestId('seq-create').click();
await page.waitForTimeout(300);
const canvas = page.getByTestId('seq-canvas');
await page.locator('[data-testid="seq-domain-card-blk-radio"]').dragTo(canvas, { targetPosition: { x: 300, y: 260 } });
await page.waitForTimeout(400);
await page.locator('[data-testid="seq-domain-card-blk-ota"]').dragTo(canvas, { targetPosition: { x: 620, y: 260 } });
await page.waitForTimeout(500);
const radio = await page.getByTestId('seq-lifeline-header-blk-radio').boundingBox();
const ota = await page.getByTestId('seq-lifeline-header-blk-ota').boundingBox();
const box = await canvas.boundingBox();
const gapX = Math.round((radio.x + radio.width / 2 + ota.x + ota.width / 2) / 2);
const gapY = Math.round(radio.y - box.y + radio.height / 2);
const dataTransfer = await page.evaluateHandle(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', 'skib-domain:blk-nav');
  return dt;
});
await page.locator('[data-testid="seq-domain-card-blk-nav"]').dispatchEvent('dragstart', { dataTransfer });
await canvas.dispatchEvent('dragover', { dataTransfer, clientX: gapX, clientY: gapY });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/07-insert-marker.png` });
await canvas.dispatchEvent('drop', { dataTransfer, clientX: gapX, clientY: gapY });
await page.locator('[data-testid="seq-domain-card-blk-nav"]').dispatchEvent('dragend', { dataTransfer });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/08-inserted-between.png` });

// Узкое окно: перенос тулбаров и текста в панелях.
const narrow = await browser.newPage({ viewport: { width: 860, height: 700 } });
narrow.on('pageerror', (e) => console.log('[pageerror-narrow]', String(e).slice(0, 300)));
await narrow.goto(`http://localhost:${PORT}/`);
await narrow.evaluate(() => window.localStorage.clear());
await narrow.reload();
await narrow.getByTestId('demo-project').click();
await narrow.getByTestId('demo-robot').click();
await narrow.waitForTimeout(1200);
await narrow.screenshot({ path: `${OUT}/09-narrow-window.png` });

await browser.close();
console.log('OK: скриншоты v0.02.02 сохранены в', OUT);
