/**
 * Пример 2 — автономное безэкипажное судно-доставщик в речной акватории.
 * Доработка v0.01.05: целевая система расширена камерой с анализом
 * видеопотока (техническое зрение), бортовым ИИ оценки обстановки и
 * планирования маршрута, навигацией GPS/INS, лидаром и подсистемой
 * OTA-обновления; цели безопасности переформулированы — все девять являются
 * целями ПЛО («при любых обстоятельствах», обозначаются (*) и несут признак
 * unconditional), добавлены два предположения безопасности и десять
 * механизмов безопасности со связями «механизм — цель» (ЦБ1…ЦБ9).
 *
 * Строки — единый источник данных: файлы в tests/fixtures/vessel и
 * samples/vessel генерируются скриптом scripts/emit-fixtures.ts и сверяются
 * unit-тестом fixtures.test.ts.
 *
 * Картина доверия шага 1: Береговой пост (СУДС) — доверенная внешняя система,
 * Оператор шлюза — недоверенная (по умолчанию). Внутренние домены:
 * Радиосвязь, Навигационный вычислитель и Подсистема расхождения — ДДБПЦД
 * (красные входящие стрелки от Оператора шлюза, GPS/INS и бортового ИИ),
 * Подсистема OTA-обновления и Контроль груза — ДДБ; сенсорные и ИИ-домены
 * без размещённых функций — НДБ. Размещено 6 из 10 механизмов:
 * C_системы = 943; цели — 2 зелёные, 4 жёлтые, 3 красные.
 */

export const DEMO_ARCHITECTURE_YAML = `version: 1
system:
  name: "Безэкипажное судно-доставщик"
  description: "Пример 2: автономная доставка грузов в речной акватории"
blocks:
  - id: blk-gps-ins
    name: "Навигация GPS/INS"
    cost: 3
    position: { x: 530, y: 80 }
  - id: blk-cam
    name: "Камера (техническое зрение)"
    cost: 2
    position: { x: 530, y: 548 }
  - id: blk-lidar
    name: "Лидар"
    cost: 2
    position: { x: 530, y: 782 }
  - id: blk-nav
    name: "Навигационный вычислитель"
    cost: 4
    position: { x: 1370, y: 314 }
  - id: blk-vision
    name: "Анализ видеопотока"
    cost: 3
    position: { x: 950, y: 548 }
  - id: blk-ota
    name: "Подсистема OTA-обновления"
    cost: 3
    position: { x: 950, y: 314 }
  - id: blk-ai
    name: "Бортовой ИИ (оценка обстановки и планирование маршрута)"
    cost: 5
    position: { x: 1790, y: 197 }
  - id: blk-avoid
    name: "Подсистема расхождения"
    cost: 3
    position: { x: 2210, y: 197 }
  - id: blk-cargo
    name: "Контроль груза и выгрузки"
    cost: 2
    position: { x: 1790, y: 431 }
  - id: blk-radio
    name: "Радиосвязь"
    cost: 2
    position: { x: 530, y: 314 }
  - id: ext-shore
    name: "Береговой пост (СУДС)"
    cost: 0
    external: true
    trusted: true
    position: { x: 80, y: 373 }
  - id: ext-lock
    name: "Оператор шлюза"
    cost: 0
    external: true
    position: { x: 2660, y: 314 }
edges:
  - id: e-shore-radio
    from: ext-shore
    to: blk-radio
    label: "судоходная обстановка"
  - id: e-lock-radio
    from: ext-lock
    to: blk-radio
    label: "разрешение шлюзования"
  - id: e-radio-nav
    from: blk-radio
    to: blk-nav
    label: "очищенные данные"
  - id: e-radio-ota
    from: blk-radio
    to: blk-ota
    label: "пакеты обновлений (OTA)"
  - id: e-radio-lock
    from: blk-radio
    to: ext-lock
    label: "заявка на шлюзование"
  - id: e-gps-nav
    from: blk-gps-ins
    to: blk-nav
    label: "навигационное решение"
  - id: e-cam-vision
    from: blk-cam
    to: blk-vision
    label: "видеопоток"
  - id: e-lidar-vision
    from: blk-lidar
    to: blk-vision
    label: "облако точек"
  - id: e-vision-ai
    from: blk-vision
    to: blk-ai
    label: "распознанная обстановка"
  - id: e-nav-ai
    from: blk-nav
    to: blk-ai
    label: "данные курса и позиции"
  - id: e-ai-avoid
    from: blk-ai
    to: blk-avoid
    label: "план манёвра"
  - id: e-avoid-nav
    from: blk-avoid
    to: blk-nav
    label: "корректировка маршрута"
  - id: e-nav-cargo
    from: blk-nav
    to: blk-cargo
    label: "маршрутный лист"
  - id: e-cargo-shore
    from: blk-cargo
    to: ext-shore
    label: "статус груза"
  - id: e-ota-nav
    from: blk-ota
    to: blk-nav
    label: "установленная прошивка"
  - id: e-ota-ai
    from: blk-ota
    to: blk-ai
    label: "обновление моделей ИИ"
`;

