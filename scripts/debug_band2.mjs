import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:3000/');
await page.waitForSelector('[data-testid="mode-sequence"]');
await page.locator('[data-testid="file-state"]').setInputFiles('tests/fixtures/vessel-full/state.yaml');
await page.waitForTimeout(1200);
await page.click('[data-testid="mode-sequence"]');
await page.waitForTimeout(600);
await page.click('[data-testid="seq-create"]');
await page.waitForTimeout(400);
await page.locator('[data-testid="seq-domain-card-blk-radio"]').dragTo(page.locator('[data-testid="seq-canvas"]'), { targetPosition: { x: 330, y: 300 } });
await page.waitForTimeout(700);
const info = await page.evaluate(() => {
  const band = document.querySelector('[data-testid="seq-lifeline-band-blk-radio"]');
  const chain = [];
  let cur = band;
  while (cur && chain.length < 10) {
    const cs = getComputedStyle(cur);
    chain.push({
      cls: String(cur.className).slice(0, 50),
      pe: cs.pointerEvents,
      transform: cs.transform.slice(0, 40),
      rect: ((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(cur.getBoundingClientRect()),
    });
    cur = cur.parentElement;
  }
  return chain;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
