# -*- coding: utf-8 -*-
"""Диаграмма для анализа отчёта советника: обещано / факт анализатора / пересчёт движка v0.03.01a."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

categories = ['Декомпозиция\ndom-6', 'Посредник\ndom-5', 'Посредник\ndom-6', 'Посредник\ndom-3', 'Шлюз\ndom-4-gw']
promised = [35, 20, 15, 10, 0]        # обещания отчёта (старая версия советчика); бонус не обещался
analyzer = [10, -1, 0, -1, 42]        # фактическая экономия по отчёту (отрицательная = рост стоимости)
engine = [0, 20, 15, 10, 42]          # пересчёт движка конструктора v0.03.01a на модели A

x = np.arange(len(categories))
w = 0.26

fig, ax = plt.subplots(figsize=(9.4, 4.8), dpi=200, constrained_layout=True)
b1 = ax.bar(x - w, promised, w, label='Обещано в отчёте v1.2.5', color='#A9C7CD', edgecolor='#6E93A0', linewidth=0.6)
b2 = ax.bar(x, analyzer, w, label='Факт анализатора (честное применение)', color='#D4875A', edgecolor='#A45F33', linewidth=0.6)
b3 = ax.bar(x + w, engine, w, label='Пересчёт движка конструктора v0.03.01a', color='#1B6B7A', edgecolor='#0E4551', linewidth=0.6)

for bars in (b1, b2, b3):
    for rect in bars:
        v = rect.get_height()
        if v != 0:
            ax.annotate(f'{v:+d}'.replace('+', '' if v < 0 else '+'),
                        xy=(rect.get_x() + rect.get_width() / 2, v),
                        xytext=(0, 3 if v >= 0 else -11), textcoords='offset points',
                        ha='center', va='bottom', fontsize=8, color='#2A2A2A')

ax.axhline(0, color='#555555', linewidth=0.8)
ax.set_ylabel('Экономия C_системы, у.е.', fontsize=10)
ax.set_ylim(-8, 50)
ax.set_xticks(x, categories, fontsize=9)
ax.tick_params(axis='y', labelsize=9)
ax.grid(axis='y', color='#D8D8D8', linewidth=0.5, alpha=0.7)
ax.set_axisbelow(True)
for spine in ('top', 'right'):
    ax.spines[spine].set_visible(False)
ax.legend(loc='lower center', bbox_to_anchor=(0.5, 1.01), ncols=3, frameon=False, fontsize=9)

fig.savefig('/home/z/my-project/scripts/advisor_chart.png', facecolor='white')
print('saved')
