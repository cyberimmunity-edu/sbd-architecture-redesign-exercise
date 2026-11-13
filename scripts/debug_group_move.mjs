/**
 * Проверка новых функций v0.02.03b: перемещение ЛГ целиком (Ф-78),
 * ограничение ДБ периметром, устойчивость выделения.
 * Запуск: node scripts/debug_group_move.mjs (dev-сервер на :3000)
 */
import { chromium } from 'playwright';

const M1 = 'blk-plan';
const M2 = 'blk-drive';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err).slice(0, 500)));
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('Maximum update') || text.includes('#185')) errors.push(text.slice(0, 500));
});

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.locator('button:has-text("Примеры")').first().click();
await page.waitForTimeout(600);
await page.locator('text=Робот').first().click();
await page.waitForTimeout(2500);

const nodePos = (id) =>
  page.evaluate((nodeId) => {
    const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
    if (!el) return null;
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
  }, id);

// --- Тест 1: перемещение ЛГ целиком ---
const chip = page.locator('[data-testid="lg-chip-lg-1"]');
console.log('lg chip found:', await chip.count());
const before1 = await nodePos(M1);
const before2 = await nodePos(M2);
const frameBefore = await nodePos('lg-1');
console.log('before:', JSON.stringify({ before1, before2, frameBefore }));

const chipBox = await chip.boundingBox();
await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
await page.mouse.down();
await page.mouse.move(chipBox.x + chipBox.width / 2 + 120, chipBox.y + chipBox.height / 2 + 90, { steps: 12 });
await page.waitForTimeout(250);
await page.mouse.up();
await page.waitForTimeout(800);

const after1 = await nodePos(M1);
const after2 = await nodePos(M2);
const frameAfter = await nodePos('lg-1');
console.log('after:', JSON.stringify({ after1, after2, frameAfter }));
console.log(
  'member deltas:',
  (after1.x - before1.x).toFixed(1),
  (after1.y - before1.y).toFixed(1),
  '|',
  (after2.x - before2.x).toFixed(1),
  (after2.y - before2.y).toFixed(1),
);

// Позиции зафиксированы в модели? Проверим перезагрузкой (автосохранение).
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const afterReload = await nodePos(M1);
console.log('after reload (модель сохранила перенос):', JSON.stringify(afterReload), 'совпало:', Math.abs(afterReload.x - after1.x) < 2 && Math.abs(afterReload.y - after1.y) < 2);

// --- Тест 2: свёрнутая ЛГ перетаскивается целиком ---
const beforeC = await nodePos(M1);
await page.locator('[data-testid="lg-toggle-lg-1"]').click();
await page.waitForTimeout(700);
const collapsedBox = await page.locator('.react-flow__node[data-id="lg-1"]').boundingBox();
await page.mouse.move(collapsedBox.x + collapsedBox.width / 2, collapsedBox.y + collapsedBox.height / 2);
await page.mouse.down();
await page.mouse.move(collapsedBox.x + collapsedBox.width / 2 - 90, collapsedBox.y + collapsedBox.height / 2 - 60, { steps: 10 });
await page.waitForTimeout(250);
await page.mouse.up();
await page.waitForTimeout(800);
console.log('collapsed LG drag: рамка сместилась на', JSON.stringify(await nodePos('lg-1')));
await page.locator('[data-testid="lg-toggle-lg-1"]').click();
await page.waitForTimeout(700);
const afterExpand = await nodePos(M1);
console.log('member moved with collapsed LG:', (afterExpand.x - beforeC.x).toFixed(1), (afterExpand.y - beforeC.y).toFixed(1));

// --- Тест 3: ДБ не покидает периметр ---
const allNodes = await page.evaluate(() =>
  [...document.querySelectorAll('.react-flow__node-domain')].map((el) => el.getAttribute('data-id')),
);
console.log('domains:', allNodes.join(','));
const target = allNodes.find((id) => id !== M1 && id !== M2);
const boxT = await page.locator(`.react-flow__node[data-id="${target}"]`).boundingBox();
await page.mouse.move(boxT.x + boxT.width / 2, boxT.y + boxT.height / 2);
await page.mouse.down();
await page.mouse.move(boxT.x + boxT.width / 2 + 1400, boxT.y + boxT.height / 2 + 800, { steps: 14 });
await page.waitForTimeout(300);
const pMid = await nodePos(target);
console.log('mid-drag position:', JSON.stringify(pMid), '(должна быть ограничена периметром)');
// Тянем ещё дальше — позиция обязана стоять на границе периметра
await page.mouse.move(boxT.x + boxT.width / 2 + 2400, boxT.y + boxT.height / 2 + 1600, { steps: 10 });
await page.waitForTimeout(300);
const pMid2 = await nodePos(target);
console.log('further drag position:', JSON.stringify(pMid2), '(не должна измениться дальше границы):', JSON.stringify(pMid2) === JSON.stringify(pMid) ? 'да' : 'нет');
await page.mouse.up();
await page.waitForTimeout(800);
const pEnd = await nodePos(target);
console.log('after drop:', JSON.stringify(pEnd));
console.log('clamped (позиция при сбросе = позиции в момент зажатой мыши):', Math.abs(pEnd.x - pMid2.x) < 3 && Math.abs(pEnd.y - pMid2.y) < 3 ? 'yes' : 'no');

// --- Тест 4: выделение сохраняется (shift-рамка, затем пауза) ---
const paneBox = await page.locator('.react-flow__pane').first().boundingBox();
// старт рамки — в правом верхнем углу канвы, вдали от кнопок панелей
const sx = paneBox.x + paneBox.width - 460;
const sy = paneBox.y + 40;
await page.keyboard.down('Shift');
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(sx + 380, sy + 420, { steps: 8 });
await page.waitForTimeout(200);
const selCount = await page.evaluate(() => document.querySelectorAll('.react-flow__node.selected').length);
console.log('в момент рамки выделено узлов:', selCount, '(должно быть >= 1)');
await page.mouse.up();
await page.keyboard.up('Shift');
await page.waitForTimeout(300);
const selCountMid = await page.evaluate(() => document.querySelectorAll('.react-flow__node.selected').length);
console.log('сразу после рамки:', selCountMid);
await page.waitForTimeout(1200);
const selCount2 = await page.evaluate(() => document.querySelectorAll('.react-flow__node.selected').length);
console.log('спустя 1.2 с выделено:', selCount2, '(должно остаться тем же):', selCountMid === selCount2 ? 'да' : 'НЕТ — осцилляция!');

console.log('ERRORS:', errors.length);
for (const e of errors.slice(0, 5)) console.log('---', e);
await page.screenshot({ path: '/tmp/group-move-shot.png' });
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
