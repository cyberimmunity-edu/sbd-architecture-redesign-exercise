# Руководство тестировщика

Версия соответствует 0.01.05. Стратегия и обязательные кейсы — раздел 11 ТЗ v0.01.01.

## 1. Пирамида тестов

- **Unit (Vitest, `tests/unit/`)** — движок, парсеры и хранилище: стоимость
  с коэффициентом доверия (T-C-01…12), модель доверия (T-T-01…10), покрытие
  (T-P-01…09), architecture.yaml (T-Y-01…10), security.yaml и state.yaml
  (T-Y-06…08, T-S-01…03), PlantUML со стереотипами external (T-U-01…06),
  декомпозиция (T-D-01…04), лимиты (Ф-17), история (Ф-21), фикстуры примеров 1 и 2
  (контрольные числа 486 и 943; пример 2 с доработки v0.01.05 — 10 доменов,
  9 целей ПЛО, 2 предположения, 10 механизмов), фикстуры invalid/ (приёмка 14.2.5
  и E-208), НФ-1 (пересчёт < 100 мс на модели 200×500×100).
- **E2E (Playwright, `tests/e2e/`)** — интерфейс: Э-01…Э-09 (включая Э-02b и
  Э-06b) против dev-сервера (порт `PORT`, по умолчанию 3000), Chromium 1280×800;
  при падении сохраняются скриншот и trace.

Пороги покрытия (`make test-unit-coverage`): `src/engine` и `src/io` — не менее
90 % строк и ветвей; `src/store` — не менее 70 %. Пороги зашиты в
`vitest.config.ts` и нарушают сборку при недостижении.

## 2. Запуск

```bash
make test-unit            # unit-тесты
make test-unit-coverage   # с отчётом coverage/
make test-e2e             # Playwright (dev-сервер на PORT, по умолчанию 3000:
                          # конфигурация наследует PORT, webServer переиспользует
                          # запущенный сервер или поднимает свой на том же порту)
make test                 # unit, затем E2E
make check                # проверка Makefile + lint + test — полная проверка перед сдачей
make check-makefile       # только синтаксическая проверка Makefile (сухой прогон целей)

# Приёмочная проверка в Firefox — пункт 10 чек-листа приёмки 14.2 ТЗ
# (сценарии Э-01, Э-03, Э-04; регулярный набор 11.3 остаётся на Chromium):
npx playwright install firefox   # однократно
npx playwright test tests/e2e/load.spec.ts -c playwright.firefox.config.ts
```

Правило проекта: тесты и проверки запускаются только через make — каждый
запуск make одновременно проверяет и сам Makefile. Правило введено после
регрессии v0.01.04: табуляция в рецептах Makefile была заменена 8 пробелами,
make падал с «missing separator», а прямые npm-запуски этого не выявляли.
На случай повтора табуляцию страхует unit-тест `makefile.test.ts`,
восстановление — `python3 scripts/fix_makefile_tabs.py`.

## 3. Структура тестов и фикстур

```text
tests/unit/     cost.test.ts (T-C-01…12), trust.test.ts (T-T-01…10), coverage.test.ts,
                archYaml.test.ts, securityYaml.test.ts, plantuml.test.ts,
                decompose.test.ts, store.test.ts, viewStore.test.ts (вид канвы v0.01.02),
                fixtures.test.ts, api.test.ts, edge.test.ts,
                makefile.test.ts (синтаксис Makefile: табуляция рецептов,
                .PHONY, сухой прогон make -n — правило «проверки через make»)
tests/e2e/      load.spec.ts (Э-01,03,04), coverage.spec.ts (Э-06,06b),
                decompose.spec.ts (Э-05), persistence.spec.ts (Э-07),
                export.spec.ts (Э-02,02b,08,09), view.spec.ts (вид и справка v0.01.02)
tests/fixtures/ robot/ — пример 1 (14.4.1, Приложения А–В и state.yaml шага 1);
                vessel/ — пример 2 (14.4.2; доработка v0.01.05 — ПЛО и предположения);
                invalid/ — по одному дефекту на файл (E-001…E-401, включая E-208)
```

Строки-источник данных примеров — `src/samples/robot/content.ts` и
`src/samples/vessel/content.ts`; файлы фикстур генерируются скриптом
`scripts/emit-fixtures.ts` и сверяются `fixtures.test.ts` (несоответствие — ошибка сборки).

Разбор типового unit-теста (`tests/unit/cost.test.ts`, T-C-04): функция
`domainCost(block, funcsIn, eIn, eOut, trust)` вызывается с блоком стоимости 4,
функциями 3+4 (S = 7), E = 3 и классом доверия ДДБ; ожидается `M = 1.5`,
`K = 5` и `C_домена = 210` (4 × 7 × 1.5 × 5) — числа зафиксированы разделами
3.3 и 3.5 ТЗ v0.01.01. Кейс T-C-09 воспроизводит шаг 1 примера 1 (14.4.1):
C_системы = 486.

## 4. Как добавить новый кейс

Шаблон unit-теста:

```ts
import { describe, expect, it } from 'vitest';
import { domainCost } from '@/engine/cost';

describe('Модель стоимости', () => {
  it('T-C-13: <условие>', () => {
    // K — класс доверия: 'ndb' (0.1) | 'ddb' (5) | 'ddbpcd' (10).
    const result = domainCost({ cost: 2 }, [{ id: 'f', name: 'Ф', cost: 3 }], 2, 1, 'ddb');
    expect(result.domainCost).toBe(45); // ceil(2 × 3 × 1.5 × 5)
  });
});
```

Шаблон E2E-сценария — см. `tests/e2e/load.spec.ts`: beforeEach очищает
localStorage и загружает демо; размещение карточки выполняется помощником
`dropCard` (HTML5 drag and drop через DataTransfer).

## 5. Отладка падений E2E

- Отчёт: `bunx playwright show-trace test-results/<каталог>/trace.zip`.
- Скриншот падения — `test-results/**/test-failed-*.png`.
- Лог dev-сервера — `dev.log` (порт `PORT`, по умолчанию 3000).
- Частые причины: dev-сервер не запущен (запустите `make dev`); параллельный запуск
  двух dev-серверов на разных портах — второй не получит блокировку `.next/dev/lock`
  (остановите первый или переиспользуйте его через `reuseExistingServer`); перезагрузка
  страницы раньше отложенного автосохранения (Ф-22 допускает задержку до 1 с —
  добавьте `waitForTimeout(1300)` перед `reload`, как в Э-07).

## 6. Шаблон отчёта о дефекте

```markdown
## Дефект: <краткое название>
- Версия: 0.01.02 (коммит/тег)
- Компонент: engine | io | store | ui | e2e
- Серьёзность: блокирующая | существенная | незначительная
- Шаги воспроизведения:
  1. ...
- Ожидаемый результат: ...
- Фактический результат: ...
- Файл-фикстура: tests/fixtures/... (если применимо)
- Логи/скриншоты/trace: ссылки на артефакты
```
