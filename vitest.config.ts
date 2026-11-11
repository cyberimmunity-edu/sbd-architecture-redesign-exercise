/**
 * Конфигурация unit-тестов — раздел 11.1–11.2 ТЗ. Движок и парсеры
 * (src/engine, src/io) — чистые функции без DOM. Пороги покрытия: engine и io
 * — не менее 90 % строк и ветвей; store — не менее 70 %
 * (адаптация порогов к среде исполнения описана в docs/developer-guide.md).
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts', 'src/io/**/*.ts', 'src/store/**/*.ts'],
      // Барелы index.ts без логики исключаются из подсчёта покрытия.
      exclude: ['src/**/index.ts'],
      thresholds: {
        // Глобальные пороги — engine и io (раздел 11.2).
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
        // Порог для слоя хранилища (интерфейс дополнительно проверяется E2E).
        'src/store/**': {
          lines: 70,
          branches: 70,
          functions: 70,
          statements: 70,
        },
      },
      reporter: ['text', 'json-summary'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