export const DEMO_SECURITY_YAML = `version: 1
assumptions:
  - id: asm-shore
    text: "Аутентичная береговая система является благонадёжной, управляется благонадёжными, авторизованными и подготовленными операторами"
  - id: asm-firmware
    text: "Подлинные прошивки выпущены благонадёжными и компетентными разработчиками, а ДВБ прошивок прошла все необходимые проверки, что подтверждается сертификатом безопасности, выпущенным авторизованным центром"
goals:
  - id: g-mission-auth
    name: "Аутентичность миссии"
    description: "При любых обстоятельствах выполняются только аутентичные миссии"
    unconditional: true
  - id: g-mission-authz
    name: "Авторизация миссий берегом"
    description: "При любых обстоятельствах выполняются только миссии, авторизованные береговыми системами"
    unconditional: true
  - id: g-cert-safety
    name: "Сертификат безопасности и штатные СБ"
    description: "При любых обстоятельствах выполнение миссии осуществляется только с действующим сертификатом безопасности и штатно работающими системами безопасности"
    unconditional: true
  - id: g-cargo-zone
    name: "Авторизованный район выгрузки"
    description: "При любых обстоятельствах выгрузка осуществляется только в авторизованном районе"
    unconditional: true
  - id: g-cmd-authz
    name: "Авторизация критичных команд"
    description: "При любых обстоятельствах выполняются только авторизованные критичные команды"
    unconditional: true
  - id: g-move-limits
    name: "Ограничения перемещений"
    description: "При любых обстоятельствах перемещения выполняются в пределах ограничений, заданных миссией и береговыми системами"
    unconditional: true
  - id: g-id-authentic
    name: "Подлинный идентификатор"
    description: "При любых обстоятельствах в коммуникации с береговыми системами используется только подлинный идентификатор"
    unconditional: true
  - id: g-fw-authentic
    name: "Подлинность прошивок"
    description: "При любых обстоятельствах для обновления используются только подлинные прошивки"
    unconditional: true
  - id: g-safe-distance
    name: "Безопасная дистанция движения"
    description: "При любых обстоятельствах движение по маршруту осуществляется только на безопасном расстоянии от других стационарных и подвижных объектов, включая другие суда, инфраструктуру акватории, людей и животных"
    unconditional: true
functions:
  - id: fn-ais-auth
    name: "Контроль подлинности AIS-данных"
    cost: 2
    implements:
      - { goal: g-mission-auth, weight: mandatory }
  - id: fn-mission-auth
    name: "Контроль подлинности миссии"
    cost: 3
    implements:
      - { goal: g-mission-authz, weight: mandatory }
  - id: fn-nav-integrity
    name: "Комплексирование и контроль целостности навигационных данных"
    cost: 4
    implements:
      - { goal: g-cargo-zone, weight: mandatory }
      - { goal: g-move-limits, weight: mandatory }
  - id: fn-ota-auth
    name: "Контроль подлинности обновления (прошивки)"
    cost: 3
    implements:
      - { goal: g-fw-authentic, weight: mandatory }
  - id: fn-avoid
    name: "Расчёт манёвра уклонения"
    cost: 4
    implements:
      - { goal: g-safe-distance, weight: mandatory }
  - id: fn-thruster-power
    name: "Контроль питания движителей"
    cost: 4
    implements:
      - { goal: g-mission-auth, weight: mandatory }
      - { goal: g-mission-authz, weight: mandatory }
      - { goal: g-cert-safety, weight: mandatory }
      - { goal: g-cmd-authz, weight: mandatory }
      - { goal: g-move-limits, weight: mandatory }
  - id: fn-brake
    name: "Контроль приводов экстренного торможения"
    cost: 3
    implements:
      - { goal: g-safe-distance, weight: mandatory }
      - { goal: g-move-limits, weight: optional }
  - id: fn-sign
    name: "Цифровая подпись исходящих данных"
    cost: 2
    implements:
      - { goal: g-id-authentic, weight: mandatory }
  - id: fn-cmd-auth
    name: "Контроль подлинности критичных команд"
    cost: 3
    implements:
      - { goal: g-cmd-authz, weight: mandatory }
  - id: fn-cargo-power
    name: "Контроль питания привода выгрузки"
    cost: 2
    implements:
      - { goal: g-cargo-zone, weight: mandatory }
`;

