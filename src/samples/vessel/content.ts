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
    name: "01. Навигация GPS/INS"
    cost: 3
    group: lg-1
    position: { x: 530, y: 80 }
  - id: blk-cam
    name: "02. Камера (техническое зрение)"
    cost: 2
    group: lg-2
    position: { x: 530, y: 548 }
  - id: blk-lidar
    name: "03. Лидар"
    cost: 2
    group: lg-2
    position: { x: 530, y: 782 }
  - id: blk-nav
    name: "04. Навигационный вычислитель"
    cost: 4
    position: { x: 1370, y: 314 }
  - id: blk-vision
    name: "05. Анализ видеопотока"
    cost: 3
    position: { x: 950, y: 548 }
  - id: blk-ota
    name: "06. Подсистема OTA-обновления"
    cost: 3
    position: { x: 950, y: 314 }
  - id: blk-ai
    name: "07. Бортовой ИИ (оценка обстановки и планирование маршрута)"
    cost: 5
    group: lg-4
    position: { x: 1790, y: 197 }
  - id: blk-avoid
    name: "08. Подсистема расхождения"
    cost: 3
    group: lg-3
    position: { x: 2210, y: 197 }
  - id: blk-cargo
    name: "09. Контроль груза и выгрузки"
    cost: 2
    position: { x: 1790, y: 431 }
  - id: blk-radio
    name: "10. Радиосвязь"
    cost: 2
    group: lg-1
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
groups:
  # Логические группы (v0.02.03, Ф-70…Ф-76): связь и позиционирование,
  # сенсорный контур и «Бортовой интеллект» с вложенной «Оценкой обстановки»
  # (Ф-71, глубина 2). Цвета — из палитры П-15 без красного/жёлтого/зелёного.
  - id: lg-1
    name: "Связь и позиционирование"
    color: "#1E88E5"
  - id: lg-2
    name: "Сенсорный контур"
    color: "#00897B"
  - id: lg-3
    name: "Бортовой интеллект"
    color: "#8E24AA"
  - id: lg-4
    name: "Оценка обстановки"
    color: "#D81B60"
    parent: lg-3
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
      name: "01. Навигация GPS/INS"
      cost: 3
      group: lg-1
      position: { x: 530, y: 80 }
    - id: blk-cam
      name: "02. Камера (техническое зрение)"
      cost: 2
      group: lg-2
      position: { x: 530, y: 548 }
    - id: blk-lidar
      name: "03. Лидар"
      cost: 2
      group: lg-2
      position: { x: 530, y: 782 }
    - id: blk-nav
      name: "04. Навигационный вычислитель"
      cost: 4
      position: { x: 1370, y: 314 }
    - id: blk-vision
      name: "05. Анализ видеопотока"
      cost: 3
      position: { x: 950, y: 548 }
    - id: blk-ota
      name: "06. Подсистема OTA-обновления"
      cost: 3
      position: { x: 950, y: 314 }
    - id: blk-ai
      name: "07. Бортовой ИИ (оценка обстановки и планирование маршрута)"
      cost: 5
      group: lg-4
      position: { x: 1790, y: 197 }
    - id: blk-avoid
      name: "08. Подсистема расхождения"
      cost: 3
      group: lg-3
      position: { x: 2210, y: 197 }
    - id: blk-cargo
      name: "09. Контроль груза и выгрузки"
      cost: 2
      position: { x: 1790, y: 431 }
    - id: blk-radio
      name: "10. Радиосвязь"
      cost: 2
      group: lg-1
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
  groups:
    - id: lg-1
      name: "Связь и позиционирование"
      color: "#1E88E5"
    - id: lg-2
      name: "Сенсорный контур"
      color: "#00897B"
    - id: lg-3
      name: "Бортовой интеллект"
      color: "#8E24AA"
    - id: lg-4
      name: "Оценка обстановки"
      color: "#D81B60"
      parent: lg-3
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

