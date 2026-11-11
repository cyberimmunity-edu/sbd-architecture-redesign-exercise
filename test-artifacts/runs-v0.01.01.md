# Журнал проверок v0.01.01 — 10.11.2026

| Проверка | Команда | Результат |
| --- | --- | --- |
| Типы | `npx tsc --noEmit` | 0 ошибок |
| Линт | `npm run lint` | 0 ошибок, 0 предупреждений |
| Unit + покрытие | `npm run test:unit:coverage` | 144/144 (11 файлов), пороги выполнены (см. coverage-summary.json) |
| E2E Chromium | `npx playwright test` | 11/11 (33.0s), порт PORT (по умолчанию 3000) |
| E2E Firefox | `npx playwright test tests/e2e/load.spec.ts -c playwright.firefox.config.ts` | 3/3 (16.6s) |
| E2E альтернативный порт | `PORT=4321 npx playwright test tests/e2e/load.spec.ts` | 3/3 (13.8s) |
| Production-сборка | `npm run build` | успешно; начальный пакет 393 КБ gzip (НФ-2 ≤ 1 МБ) |
| Вето-контроль | `grep -rni сложност src tests docs samples` | 0 совпадений |
| НФ-4 | анализ `src/` | 0 внешних запросов (fetch/XHR/WebSocket/sendBeacon) |
