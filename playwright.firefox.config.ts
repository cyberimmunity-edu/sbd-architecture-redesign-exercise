/**
 * Конфигурация приёмочной проверки в Firefox — пункт 10 чек-листа приёмки 14.2 ТЗ
 * («сценарии Э-01–Э-03 выполняются в Chrome и Firefox»). Регулярный прогон E2E
 * остаётся на Chromium (раздел 11.3); этот конфиг запускается отдельно:
 *   npx playwright test tests/e2e/load.spec.ts -c playwright.firefox.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'ru-RU',
  },
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