export const DEMO_PUML = `@startuml
[Навигация GPS/INS] <<cost: 3>>
[Камера (техническое зрение)] <<cost: 2>>
[Лидар] <<cost: 2>>
[Навигационный вычислитель] <<cost: 4>>
[Анализ видеопотока] <<cost: 3>>
[Подсистема OTA-обновления] <<cost: 3>>
[Бортовой ИИ (оценка обстановки и планирование маршрута)] <<cost: 5>>
[Подсистема расхождения] <<cost: 3>>
[Контроль груза и выгрузки] <<cost: 2>>
[Радиосвязь] <<cost: 2>>
[Береговой пост (СУДС)] <<external-trusted>>
[Оператор шлюза] <<external>>
[Береговой пост (СУДС)] --> [Радиосвязь] : судоходная обстановка
[Оператор шлюза] --> [Радиосвязь] : разрешение шлюзования
[Радиосвязь] --> [Навигационный вычислитель] : очищенные данные
[Радиосвязь] --> [Подсистема OTA-обновления] : пакеты обновлений (OTA)
[Радиосвязь] --> [Оператор шлюза] : заявка на шлюзование
[Навигация GPS/INS] --> [Навигационный вычислитель] : навигационное решение
[Камера (техническое зрение)] --> [Анализ видеопотока] : видеопоток
[Лидар] --> [Анализ видеопотока] : облако точек
[Анализ видеопотока] --> [Бортовой ИИ (оценка обстановки и планирование маршрута)] : распознанная обстановка
[Навигационный вычислитель] --> [Бортовой ИИ (оценка обстановки и планирование маршрута)] : данные курса и позиции
[Бортовой ИИ (оценка обстановки и планирование маршрута)] --> [Подсистема расхождения] : план манёвра
[Подсистема расхождения] --> [Навигационный вычислитель] : корректировка маршрута
[Навигационный вычислитель] --> [Контроль груза и выгрузки] : маршрутный лист
[Контроль груза и выгрузки] --> [Береговой пост (СУДС)] : статус груза
[Подсистема OTA-обновления] --> [Навигационный вычислитель] : установленная прошивка
[Подсистема OTA-обновления] --> [Бортовой ИИ (оценка обстановки и планирование маршрута)] : обновление моделей ИИ
@enduml
`;

