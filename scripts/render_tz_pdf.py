#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка HTML для рендера ТЗ «Конструктор СКИБ» (v0.01.01) из markdown.
Пайплайн: pandoc (gfm) → обёртка (обложка + содержание + основной текст) →
html2pdf-next.js (Playwright + Paged.js, векторный PDF).
Шрифты локальные: Liberation Serif/Sans/Mono (полная кириллица).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/z/my-project')
MD = ROOT / 'download' / 'ТЗ_Конструктор_СКИБ.md'
OUT_HTML = ROOT / 'scripts' / 'render' / 'tz.html'
PAGES_JSON = ROOT / 'scripts' / 'render' / 'tz_pages.json'

VERSION = '0.01.01'
DATE_RU = '10 ноября 2026 г.'

# 1) Markdown → HTML-фрагмент (gfm: таблицы, fenced code, auto ids).
#    --wrap=none: pandoc не переносит строки внутри тегов.
pandoc = subprocess.run(
    ['pandoc', '--from', 'gfm+footnotes', '--to', 'html', '--wrap=none', str(MD)],
    capture_output=True, text=True, check=True,
)
body = pandoc.stdout

# 2) Убрать h1 (заголовок документа живёт на обложке).
body = re.sub(r'<h1[^>]*>.*?</h1>\s*', '', body, count=1, flags=re.S)

# 2a) Идентификаторы заголовков pandoc начинаются с цифры («1-общие-…») —
# это невалидный CSS-селектор, Paged.js падает на target-counter.
# Префиксуем все id заголовков; ссылки содержания получают тот же префикс.
body = re.sub(
    r'<(h[234])\s+id="([^"]+)"',
    lambda m: f'<{m.group(1)} id="sec-{m.group(2)}"',
    body,
)

# 3) Содержание: собрать h2/h3 с идентификаторами pandoc.
toc_items = []
for m in re.finditer(r'<h([23])\s+id="([^"]+)"[^>]*>(.*?)</h\1>', body, flags=re.S):
    level, hid, text = int(m.group(1)), m.group(2), m.group(3)
    text = re.sub(r'<[^>]+>', '', text).strip()
    toc_items.append((level, hid, text))
toc_html = ['<nav class="toc"><h2 class="toc-title">Содержание</h2><ul>']
# Номера страниц содержания: двухпроходная схема. При первом прогоне (нет
# tz_pages.json) ставится пустой заполнитель; после рендера скрипт
# extract_toc_pages.py вычисляет фактические страницы, и второй прогон
# подставляет их в готовом виде (target-counter в Paged.js 0.4.3 даёт нули).
pages_map = {}
if PAGES_JSON.exists():
    pages_map = json.loads(PAGES_JSON.read_text(encoding='utf-8'))
for level, hid, text in toc_items:
    cls = 'toc-h2' if level == 2 else 'toc-h3'
    num = pages_map.get(hid, '')
    toc_html.append(
        f'<li class="{cls}"><a href="#sec-{hid}"><span>{text}</span>'
        f'<span class="dots"></span><span class="pg">{num}</span></a></li>'
    )
toc_html.append('</ul></nav>')
toc = '\n'.join(toc_html)

# 4) Обложка.
cover = f'''
<section class="cover">
  <div class="cover-inner">
    <div class="cover-label">TECHNICAL SPECIFICATION</div>
    <div class="cover-rule"></div>
    <h1 class="cover-title">Конструктор СКИБ</h1>
    <p class="cover-subtitle">Техническое задание на разработку учебного веб-инструмента
    проектирования систем с конструктивной информационной безопасностью</p>
    <div class="cover-meta">
      <div><span>Документ</span>Техническое задание · версия {VERSION}</div>
      <div><span>Дата</span>{DATE_RU}</div>
      <div><span>Статус</span>утверждено, реализовано (v{VERSION})</div>
      <div><span>Назначение</span>спецификация инструмента</div>
      <div><span>Контекст курса</span>ГОСТ Р 72118-2025 · ГОСТ ISO/IEC TS 19249-2021</div>
    </div>
    <div class="cover-rev">Ревизия {VERSION}: модель доверия доменов (3.5), коэффициенты доверия
    в стоимости (3.3, 7.1), внешние системы и рамка периметра, перестановка панелей и тема
    интерфейса (5.1), примеры «Автономный коммунальный робот» и «Безэкипажное судно-доставщик»
    (14.4), кейсы T-T-01…T-T-10 (11.2), сборка node:22-alpine (10.2).</div>
    <div class="cover-footer">
      <span>Конструктивная информационная безопасность · учебный курс</span>
      <span>skib-lab · v{VERSION}</span>
    </div>
  </div>
</section>
'''

