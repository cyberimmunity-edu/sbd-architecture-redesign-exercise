/**
 * Э-02 (загрузка файлов через диалоги), Э-08 (экспорт и повторный импорт),
 * Э-09 (некорректный файл не изменяет проект).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURES = resolve(__dirname, '../fixtures');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('demo-project')).toBeVisible();
});

async function loadRobot(page: import('@playwright/test').Page) {
  await page.getByTestId('demo-project').click();
  await page.getByTestId('demo-robot').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
}

test('Э-02: загрузка architecture.yaml и security.yaml через диалоги', async ({ page }) => {
  await page.getByTestId('file-architecture').setInputFiles(resolve(FIXTURES, 'robot/architecture.yaml'));
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
  await expect(page.getByTestId('summary-bar')).toContainText('размещено 0 из 0 функций');

  await page.getByTestId('file-security').setInputFiles(resolve(FIXTURES, 'robot/security.yaml'));
  await expect(page.getByTestId(/^pool-card-/)).toHaveCount(7);
  await expect(page.getByTestId('summary-bar')).toContainText('размещено 0 из 7 функций');
  // Предупреждений у демо-комплекта нет, индикатор валидации — зелёный.
  await expect(page.locator('header')).toContainText('Валидация: чисто');
});

test('Э-02b: загрузка архитектуры из PlantUML эквивалентна YAML (Ф-3), включая внешние системы', async ({ page }) => {
  await page.getByTestId('file-puml').setInputFiles(resolve(FIXTURES, 'robot/architecture.puml'));
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
  await expect(page.getByTestId('summary-bar')).toContainText('внешние системы: 2');
});

test('Э-08: экспорт state.yaml и повторный импорт дают эквивалентный проект', async ({ page }) => {
  await loadRobot(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-menu').click();
  await page.getByTestId('export-state').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(download.suggestedFilename()).toBe('state.yaml');

  const exported = readFileSync(path!, 'utf8');
  expect(exported).toContain('version: 1');
  expect(exported).toContain('assignments:');
  expect(exported).toContain('external: true');

  // После перезагрузки импортируем тот же файл: проект эквивалентен (6.6).
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId('file-state').setInputFiles(path!);
  // Проект пуст → замена без подтверждения (Ф-25).
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
});

test('Э-09: некорректный YAML — панель ошибок с кодами, проект не изменён', async ({ page }) => {
  await loadRobot(page);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');

  await page
    .getByTestId('file-architecture')
    .setInputFiles(resolve(FIXTURES, 'invalid/e102-negative-cost.yaml'));

  const panel = page.getByTestId('validation-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('E-102');
  await expect(panel).toContainText('Ошибки — файл не применён');
  // Текущий проект не изменён (Ф-6).
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.getByTestId('summary-bar')).toContainText('C_системы: 4');
  // Индикатор валидации в верхней панели — красный.
  await expect(page.locator('header')).toContainText('Ошибки');
});