/** state.yaml шага 1 примера 2: C_системы = 943 (v0.01.05). */
export const DEMO_STATE_YAML = `version: 1
architecture:
  blocks:
    - id: blk-gps-ins
      name: "Навигация GPS/INS"
      cost: 3
      position: { x: 60, y: 60 }
    - id: blk-cam
      name: "Камера (техническое зрение)"
      cost: 2
      position: { x: 60, y: 240 }
    - id: blk-lidar
      name: "Лидар"
      cost: 2
      position: { x: 60, y: 400 }
    - id: blk-nav
      name: "Навигационный вычислитель"
      cost: 4
      position: { x: 400, y: 60 }
    - id: blk-vision
      name: "Анализ видеопотока"
      cost: 3
      position: { x: 400, y: 240 }
    - id: blk-ota
      name: "Подсистема OTA-обновления"
      cost: 3
      position: { x: 400, y: 400 }
    - id: blk-ai
      name: "Бортовой ИИ (оценка обстановки и планирование маршрута)"
      cost: 5
      position: { x: 760, y: 60 }
    - id: blk-avoid
      name: "Подсистема расхождения"
      cost: 3
      position: { x: 760, y: 240 }
    - id: blk-cargo
      name: "Контроль груза и выгрузки"
      cost: 2
      position: { x: 760, y: 420 }
    - id: blk-radio
      name: "Радиосвязь"
      cost: 2
      position: { x: 400, y: 560 }
    - id: ext-shore
      name: "Береговой пост (СУДС)"
      cost: 0
      external: true
      trusted: true
      position: { x: 1180, y: 60 }
    - id: ext-lock
      name: "Оператор шлюза"
      cost: 0
      external: true
      position: { x: 1180, y: 380 }
  edges:
    - id: e-shore-radio
      from: ext-shore
      to: blk-radio
      label: "судоходная обстановка"
    - id: e-lock-radio
      from: ext-lock
      to: blk-radio
      label: "разрешение шлюзования"
    - id: e-radio-nav
      from: blk-radio
      to: blk-nav
      label: "очищенные данные"
    - id: e-radio-ota
      from: blk-radio
      to: blk-ota
      label: "пакеты обновлений (OTA)"
    - id: e-radio-lock
      from: blk-radio
      to: ext-lock
      label: "заявка на шлюзование"
    - id: e-gps-nav
      from: blk-gps-ins
      to: blk-nav
      label: "навигационное решение"
    - id: e-cam-vision
      from: blk-cam
      to: blk-vision
      label: "видеопоток"
    - id: e-lidar-vision
      from: blk-lidar
      to: blk-vision
      label: "облако точек"
    - id: e-vision-ai
      from: blk-vision
      to: blk-ai
      label: "распознанная обстановка"
    - id: e-nav-ai
      from: blk-nav
      to: blk-ai
      label: "данные курса и позиции"
    - id: e-ai-avoid
      from: blk-ai
      to: blk-avoid
      label: "план манёвра"
    - id: e-avoid-nav
      from: blk-avoid
      to: blk-nav
      label: "корректировка маршрута"
    - id: e-nav-cargo
      from: blk-nav
      to: blk-cargo
      label: "маршрутный лист"
    - id: e-cargo-shore
      from: blk-cargo
      to: ext-shore
      label: "статус груза"
    - id: e-ota-nav
      from: blk-ota
      to: blk-nav
      label: "установленная прошивка"
    - id: e-ota-ai
      from: blk-ota
      to: blk-ai
      label: "обновление моделей ИИ"
security:
  assumptions:
    - id: asm-shore
      text: "Аутентичная береговая система является благонадёжной, управляется благонадёжными, авторизованными и подготовленными операторами"
    - id: asm-firmware
      text: "Подлинные прошивки выпущены благонадёжными и компетентными разработчиками, а ДВБ прошивок прошла все необходимые проверки, что подтверждается сертификатом безопасности, выпущенным авторизованным центром"
  goals:
    - id: g-mission-auth
      name: "Аутентичность миссии"
      description: "При любых обстоятельствах выполняются только аутентичные миссии"
      unconditional: true
    - id: g-mission-authz
      name: "Авторизация миссий берегом"
      description: "При любых обстоятельствах выполняются только миссии, авторизованные береговыми системами"
      unconditional: true
    - id: g-cert-safety
      name: "Сертификат безопасности и штатные СБ"
      description: "При любых обстоятельствах выполнение миссии осуществляется только с действующим сертификатом безопасности и штатно работающими системами безопасности"
      unconditional: true
    - id: g-cargo-zone
      name: "Авторизованный район выгрузки"
      description: "При любых обстоятельствах выгрузка осуществляется только в авторизованном районе"
      unconditional: true
    - id: g-cmd-authz
      name: "Авторизация критичных команд"
      description: "При любых обстоятельствах выполняются только авторизованные критичные команды"
      unconditional: true
    - id: g-move-limits
      name: "Ограничения перемещений"
      description: "При любых обстоятельствах перемещения выполняются в пределах ограничений, заданных миссией и береговыми системами"
      unconditional: true
    - id: g-id-authentic
      name: "Подлинный идентификатор"
      description: "При любых обстоятельствах в коммуникации с береговыми системами используется только подлинный идентификатор"
      unconditional: true
    - id: g-fw-authentic
      name: "Подлинность прошивок"
      description: "При любых обстоятельствах для обновления используются только подлинные прошивки"
      unconditional: true
    - id: g-safe-distance
      name: "Безопасная дистанция движения"
      description: "При любых обстоятельствах движение по маршруту осуществляется только на безопасном расстоянии от других стационарных и подвижных объектов, включая другие суда, инфраструктуру акватории, людей и животных"
      unconditional: true
  functions:
    - id: fn-ais-auth
      name: "Контроль подлинности AIS-данных"
      cost: 2
      implements:
        - { goal: g-mission-auth, weight: mandatory }
    - id: fn-mission-auth
      name: "Контроль подлинности миссии"
      cost: 3
      implements:
        - { goal: g-mission-authz, weight: mandatory }
    - id: fn-nav-integrity
      name: "Комплексирование и контроль целостности навигационных данных"
      cost: 4
      implements:
        - { goal: g-cargo-zone, weight: mandatory }
        - { goal: g-move-limits, weight: mandatory }
    - id: fn-ota-auth
      name: "Контроль подлинности обновления (прошивки)"
      cost: 3
      implements:
        - { goal: g-fw-authentic, weight: mandatory }
    - id: fn-avoid
      name: "Расчёт манёвра уклонения"
      cost: 4
      implements:
        - { goal: g-safe-distance, weight: mandatory }
    - id: fn-thruster-power
      name: "Контроль питания движителей"
      cost: 4
      implements:
        - { goal: g-mission-auth, weight: mandatory }
        - { goal: g-mission-authz, weight: mandatory }
        - { goal: g-cert-safety, weight: mandatory }
        - { goal: g-cmd-authz, weight: mandatory }
        - { goal: g-move-limits, weight: mandatory }
    - id: fn-brake
      name: "Контроль приводов экстренного торможения"
      cost: 3
      implements:
        - { goal: g-safe-distance, weight: mandatory }
        - { goal: g-move-limits, weight: optional }
    - id: fn-sign
      name: "Цифровая подпись исходящих данных"
      cost: 2
      implements:
        - { goal: g-id-authentic, weight: mandatory }
    - id: fn-cmd-auth
      name: "Контроль подлинности критичных команд"
      cost: 3
      implements:
        - { goal: g-cmd-authz, weight: mandatory }
    - id: fn-cargo-power
      name: "Контроль питания привода выгрузки"
      cost: 2
      implements:
        - { goal: g-cargo-zone, weight: mandatory }
assignments:
  - { function: fn-ais-auth, block: blk-radio }
  - { function: fn-cmd-auth, block: blk-radio }
  - { function: fn-nav-integrity, block: blk-nav }
  - { function: fn-ota-auth, block: blk-ota }
  - { function: fn-avoid, block: blk-avoid }
  - { function: fn-cargo-power, block: blk-cargo }
meta:
  savedAt: "2026-11-11T09:00:00Z"
  source: "Пример 2: безэкипажное судно-доставщик (доработка v0.01.05)"
`;
