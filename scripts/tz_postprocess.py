#!/usr/bin/env python3
# Постобработка docx ТЗ: очистка pgNumType, удаление артефакта-дубля TOC, уплотнение TOC
import sys, zipfile, shutil, re

src = sys.argv[1] if len(sys.argv) > 1 else 'TZ_SecArch_Lab_v1.0.docx'
tmp = src + '.tmp'

zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    data = zin.read(it.filename)
    if it.filename == 'word/document.xml':
        t = data.decode('utf-8')
        # 1) пустой pgNumType в секции обложки
        t = t.replace('<w:pgNumType/>', '')
        # 2) артефактный гипертекст-дубль первой записи оглавления
        t, n = re.subn(r'<w:hyperlink w:history="1" w:anchor="_Toc1">.*?</w:hyperlink>', '', t, count=1)
        if n != 1:
            print('WARN: TOC artifact not found (already removed?)')
        # 3) уплотнение интервалов записей оглавления
        t1 = '<w:pStyle w:val="TOC1"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9026"/></w:tabs><w:spacing w:before="120" w:after="60"/>'
        t1n = '<w:pStyle w:val="TOC1"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9026"/></w:tabs><w:spacing w:before="120" w:after="0"/>'
        t2 = '<w:pStyle w:val="TOC2"/><w:ind w:left="360"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9026"/></w:tabs><w:spacing w:before="120" w:after="60"/>'
        t2n = '<w:pStyle w:val="TOC2"/><w:ind w:left="360"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9026"/></w:tabs><w:spacing w:before="0" w:after="0"/>'
        c1, c2 = t.count(t1), t.count(t2)
        t = t.replace(t1, t1n).replace(t2, t2n)
        print(f'TOC entries tightened: TOC1={c1}, TOC2={c2}')
        data = t.encode('utf-8')
    zout.writestr(it, data)
zin.close()
zout.close()
shutil.move(tmp, src)
print('postprocess done:', src)
