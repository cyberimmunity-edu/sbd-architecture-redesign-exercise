/** Геометрия в полном сценарии: заголовки, полосы, сегменты стрелок. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function dragDomain(page, blockId, fraction) {
  const box = await page.getByTestId('seq-canvas').boundingBox();
  const x = Math.max(80, Math.min(Math.round(box.width * fraction), box.width - 60));
  const y = Math.min(Math.round(box.height * 0.4), box.height - 80);
  const dt = await page.evaluateHandle((id) => { const t = new DataTransfer(); t.setData('text/plain', `skib-domain:${id}`); return t; }, blockId);
  const card = page.locator(`[data-testid="seq-domain-card-${blockId}"]`);
  const clientX = Math.round(box.x + x), clientY = Math.round(box.y + y);
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
await page.goto('http://localhost:3100');
await page.evaluate(() => window.localStorage.clear());
await page.reload();
await page.getByTestId('demo-project').waitFor();
await page.getByTestId('file-state').setInputFiles(resolve(process.cwd(), 'tests/fixtures/vessel-full/state.yaml'));
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
const geo = await page.evaluate(() => {
  const vp = document.querySelector('.react-flow__viewport');
  const pick = (sel) => [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: (el.getAttribute('data-testid') || '').replace(/^seq-(lifeline-header-|lifeline-band-|arrow-)/, ''), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return { vp: vp ? vp.getAttribute('style') : '?', headers: pick('[data-testid^="seq-lifeline-header-"]'), arrows: pick('[data-testid^="seq-arrow-"]') };
});
console.log('VP:', geo.vp);
console.log('Заголовки:');
for (const h of geo.headers) console.log(`  ${h.id}: x=[${h.x}..${h.x + h.w}] y=${h.y}`);
console.log('Стрелки (первые 4):');
for (const a of geo.arrows.slice(0, 4)) console.log(`  ${a.id}: x=[${a.x}..${a.x + a.w}] y=${a.y} h=${a.h}`);
await browser.close();
