/**
 * Демонстрационный комплект — Приложения А, Б, В ТЗ и state.yaml шага 1
 * контрольного примера (раздел 14.3). Строки — единый источник данных:
 * файлы в tests/fixtures/demo и samples/ генерируются из этого модуля
 * скриптом scripts/emit-fixtures.ts и сверяются unit-тестом fixtures.test.ts.
 */

export const DEMO_ARCHITECTURE_YAML = `version: 1
system:
  name: "АСУ ТП учебного стенда"
  description: "Контрольный пример ТЗ «Конструктор СКИБ»"
blocks:
  - id: blk-ui
    name: "Консоль оператора"
    cost: 2
    position: { x: 60, y: 240 }
  - id: blk-core
    name: "Ядро системы"
    cost: 4
    position: { x: 380, y: 240 }
  - id: blk-store
    name: "Хранилище"
    cost: 2
    position: { x: 700, y: 120 }
  - id: blk-audit
    name: "Аудит"
    cost: 3
    position: { x: 700, y: 360 }
  - id: blk-siem
    name: "Внешний SIEM"
    cost: 1
    position: { x: 1000, y: 360 }
edges:
  - id: e-ui-core
    from: blk-ui
    to: blk-core
    label: "команды"
  - id: e-core-store
    from: blk-core
    to: blk-store
    label: "данные"
  - id: e-core-audit
    from: blk-core
    to: blk-audit
    label: "события"
  - id: e-audit-siem
    from: blk-audit
    to: blk-siem
    label: "журналы"
`;

export const DEMO_SECURITY_YAML = `version: 1
goals:
  - id: goal-conf
    name: "Конфиденциальность данных"
    description: "Данные доступны только легитимным процессам"
  - id: goal-access
    name: "Управление доступом"
    description: "Доступ к функциям ядра только после подтверждения личности"
  - id: goal-integrity
    name: "Целостность"
    description: "Неавторизованное изменение данных обнаруживается"
  - id: goal-audit
    name: "Аудит и учёт"
    description: "События безопасности регистрируются и передаются в SIEM"
  - id: goal-availability
    name: "Доступность"
    description: "Данные восстанавливаются после инцидента"
functions:
  - id: fn-hashing
    name: "Хеширование паролей"
    cost: 3
    implements:
      - { goal: goal-conf, weight: mandatory }
  - id: fn-mfa
    name: "Многофакторная аутентификация"
    cost: 4
    implements:
      - { goal: goal-access, weight: mandatory }
      - { goal: goal-conf, weight: optional }
  - id: fn-encrypt
    name: "Шифрование хранилища"
    cost: 5
    implements:
      - { goal: goal-conf, weight: mandatory }
  - id: fn-integrity
    name: "Контроль целостности"
    cost: 4
    implements:
      - { goal: goal-integrity, weight: mandatory }
      - { goal: goal-audit, weight: optional }
  - id: fn-auditlog
    name: "Журналирование событий"
    cost: 2
    implements:
      - { goal: goal-audit, weight: mandatory }
  - id: fn-backup
    name: "Резервное копирование"
    cost: 3
    implements:
      - { goal: goal-availability, weight: mandatory }
`;

export const DEMO_PUML = `@startuml
[Консоль оператора] <<cost: 2>>
[Ядро системы] <<cost: 4>>
[Хранилище] <<cost: 2>>
[Аудит] <<cost: 3>>
[Внешний SIEM] <<cost: 1>>
[Консоль оператора] --> [Ядро системы] : команды
[Ядро системы] --> [Хранилище] : данные
[Ядро системы] --> [Аудит] : события
[Аудит] --> [Внешний SIEM] : журналы
@enduml
`;

/** state.yaml шага 1 контрольного примера 14.3: C_системы = 67. */
export const DEMO_STATE_YAML = `version: 1
architecture:
  blocks:
    - id: blk-ui
      name: "Консоль оператора"
      cost: 2
      position: { x: 60, y: 240 }
    - id: blk-core
      name: "Ядро системы"
      cost: 4
      position: { x: 380, y: 240 }
    - id: blk-store
      name: "Хранилище"
      cost: 2
      position: { x: 700, y: 120 }
    - id: blk-audit
      name: "Аудит"
      cost: 3
      position: { x: 700, y: 360 }
    - id: blk-siem
      name: "Внешний SIEM"
      cost: 1
      position: { x: 1000, y: 360 }
  edges:
    - id: e-ui-core
      from: blk-ui
      to: blk-core
      label: "команды"
    - id: e-core-store
      from: blk-core
      to: blk-store
      label: "данные"
    - id: e-core-audit
      from: blk-core
      to: blk-audit
      label: "события"
    - id: e-audit-siem
      from: blk-audit
      to: blk-siem
      label: "журналы"
security:
  goals:
    - id: goal-conf
      name: "Конфиденциальность данных"
      description: "Данные доступны только легитимным процессам"
    - id: goal-access
      name: "Управление доступом"
      description: "Доступ к функциям ядра только после подтверждения личности"
    - id: goal-integrity
      name: "Целостность"
      description: "Неавторизованное изменение данных обнаруживается"
    - id: goal-audit
      name: "Аудит и учёт"
      description: "События безопасности регистрируются и передаются в SIEM"
    - id: goal-availability
      name: "Доступность"
      description: "Данные восстанавливаются после инцидента"
  functions:
    - id: fn-hashing
      name: "Хеширование паролей"
      cost: 3
      implements:
        - { goal: goal-conf, weight: mandatory }
    - id: fn-mfa
      name: "Многофакторная аутентификация"
      cost: 4
      implements:
        - { goal: goal-access, weight: mandatory }
        - { goal: goal-conf, weight: optional }
    - id: fn-encrypt
      name: "Шифрование хранилища"
      cost: 5
      implements:
        - { goal: goal-conf, weight: mandatory }
    - id: fn-integrity
      name: "Контроль целостности"
      cost: 4
      implements:
        - { goal: goal-integrity, weight: mandatory }
        - { goal: goal-audit, weight: optional }
    - id: fn-auditlog
      name: "Журналирование событий"
      cost: 2
      implements:
        - { goal: goal-audit, weight: mandatory }
    - id: fn-backup
      name: "Резервное копирование"
      cost: 3
      implements:
        - { goal: goal-availability, weight: mandatory }
assignments:
  - { function: fn-hashing, block: blk-core }
  - { function: fn-mfa, block: blk-core }
  - { function: fn-encrypt, block: blk-store }
  - { function: fn-backup, block: blk-store }
  - { function: fn-auditlog, block: blk-audit }
meta:
  savedAt: "2026-11-09T12:00:00Z"
  source: "architecture.yaml + security.yaml"
`;
