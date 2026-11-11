/**
 * Конфигурация E2E-тестов — раздел 11.3 ТЗ: Chromium, окно 1280×800,
 * при падении сохраняются скриншот и trace. WebServer повторно использует
 * запущенный dev-сервер приложения; порт берётся из переменной окружения
 * PORT (по умолчанию 3000) — как в скрипте dev из package.json.
 */

import { defineConfig, devices } from '@playwright/test';

const port = process.env.PORT || '3000';
// Локальная среда без установленного headless-shell нужной ревизии может
// указать полный Chromium через SKIB_CHROMIUM_PATH (в CI не используется):
// SKIB_CHROMIUM_PATH=/путь/chrome make test-e2e
const chromiumPath = process.env.SKIB_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
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
    command: 'bun run dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
