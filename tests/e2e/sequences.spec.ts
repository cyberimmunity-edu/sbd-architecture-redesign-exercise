/**
 * E2E-тесты режима «Диаграммы последовательности» — кейсы T-U-01… раздела
 * 9.3 ТЗ v0.02.01: переключение режимов; создание и удаление ДП (с
 * подтверждением); drag домена из набора → линия жизни (набор содержит ровно
 * домены ДАП — П-12); стрелки обеих направленностей и self; перенос стрелки
 * (автонумерация обновляется); блоки: цикл и условный блок (диалог, разделитель
 * веток), разгруппировка, удаление со стрелками; валидация: расхождение →
 * «Добавить недостающие связи в ДАП» → без расхождений; секция неиспользуемых
 * доменов; импорт/экспорт sequences.yaml и PlantUML (круговая); сквозной
 * сценарий 9.1 (генерация → отображение → экспорт → импорт → «Проверить ДП»);
 * опция «Цвета из ДАП»; регрессия ДАП; v0.02.01b: горячий фильтр набора
 * доменов (Ф-66), «Очистить ДП» с подтверждением (Ф-64), набрасывание
 * ЦБ на канву (Ф-65).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURES = resolve(__dirname, '../fixtures');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('demo-project')).toBeVisible();
});

/** Загрузка ДАП сквозного сценария (22 блока: 18 внутренних, 4 внешние). */
async function loadDap22(page: Page) {
  await page.getByTestId('file-state').setInputFiles(resolve(FIXTURES, 'vessel-full/state.yaml'));
  await page.waitForTimeout(600);
  await page.getByTestId('mode-sequence').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('seq-left-panel')).toBeVisible();
}

/** Жест создания стрелки: от полосы источника к полосе приёмника. */
async function gestureArrow(page: Page, fromId: string, toId: string) {
  const from = (await page.getByTestId(`seq-lifeline-band-${fromId}`).boundingBox())!;
  const to = (await page.getByTestId(`seq-lifeline-band-${toId}`).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Сброс карточки домена из набора на канву в долю ширины канвы.
 *  Диспетчеризация HTML5 DnD (как в view.spec dropCard): реальное наведение
 *  чувствительно к обрезке карточек прокруткой «Набора доменов» — hit-тест
 *  Playwright промахивается по обрезанной карточке (v0.02.02). */
async function dragDomain(page: Page, blockId: string, fraction: number) {
  const box = (await page.getByTestId('seq-canvas').boundingBox())!;
  const x = Math.max(80, Math.min(Math.round(box.width * fraction), box.width - 60));
  const y = Math.min(Math.round(box.height * 0.4), box.height - 80);
  const dataTransfer = await page.evaluateHandle((id) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', `skib-domain:${id}`);
    return dt;
  }, blockId);
  const card = page.locator(`[data-testid="seq-domain-card-${blockId}"]`);
  const clientX = Math.round(box.x + x);
  const clientY = Math.round(box.y + y);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await page.getByTestId('seq-canvas').dispatchEvent('dragover', { dataTransfer, clientX, clientY });
  await page.getByTestId('seq-canvas').dispatchEvent('drop', { dataTransfer, clientX, clientY });
  await card.dispatchEvent('dragend', { dataTransfer });
  await page.waitForTimeout(400);
}

test('T-U-01: переключение режимов сохраняет данные; кнопки ДАП отключены в режиме ДП', async ({ page }) => {
  await loadDap22(page);
  await expect(page.getByTestId('seq-canvas')).toBeVisible();
  await expect(page.getByTestId('add-domain')).toBeDisabled();
  await expect(page.getByTestId('add-external')).toBeDisabled();
  // Опция «Цвета из ДАП» видна в режиме ДП и скрыта в режиме ДАП.
  await expect(page.getByTestId('seq-colors-toggle')).toBeVisible();
  await page.getByTestId('mode-architecture').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('add-domain')).toBeEnabled();
  await expect(page.getByTestId('seq-colors-toggle')).toHaveCount(0);
  // Возврат в ДП — данные не потеряны.
  await page.getByTestId('mode-sequence').click();
  await page.getByTestId('seq-create').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('seq-item-seq-1')).toBeVisible();
  await page.getByTestId('mode-architecture').click();
  await page.waitForTimeout(300);
  await page.getByTestId('mode-sequence').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('seq-item-seq-1')).toBeVisible();
});

