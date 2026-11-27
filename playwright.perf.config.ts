/**
 * Конфигурация теста производительности (v0.03.01j): тесты perf.spec.ts
 * выполняются против ПРОИЗВОДСТВЕННОЙ статической сборки out/ (next build),
 * потому что бюджеты запроса (импорт ≤ 2 с, свёртывание/развёртывание/
 * перемещение ЛГ ≤ 1 с, экспорт ≤ 1 с) определены для боевого приложения;
 * dev-сервер добавлял бы собственные накладные расходы React.
 * Запуск: make test-perf (сначала next build, затем serve out).
 */

import { defineConfig, devices } from '@playwright/test';

const port = process.env.PORT || '3100';
const chromiumPath = process.env.SKIB_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/perf.spec.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/perf-report.json' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    screenshot: 'off',
    trace: 'off',
    locale: 'ru-RU',
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath, args: ['--no-sandbox'] } }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx --yes serve out -s -l ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
