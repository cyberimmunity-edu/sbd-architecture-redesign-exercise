# Руководство разработчика

Версия соответствует 0.01.04. Слои и запреты — раздел 8.2 ТЗ; структура каталогов —
Приложение Д ТЗ; модель доверия — раздел 3.5 ТЗ.

## 1. Архитектура слоёв и поток данных

```text
src/engine/   чистые функции модели: типы, включая external/trusted (types.ts),
              стоимость с коэффициентом доверия K (cost.ts, 7.1), модель доверия
              и рамка периметра (trust.ts, 3.5), покрытие (coverage.ts, 7.2),
              декомпозиция (decompose.ts, 7.3), лимиты (limits.ts, Ф-17).
              Без DOM, localStorage и сети.
src/io/       парсеры и сериализаторы четырёх форматов: archYaml.ts, securityYaml.ts,
              plantuml.ts (стереотипы <<external>>/<<external-trusted>>), stateFile.ts;
              zod-схемы (schema.ts); реестр кодов E/W (errors.ts); семантическая
              валидация (validate.ts). Без React и DOM.
src/store/    projectStore.ts — zustand-хранилище: проект, история операций
              (снимки, глубина 100), автосохранение в localStorage,
              addExternalDomain/updateDomain (trusted).
src/ui/       компоненты React (TopBar с переключателем темы, PoolPanel, GoalsPanel —
              цели на левой панели, Canvas с рамкой периметра, DomainNode с классом
              доверия и K, InspectorPanel со свойствами внешней системы, SummaryPanel —
              расчёт системы под инспектором, DecomposeDialog, ValidationPanel, theme.ts)
              — без бизнес-расчётов.
src/i18n/     ru.ts — единый словарь строк интерфейса (НФ-8).
src/samples/  robot/content.ts, vessel/content.ts — строки-источник данных примеров
              14.4.1 и 14.4.2; файлы .yaml/.puml генерируются scripts/emit-fixtures.ts
              и сверяются fixtures.test.ts.
src/app/      layout.tsx (бутстрап темы до гидратации), page.tsx — среда исполнения
              Next.js App Router.
```

Односторонние зависимости: `ui → store → engine/io`. `engine` и `io` не знают
о React и DOM — это обеспечивает высокое покрытие unit-тестами (раздел 11.1).

## 2. Установка среды разработки

Node.js 22.12+ (22 LTS или 24) и npm (в среде разработки используется Bun — совместимо):

```bash
make install     # npm ci
make dev         # dev-сервер на http://localhost:3000
PORT=4000 npm run dev   # тот же сервер на другом порту (переменная PORT)
bun run lint     # eslint
npx tsc --noEmit # проверка типов (strict)
```

## 3. Модель и форматы

Спецификация сущностей — раздел 3.1 ТЗ; форматов — раздел 6; алгоритмов — раздел 7.
Эти разделы — источник истины; имена полей в коде совпадают с ТЗ
(`Block`, `Edge`, `Goal`, `SecurityFunction`, `Assignment`, `Project`).

## 4. Адаптация стека к среде исполнения

ТЗ (решение D6) фиксирует стек; исполнение v0/v0.01.01 выполнено на Next.js 16
(App Router) со статическим экспортом (`output: "export"` → каталог `out/`).
Сохранено: React, React Flow (@xyflow/react 12), js-yaml, zod, zustand, Vitest,
Playwright, статическая выдача без серверной части (варианты В1/В3 работают
без изменений: nginx обслуживает `out/`). Отличия: сборщик Next.js, React 19,
zod 4, js-yaml 5, порты dev/preview 3000/4173 (переопределяются переменной `PORT`).
Требование Node ≥ 22.12 (engines, `.nvmrc` 22, базовый образ node:22-alpine) —
решение D18 ТЗ: vitest 5 не поддерживает Node 20 (EBADENGINE).
Функциональные требования Ф-1…Ф-27 затронуты не были.

### 4.1. Что добавлено в v0.01.01

- **Модель доверия (3.5)** — `src/engine/trust.ts`: `trustedBlockIds` (критичность
  функции = наличие связи implements), `computeTrust` (классы НДБ/ДДБ/ДДБПЦД и
  цвета стрелок), `frameBounds`/`isInsideFrame`/`snapExternalsOutside` (рамка
  периметра). `recalcCosts` вызывает `computeTrust` и подставляет K в формулу —
  стоимость и раскраска всегда согласованы.