test('T-U-02: drag домена из набора создаёт линию жизни; повтор блокируется; набор — домены ДАП (П-12)', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await page.waitForTimeout(300);
  // Карточек в наборе — ровно 22 (все домены ДАП).
  await expect(page.locator('[data-testid^="seq-domain-card-"]')).toHaveCount(22);
  // Drag двух доменов на канву.
  await dragDomain(page, 'blk-radio', 0.35);
  await dragDomain(page, 'blk-ota', 0.6);
  await expect(page.getByTestId('seq-lifeline-header-blk-radio')).toBeVisible();
  await expect(page.getByTestId('seq-lifeline-header-blk-ota')).toBeVisible();
  // Полнoе название с номером на линии жизни (Ф-36).
  await expect(page.getByTestId('seq-lifeline-header-blk-radio')).toContainText('10. Радиосвязь');
  // Внешняя система — с бейджем «внешняя».
  await dragDomain(page, 'ext-shore', 0.85);
  await expect(page.getByTestId('seq-lifeline-header-ext-shore')).toContainText('внешняя');
  // Карточка включённого домена помечена «в ДП» и приглушена.
  await expect(page.getByTestId('seq-domain-card-blk-radio')).toHaveAttribute('data-in-sequence', 'true');
});

test('T-U-03: удаление ДП с подтверждением (имя и число стрелок в диалоге)', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await page.waitForTimeout(300);
  await page.getByTestId('seq-delete-seq-1').click();
  await expect(page.locator('[role="alertdialog"]')).toContainText('ДП «Новая ДП»');
  await expect(page.locator('[role="alertdialog"]')).toContainText('0 стрелками');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('seq-item-seq-1')).toHaveCount(0);
});

test('T-U-04: стрелки обеих направленностей и self; автонумерация; перенос стрелки', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await dragDomain(page, 'blk-radio', 0.35);
  await dragDomain(page, 'blk-ota', 0.6);

  // Прямая стрелка radio → ota.
  await gestureArrow(page, 'blk-radio', 'blk-ota');
  // Self-стрелка на ota.
  const band = (await page.getByTestId('seq-lifeline-band-blk-ota').boundingBox())!;
  await page.mouse.move(band.x + band.width / 2, band.y + 45);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  // Обратная стрелка ota → radio (справа налево).
  await gestureArrow(page, 'blk-ota', 'blk-radio');
  await expect(page.locator('[data-testid^="seq-arrow-a-"]')).toHaveCount(3);
  await expect(page.getByTestId('seq-arrow-a-1')).toHaveAttribute('data-arrow-number', '1');
  await expect(page.getByTestId('seq-arrow-a-3')).toHaveAttribute('data-arrow-number', '3');

  // Перенос третьей стрелки на первую позицию — нумерация обновляется сразу.
  // Захват — в середине сегмента (у полос линии жизни начинается их жест).
  const third = (await page.getByTestId('seq-arrow-a-3').boundingBox())!;
  const first = (await page.getByTestId('seq-arrow-a-1').boundingBox())!;
  await page.mouse.move(third.x + third.width / 2, third.y + 20);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2, first.y + 4, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const numbers = await page.locator('[data-testid^="seq-arrow-a-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-arrow-number')),
  );
  expect(numbers).toEqual(['1', '2', '3']);
  // После переноса первый элемент — бывшая третья стрелка (rev с ota на radio).
  const firstId = await page.locator('[data-testid^="seq-arrow-a-"]').first().getAttribute('data-testid');
  expect(firstId).toBe('seq-arrow-a-3');
});