/**
 * Образцы ДП демонстрационного комплекта «Безэкипажное судно-доставщик»
 * (v0.02.01b): участники — ровно домены ДАП примера 2 (12 доменов),
 * каждая стрелка (кроме self) опирается на связь ДАП с точным
 * направлением (П-3): seq-1 «Удалённое обновление прошивки» (5 линий
 * жизни, 8 стрелок: цикл «до получения полного образа», условный блок
 * «подлинность прошивки подтверждена» с ветками «нормальное обновление»
 * и «нарушение подлинности») и seq-2 «Выполнение новой миссии» (8 линий
 * жизни, 14 стрелок: цикл «контроль обстановки по ходу миссии», условный
 * блок «критических нарушений в системе управления не выявлено» с ветками
 * «нормальное выполнение миссии» и «аварийная остановка»).
 * Для ДАП сквозного сценария (22 домена) используется
 * SCENARIO_SEQUENCES_YAML (fixture tests/fixtures/vessel/sequences.yaml).
 */
export const DEMO_SEQUENCES_YAML = `version: 1
domains:
  ext-shore: Береговой пост (СУДС) (внешняя)
  ext-lock: Оператор шлюза (внешняя)
  blk-radio: 10. Радиосвязь
  blk-ota: 06. Подсистема OTA-обновления
  blk-nav: 04. Навигационный вычислитель
  blk-gps-ins: 01. Навигация GPS/INS
  blk-ai: 07. Бортовой ИИ (оценка обстановки и планирование маршрута)
  blk-avoid: 08. Аварийный уход от столкновения
  blk-cargo: 09. Контроль груза и выгрузки
sequences:
  - id: seq-1
    name: Удалённое обновление прошивки
    lifelines: [ext-shore, blk-radio, blk-ota, blk-nav, blk-ai]
    arrows:
      - id: a-1
        from: ext-shore
        to: blk-radio
        label: команда удалённого обновления прошивки
      - id: a-2
        from: blk-radio
        to: blk-ota
        label: передача пакета образа (OTA)
      - id: a-3
        from: blk-ota
        to: blk-ota
        label: проверка подписи образа
      - id: a-4
        from: blk-ota
        to: blk-ota
        label: применение верифицированной прошивки
      - id: a-5
        from: blk-ota
        to: blk-nav
        label: ввод прошивки в работу
      - id: a-6
        from: blk-ota
        to: blk-ai
        label: обновление моделей ИИ
      - id: a-7
        from: blk-ota
        to: blk-ota
        label: отклонение обновления
      - id: a-8
        from: blk-ota
        to: blk-ota
        label: запись события безопасности
    blocks:
      - id: g-1
        kind: loop
        name: до получения полного образа
        color: '#1E88E5'
        arrows: [a-1, a-2]
      - id: g-2
        kind: cond
        name: подлинность прошивки подтверждена
        thenLabel: нормальное обновление
        elseLabel: нарушение подлинности
        elseFrom: a-7
        arrows: [a-3, a-4, a-5, a-6, a-7, a-8]
  - id: seq-2
    name: Выполнение новой миссии
    lifelines: [ext-shore, ext-lock, blk-radio, blk-gps-ins, blk-nav, blk-ai, blk-avoid, blk-cargo]
    arrows:
      - id: a-1
        from: ext-shore
        to: blk-radio
        label: передача новой миссии
      - id: a-2
        from: blk-radio
        to: blk-nav
        label: приём миссии на борту
      - id: a-3
        from: blk-nav
        to: blk-nav
        label: контроль подлинности миссии
      - id: a-4
        from: blk-gps-ins
        to: blk-nav
        label: данные курса и позиции
      - id: a-5
        from: blk-nav
        to: blk-ai
        label: оценка обстановки и планирование маршрута
      - id: a-6
        from: blk-ai
        to: blk-avoid
        label: уход от столкновения
      - id: a-7
        from: blk-avoid
        to: blk-nav
        label: корректировка маршрута
      - id: a-8
        from: blk-nav
        to: blk-cargo
        label: маршрутный лист
      - id: a-9
        from: blk-radio
        to: ext-lock
        label: заявка на шлюзование
      - id: a-10
        from: ext-lock
        to: blk-radio
        label: разрешение шлюзования
      - id: a-11
        from: blk-cargo
        to: ext-shore
        label: отчёт о выполнении миссии
      - id: a-12
        from: blk-ai
        to: blk-avoid
        label: аварийный уход от столкновения
      - id: a-13
        from: blk-avoid
        to: blk-nav
        label: блокировка движения
      - id: a-14
        from: blk-avoid
        to: blk-avoid
        label: запись события безопасности
    blocks:
      - id: g-1
        kind: loop
        name: контроль обстановки по ходу миссии
        color: '#1E88E5'
        arrows: [a-4, a-5, a-6, a-7]
      - id: g-2
        kind: cond
        name: критических нарушений в системе управления не выявлено
        thenLabel: нормальное выполнение миссии
        elseLabel: аварийная остановка
        elseFrom: a-12
        arrows: [a-8, a-9, a-10, a-11, a-12, a-13, a-14]
`;

