#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Извлечение фактических страниц заголовков из отрендеренного PDF
для заполнения содержания во втором проходе (Paged.js 0.4.3 выдаёт
нули для target-counter на этом документе).
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path('/home/z/my-project')
PDF = ROOT / 'download' / 'Отчёт_Конструктор_СКИБ.pdf'
KEYS = ROOT / 'scripts' / 'render' / 'report_toc_keys.json'
OUT = ROOT / 'scripts' / 'render' / 'report_pages.json'

keys = json.loads(KEYS.read_text(encoding='utf-8'))

# Число страниц PDF.
info = subprocess.run(['pdfinfo', str(PDF)], capture_output=True, text=True, check=True).stdout
n_pages = int(re.search(r'Pages:\s+(\d+)', info).group(1))

# Нормализованный текст каждой страницы.
page_text = {}
for p in range(1, n_pages + 1):
    txt = subprocess.run(
        ['pdftotext', '-f', str(p), '-l', str(p), str(PDF), '-'],
        capture_output=True, text=True, check=True,
    ).stdout
    page_text[p] = re.sub(r'\s+', ' ', txt)

def norm(s: str) -> str:
    return re.sub(r'\s+', ' ', s).strip()

result = {}
for item in keys:
    needle = norm(item['text'])
    hits = [p for p, t in page_text.items() if needle in t]
    if not hits:
        print(f'!! не найдено: {needle[:60]}')
        continue
    # Первое вхождение после страниц содержания (обложка = 1, содержание = 2..k):
    # заголовок встречается в содержании и в основном тексте — берём последнее
    # вхождение, оно всегда в теле (ссылки в тексте не совпадают с полным
    # текстом заголовка).
    result[item['id']] = max(hits)

OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'OK: {OUT}: {len(result)}/{len(keys)} заголовков')
missing = [i['text'] for i in keys if i['id'] not in result]
for m in missing:
    print('MISS:', m)