test('T-U-05: блоки — цикл и условный блок с разделителем веток; разгруппировка; удаление со стрелками', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await dragDomain(page, 'blk-radio', 0.35);
  await dragDomain(page, 'blk-ota', 0.6);
  await gestureArrow(page, 'blk-radio', 'blk-ota');
  await gestureArrow(page, 'blk-radio', 'blk-ota');
  await gestureArrow(page, 'blk-radio', 'blk-ota');
  await gestureArrow(page, 'blk-radio', 'blk-ota');

  // Цикл из первых двух стрелок.
  await page.getByTestId('seq-arrow-a-1').click();
  await page.getByTestId('seq-arrow-a-2').click({ modifiers: ['Shift'] });
  await page.getByTestId('seq-toolbar-loop').click();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid^="seq-block-frame-"]')).toHaveCount(1);
  await expect(page.locator('[data-block-kind="loop"]')).toHaveCount(1);

  // Несмежное выделение не образует блок (подсказка).
  await page.getByTestId('seq-arrow-a-1').click();
  await page.getByTestId('seq-arrow-a-4').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-testid="seq-toolbar"]')).toContainText('подряд идущих');

  // Условный блок из стрелок 3–4: диалог, граница else, разделитель веток.
  await page.getByTestId('seq-arrow-a-3').click();
  await page.getByTestId('seq-arrow-a-4').click({ modifiers: ['Shift'] });
  await page.getByTestId('seq-toolbar-cond').click();
  await page.fill('[data-testid="seq-cond-condition"]', 'подлинность подтверждена');
  await page.fill('[data-testid="seq-cond-then"]', 'нормальное обновление');
  await page.fill('[data-testid="seq-cond-else"]', 'нарушение подлинности');
  await page.getByTestId('seq-cond-apply').click();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-block-kind="cond"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="seq-block-else-divider-"]')).toHaveCount(1);

  // Инспектор условного блока: условие и подписи веток (значения полей).
  await expect(page.getByTestId('seq-block-condition')).toHaveValue('подлинность подтверждена');
  await expect(page.getByTestId('seq-block-then-label')).toHaveValue('нормальное обновление');
  await expect(page.getByTestId('seq-block-else-label')).toHaveValue('нарушение подлинности');
  await expect(page.getByTestId('seq-inspector-block')).toContainText('Ветка «то»: 1');
  await expect(page.getByTestId('seq-inspector-block')).toContainText('Ветка «иначе»: 1');

  // Разгруппировка цикла — стрелки остаются.
  await page.locator('[data-testid^="seq-block-label-"]').first().click();
  await page.waitForTimeout(200);
  await page.getByTestId('seq-ungroup').click();
  await page.waitForTimeout(200);
  await expect(page.locator('[data-block-kind="loop"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="seq-arrow-a-"]')).toHaveCount(4);

  // Удаление условного блока со стрелками (с подтверждением).
  await page.locator('[data-block-kind="cond"] [data-testid^="seq-block-label-"]').click();
  await page.waitForTimeout(200);
  await page.getByTestId('seq-delete-block').click();
  await expect(page.locator('[role="alertdialog"]')).toContainText('подлинность подтверждена');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid^="seq-arrow-a-"]')).toHaveCount(2);
});

test('T-U-06: валидация — расхождение направления E-601 → «Добавить недостающие связи в ДАП» → чисто; W-008', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  // Связь на ДАП: blk-radio → blk-ota. Создаём РЕВЕРС — расхождение (П-3).
  await dragDomain(page, 'blk-radio', 0.35);
  await dragDomain(page, 'blk-ota', 0.6);
  await gestureArrow(page, 'blk-ota', 'blk-radio');
  await page.getByTestId('seq-check').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('seq-validation-table')).toContainText('E-601');
  await expect(page.getByTestId('seq-validation-table')).toContainText('06. Подсистема OTA-обновления → 10. Радиосвязь');
  // Кнопка исправления появляется и применяется глобально.
  await page.getByTestId('seq-add-missing-edges').click();
  await page.waitForTimeout(300);
  // После исправления E-601 нет: кнопка исчезла, осталась информационная секция W-008.
  await expect(page.getByTestId('seq-add-missing-edges')).toHaveCount(0);
  await expect(page.locator('[data-testid="seq-validation"]')).toContainText('Неиспользуемые домены');
  await expect(page.locator('[data-testid="seq-validation"]')).toContainText('W-008');
  // Связь появилась на ДАП в правильном направлении.
  await page.getByTestId('mode-architecture').click();
  await page.waitForTimeout(400);
  await page.getByTestId('mode-sequence').click();
  await page.waitForTimeout(300);
  await page.getByTestId('seq-check').click();
  await page.waitForTimeout(300);
  // Таблицы расхождений нет и после смены режима.
  await expect(page.getByTestId('seq-validation-table')).toHaveCount(0);
});

