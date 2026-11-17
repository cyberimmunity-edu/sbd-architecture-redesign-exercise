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
for (const [id, f] of [['blk-radio',0.2],['blk-ota',0.4],['blk-nav',0.6],['blk-cam',0.8]]) {
  await dragDomain(page, id, f);
  console.log(id, '→ линий:', await page.locator('[data-testid^="seq-lifeline-header-"]').count());
}
await browser.close();
