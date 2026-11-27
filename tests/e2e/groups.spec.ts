/**
 * E2E-тесты логических групп (ЛГ) — v0.02.03, Ф-70…Ф-76.
 * Проверяются: рамка ЛГ в примере робота; создание ЛГ из мультивыбора
 * через тулбар «Правка»; включение/исключение ДБ перетаскиванием;
 * свёртывание (скрытие членов, перенос связей на рамку); раскрытие при
 * подсветке из таблицы ДВБ (Ф-76); удаление ЛГ (ДБ остаются) и отмена;
 * палитра цветов без красного/жёлтого/зелёного; сохранение в localStorage;
 * v0.03.01h: вложенная ЛГ из контекстного меню рамки (Ф-71), кнопки
 * канвы «Свернуть ЛГ»/«Развернуть ЛГ» с вложенными ЛГ и гашением без ЛГ.
 */

import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  // 4 внутренних домена + 2 внешние системы + рамка периметра + рамка ЛГ.
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  // Пример содержит ЛГ «Контур управления движением» (планировщик + привод).
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('Контур управления движением');
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('(2)');
});

/** Размещение карточки функции в домен (как в table-focus): ДВБ-строка появляется. */
async function dropCard(page: Page, cardId: string, blockId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.getByTestId(`pool-card-${cardId}`);
  const node = page.locator(`[data-block-id="${blockId}"]`);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await node.dispatchEvent('dragover', { dataTransfer });
  await node.dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
}

/** Мультивыбор двух доменов Ctrl-кликом. */
async function selectPair(page: Page, firstId: string, secondId: string) {
  await page.locator(`.react-flow__node[data-id="${firstId}"]`).click();
  await page.locator(`.react-flow__node[data-id="${secondId}"]`).click({ modifiers: ['Control'] });
}

test('v0.02.03: ЛГ создаются из мультивыбора через тулбар «Правка», имя и состав видны', async ({ page }) => {
  await selectPair(page, 'blk-perc', 'blk-link');
  await page.getByTestId('lg-menu').click();
  await page.getByTestId('lg-create-selected').click();
  await expect(page.getByTestId('lg-name-input')).toBeVisible();
  await page.getByTestId('lg-name-input').fill('Восприятие и связь');
  await page.getByTestId('lg-apply').click();
  // Новая рамка с двумя членами; выбор ЛГ сбрасывает мультивыбор ДБ.
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('Восприятие и связь');
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(2)');
});

test('v0.02.03: ДБ включается в ЛГ перетаскиванием и выносится наружу (Ф-74)', async ({ page }) => {
  await selectPair(page, 'blk-perc', 'blk-link');
  await page.getByTestId('lg-menu').click();
  await page.getByTestId('lg-create-selected').click();
  await page.getByTestId('lg-name-input').fill('Новая ЛГ');
  await page.getByTestId('lg-apply').click();
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);

  // Перетаскивание планировщика в центр рамки — включение в ЛГ.
  const plan = page.locator('.react-flow__node[data-id="blk-plan"]');
  const frame = page.locator('[data-lg-id="lg-2"]');
  const planBox = (await plan.boundingBox())!;
  const frameBox = (await frame.boundingBox())!;
  await page.mouse.move(planBox.x + planBox.width / 2, planBox.y + planBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(3)');

  // Вынос домена на свободное место внутри периметра системы — справа от
  // рамки, под свёрнутой зоной рамки lg-1 (v0.02.03b, Ф-78: ДБ не тащится
  // за периметр — старая точка «слева от рамки» теперь за его границей).
  const perc = page.locator('.react-flow__node[data-id="blk-perc"]');
  const percBox = (await perc.boundingBox())!;
  await page.mouse.move(percBox.x + percBox.width / 2, percBox.y + percBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width + 160, frameBox.y + frameBox.height - 80, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(2)');
});

test('v0.02.03: свёрнутая ЛГ скрывает члены, связи ведут к рамке (Ф-72)', async ({ page }) => {
  // Делаем планировщик доверенным: появится строка в «Расширенном анализе ДВБ».
  await dropCard(page, 'fn-sanitize', 'blk-plan');
  await expect(page.getByTestId('dvb-row-blk-plan')).toBeVisible();

  await page.getByTestId('lg-toggle-lg-1').click();
  // Члены скрыты, рамка отмечена свёрнутой.
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(0);
  // Стрелки: 6 − внутренняя связь членов свёрнутой ЛГ = 5.
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);

  // Подсветка скрытого ДБ из таблицы ДВБ раскрывает ЛГ (Ф-76).
  await page.getByTestId('dvb-row-blk-plan').hover();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="false"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveAttribute('data-highlighted', 'true');
});