test('T-U-07: импорт/экспорт sequences.yaml и PlantUML — круговая проверка', async ({ page }) => {
  await loadDap22(page);
  // Импорт sequences.yaml образца (обе ДП).
  await page.getByTestId('file-sequences').setInputFiles(resolve(FIXTURES, 'vessel/sequences.yaml'));
  await page.waitForTimeout(600);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('Удалённое обновление прошивки');
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('9 лин./13 стрел.');
  await expect(page.getByTestId('seq-item-seq-2')).toContainText('12 лин./21 стрел.');
  // Отображение: линии жизни с номерами, рамки циклов и ветвления.
  await expect(page.getByTestId('seq-lifeline-header-dom-5')).toContainText('15. Верификация и применение обновления прошивки');
  await expect(page.locator('[data-block-kind="loop"]')).toHaveCount(1);
  await expect(page.locator('[data-block-kind="cond"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="seq-block-else-divider-"]')).toHaveCount(1);
  // Номера стрелок 1..13.
  const numbers = await page.locator('[data-testid^="seq-arrow-a-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-arrow-number')),
  );
  expect(numbers).toEqual(Array.from({ length: 13 }, (_, i) => String(i + 1)));

  // Экспорт sequences.yaml и обратный импорт — данные сохраняются.
  const yamlDownload = page.waitForEvent('download');
  await page.getByTestId('seq-export-yaml').click();
  const yamlFile = await yamlDownload;
  const yamlPath = await yamlFile.path();
  const yamlText = readFileSync(yamlPath!, 'utf8');
  expect(yamlText).toContain('Удалённое обновление прошивки');
  expect(yamlText).toContain('elseFrom: a-9');

  await page.getByTestId('file-sequences').setInputFiles(yamlPath!);
  await page.waitForTimeout(600);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('13 стрел.');

  // Экспорт PlantUML выбранной ДП → файл «Удалённое обновление прошивки.puml».
  const pumlDownload = page.waitForEvent('download');
  await page.getByTestId('seq-export-puml').click();
  const pumlFile = await pumlDownload;
  expect(pumlFile.suggestedFilename()).toBe('Удалённое обновление прошивки.puml');
  const pumlText = readFileSync((await pumlFile.path())!, 'utf8');
  expect(pumlText).toContain('autonumber');
  expect(pumlText).toContain('participant "10. Радиосвязь" as blk-radio');
  expect(pumlText).toContain('loop до получения полного образа #1E88E5');
  expect(pumlText).toContain('if (подлинность прошивки подтверждена) then (нормальное обновление)');
  expect(pumlText).toContain('else (нарушение подлинности)');

  // Обратный импорт PlantUML добавляет третью ДП.
  await page.getByTestId('file-seq-puml').setInputFiles((await pumlFile.path())!);
  await page.waitForTimeout(600);
  await expect(page.getByTestId('seq-left-panel')).toContainText('Импортированная ДП');
  await expect(page.getByTestId('seq-left-panel')).toContainText('13 стрел.');
});

test('T-U-08: сквозной сценарий 9.1 — «Проверить ДП» без расхождений на ДАП сквозного сценария', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('file-sequences').setInputFiles(resolve(FIXTURES, 'vessel/sequences.yaml'));
  await page.waitForTimeout(600);
  await page.getByTestId('seq-check').click();
  await page.waitForTimeout(400);
  // E-601 нет: все стрелки обеих ДП опираются на связи ДАП (W-008 — информационно).
  await expect(page.getByTestId('seq-validation-table')).toHaveCount(0);
  await expect(page.getByTestId('seq-add-missing-edges')).toHaveCount(0);
  await expect(page.locator('[data-testid="seq-validation"]')).toContainText('Неиспользуемые домены');
});

test('T-U-09: опция «Цвета из ДАП» перекрашивает линии жизни и стрелки, выключение возвращает нейтральный вид', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  // Береговой пост (СУДС) — доверенная внешняя (зелёная); Радиосвязь — ДДБПЦД (жёлтая).
  await dragDomain(page, 'ext-shore', 0.35);
  await dragDomain(page, 'blk-radio', 0.6);
  await gestureArrow(page, 'ext-shore', 'blk-radio');

  const headerColorBefore = await page.getByTestId('seq-lifeline-header-ext-shore').evaluate((el) => getComputedStyle(el).borderColor);
  await page.getByTestId('seq-colors-toggle').click();
  await page.waitForTimeout(400);
  const headerColorAfter = await page.getByTestId('seq-lifeline-header-ext-shore').evaluate((el) => getComputedStyle(el).borderColor);
  expect(headerColorAfter).not.toBe(headerColorBefore);
  // Доверенная внешняя — зелёная рамка.
  expect(headerColorAfter).toContain('67, 160, 71');
  // Стрелка из доверенного источника — зелёная.
  const strokeColor = await page.locator('[data-testid^="seq-arrow-a-"] svg line').evaluate((el) => getComputedStyle(el).stroke);
  expect(strokeColor).toContain('67, 160, 71');
  // Выключение возвращает нейтральный вид.
  await page.getByTestId('seq-colors-toggle').click();
  await page.waitForTimeout(400);
  const headerColorNeutral = await page.getByTestId('seq-lifeline-header-ext-shore').evaluate((el) => getComputedStyle(el).borderColor);
  expect(headerColorNeutral).toBe(headerColorBefore);
});

