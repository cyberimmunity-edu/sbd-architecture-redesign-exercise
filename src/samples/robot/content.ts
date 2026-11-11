/**
 * Пример 1 — автономный коммунальный робот (уборка и полив городской территории).
 * Раздел 14.4 ТЗ v0.01.01. Строки — единый источник данных: файлы в
 * tests/fixtures/robot и samples/robot генерируются скриптом
 * scripts/emit-fixtures.ts и сверяются unit-тестом fixtures.test.ts.
 *
 * Картина доверия: Диспетчерский пункт — доверенная внешняя система (зелёная),
 * Зарядная станция — недоверенная (красная, по умолчанию). Подсистема
 * восприятия без функций — НДБ; планировщик и модуль связи — ДДБПЦД (входят
 * красные стрелки), привод движения — ДДБ. C_системы с размещениями = 486.
 */

export const DEMO_ARCHITECTURE_YAML = `version: 1
system:
  name: "Автономный коммунальный робот"
  description: "Пример 1: уборка и полив городской территории, взаимодействие со смежными системами"
blocks:
  - id: blk-perc
    name: "Подсистема восприятия"
    cost: 3
    position: { x: 530, y: 314 }
  - id: blk-plan
    name: "Планировщик маршрута"
    cost: 4
    position: { x: 950, y: 80 }
  - id: blk-drive
    name: "Привод движения"
    cost: 3
    position: { x: 1370, y: 80 }
  - id: blk-link
    name: "Модуль связи"
    cost: 2
    position: { x: 530, y: 80 }
  - id: ext-ctrl
    name: "Диспетчерский пункт"
    cost: 0
    external: true
    trusted: true
    position: { x: 80, y: 314 }
  - id: ext-charge
    name: "Зарядная станция"
    cost: 0
    external: true
    position: { x: 80, y: 80 }
edges:
  - id: e-disp-link
    from: ext-ctrl
    to: blk-link
    label: "команды диспетчера"
  - id: e-charge-link
    from: ext-charge
    to: blk-link
    label: "статус зарядки"
  - id: e-link-plan
    from: blk-link
    to: blk-plan
    label: "очищенные команды"
  - id: e-perc-plan
    from: blk-perc
    to: blk-plan
    label: "данные среды"
  - id: e-plan-drive
    from: blk-plan
    to: blk-drive
    label: "маршрут"
  - id: e-link-ctrl
    from: blk-link
    to: ext-ctrl
    label: "телеметрия"
`;

export const DEMO_SECURITY_YAML = `version: 1
goals:
  - id: g-safe
    name: "Безопасность пешеходов"
    description: "Робот не травмирует людей на обслуживаемой территории"
  - id: g-cmd
    name: "Достоверность команд"
    description: "Исполняются только подлинные команды диспетчера"
  - id: g-telem
    name: "Достоверность телеметрии"
    description: "Телеметрия передаётся без искажений и подмен"
  - id: g-route
    name: "Сохранность маршрута"
    description: "Маршрут не искажается и выводит к точке возврата"
  - id: g-charge
    name: "Безопасность зарядки"
    description: "Зарядка начинается только при безопасных параметрах"
functions:
  - id: fn-auth
    name: "Аутентификация команд диспетчера"
    cost: 3
    implements:
      - { goal: g-cmd, weight: mandatory }
  - id: fn-sanitize
    name: "Контроль целостности входных данных"
    cost: 2
    implements:
      - { goal: g-cmd, weight: optional }
      - { goal: g-telem, weight: mandatory }
  - id: fn-estop
    name: "Аварийный останов"
    cost: 3
    implements:
      - { goal: g-safe, weight: mandatory }
  - id: fn-geofence
    name: "Геоограничение"
    cost: 2
    implements:
      - { goal: g-safe, weight: optional }
      - { goal: g-route, weight: mandatory }
  - id: fn-sign
    name: "Подписывание телеметрии"
    cost: 2
    implements:
      - { goal: g-telem, weight: mandatory }
  - id: fn-charge-guard
    name: "Контроль параметров зарядки"
    cost: 2
    implements:
      - { goal: g-charge, weight: mandatory }
  - id: fn-log
    name: "Журналирование событий"
    cost: 1
    implements:
      - { goal: g-telem, weight: optional }
`;

