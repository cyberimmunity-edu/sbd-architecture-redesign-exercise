/**
 * Воспроизведение UX-сценариев перетаскивания стрелок на ДП (диагностика,
 * не входит в гейты). Сценарии:
 *   A: перенос нижней стрелки на одну строку вверх (между 2-й и 3-й);
 *   B: перенос верхней стрелки на одну строку вниз;
 *   C: перенос 4-й стрелки в зазор между 2-й и 3-й;
 *   D: полустрочное смещение (симптом «двигается рывками/только края»).
 * Запуск: node scripts/repro-arrow-drag.mjs [порт]
 */
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const port = process.argv[2] || '3000';
const base = `http://localhost:${port}`;
const FIXTURE = resolve(process.cwd(), 'tests/fixtures/vessel-full/state.yaml');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dragDomain(page, blockId, fraction) {
  const box = await page.getByTestId('seq-canvas').boundingBox();
  const x = Math.max(80, Math.min(Math.round(box.width * fraction), box.width - 60));
  const y = Math.min(Math.round(box.height * 0.4), box.height - 80);
  const dt = await page.evaluateHandle((id) => {
    const t = new DataTransfer();
    t.setData('text/plain', `skib-domain:${id}`);
    return t;
  }, blockId);
  const card = page.locator(`[data-testid="seq-domain-card-${blockId}"]`);
  const clientX = Math.round(box.x + x);
  const clientY = Math.round(box.y + y);
  await card.dispatchEvent('dragstart', { dataTransfer: dt });
  await page.getByTestId('seq-canvas').dispatchEvent('dragover', { dataTransfer: dt, clientX, clientY });
  await page.getByTestId('seq-canvas').dispatchEvent('drop', { dataTransfer: dt, clientX, clientY });
  await card.dispatchEvent('dragend', { dataTransfer: dt });
  await sleep(350);
}

async function gestureArrow(page, fromId, toId) {
  const from = await page.getByTestId(`seq-lifeline-band-${fromId}`).boundingBox();
  const to = await page.getByTestId(`seq-lifeline-band-${toId}`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 10 });
  await page.mouse.up();
  await sleep(600);
}

/** Порядок стрелок: список testid по порядку следования строк. */
async function order(page) {
  return page.locator('[data-testid^="seq-arrow-a-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid').replace('seq-arrow-', '')),
  );
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base);
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').waitFor();
await page.getByTestId('file-state').setInputFiles(FIXTURE);
await sleep(600);
await page.getByTestId('mode-sequence').click();
await sleep(400);
await page.getByTestId('seq-create').click();
await sleep(200);
await dragDomain(page, 'blk-radio', 0.2);
await dragDomain(page, 'blk-ota', 0.4);
await dragDomain(page, 'blk-nav', 0.6);
await dragDomain(page, 'blk-cam', 0.8);
await gestureArrow(page, 'blk-radio', 'blk-ota'); // a-1
await gestureArrow(page, 'blk-ota', 'blk-nav');   // a-2
console.log('после 2:', await order(page));
await gestureArrow(page, 'blk-nav', 'blk-radio'); // a-3
console.log('после 3:', await order(page));
await gestureArrow(page, 'blk-cam', 'blk-radio'); // a-4
console.log('после 4:', await order(page));
console.log('Исходный порядок:', await order(page));

const center = (el) => ({ x: el.x + el.width / 2, y: el.y + el.height / 2 });

// A: a-4 на одну строку вверх (в зазор между a-2 и a-3).
{
  const a4 = await page.getByTestId('seq-arrow-a-4').boundingBox();
  const a3 = await page.getByTestId('seq-arrow-a-3').boundingBox();
  const from = center(a4);
  const to = { x: from.x, y: center(a3).y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await sleep(400);
  console.log('A (4-я на 1 строку вверх, ожидание [a-1,a-2,a-4,a-3]):', await order(page));
}

// B: верхняя на одну строку вниз.
{
  const a1 = await page.getByTestId('seq-arrow-a-1').boundingBox();
  const a2 = await page.getByTestId('seq-arrow-a-2').boundingBox();
  const from = center(a1);
  const to = { x: from.x, y: center(a2).y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await sleep(400);
  console.log('B (1-я на 1 строку вниз, ожидание [a-2,a-1,a-4,a-3]):', await order(page));
}

// C: последняя стрелка в зазор между 2-й и 3-й.
{
  const ids = await order(page);
  const lastId = ids[ids.length - 1];
  const last = await page.getByTestId(`seq-arrow-${lastId}`).boundingBox();
  const second = await page.getByTestId('seq-arrow-a-1').boundingBox();
  const from = center(last);
  // Зазор между 1-й и 2-й строкой: на полстроки ниже центра 1-й.
  const to = { x: from.x, y: center(second).y + second.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
  await sleep(400);
  console.log(`C (${lastId} в зазор между 1-й и 2-й):`, await order(page));
}

// D: смещение на полстроки вниз (меньше порога срабатывания?).
{
  const a1 = await page.getByTestId('seq-arrow-a-1').boundingBox();
  const from = center(a1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + a1.height / 2, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  console.log('D (полстроки вниз — ожидание без изменений):', await order(page));
}

console.log('Ошибки страницы:', errors.length ? errors : 'нет');
await browser.close();