/**
 * Образцы ДП сквозного сценария приёмки 9.1 ТЗ v0.02.01 — расширенная ДАП
 * (22 домена, fixture vessel-full): seq-1 «Удалённое обновление прошивки» (9 линий жизни,
 * 13 стрелок: цикл «до получения полного образа», условный блок «подлинность
 * прошивки подтверждена» с ветками «нормальное обновление» и «нарушение
 * подлинности») и seq-2 «Выполнение новой миссии» (12 линий жизни, 21
 * стрелка: цикл «контроль обстановки по ходу миссии», условный блок
 * «критических нарушений в системе управления не выявлено» с ветками
 * «нормальное выполнение миссии» и «аварийная остановка»). Каждая стрелка
 * (кроме self) опирается на связь ДАП с точным направлением (П-3).
 * Файлы samples/vessel/sequences.yaml, tests/fixtures/vessel/sequences.yaml
 * и src/samples/vessel/sequences.yaml генерируются скриптом emit-fixtures.ts
 * и сверяются unit-тестом fixtures.test.ts.
 */
export const SCENARIO_SEQUENCES_YAML = `version: 1
domains:
  ext-shore: Береговой пост (СУДС) (внешняя)
  ext-2: Радиоэфир (внешняя)
  ext-lock: Оператор шлюза (внешняя)
  blk-radio: 10. Радиосвязь
  blk-ota: 06. Подсистема OTA-обновления
  blk-nav: 04. Навигационный вычислитель
  blk-ai: 07. Бортовой ИИ (оценка обстановки и планирование маршрута)
  blk-cargo: 09. Контроль груза и выгрузки
  dom-2: 12. Контроль миссии
  dom-3: 13. Контроль положения
  dom-4: 14. Аварийный уход от столкновения
  dom-5: 15. Верификация и применение обновления прошивки
  dom-6: 16. Выполнение критичных команд
  dom-7: 17. События безопасности
  dom-8: 18. Блокировка движения
sequences:
  - id: seq-1
    name: Удалённое обновление прошивки
    lifelines: [ext-shore, ext-2, blk-radio, blk-ota, dom-5, blk-nav, blk-ai, dom-2, dom-7]
    arrows:
      - id: a-1
        from: ext-shore
        to: ext-2
        label: команда удалённого обновления прошивки
      - id: a-2
        from: ext-2
        to: blk-radio
        label: передача команды обновления
      - id: a-3
        from: blk-radio
        to: blk-ota
        label: пакеты обновлений (OTA)
      - id: a-4
        from: blk-ota
        to: dom-5
        label: передача пакета образа
      - id: a-5
        from: dom-5
        to: dom-5
        label: проверка подписи образа
      - id: a-6
        from: dom-5
        to: dom-5
        label: применение верифицированной прошивки
      - id: a-7
        from: blk-ota
        to: blk-nav
        label: ввод прошивки в работу
      - id: a-8
        from: blk-ota
        to: blk-ai
        label: обновление моделей ИИ
      - id: a-9
        from: dom-5
        to: dom-5
        label: отклонение обновления
      - id: a-10
        from: dom-2
        to: dom-7
        label: регистрация события безопасности
      - id: a-11
        from: dom-7
        to: blk-radio
        label: передача тревоги
      - id: a-12
        from: blk-radio
        to: ext-2
        label: ретрансляция тревоги
      - id: a-13
        from: ext-2
        to: ext-shore
        label: тревога береговому посту
    blocks:
      - id: g-1
        kind: loop
        name: до получения полного образа
        color: '#1E88E5'
        arrows: [a-1, a-2, a-3, a-4]
      - id: g-2
        kind: cond
        name: подлинность прошивки подтверждена
        thenLabel: нормальное обновление
        elseLabel: нарушение подлинности
        elseFrom: a-9
        arrows: [a-5, a-6, a-7, a-8, a-9, a-10, a-11, a-12, a-13]
  - id: seq-2
    name: Выполнение новой миссии
    lifelines: [ext-shore, ext-2, blk-radio, ext-lock, dom-2, blk-nav, dom-3, dom-4, blk-cargo, dom-6, dom-7, dom-8]
    arrows:
      - id: a-1
        from: ext-shore
        to: ext-2
        label: передача новой миссии
      - id: a-2
        from: ext-2
        to: blk-radio
        label: приём миссии на борту
      - id: a-3
        from: blk-radio
        to: blk-nav
        label: передача миссии в навигационный вычислитель
      - id: a-4
        from: blk-nav
        to: blk-nav
        label: контроль подлинности миссии
      - id: a-5
        from: blk-nav
        to: dom-3
        label: данные курса и позиции
      - id: a-6
        from: dom-3
        to: dom-3
        label: контроль целостности навигационных данных
      - id: a-7
        from: blk-nav
        to: blk-cargo
        label: маршрутный лист
      - id: a-8
        from: blk-radio
        to: ext-lock
        label: заявка на шлюзование
      - id: a-9
        from: ext-lock
        to: blk-radio
        label: разрешение шлюзования
      - id: a-10
        from: blk-cargo
        to: blk-radio
        label: отчёт о статусе груза
      - id: a-11
        from: blk-radio
        to: ext-2
        label: передача статуса груза и миссии
      - id: a-12
        from: ext-2
        to: ext-shore
        label: отчёт о выполнении миссии
      - id: a-13
        from: dom-2
        to: dom-2
        label: признак критического нарушения в системе управления
      - id: a-14
        from: dom-3
        to: dom-4
        label: экстренное торможение
      - id: a-15
        from: dom-2
        to: dom-7
        label: регистрация события безопасности
      - id: a-16
        from: blk-cargo
        to: dom-6
        label: передача критичной команды
      - id: a-17
        from: dom-6
        to: dom-6
        label: исполнение критичной команды
      - id: a-18
        from: dom-6
        to: dom-8
        label: блокировка движения
      - id: a-19
        from: dom-7
        to: blk-radio
        label: тревога
      - id: a-20
        from: blk-radio
        to: ext-2
        label: передача тревоги в радиоэфир
      - id: a-21
        from: ext-2
        to: ext-shore
        label: тревога береговому посту
    blocks:
      - id: g-1
        kind: loop
        name: контроль обстановки по ходу миссии
        color: '#1E88E5'
        arrows: [a-5, a-6]
      - id: g-2
        kind: cond
        name: критических нарушений в системе управления не выявлено
        thenLabel: нормальное выполнение миссии
        elseLabel: аварийная остановка
        elseFrom: a-13
        arrows: [a-7, a-8, a-9, a-10, a-11, a-12, a-13, a-14, a-15, a-16, a-17, a-18, a-19, a-20, a-21]
`;