test('v0.02.03: удаление ЛГ оставляет ДБ несгруппированными; отмена возвращает (Ф-73)', async ({ page }) => {
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible();
  await page.getByTestId('lg-ctx-delete').click();
  // Рамка исчезла, домены остались.
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node')).toHaveCount(7);

  await page.getByTestId('undo').click();
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('(2)');
});

test('v0.02.03: палитра цветов ЛГ без красного, жёлтого и зелёного (П-15)', async ({ page }) => {
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible();
  // Восемь цветов палитры; зарезервированные цвета доверия недоступны.
  const swatches = page.locator('[data-testid^="lg-ctx-color-"]');
  await expect(swatches).toHaveCount(8);
  await expect(page.locator('[data-testid="lg-ctx-color-d32f2f"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="lg-ctx-color-f9a825"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="lg-ctx-color-43a047"]')).toHaveCount(0);

  // Перекраска в синий — одна операция истории.
  await page.getByTestId('lg-ctx-color-1e88e5').click();
  await expect(page.getByTestId('canvas-context-menu')).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-testid^="lg-ctx-color-"]')).toHaveCount(0);
});

test('v0.02.03: переименование ЛГ через диалог (двойной клик по плашке)', async ({ page }) => {
  await page.getByTestId('lg-chip-lg-1').dblclick();
  await expect(page.getByTestId('lg-name-input')).toBeVisible();
  await page.getByTestId('lg-name-input').fill('Исполнительный контур');
  await page.getByTestId('lg-apply').click();
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('Исполнительный контур');
  // Отмена возвращает прежнее имя.
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('Контур управления движением');
});

test('v0.02.03: ЛГ сохраняются в автосохранении и восстанавливаются', async ({ page }) => {
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await page.waitForTimeout(600); // дебаунс автосохранения 300 мс
  await page.reload();
  // Свёрнутая ЛГ: 2 скрытых домена не отображаются — 2 домена + 2 внешние
  // системы + рамка периметра + свёрнутая рамка ЛГ.
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  // Развёртывание после перезагрузки возвращает членов.
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
});

test('v0.02.03b: ЛГ перемещается целиком плашкой; ДБ не покидают периметр (Ф-78)', async ({
  page,
}) => {
  // Позиции узлов читаются из transform канвы (координаты потока).
  const nodePos = (id: string) =>
    page.evaluate((nodeId) => {
      const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
      if (!el) return null;
      const m = el.getAttribute('style')?.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
    }, id);

  // Перетаскивание плашки ЛГ — группа целиком: члены и рамка смещаются
  // на одну дельту.
  const beforePlan = (await nodePos('blk-plan'))!;
  const beforeDrive = (await nodePos('blk-drive'))!;
  const beforeFrame = (await nodePos('lg-1'))!;
  const chip = page.getByTestId('lg-chip-lg-1');
  const chipBox = (await chip.boundingBox())!;
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    chipBox.x + chipBox.width / 2 + 100,
    chipBox.y + chipBox.height / 2 + 70,
    { steps: 8 },
  );
  await page.mouse.up();
  const afterPlan = (await nodePos('blk-plan'))!;
  const afterDrive = (await nodePos('blk-drive'))!;
  const afterFrame = (await nodePos('lg-1'))!;
  const dx = afterPlan.x - beforePlan.x;
  const dy = afterPlan.y - beforePlan.y;
  expect(dx).toBeGreaterThan(0);
  expect(dy).toBeGreaterThan(0);
  expect(afterDrive.x - beforeDrive.x).toBeCloseTo(dx, 0);
  expect(afterDrive.y - beforeDrive.y).toBeCloseTo(dy, 0);
  expect(afterFrame.x - beforeFrame.x).toBeCloseTo(dx, 0);
  expect(afterFrame.y - beforeFrame.y).toBeCloseTo(dy, 0);

  // Перенос сохраняется в модели и переживает перезагрузку.
  await page.waitForTimeout(600); // дебаунс автосохранения 300 мс
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  expect((await nodePos('blk-plan'))!.x).toBeCloseTo(afterPlan.x, 0);

  // ДБ не тащится за периметр: дальнейшее движение курсора за границей
  // не меняет позицию узла.
  const perc = page.locator('.react-flow__node[data-id="blk-perc"]');
  const percBox = (await perc.boundingBox())!;
  await page.mouse.move(percBox.x + percBox.width / 2, percBox.y + percBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    percBox.x + percBox.width / 2 + 1400,
    percBox.y + percBox.height / 2 + 800,
    { steps: 12 },
  );
  await page.waitForTimeout(150);
  const mid = (await nodePos('blk-perc'))!;
  await page.mouse.move(
    percBox.x + percBox.width / 2 + 2200,
    percBox.y + percBox.height / 2 + 1400,
    { steps: 8 },
  );
  await page.waitForTimeout(150);
  const mid2 = (await nodePos('blk-perc'))!;
  await page.mouse.up();
  expect(mid2.x).toBeCloseTo(mid.x, 0);
  expect(mid2.y).toBeCloseTo(mid.y, 0);
  expect((await nodePos('blk-perc'))!.x).toBeCloseTo(mid.x, 0);
});

