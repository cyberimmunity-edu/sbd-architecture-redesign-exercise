#!/usr/bin/env node
/**
 * CLI «skib» — входная точка (v0.03.01). Регистрирует резолвер расширений
 * TypeScript и передаёт управление cli/main.ts. Работа без сборки и без
 * установки зависимостей сверх package.json; Node ≥ 24 — напрямую,
 * Node 22.12+ — с флагом --experimental-strip-types.
 */
import { register } from 'node:module';

register(new URL('./ts-hook.mjs', import.meta.url));

const { run } = await import('./main.ts');
process.exitCode = await run(process.argv.slice(2));
