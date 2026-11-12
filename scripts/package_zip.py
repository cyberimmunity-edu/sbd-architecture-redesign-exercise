#!/usr/bin/env python3
# Пересборка архива поставки skib-lab-v0.01.10-src.zip (v0.01.10).
# Манифест берётся из предыдущего архива поставки; при пересборке добавляются
# новые файлы (scripts/shot-v010.mjs, docs/img/08-goal-fit.png) и
# исключаются устаревшие. Отчёты (ТЗ и отчёт по трассировке, md/pdf) остаются
# в каталоге docs/ архива — отдельно не поставляются. tool-results,
# .zscripts и прочие рабочие каталоги не входят.

import sys
import zipfile
from pathlib import Path

ROOT = Path('/home/z/my-project')
CUR_ZIP = ROOT / 'download' / 'skib-lab-v0.01.10-src.zip'

ADD_FILES = [
    'scripts/shot-v010.mjs',
    'docs/img/08-goal-fit.png',
]
REMOVE_FILES = [
]


def fix_zip_name(name: str) -> str:
    """Имена в старых архивах писались в UTF-8 без флага — zipfile читает
    их как CP437 (мojибake). Восстановление: CP437 → байты → UTF-8."""
    if name.isascii():
        return name
    try:
        return name.encode('cp437').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def main() -> int:
    with zipfile.ZipFile(CUR_ZIP) as cur:
        manifest = [fix_zip_name(name) for name in cur.namelist() if not name.endswith('/')]
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
