/** Точная диагностика сценария A: что под курсором при pointerdown/move/up. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const port = process.argv[2] || '3100';
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));

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
await gestureArrow(page, 'blk-radio', 'blk-ota');
await gestureArrow(page, 'blk-ota', 'blk-nav');
await gestureArrow(page, 'blk-nav', 'blk-radio');
await gestureArrow(page, 'blk-cam', 'blk-radio');
await sleep(1200);

const zoomInfo = await page.evaluate(() => {
  const vp = document.querySelector('.react-flow__viewport');
  return vp ? vp.getAttribute('style') : 'нет viewport';
});
console.log('VIEWPORT:', zoomInfo);

const a4 = await page.getByTestId('seq-arrow-a-4').boundingBox();
const a3 = await page.getByTestId('seq-arrow-a-3').boundingBox();
console.log('box a-4:', JSON.stringify(a4));
console.log('box a-3:', JSON.stringify(a3));

const from = { x: a4.x + a4.width / 2, y: a4.y + a4.height / 2 };
const to = { x: from.x, y: a3.y + a3.height / 2 };

const probe = (p) =>
  page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'ничего';
    const path = [];
    let cur = el;
    for (let i = 0; i < 5 && cur; i++) {
      path.push(
        cur.tagName +
          (cur.getAttribute ? `[${cur.getAttribute('data-testid') ?? ''}]` : '') +
          (cur.style ? `{z:${getComputedStyle(cur).zIndex}}` : ''),
      );
      cur = cur.parentElement;
    }
    return path.join(' < ');
  }, p);

console.log('Под курсором (down):', await probe(from));
console.log('Под курсором (to):', await probe(to));

await page.mouse.move(from.x, from.y);
await page.mouse.down();
await sleep(100);
console.log('После down, под курсором:', await probe(from));
await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
await sleep(100);
const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
console.log('В середине жеста, под курсором:', await probe(mid));
await page.mouse.move(to.x, to.y, { steps: 6 });
await sleep(100);
console.log('Перед up, под курсором:', await probe(to));
await page.mouse.up();
await sleep(600);

const order = await page.locator('[data-testid^="seq-arrow-a-"]').evaluateAll((els) =>
  els.map((el) => el.getAttribute('data-testid')),
);
console.log('Итог:', order);
await browser.close();