test('T-U-10: регрессия ДАП не сломана — декомпозиция и перенумерация работают после режима ДП', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await dragDomain(page, 'blk-radio', 0.35);
  // Возврат в ДАП: домены на канве с полными названиями.
  await page.getByTestId('mode-architecture').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.react-flow__node')).toHaveCount(23); // 22 блока + рамка периметра
  await expect(page.locator('.react-flow__node').filter({ hasText: '01. ' }).first()).toBeVisible();
  // «+ Домен» — очередной номер 19 (после 18 внутренних).
  await page.getByTestId('add-domain').click();
  await page.waitForTimeout(300);
  await page.getByTestId('mode-sequence').click();
  await page.waitForTimeout(300);
  // Набор доменов содержит 23 карточки, включая новый домен с номером 19.
  await expect(page.locator('[data-testid^="seq-domain-card-"]')).toHaveCount(23);
  await expect(page.locator('[data-testid^="seq-domain-card-"]').filter({ hasText: '19. Новый домен' })).toHaveCount(1);
});

test('T-U-11: горячий фильтр «Набора доменов» отбирает карточки по подстроке (Ф-66)', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await page.waitForTimeout(200);
  await expect(page.locator('[data-testid^="seq-domain-card-"]')).toHaveCount(22);
  // Подстрока без учёта регистра: «радио» — Радиосвязь и Радиоэфир.
  await page.getByTestId('seq-domains-filter').fill('радио');
  await page.waitForTimeout(200);
  const filtered = page.locator('[data-testid^="seq-domain-card-"]');
  await expect(filtered).toHaveCount(2);
  await expect(filtered.first()).toContainText('Радиосвязь');
  // Нет совпадений — сообщение; очистка фильтра возвращает весь набор.
  await page.getByTestId('seq-domains-filter').fill('нет-такого-домена');
  await expect(page.getByTestId('seq-domains-pool')).toContainText('Доменов по фильтру не найдено');
  await page.getByTestId('seq-domains-filter').fill('');
  await expect(page.locator('[data-testid^="seq-domain-card-"]')).toHaveCount(22);
  // Отфильтрованная карточка тянется на канву: линия жизни создаётся.
  await page.getByTestId('seq-domains-filter').fill('радио');
  await dragDomain(page, 'blk-radio', 0.35);
  await expect(page.getByTestId('seq-lifeline-header-blk-radio')).toBeVisible();
});

test('T-U-12: «Очистить ДП» с подтверждением — содержимое удаляется одним шагом истории (Ф-64)', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await page.waitForTimeout(200);
  // Для пустой ДП кнопка неактивна.
  await expect(page.getByTestId('seq-clear')).toBeDisabled();
  await dragDomain(page, 'blk-radio', 0.3);
  await dragDomain(page, 'blk-ota', 0.6);
  await gestureArrow(page, 'blk-radio', 'blk-ota');
  await expect(page.locator('[data-testid^="seq-arrow-a-"]')).toHaveCount(1);
  await expect(page.getByTestId('seq-clear')).toBeEnabled();
  await page.getByTestId('seq-clear').click();
  await page.waitForTimeout(300);
  // Подтверждение: имя и счётчики содержимого.
  await expect(page.getByText('Очистить ДП?')).toBeVisible();
  await expect(page.getByTestId('seq-cond-dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('0 лин./0 стрел.');
  await expect(page.locator('[data-testid^="seq-lifeline-header-"]')).toHaveCount(0);
  // Одна операция истории: Ctrl+Z возвращает линии жизни и стрелку.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid^="seq-lifeline-header-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="seq-arrow-a-"]')).toHaveCount(1);
});

/** Сброс карточки ЦБ на канву (диспетчеризация HTML5 DnD — v0.02.02). */
async function dropGoal(page: Page, goalId: string, x: number, y: number) {
  const box = (await page.getByTestId('seq-canvas').boundingBox())!;
  const dataTransfer = await page.evaluateHandle((id) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', `skib-goal:${id}`);
    return dt;
  }, goalId);
  const card = page.locator(`[data-testid="seq-goal-card-${goalId}"]`);
  const clientX = Math.round(box.x + x);
  const clientY = Math.round(box.y + y);
  await card.dispatchEvent('dragstart', { dataTransfer });
  await page.getByTestId('seq-canvas').dispatchEvent('dragover', { dataTransfer, clientX, clientY });
  await page.getByTestId('seq-canvas').dispatchEvent('drop', { dataTransfer, clientX, clientY });
  await card.dispatchEvent('dragend', { dataTransfer });
  await page.waitForTimeout(500);
}