test('v0.03.01h: вложенная ЛГ создаётся из контекстного меню рамки (Ф-71, П-71)', async ({ page }) => {
  // План + привод уже в lg-1; выбираем их и создаём ЛГ внутри lg-1.
  await selectPair(page, 'blk-plan', 'blk-drive');
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible();
  await page.getByTestId('lg-ctx-create-nested').click();
  await expect(page.getByTestId('lg-name-input')).toBeVisible();
  await page.getByTestId('lg-name-input').fill('Исполнительный контур');
  await page.getByTestId('lg-apply').click();
  // Вложенная рамка с двумя членами появилась внутри lg-1:
  // 4 ДБ + 2 внешние + периметр + lg-1 + lg-2.
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('Исполнительный контур');
  await expect(page.getByTestId('lg-chip-lg-2')).toContainText('(2)');
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  // Один шаг истории: Ctrl+Z удаляет вложенную ЛГ, члены остаются в lg-1.
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(0);
  await expect(page.getByTestId('lg-chip-lg-1')).toContainText('(2)');
});

test('v0.03.01h: кнопки канвы «Свернуть ЛГ»/«Развернуть ЛГ» накрывают вложенные ЛГ (Ф-72)', async ({
  page,
}) => {
  // Вложенная ЛГ: lg-2 (план + привод) внутри lg-1.
  await selectPair(page, 'blk-plan', 'blk-drive');
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await page.getByTestId('lg-ctx-create-nested').click();
  await page.getByTestId('lg-apply').click();
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);

  // «Свернуть ЛГ» на канве: сворачиваются все ЛГ сразу, включая вложенную.
  await page.getByTestId('lg-collapse-all-canvas').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(0);
  // Несгруппированные домены остаются; внутренняя связь ЛГ скрыта (6 → 5).
  await expect(page.locator('[data-block-id="blk-perc"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);

  // «Развернуть ЛГ» возвращает всё: и вложенную рамку, и членов.
  await page.getByTestId('lg-expand-all-canvas').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="false"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);

  // Пара кнопок — две операции истории: Ctrl+Z возвращает свёрнутость.
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
});

test('v0.03.01h: без ЛГ кнопки канвы «Свернуть ЛГ»/«Развернуть ЛГ» погашены (Ф-72)', async ({
  page,
}) => {
  // Демо робота содержит lg-1 — кнопки активны.
  await expect(page.getByTestId('lg-collapse-all-canvas')).toBeEnabled();
  await expect(page.getByTestId('lg-expand-all-canvas')).toBeEnabled();

  // Удаление единственной ЛГ: кнопки гаснут, пока ЛГ нет.
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await page.getByTestId('lg-ctx-delete').click();
  await expect(page.locator('[data-lg-id="lg-1"]')).toHaveCount(0);
  await expect(page.getByTestId('lg-collapse-all-canvas')).toBeDisabled();
  await expect(page.getByTestId('lg-expand-all-canvas')).toBeDisabled();
});

