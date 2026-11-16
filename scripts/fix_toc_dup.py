# -*- coding: utf-8 -*-
"""Убрать дубль первой записи TOC: в параграфе поля (begin+instrText+separate) удалить
видимые run'ы после первого separate — записи оглавления идут отдельными параграфами."""
import re
import shutil
import sys
import zipfile

path = sys.argv[1]
tmp = path + '.tmp'

with zipfile.ZipFile(path, 'r') as zin:
    items = zin.infolist()
    data = {i.filename: zin.read(i.filename) for i in items}

xml = data['word/document.xml'].decode('utf-8')
m = re.search(r'<w:sdt>.*?</w:sdt>', xml, re.S)
sdt = m.group(0)
paras = re.findall(r'<w:p\b.*?</w:p>', sdt, re.S)
first = paras[0]
# Граница: конец run'а, содержащего первый fldCharType="separate"
sep_idx = first.find('w:fldCharType="separate"')
close_r = first.find('</w:r>', sep_idx)
if close_r == -1:
    print('separate не найден — файл не изменён')
    sys.exit(0)
kept = first[:close_r + len('</w:r>')] + '</w:p>'
new_sdt = sdt.replace(first, kept, 1)
if new_sdt != sdt:
    xml = xml.replace(sdt, new_sdt, 1)
    data['word/document.xml'] = xml.encode('utf-8')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for i in items:
            zout.writestr(i, data[i.filename])
    shutil.move(tmp, path)
    print('исправлено: дублирующая запись TOC в параграфе поля удалена')
else:
    print('изменений нет')
