#!/usr/bin/env python3
"""
Синхронный бамп версии в 4 источниках + проверка:
  1. src/engine/types.ts    — export const APP_VERSION = 'X.Y.Z'
  2. package.json           — "version": "X.Y.Z"
  3. Makefile               — TAG := vX.Y.Z
  4. Dockerfile             — ARG APP_VERSION=X.Y.Z
Запуск: python3 scripts/bump_version.py 0.03.01j
Каждая замена проверяется assert'ом; после замены печатается сводка.
"""

import json
import pathlib
import re
import sys


def main() -> None:
    if len(sys.argv) != 2:
        print("использование: bump_version.py <новая версия>")
        sys.exit(1)
    version = sys.argv[1].strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+[a-z]?", version):
        print(f"версия должна быть вида X.Y.Z, получено: {version}")
        sys.exit(1)

    root = pathlib.Path(__file__).resolve().parent.parent

    # 1. types.ts
    types_path = root / "src/engine/types.ts"
    types = types_path.read_text(encoding="utf-8")
    pattern = re.compile(r"export const APP_VERSION = '([^']+)'")
    match = pattern.search(types)
    assert match, "APP_VERSION не найден в types.ts"
    old = match.group(1)
    assert old != version, f"версия уже {version}"
    types = pattern.sub(f"export const APP_VERSION = '{version}'", types, count=1)
    types_path.write_text(types, encoding="utf-8")
    print(f"types.ts:    {old} -> {version}")

    # 2. package.json
    pkg_path = root / "package.json"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    old_pkg = pkg["version"]
    assert old_pkg != version, f"package.json уже {version}"
    assert old_pkg == old, f"package.json ({old_pkg}) не совпадает с types.ts ({old})"
    pkg["version"] = version
    text = pkg_path.read_text(encoding="utf-8")
    text = text.replace(f'"version": "{old_pkg}"', f'"version": "{version}"', 1)
    pkg_path.write_text(text, encoding="utf-8")
    print(f"package.json: {old_pkg} -> {version}")

    # 3. Makefile
    makefile_path = root / "Makefile"
    makefile = makefile_path.read_text(encoding="utf-8")
    m = re.search(r"TAG\s*\?=\s*([^\s#]+)", makefile)
    assert m, "TAG ?= не найден в Makefile"
    old_tag = m.group(1)
    assert old_tag == old, f"Makefile TAG ({old_tag}) не совпадает с types.ts ({old})"
    makefile = re.sub(
        r"TAG\s*\?=\s*" + re.escape(old_tag),
        f"TAG    ?= {version}",
        makefile,
        count=1,
    )
    makefile_path.write_text(makefile, encoding="utf-8")
    print(f"Makefile:    {old_tag} -> {version}")

    # 4. Dockerfile
    dockerfile_path = root / "Dockerfile"
    dockerfile = dockerfile_path.read_text(encoding="utf-8")
    m = re.search(r"ARG APP_VERSION=([^\s]+)", dockerfile)
    assert m, "ARG APP_VERSION не найден в Dockerfile"
    old_arg = m.group(1)
    assert old_arg == old, f"Dockerfile ({old_arg}) не совпадает с types.ts ({old})"
    dockerfile = dockerfile.replace(f"ARG APP_VERSION={old_arg}", f"ARG APP_VERSION={version}", 1)
    dockerfile_path.write_text(dockerfile, encoding="utf-8")
    print(f"Dockerfile:  {old_arg} -> {version}")

    print(f"\nСинхронно: {old} -> {version}")


if __name__ == "__main__":
    main()
