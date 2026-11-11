#!/usr/bin/env python3
"""Исправление поля TOC после add_toc_placeholders.py.

docx-js кладёт begin+instrText+separate в один абзац поля TOC, а скрипт
вставки заглушек добавляет первую запись внутрь этого же абзаца — в
результате первая строка оглавления дублируется (гиперссылка без номера
страницы + обычная запись с номером). Скрипт: переносит runs поля
(begin/instrText/separate) в первый абзац-запись и удаляет лишний
гиперссылочный дубль.
"""
import sys
import zipfile
import shutil

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
DOCX = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/ТЗ_Конструктор_СКИБ.docx"
TMP = DOCX + ".tmp"

with zipfile.ZipFile(DOCX) as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

root = etree.fromstring(data["word/document.xml"])

# sdt оглавления
toc_sdt = None
for sdt in root.iter(f"{{{W}}}sdt"):
    for alias in sdt.iter(f"{{{W}}}alias"):
        if alias.get(f"{{{W}}}val") == "Table of Contents":
            toc_sdt = sdt
            break
    if toc_sdt is not None:
        break
assert toc_sdt is not None, "sdt оглавления не найден"

content = toc_sdt.find(f"{{{W}}}sdtContent")
paras = list(content.findall(f"{{{W}}}p"))

field_para = None
for p in paras:
    for instr in p.iter(f"{{{W}}}instrText"):
        if (instr.text or "").strip().startswith("TOC"):
            field_para = p
            break
    if field_para is not None:
        break
assert field_para is not None, "абзац поля TOC не найден"

# runs поля: begin / instrText TOC / separate (только прямые дочерние w:r)
field_runs = []
for r in field_para.findall(f"{{{W}}}r"):
    if r.find(f"{{{W}}}fldChar") is not None or r.find(f"{{{W}}}instrText") is not None:
        field_runs.append(r)
assert 2 <= len(field_runs) <= 4, f"неожиданное число runs поля: {len(field_runs)}"

# первый абзац-запись (следующий за абзацем поля)
idx = list(content).index(field_para)
entry_para = None
for sib in list(content)[idx + 1:]:
    if sib.tag == f"{{{W}}}p":
        entry_para = sib
        break
assert entry_para is not None, "абзац первой записи не найден"

# вставить runs поля после pPr первой записи, сохранить порядок
ppr = entry_para.find(f"{{{W}}}pPr")
insert_at = 1 if ppr is not None else 0
for i, r in enumerate(field_runs):
    field_para.remove(r)
    entry_para.insert(insert_at + i, r)

# удалить абзац поля (в нём осталась только лишняя гиперссылка-дубль)
text_left = "".join(t.text or "" for t in field_para.iter(f"{{{W}}}t"))
print(f"удалённый дубль: {text_left!r}")
content.remove(field_para)

data["word/document.xml"] = etree.tostring(
    root, xml_declaration=True, encoding="UTF-8", standalone=True)

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(TMP, DOCX)
print("OK:", DOCX)
