#!/usr/bin/env python3
"""Проверка контрольного примера ТЗ «Конструктор СКИБ».

Формула (решение D2):
  C_домена = C_блока * S * M,  S = сумма стоимостей функций в домене
  M = (E_вх + E_исх)/2, если (E_вх + E_исх) >= 2, иначе M = 1
  C_домена(без функций) = C_блока
  C_системы = сумма C_домена
Все стоимости целые, результат округляется вверх (ceil).
"""
import math

# (id, стоимость блока)
BLOCKS = {
    "blk-core": 4, "blk-store": 2, "blk-audit": 3,
    "blk-siem": 1, "blk-ui": 2,
}
EDGES = [("blk-ui", "blk-core"), ("blk-core", "blk-store"),
         ("blk-core", "blk-audit"), ("blk-audit", "blk-siem")]
FUNCS = {"fn-hashing": 3, "fn-mfa": 4, "fn-encrypt": 5,
         "fn-integrity": 4, "fn-auditlog": 2, "fn-backup": 3}


def m_factor(block_id):
    e_in = sum(1 for a, b in EDGES if b == block_id)
    e_out = sum(1 for a, b in EDGES if a == block_id)
    e = e_in + e_out
    return e / 2 if e >= 2 else 1, e


def domain_cost(block_id, funcs_in):
    c_block = BLOCKS[block_id]
    s = sum(FUNCS[f] for f in funcs_in)
    if s == 0:
        return c_block, 0, 1
    m, _ = m_factor(block_id)
    return math.ceil(c_block * s * m), s, m


def costs(placements):
    by_block = {}
    for f, b in placements.items():
        by_block.setdefault(b, []).append(f)
    res = {}
    for b in BLOCKS:
        res[b] = domain_cost(b, by_block.get(b, []))
    return res


def show(title, placements):
    print(f"== {title}")
    total = 0
    for b, (c, s, m) in costs(placements).items():
        total += c
        print(f"  {b:11s} C_блока={BLOCKS[b]}  S={s:2d}  M={m:<4} C_домена={c}")
    print(f"  C_системы = {total}")
    return total


# 1) Состояние после загрузки демо-комплекта (ничего не размещено)
t0 = show("После загрузки (размещений нет)", {})

# 2) Размещения контрольного примера (Приложения А, Б)
p1 = {"fn-hashing": "blk-core", "fn-mfa": "blk-core",
      "fn-encrypt": "blk-store", "fn-backup": "blk-store",
      "fn-auditlog": "blk-audit"}
t1 = show("Шаг 1 (5 карточек размещены)", p1)

# 3) Добавление fn-integrity в blk-audit
p2 = dict(p1, **{"fn-integrity": "blk-audit"})
t2 = show("Шаг 2 (+ fn-integrity в blk-audit)", p2)

# 4) Правило округления: блок 3, функции 3, E=3 -> 3*3*1.5 = 13.5 -> 14
ceil_case = math.ceil(3 * 3 * 1.5)
print(f"== Округление: 3*3*1.5 = {3*3*1.5} -> ceil = {ceil_case}")

# 5) Таблица M
print("== Таблица M:")
for e in range(0, 9):
    m = e / 2 if e >= 2 else 1
    print(f"  E={e} -> M={m}")

# 6) Покрытие (mandatory/optional), проверка статусов
#    goal-conf:   mandatory {hashing, encrypt}, optional {mfa}
#    goal-access: mandatory {mfa}
#    goal-integrity: mandatory {integrity}
#    goal-audit:  mandatory {auditlog}, optional {integrity}
#    goal-availability: mandatory {backup}
def goal_status(mand, opt, placed):
    m = sum(1 for f in mand if f in placed)
    o = sum(1 for f in opt if f in placed)
    if not mand and not opt:
        return "RED"
    if mand:
        if m == len(mand):
            return "GREEN"
        return "YELLOW" if (m + o) > 0 else "RED"
    if o == len(opt):
        return "GREEN"
    return "YELLOW" if o > 0 else "RED"

GOALS = {
    "Конфиденциальность": ({"fn-hashing", "fn-encrypt"}, {"fn-mfa"}),
    "Управление доступом": ({"fn-mfa"}, set()),
    "Целостность": ({"fn-integrity"}, set()),
    "Аудит": ({"fn-auditlog"}, {"fn-integrity"}),
    "Доступность": ({"fn-backup"}, set()),
}

for name, placed in [("начальное", set()), ("после fn-hashing", {"fn-hashing"}),
                     ("после шага 1", set(p1)), ("после шага 2", set(p2))]:
    print(f"== Покрытие {name}:")
    worst = "GREEN"
    for g, (mand, opt) in GOALS.items():
        st = goal_status(mand, opt, placed)
        order = ["RED", "YELLOW", "GREEN"]
        if order.index(st) < order.index(worst):
            worst = st
        print(f"  {g:22s} -> {st}")
    print(f"  Система: {worst}")

# Ожидаемые значения из ТЗ
assert t0 == 12, t0
assert t1 == 67, t1
assert t2 == 79, t2
assert costs(p1)["blk-core"][0] == 42
assert costs(p1)["blk-store"][0] == 16
assert costs(p1)["blk-audit"][0] == 6
assert costs(p2)["blk-audit"][0] == 18
assert ceil_case == 14
print("\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: 12 / 67 / 79 / 42 / 16 / 6 / 18 / 14")