- **Тема (5.1)** — `src/ui/theme.ts`: тёмная по умолчанию, `useSkibTheme` построен
  на `useSyncExternalStore` (не используйте setState в эффекте — правило
  react-hooks/set-state-in-effect); класс применяется бутстрап-скриптом в
  `layout.tsx` до гидратации.
- **Внешние системы** — `addExternalDomain` в хранилище; кнопка «+ Внешняя система»;
  стереотипы PlantUML; поля `external`/`trusted` в схемах zod.
- **Два примера** — строки-источник `src/samples/robot/content.ts` и
  `src/samples/vessel/content.ts`; после правки запустите `scripts/emit-fixtures.ts`,
  иначе `fixtures.test.ts` зафиксирует расхождение.

### 4.2. Что добавлено в v0.01.02

- **Вид канвы** — `src/store/viewStore.ts`: отдельное zustand-хранилище
  `showEdges`/`focusInternal` (настройки вида не входят в модель проекта,
  не пишутся в историю Ф-21 и не сохраняются в localStorage Ф-22). `Canvas.tsx`
  фильтрует узлы (`visibleBlocks`) и рёбра (`modelEdges`) на уровне рендера;
  расчёты `recalcCosts`/`recalcCoverage` всегда считаются по полной модели.
- **Справка** — `src/ui/HelpDialog.tsx` (диалог на shadcn Dialog), кнопка
  «Справка» в TopBar; все тексты — в разделе `help` словаря `src/i18n/ru.ts`.
- **Метрики** — `SummaryPanel.tsx`: `C_системы` шрифтом 4xl, статус системы
  с индикатором 5×5, четыре плитки метрик; строки и testid сохранены
  (E2E-утверждения не менялись).

## 5. Соглашения

- TypeScript strict; ESLint (`bun run lint`) и `tsc --noEmit` обязательны перед коммитом.
- Правило проекта — проверки запускаются только через make: `make lint`,
  `make test-unit`, `make check` (проверка Makefile → lint → test). Запуская
  цели через make, мы каждый раз проверяем и сам Makefile; первая цель внутри
  `make check` — `check-makefile` (сухой прогон всех целей через `make -n`).
  Прямой запуск npm-скриптов (`npm run test:unit`) не заменяет make-проверку:
  правило введено после регрессии v0.01.04, когда табуляция в рецептах
  Makefile была заменена 8 пробелами (make падал с «missing separator»,
  а npm-запуски этого не выявляли). Табуляцию в рецептах страхует unit-тест
  `tests/unit/makefile.test.ts`, восстанавливает —
  `python3 scripts/fix_makefile_tabs.py`. Текстовые правки Makefile после
  этого — только через скрипт (инструменты правки текста заменяют таб пробелами).
- Форматирование — Prettier (`.prettierrc`).
- Коммиты — Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Версии — semver; совместимость `state.yaml` — в пределах major-версии схемы
  (`version: 1`), раздел 10.5 ТЗ.

## 6. Пошаговый пример: новая функция движка

1. Добавьте вычисление в `src/engine/cost.ts` (или новый модуль) как чистую функцию
   с явными типами.
2. Опишите типы результата в `types.ts`, если он покидает движок.
3. Добавьте unit-тест в `tests/unit/cost.test.ts` с фиксированными ожиданиями
   (шаблон — кейсы T-C-01…T-C-12).
4. Если функция влияет на UI — используйте её в компоненте через `useMemo`, без
   расчётов в обработчиках; зависимости useMemo должны совпадать с используемыми
   данными (правило react-hooks/preserve-manual-memoization).
5. Запустите `make test-unit` и `make lint`; при изменении формул сверьте
   контрольные примеры 14.4.1 (486) и 14.4.2 (370) ТЗ.

## 7. Процедура выпуска версии

1. Обновите `CHANGELOG.md` (раздел «Неопубликовано» → новая версия с датой).
2. Синхронизируйте `APP_VERSION` в `src/engine/types.ts` и `TAG` по умолчанию
   в Makefile; тег в git: `git tag v0.01.x`.
3. Сборка и проверка: `make check`; сборка образа: `make docker-build TAG=0.01.x`.
4. Публикация статического `out/` (В1) или образа (В3) — deployment-guide.
