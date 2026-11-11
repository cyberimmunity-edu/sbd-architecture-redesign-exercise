#!/usr/bin/env python3
"""Пост-обработка ТЗ docx (правила toc.md):
1) удалить пустые <w:pgNumType/> (смущают WPS);
2) подставить явные форматы в поля PAGE футеров:
   первая секция с футером (СОДЕРЖАНИЕ) -> PAGE \\* ROMAN \\* MERGEFORMAT,
   вторая (основная часть)              -> PAGE \\* arabic \\* MERGEFORMAT.
"""
import re
import shutil
import sys
import zipfile

DOCX = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/ТЗ_Конструктор_СКИБ.docx"
TMP = DOCX + ".tmp"

with zipfile.ZipFile(DOCX) as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc_xml = data["word/document.xml"].decode("utf-8")

# 1) пустые pgNumType
before = doc_xml.count("<w:pgNumType/>")
doc_xml = doc_xml.replace("<w:pgNumType/>", "")
print(f"removed empty pgNumType: {before}")

# 2) порядок footerReference в document.xml = порядок секций с футерами
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rel_map = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
footer_refs = re.findall(
    r'<w:footerReference w:type="default" r:id="([^"]+)"/>', doc_xml)
print("footer refs in order:", footer_refs)
assert len(footer_refs) == 2, "ожидается ровно 2 секции с футером (TOC + body)"

fmt_by_index = ["ROMAN", "arabic"]
for idx, rid in enumerate(footer_refs):
    target = rel_map[rid]
    path = "word/" + target.lstrip("/")
    xml = data[path].decode("utf-8")
    fmt = fmt_by_index[idx]
    xml_new, n = re.subn(
        r'(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)',
        rf'\1 PAGE \\* {fmt} \\* MERGEFORMAT \2',
        xml)
    data[path] = xml_new.encode("utf-8")
    print(f"{path}: patched {n} PAGE field(s) -> {fmt}")

data["word/document.xml"] = doc_xml.encode("utf-8")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(TMP, DOCX)
print("OK:", DOCX)
