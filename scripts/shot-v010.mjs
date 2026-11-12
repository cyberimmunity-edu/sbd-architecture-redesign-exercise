/**
 * Визуальная проверка v0.01.10: якоря портов (горизонтальные входы/выходы,
 * вход не изнутри блока), вмещение критичных доменов цели, фокус по функции
 * и разделитель высоты целей. Раскладка пользователя (пример 2 «Безэкипажное
 * судно-доставщик», tests/fixtures/vessel-user-state.yaml).
 * Запуск: node scripts/shot-v010.mjs (dev-сервер на :3000).
 * Скриншоты: /tmp/edges-v010/*.png — проверка, не поставка.
 */

import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { load as parse } from 'js-yaml';

const OUT = '/tmp/edges-v010';
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

// В чистом окружении Chromium Playwright не установлен — путь задаётся
// переменной SKIB_CHROMIUM_PATH (правило проекта: браузер ставится до
// тестирования, см. docs/testing-guide.md).
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(process.env.SKIB_CHROMIUM_PATH
    ? { executablePath: process.env.SKIB_CHROMIUM_PATH }
    : {}),
});
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
// «Вместить» — диаграмма крупнее, порты различимы.
await page.getByTestId('fit-view').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/1-user-layout-edges-v010.png` });

// Крупные планы портов: правый порт «Навигация и планирование» и левый порт
// «Интеллектуальный анализ» — проверить «усики» и отсутствие входа изнутри.
const portTargets = ['blk-nav', 'blk-ai', 'blk-radio'];
let cropIndex = 2;
for (const id of portTargets) {
  const box = await page.locator(`[data-block-id="${id}"]`).boundingBox();
  if (!box) continue;
  await page.screenshot({
    path: `${OUT}/${cropIndex}-port-${id}.png`,
    clip: {
      x: Math.max(280, box.x - 320),
      y: Math.max(48, box.y - 190),
      width: 640,
      height: 380,
    },
  });
  cropIndex += 1;
}

// Клик по цели «Ограничения перемещений» (fn-nav-integrity → dom-3,
// fn-brake → dom-4): вмещение обоих критичных доменов + подсветка.
const goalCard2 = page.getByTestId('goal-card-g-move-limits');
if (await goalCard2.count()) {
  await goalCard2.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/3-goal-fit-two-domains.png` });

  // Клик по функции в карточке ЦБ — фокус на домене размещения.
  const fnRow = page.locator('[data-testid^="goal-fn-"]').first();
  if (await fnRow.count()) {
    await fnRow.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/4-function-focus.png` });
  }
}

// Разделитель высоты целей: тянем вниз — цели сжимаются, пул растёт.
const goalsHandle = page.locator('[aria-label*="Цели безопасности"]');
const hb = await goalsHandle.boundingBox();
if (hb) {
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 220, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-goals-resized.png` });
}

await browser.close();
console.log('v0.01.10 screenshots saved to', OUT);
