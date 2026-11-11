#!/usr/bin/env python3
# Пересборка архива поставки skib-lab-v0.01.04-src.zip (v0.01.04).
# Манифест берётся из текущего архива поставки; при пересборке добавляются
# новые файлы (docs/github-pages.md, .github/workflows/gh-pages.yml) и
# исключаются устаревшие (скрипты снимков старых ревизий и лог тестов
# v0.01.01 удалены при чистке старых файлов задачи). Отчёты (ТЗ и отчёт по трассировке, md/pdf) остаются
# в каталоге docs/ архива — отдельно не поставляются. tool-results,
# .zscripts и прочие рабочие каталоги не входят.

import sys
import zipfile
from pathlib import Path

ROOT = Path('/home/z/my-project')
CUR_ZIP = ROOT / 'download' / 'skib-lab-v0.01.04-src.zip'

ADD_FILES = [
    'docs/github-pages.md',
    '.github/workflows/gh-pages.yml',
    'tests/unit/makefile.test.ts',
]
REMOVE_FILES = [
    'scripts/shot-v002.mjs',
    'scripts/shot-v004.mjs',
    'test-artifacts/runs-v0.01.01.md',
]


def main() -> int:
    with zipfile.ZipFile(CUR_ZIP) as cur:
        manifest = [name for name in cur.namelist() if not name.endswith('/')]
    names = [name for name in manifest if name not in REMOVE_FILES]
    names = list(dict.fromkeys(names + ADD_FILES))

    missing = [name for name in names if not (ROOT / name).is_file()]
    if missing:
        print('Отсутствуют файлы из манифеста:')
        for name in missing:
            print(' -', name)
        return 1

    tmp = CUR_ZIP.with_name(CUR_ZIP.name + '.tmp')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        for name in sorted(names):
            out.write(ROOT / name, arcname=name)
    tmp.replace(CUR_ZIP)

    with zipfile.ZipFile(CUR_ZIP) as check:
        names_in_zip = set(check.namelist())
    count = len(names_in_zip)
    added = [name for name in ADD_FILES if name in names_in_zip]
    leftover = [name for name in REMOVE_FILES if name in names_in_zip]
    size = CUR_ZIP.stat().st_size
    print(f'OK: {CUR_ZIP.name}: {count} файлов, {size} байт')
    print('Добавлено:', ', '.join(added) if added else 'нет')
    if leftover:
        print('Остались устаревшие:', ', '.join(leftover))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