test('v0.03.01j: рамка родителя охватывает вложенную ЛГ — «двигаются вместе» видно геометрически', async ({
  page,
}) => {
  // Вложенная ЛГ lg-2 (план + привод) внутри lg-1.
  await selectPair(page, 'blk-plan', 'blk-drive');
  await page.getByTestId('lg-chip-lg-1').click({ button: 'right' });
  await page.getByTestId('lg-ctx-create-nested').click();
  await page.getByTestId('lg-apply').click();
  await expect(page.locator('[data-lg-id="lg-2"]')).toHaveCount(1);

  const box = async (selector: string) => {
    const b = (await page.locator(selector).boundingBox())!;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
  const parent = await box('[data-lg-id="lg-1"]');
  const child = await box('[data-lg-id="lg-2"]');
  // Рамка ребёнка целиком внутри рамки родителя: перенос родителя двигает
  // поддерево, и это видно по геометрии (раньше рамки были «отдельными»).
  expect(parent.x).toBeLessThanOrEqual(child.x);
  expect(parent.y).toBeLessThanOrEqual(child.y);
  expect(parent.x + parent.width).toBeGreaterThanOrEqual(child.x + child.width);
  expect(parent.y + parent.height).toBeGreaterThanOrEqual(child.y + child.height);
});

test('v0.03.01j: периметр сжимается при свёртывании ЛГ и растёт при развёртывании', async ({ page }) => {
  const perimSize = () =>
    page.evaluate(() => {
      const el = document.querySelector(
        '.react-flow__node[data-id="__perimeter"]',
      ) as HTMLElement | null;
      return el ? { width: el.offsetWidth, height: el.offsetHeight } : null;
    });
  const before = (await perimSize())!;
  // Свёртывание lg-1: план и привод скрыты — периметр сжимается по ширине
  // (правая граница периметра держалась на приводе, x до 1670).
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(0);
  const after = (await perimSize())!;
  expect(after.width).toBeLessThan(before.width);
  // Развёртывание возвращает периметр.
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  const restored = (await perimSize())!;
  expect(restored.width).toBeCloseTo(before.width, 0);
});

test('v0.03.01j: развёртывание ЛГ с автораздвижением — без наложения на соседей', async ({ page }) => {
  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
  const overlap = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;

  // 1. Свёртывание lg-1; свёрнутый блок тащится под blk-perc и правее —
  //    развёрнутая рамка (охват членов с отступом 24) обязана наложиться
  //    на blk-perc. Плашка остаётся на свободном месте (ниже blk-perc) —
  //    её тумблер доступен (рамки ЛГ рисуются под доменами).
  await page.getByTestId('lg-toggle-lg-1').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
  const percBefore = await box('[data-block-id="blk-perc"]');
  // Масштаб канвы: экранные пиксели = модельные × zoom.
  const zoom = await page.evaluate(() => {
    const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    const m = vp?.style.transform.match(/scale\(([\d.]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  });
  const chip = page.getByTestId('lg-chip-lg-1');
  const chipBox = (await chip.boundingBox())!;
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    chipBox.x + chipBox.width / 2 - 320 * zoom,
    chipBox.y + chipBox.height / 2 + 410 * zoom,
    { steps: 8 },
  );
  await page.mouse.up();

  // 2. Развёртывание: рамка lg-1 раздвигает поддерево сама — ручной перенос
  //    не требуется; члены видны, наложения на blk-perc нет. Тумблер
  //    нажимается DOM-кликом: свёрнутая плашка может оказаться под доменом
  //    (рамки ЛГ ниже доменов по z-порядку), проверяется логика раздвижения.
  await page.evaluate(() => {
    (document.querySelector('[data-testid="lg-toggle-lg-1"]') as HTMLElement | null)?.click();
  });
  await expect(page.locator('[data-block-id="blk-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="blk-drive"]')).toHaveCount(1);
  const frame = (await box('[data-lg-id="lg-1"]')) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const perc = (await box('[data-block-id="blk-perc"]')) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  expect(overlap(frame, perc)).toBe(false);
  // На link тоже не накладывается.
  const link = (await box('[data-block-id="blk-link"]')) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  expect(overlap(frame, link)).toBe(false);
  // Одна операция истории: Ctrl+Z возвращает свёрнутость и прежние позиции.
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-lg-id="lg-1"][data-lg-collapsed="true"]')).toHaveCount(1);
});
