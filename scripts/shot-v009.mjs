/**
 * Визуальная проверка трассировки v0.01.09 на раскладке пользователя
 * (пример 2 «Безэкипажное судно-доставщик», tests/fixtures/vessel-user-state.yaml)
 * и карточки ЦБ. Запуск: node scripts/shot-v009.mjs (dev-сервер на :3000).
 * Скриншоты: /tmp/edges-v009/*.png — проверка, не поставка.
 */

import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { load as parse } from 'js-yaml';

const OUT = '/tmp/edges-v009';
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(
  new URL('../tests/fixtures/vessel-user-state.yaml', import.meta.url),
  'utf8',
);
const project = parse(fixtureText);
const stored = JSON.stringify({
  architecture: project.architecture,
  security: project.security,
  assignments: project.assignments,
  meta: project.meta ?? {},
});

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 2560, height: 1400 },
  deviceScaleFactor: 1,
  locale: 'ru-RU',
});
const page = await context.newPage();

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.evaluate((state) => {
  window.localStorage.clear();
  window.localStorage.setItem('skib-lab-state-v1', state);
}, stored);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__edge');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/1-user-layout-edges.png` });

// Клик по цели «Подлинный идентификатор» (fn-sign → dom-7): карточка ЦБ
// и краткая подсветка критичного домена.
const goalCard = page.getByTestId('goal-card-g-id-authentic');
if (await goalCard.count()) {
  await goalCard.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/2-goal-card-flash.png` });
}

// Клик по другой цели — «Ограничения перемещений» (fn-nav-integrity → dom-3,
// fn-brake → dom-4): два критичных домена.
const goalCard2 = page.getByTestId('goal-card-g-move-limits');
if (await goalCard2.count()) {
  await goalCard2.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/3-goal-card-two-domains.png` });
}

// Проверка: ни одна стрелка не пересекает чужой домен (данные из канвы).
const crossings = await page.evaluate(() => {
  return null; // численная проверка — в unit-тестах routeLayout
});

await browser.close();
console.log('v0.01.09 screenshots saved to', OUT, crossings ?? '');