CSS = '''
@page {
  size: A4;
  margin: 20mm 17mm 21mm 17mm;
  @bottom-center { content: counter(page); font-family: 'Liberation Sans', sans-serif; font-size: 8.5pt; color: #8A94A0; }
  @top-right { content: 'Конструктор СКИБ · ТЗ v0.01.01'; font-family: 'Liberation Sans', sans-serif; font-size: 7.5pt; color: #A7B0BB; }
}
@page cover { margin: 0; @bottom-center { content: none; } @top-right { content: none; } }
@page toc-page { @top-right { content: none; } }

html, body { margin: 0; padding: 0; background: #FFFFFF; color: #23282E;
  font-family: 'Liberation Serif', 'DejaVu Serif', serif; font-size: 10.5pt; line-height: 1.5; }

/* ---------- Обложка ---------- */
.cover { page: cover; width: 210mm; height: 296mm; box-sizing: border-box;
  break-after: page; overflow: hidden; background: #FFFFFF; position: relative; }
.cover-inner { position: absolute; inset: 0; padding: 26mm 20mm 18mm 20mm; box-sizing: border-box;
  display: flex; flex-direction: column; }
.cover-label { font-family: 'Liberation Sans', sans-serif; font-size: 11pt; letter-spacing: 7px;
  color: #1E4E8C; font-weight: 700; }
.cover-rule { width: 34mm; height: 1.4mm; background: #1E4E8C; margin: 9mm 0 14mm 0; }
.cover-title { font-family: 'Liberation Sans', sans-serif; font-size: 37pt; line-height: 1.12;
  margin: 0 0 7mm 0; color: #14181D; font-weight: 700; }
.cover-subtitle { font-size: 13.5pt; line-height: 1.5; color: #3C4550; margin: 0 0 16mm 0; max-width: 155mm; }
.cover-meta { border-top: 0.5mm solid #1E4E8C; padding-top: 6mm; display: flex; flex-direction: column; gap: 3.2mm; max-width: 150mm; }
.cover-meta div { font-size: 11pt; color: #23282E; }
.cover-meta span { display: inline-block; min-width: 42mm; font-family: 'Liberation Sans', sans-serif;
  font-size: 8.5pt; letter-spacing: 1.5px; text-transform: uppercase; color: #6B7684; }
.cover-rev { margin-top: 11mm; max-width: 158mm; font-size: 9.5pt; line-height: 1.55; color: #4A5462;
  border-left: 1mm solid #C4CFDB; padding-left: 5mm; }
.cover-footer { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end;
  font-family: 'Liberation Sans', sans-serif; font-size: 8.5pt; color: #6B7684;
  border-top: 0.3mm solid #D9DEE4; padding-top: 4mm; }

/* ---------- Содержание ---------- */
.toc { page: toc-page; break-after: page; }
.toc-title { font-family: 'Liberation Sans', sans-serif; font-size: 16pt; color: #14181D;
  margin: 0 0 8mm 0; padding-bottom: 3mm; border-bottom: 0.6mm solid #1E4E8C; }
.toc ul { list-style: none; margin: 0; padding: 0; }
.toc li { margin: 0; }
.toc a { display: flex; align-items: baseline; text-decoration: none; color: #23282E;
  font-size: 10.5pt; padding: 1.1mm 0; }
.toc .dots { flex: 1 1 auto; border-bottom: 0.3mm dotted #B8C2CE; margin: 0 1.5mm 0.8mm 2.5mm; min-width: 6mm; }
.toc .pg { min-width: 6mm; text-align: right; color: #6B7684; }
.toc-h2 a { font-family: 'Liberation Sans', sans-serif; font-weight: 700; font-size: 10pt; margin-top: 2.2mm; }
.toc-h3 a { padding-left: 7mm; font-weight: 400; }

/* ---------- Основной текст ---------- */
.main-content h2 { font-family: 'Liberation Sans', sans-serif; font-size: 15pt; color: #14181D;
  margin: 9mm 0 4mm 0; padding-bottom: 2mm; border-bottom: 0.5mm solid #1E4E8C;
  break-after: avoid; break-inside: avoid; }
.main-content h3 { font-family: 'Liberation Sans', sans-serif; font-size: 12pt; color: #1E4E8C;
  margin: 6.5mm 0 2.5mm 0; break-after: avoid; break-inside: avoid; }
.main-content h4 { font-family: 'Liberation Sans', sans-serif; font-size: 10.5pt; color: #23282E;
  margin: 5mm 0 2mm 0; break-after: avoid; break-inside: avoid; }
.main-content p { margin: 0 0 2.6mm 0; text-align: justify; hyphens: auto; }
.main-content ul, .main-content ol { margin: 0 0 2.6mm 0; padding-left: 6.5mm; }
.main-content li { margin-bottom: 1.2mm; }
.main-content li p { margin: 0 0 1.2mm 0; }

/* Цитата-ревизия в начале документа */
.main-content blockquote { margin: 0 0 5mm 0; padding: 3.5mm 5mm; background: #F3F6FA;
  border-left: 1.2mm solid #1E4E8C; color: #333A44; font-size: 9.5pt; }
.main-content blockquote p { margin: 0 0 2mm 0; text-align: left; }
.main-content blockquote p:last-child { margin: 0; }

/* Таблицы */
table { border-collapse: collapse; width: 100%; margin: 3mm 0 4.5mm 0; font-size: 8.8pt;
  font-family: 'Liberation Sans', sans-serif; line-height: 1.35; }
th, td { border: 0.25mm solid #C4CFDB; padding: 1.5mm 2.2mm; text-align: left; vertical-align: top; }
th { background: #EDF1F6; color: #14181D; font-weight: 700; }
tr { break-inside: avoid; }
thead { break-inside: avoid; }
td { word-break: break-word; }
tbody tr:nth-child(even) td { background: #FAFBFD; }

/* Код */
pre { background: #F5F7FA; border: 0.25mm solid #DFE5EC; padding: 2.8mm 3.5mm; margin: 2.5mm 0 4mm 0;
  font-family: 'Liberation Mono', monospace; font-size: 8.2pt; line-height: 1.42; white-space: pre-wrap; }
code { font-family: 'Liberation Mono', monospace; font-size: 0.86em; background: #F5F7FA;
  padding: 0.2mm 0.8mm; border-radius: 0.8mm; }
pre code { background: none; padding: 0; font-size: 1em; }
thead { display: table-header-group; }

/* Прочее */
hr { border: none; border-top: 0.3mm solid #D9DEE4; margin: 6mm 0; }
strong { color: #14181D; }
a { color: #1E4E8C; }
'''

html = f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Конструктор СКИБ — техническое задание v{VERSION}</title>
<style>{CSS}</style>
</head>
<body>
{cover}
{toc}
<main class="main-content">
{body}
</main>
</body>
</html>
'''

OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
OUT_HTML.write_text(html, encoding='utf-8')
# Ключи содержания — для скрипта извлечения страниц.
(ROOT / 'scripts' / 'render' / 'toc_keys.json').write_text(
    json.dumps([{'level': l, 'id': h, 'text': t} for l, h, t in toc_items], ensure_ascii=False),
    encoding='utf-8',
)
filled = sum(1 for _, h, _ in toc_items if h in pages_map)
print(f'OK: {OUT_HTML} ({len(html)} bytes), toc entries: {len(toc_items)}, pages filled: {filled}/{len(toc_items)}')