test('T-U-13: набрасывание ЦБ — ДП по имени ЦБ, затем пополнение критичными доменами (Ф-65)', async ({ page }) => {
  await loadDap22(page);
  // ДП ещё нет: создаётся ДП с именем ЦБ и критичным доменом dom-5.
  await dropGoal(page, 'g-fw-authentic', 320, 220);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('Подлинность прошивок');
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('1 лин./0 стрел.');
  await expect(page.getByTestId('seq-lifeline-header-dom-5')).toBeVisible();
  // Вторая ЦБ: критичный домен dom-7 добавляется в текущую ДП.
  await dropGoal(page, 'g-id-authentic', 520, 220);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('2 лин./0 стрел.');
  await expect(page.getByTestId('seq-lifeline-header-dom-7')).toBeVisible();
  // Каждый наброс ЦБ — один шаг истории: Ctrl+Z отменяет второе добавление.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('1 лин./0 стрел.');
  await expect(page.getByTestId('seq-lifeline-header-dom-7')).toHaveCount(0);
});

test('T-U-14: вставка линии жизни в зазор между другими — индикатор и порядок (v0.02.02)', async ({ page }) => {
  await loadDap22(page);
  await page.getByTestId('seq-create').click();
  await page.waitForTimeout(300);
  await dragDomain(page, 'blk-radio', 0.3);
  await dragDomain(page, 'blk-ota', 0.75);
  await expect(page.getByTestId('seq-lifeline-header-blk-radio')).toBeVisible();
  await expect(page.getByTestId('seq-lifeline-header-blk-ota')).toBeVisible();

  // Сброс третьего домена в зазор между двумя линиями жизни: x — середина
  // между центрами заголовков; во время перетаскивания виден индикатор.
  const radio = (await page.getByTestId('seq-lifeline-header-blk-radio').boundingBox())!;
  const ota = (await page.getByTestId('seq-lifeline-header-blk-ota').boundingBox())!;
  const canvas = (await page.getByTestId('seq-canvas').boundingBox())!;
  const gapX = Math.round((radio.x + radio.width / 2 + ota.x + ota.width / 2) / 2);
  const gapY = Math.round(radio.y - canvas.y + radio.height / 2);

  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'skib-domain:blk-nav');
    return dt;
  });
  const card = page.locator('[data-testid="seq-domain-card-blk-nav"]');
  const canvasEl = page.getByTestId('seq-canvas');
  await card.dispatchEvent('dragstart', { dataTransfer });
  await canvasEl.dispatchEvent('dragover', { dataTransfer, clientX: gapX, clientY: gapY });
  // Индикатор зазора вставки виден во время перетаскивания (v0.02.02).
  await expect(page.getByTestId('seq-insert-marker')).toBeVisible();
  await canvasEl.dispatchEvent('drop', { dataTransfer, clientX: gapX, clientY: gapY });
  await card.dispatchEvent('dragend', { dataTransfer });
  await page.waitForTimeout(400);

  // Линия жизни встала между radio и ota, а не в конец: порядок по x
  // (позиции оцифровываются заново после вставки).
  const nav = (await page.getByTestId('seq-lifeline-header-blk-nav').boundingBox())!;
  const otaAfter = (await page.getByTestId('seq-lifeline-header-blk-ota').boundingBox())!;
  const radioAfter = (await page.getByTestId('seq-lifeline-header-blk-radio').boundingBox())!;
  expect(radioAfter.x).toBeLessThan(nav.x);
  expect(nav.x).toBeLessThan(otaAfter.x);
  await expect(page.getByTestId('seq-item-seq-1')).toContainText('3 лин./0 стрел.');
  // После сброса индикатор скрыт.
  await expect(page.getByTestId('seq-insert-marker')).toHaveCount(0);
});
