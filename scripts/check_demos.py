#!/usr/bin/env python3
"""Проверка арифметики контрольных примеров v0.01.01 (формула с коэффициентами доверия)."""
import math

def cost(block, s, m, k):
    base = block * (s if s > 0 else 1) * m
    return math.ceil(base * k)

def connectivity(e_in, e_out):
    e = e_in + e_out
    return e / 2 if e >= 2 else 1

print("=== Пример 1: автономный коммунальный робот ===")
# perc: НДБ, S=0, E=1 (out 1)
c_perc = cost(3, 0, 1, 0.1); print(f"blk-perc  НДБ   C=ceil(3*1*1*0.1)={c_perc}")
# plan: ДДБПЦД, S=4 (2+2), E=3 (in2,out1) M=1.5, K=10
c_plan = cost(4, 4, connectivity(2,1), 10); print(f"blk-plan  ДДБПЦД S=4 M={connectivity(2,1)} C={c_plan}")
# drive: ДДБ, S=3, E=1 (in1,out0) M=1, K=5
c_drive = cost(3, 3, connectivity(1,0), 5); print(f"blk-drive ДДБ   S=3 M={connectivity(1,0)} C={c_drive}")
# link: ДДБПЦД, S=5 (3+2), E=4 (in2,out2) M=2, K=10
c_link = cost(2, 5, connectivity(2,2), 10); print(f"blk-link  ДДБПЦД S=5 M={connectivity(2,2)} C={c_link}")
sys1 = c_perc + c_plan + c_drive + c_link
print(f"C_системы = {sys1}")
# без размещений: все НДБ, S=0
empty = [cost(b,0,1,0.1) for b in (3,4,3,2)]
print(f"без размещений: {empty}, сумма {sum(empty)}")
# только fn-auth (3) в blk-link: link ДДБПЦД S=3 M=2 K=10
print(f"только fn-auth в link: ceil(2*3*2*10)={cost(2,3,2,10)}, система={sum([cost(3,0,1,0.1)])+cost(2,3,2,10)+cost(4,0,1,0.1)+cost(3,0,1,0.1)}")

print()
print("=== Пример 2: безэкипажное судно-доставщик ===")
# radio: ДДБПЦД, S=5 (2+3), E=4 (in2,out2) M=2, K=10
c_radio = cost(2, 5, connectivity(2,2), 10); print(f"blk-radio ДДБПЦД S=5 M={connectivity(2,2)} C={c_radio}")
# avoid: ДДБ, S=4, E=2 (in1,out1) M=1, K=5
c_avoid = cost(3, 4, connectivity(1,1), 5); print(f"blk-avoid ДДБ   S=4 M={connectivity(1,1)} C={c_avoid}")
# nav: ДДБ, S=2, E=4 (in2,out2) M=2, K=5
c_nav = cost(4, 2, connectivity(2,2), 5); print(f"blk-nav   ДДБ   S=2 M={connectivity(2,2)} C={c_nav}")
# cargo: ДДБ, S=3, E=2 (in1,out1) M=1, K=5
c_cargo = cost(2, 3, connectivity(1,1), 5); print(f"blk-cargo ДДБ   S=3 M={connectivity(1,1)} C={c_cargo}")
sys2 = c_radio + c_avoid + c_nav + c_cargo
print(f"C_системы = {sys2}")
empty2 = [cost(b,0,1,0.1) for b in (2,3,4,2)]
print(f"без размещений: {empty2}, сумма {sum(empty2)}")
