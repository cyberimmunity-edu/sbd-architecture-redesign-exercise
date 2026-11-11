/* Диагностика Paged.js на большом документе: ловим ошибки и считаем страницы. */
const { chromium } = require('/home/z/my-project/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') console.log(`[console.${t}]`, m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
  await page.goto('file:///home/z/my-project/scripts/render/tz.html', { waitUntil: 'networkidle' });
  const paged = fs.readFileSync(
    '/home/z/my-project/node_modules/pagedjs/dist/paged.polyfill.js', 'utf-8');
  await page.addScriptTag({ content: paged });
  await page.waitForTimeout(15000);
  const info = await page.evaluate(() => ({
    pages: document.querySelectorAll('.pagedjs_page').length,
    bodyChildren: document.body.children.length,
    hasMain: !!document.querySelector('main'),
  }));
  console.log('INFO', JSON.stringify(info));
  await browser.close();
})();
