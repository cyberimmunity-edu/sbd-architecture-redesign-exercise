#!/usr/bin/env python3
# Восстановление табуляции в рецептах Makefile и валидация синтаксиса.
# Причина: правки текстовыми инструментами заменяют таб на 8 пробелов
# (исходная регрессия v0.01.04 и повтор в этом сеансе). Скрипт конвертирует
# отступы рецептов обратно в таб и прогоняет сухую проверку всех целей.
# Запуск: python3 scripts/fix_makefile_tabs.py

import subprocess
import sys
from pathlib import Path

MAKEFILE = Path('/home/z/my-project/Makefile')
DRY_TARGETS = [
    'help', 'install', 'dev', 'build', 'preview', 'lint', 'test-unit',
    'test-unit-coverage', 'test-e2e', 'test', 'zip', 'docker-build',
    'docker-run', 'docker-start', 'docker-stop', 'docker-logs',
    'docker-shell', 'clean', 'distclean',
]


def fix_tabs(text: str) -> tuple[str, int]:
    fixed_lines = []
    fixed = 0
    prev_continuation = False
    for line in text.split('\n'):
        stripped = line.rstrip('\n')
        starts_with_spaces = stripped.startswith('    ')
        if starts_with_spaces and not prev_continuation:
            # Строка рецепта с отступом пробелами -> один таб.
            fixed_lines.append('\t' + stripped.lstrip())
            fixed += 1
        else:
            fixed_lines.append(stripped)
        prev_continuation = stripped.rstrip().endswith('\\')
    return '\n'.join(fixed_lines), fixed


def main() -> int:
    text = MAKEFILE.read_text(encoding='utf-8')
    fixed_text, fixed = fix_tabs(text)
    if fixed:
        MAKEFILE.write_text(fixed_text, encoding='utf-8')
        print(f'Исправлено строк рецептов (пробелы -> таб): {fixed}')
    else:
        print('Строки рецептов уже с табуляцией.')

    remaining = [
        f'{i + 1}: {line}'
        for i, line in enumerate(MAKEFILE.read_text(encoding='utf-8').split('\n'))
        if line.startswith('    ') and not line.rstrip().endswith('\\')
    ]
    # Продолжения .PHONY и zip-списка следуют за строками с «\» и не должны попасть сюда.
    leftovers = [
        item for item in remaining
        if not MAKEFILE.read_text(encoding='utf-8').split('\n')[int(item.split(':')[0]) - 2].rstrip().endswith('\\')
    ]
    if leftovers:
        print('Остались строки с отступом пробелами вне продолжений:')
        print('\n'.join(leftovers))
        return 1

    run = subprocess.run(
        ['make', '--no-print-directory', '-n', *DRY_TARGETS],
        cwd=MAKEFILE.parent, capture_output=True, text=True,
    )
    if run.returncode != 0:
        print('Сухой прогон целей не прошёл:')
        print(run.stderr)
        return 1
    print(f'Сухой прогон {len(DRY_TARGETS)} целей: OK (синтаксис и табуляция корректны).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