export const DEMO_PUML = `@startuml
[Подсистема восприятия] <<cost: 3>>
[Планировщик маршрута] <<cost: 4>>
[Привод движения] <<cost: 3>>
[Модуль связи] <<cost: 2>>
[Диспетчерский пункт] <<external-trusted>>
[Зарядная станция] <<external>>
[Диспетчерский пункт] --> [Модуль связи] : команды диспетчера
[Зарядная станция] --> [Модуль связи] : статус зарядки
[Модуль связи] --> [Планировщик маршрута] : очищенные команды
[Подсистема восприятия] --> [Планировщик маршрута] : данные среды
[Планировщик маршрута] --> [Привод движения] : маршрут
[Модуль связи] --> [Диспетчерский пункт] : телеметрия
@enduml
`;

/** state.yaml шага 1 примера 1: C_системы = 486 (см. 14.4 ТЗ). */
export const DEMO_STATE_YAML = `version: 1
architecture:
  blocks:
    - id: blk-perc
      name: "Подсистема восприятия"
      cost: 3
      position: { x: 60, y: 200 }
    - id: blk-plan
      name: "Планировщик маршрута"
      cost: 4
      position: { x: 420, y: 120 }
    - id: blk-drive
      name: "Привод движения"
      cost: 3
      position: { x: 780, y: 200 }
    - id: blk-link
      name: "Модуль связи"
      cost: 2
      position: { x: 420, y: 340 }
    - id: ext-ctrl
      name: "Диспетчерский пункт"
      cost: 0
      external: true
      trusted: true
      position: { x: 1180, y: 120 }
    - id: ext-charge
      name: "Зарядная станция"
      cost: 0
      external: true
      position: { x: 1180, y: 340 }
  edges:
    - id: e-disp-link
      from: ext-ctrl
      to: blk-link
      label: "команды диспетчера"
    - id: e-charge-link
      from: ext-charge
      to: blk-link
      label: "статус зарядки"
    - id: e-link-plan
      from: blk-link
      to: blk-plan
      label: "очищенные команды"
    - id: e-perc-plan
      from: blk-perc
      to: blk-plan
      label: "данные среды"
    - id: e-plan-drive
      from: blk-plan
      to: blk-drive
      label: "маршрут"
    - id: e-link-ctrl
      from: blk-link
      to: ext-ctrl
      label: "телеметрия"
security:
  goals:
    - id: g-safe
      name: "Безопасность пешеходов"
      description: "Робот не травмирует людей на обслуживаемой территории"
    - id: g-cmd
      name: "Достоверность команд"
      description: "Исполняются только подлинные команды диспетчера"
    - id: g-telem
      name: "Достоверность телеметрии"
      description: "Телеметрия передаётся без искажений и подмен"
    - id: g-route
      name: "Сохранность маршрута"
      description: "Маршрут не искажается и выводит к точке возврата"
    - id: g-charge
      name: "Безопасность зарядки"
      description: "Зарядка начинается только при безопасных параметрах"
  functions:
    - id: fn-auth
      name: "Аутентификация команд диспетчера"
      cost: 3
      implements:
        - { goal: g-cmd, weight: mandatory }
    - id: fn-sanitize
      name: "Контроль целостности входных данных"
      cost: 2
      implements:
        - { goal: g-cmd, weight: optional }
        - { goal: g-telem, weight: mandatory }
    - id: fn-estop
      name: "Аварийный останов"
      cost: 3
      implements:
        - { goal: g-safe, weight: mandatory }
    - id: fn-geofence
      name: "Геоограничение"
      cost: 2
      implements:
        - { goal: g-safe, weight: optional }
        - { goal: g-route, weight: mandatory }
    - id: fn-sign
      name: "Подписывание телеметрии"
      cost: 2
      implements:
        - { goal: g-telem, weight: mandatory }
    - id: fn-charge-guard
      name: "Контроль параметров зарядки"
      cost: 2
      implements:
        - { goal: g-charge, weight: mandatory }
    - id: fn-log
      name: "Журналирование событий"
      cost: 1
      implements:
        - { goal: g-telem, weight: optional }
assignments:
  - { function: fn-auth, block: blk-link }
  - { function: fn-sign, block: blk-link }
  - { function: fn-sanitize, block: blk-plan }
  - { function: fn-geofence, block: blk-plan }
  - { function: fn-estop, block: blk-drive }
meta:
  savedAt: "2026-11-10T09:00:00Z"
  source: "Пример 1: автономный коммунальный робот (14.4 ТЗ)"
`;
