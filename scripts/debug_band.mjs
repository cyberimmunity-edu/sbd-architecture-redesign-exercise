import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3000/');
await page.waitForSelector('[data-testid="mode-sequence"]');
await page.locator('[data-testid="file-state"]').setInputFiles('tests/fixtures/vessel-full/state.yaml');
await page.waitForTimeout(1200);
await page.click('[data-testid="mode-sequence"]');
await page.waitForTimeout(600);
await page.click('[data-testid="seq-create"]');
await page.waitForTimeout(400);
await page.locator('[data-testid="seq-domain-card-blk-radio"]').dragTo(page.locator('[data-testid="seq-canvas"]'), { targetPosition: { x: 330, y: 300 } });
await page.waitForTimeout(600);
await page.locator('[data-testid="seq-domain-card-blk-ota"]').dragTo(page.locator('[data-testid="seq-canvas"]'), { targetPosition: { x: 550, y: 300 } });
await page.waitForTimeout(700);

const info = await page.evaluate(() => {
  const band = document.querySelector('[data-testid="seq-lifeline-band-blk-radio"]');
  if (!band) return { band: null };
  const rect = band.getBoundingClientRect();
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + 30;
  const el = document.elementFromPoint(cx, cy);
  const chain = [];
  let cur = el;
  while (cur && chain.length < 6) {
    chain.push(`${cur.tagName}.${String(cur.className).slice(0, 60)}`);
    cur = cur.parentElement;
  }
  return { rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, point: { cx, cy }, at: String(el?.tagName), atTest: el?.getAttribute('data-testid'), chain };
});
console.log(JSON.stringify(info, null, 1));

// Ручной жест с listener-трассировкой.
await page.evaluate(() => {
  const band = document.querySelector('[data-testid="seq-lifeline-band-blk-radio"]');
  window.__events = [];
  ['pointerdown', 'pointerenter', 'pointerup'].forEach((t) => {
    band.addEventListener(t, (e) => window.__events.push(`${t}:${e.target.getAttribute('data-testid') ?? ''}`));
  });
  document.addEventListener('pointerup', () => window.__events.push('doc-pointerup'), { capture: false, once: true });
});
const b = await page.locator('[data-testid="seq-lifeline-band-blk-radio"]').boundingBox();
const b2 = await page.locator('[data-testid="seq-lifeline-band-blk-ota"]').boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + 30);
await page.mouse.down();
await page.mouse.move(b2.x + b2.width / 2, b2.y + 30, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
const events = await page.evaluate(() => window.__events);
console.log('events:', JSON.stringify(events));
console.log('arrows:', await page.locator('[data-testid^="seq-arrow-"]').count());
await page.screenshot({ path: '/tmp/seq-live/debug.png' });
await browser.close();
