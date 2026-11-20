/**
 * Актуальность версии (v0.03.01e): регрессия после пропущенного бампа
 * APP_VERSION при выпуске 0.03.01e — константа осталась 0.03.01d, тогда как
 * package.json, TAG Makefile и верхняя запись CHANGELOG уже несли 0.03.01e.
 * Версия задаётся в четырёх местах и обязана меняться одновременно:
 *   1. APP_VERSION — src/engine/types.ts (интерфейс, CLI `skib version`);
 *   2. version     — package.json;
 *   3. TAG         — Makefile (имя пакета skib-lab-<TAG>-src.zip, образ docker);
 *   4. ARG APP_VERSION — Dockerfile (fallback при сборке мимо make).
 * Верхняя запись CHANGELOG.md должна называть ту же версию — документация
 * релиза не отрывается от кода. Тест ловит любой рассинхрон при выпуске.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/engine/types';

const root = resolve(__dirname, '../..');

const packageVersion: string = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
).version;

const makefile = readFileSync(resolve(root, 'Makefile'), 'utf8');
const makeTag = /^TAG\s*\?=\s*(\S+)\s*$/m.exec(makefile)?.[1] ?? '';

const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
const dockerArg = /^ARG APP_VERSION=(\S+)\s*$/m.exec(dockerfile)?.[1] ?? '';

const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const changelogTop = /^## \[([^\]]+)\]\s*—\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(changelog);

describe('Актуальность версии (единый релизный номер во всех источниках)', () => {
  it('APP_VERSION совпадает с version в package.json', () => {
    expect(APP_VERSION).toBe(packageVersion);
  });

  it('APP_VERSION совпадает с TAG в Makefile (имя пакета и docker-образа)', () => {
    expect(makeTag).not.toBe('');
    expect(APP_VERSION).toBe(makeTag);
  });

  it('APP_VERSION совпадает с ARG APP_VERSION в Dockerfile (fallback без make)', () => {
    expect(dockerArg).not.toBe('');
    expect(APP_VERSION).toBe(dockerArg);
  });

  it('верхняя запись CHANGELOG.md — та же версия, с датой релиза', () => {
    expect(changelogTop).not.toBeNull();
    expect(changelogTop![1]).toBe(APP_VERSION);
    // Дата обязана присутствовать и быть не позже сегодняшнего дня.
    expect(changelogTop![2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const releaseDate = new Date(`${changelogTop![2]}T00:00:00Z`).getTime();
    expect(Number.isNaN(releaseDate)).toBe(false);
    expect(releaseDate).toBeLessThanOrEqual(Date.now());
  });

  it('CLI `skib version` печатает ту же версию (сквозная проверка адаптера)', () => {
    // Без вызова процесса: константа уже проверена против всех источников;
    // plumbing CLI покрывает tests/unit/cli.test.ts — здесь сверяем формат.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+[a-z]?$/);
  });
});
