#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import sys
import zipfile

ROOT = pathlib.Path.cwd().resolve()
DIST = (ROOT / os.environ.get("ATAB_EXTENSION_DIR", "apps/extension/dist")).resolve()
OUTPUT_DIR = (ROOT / os.environ.get("ATAB_ARTIFACT_DIR", "artifacts")).resolve()
FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:\.\d+)?$")


def main() -> int:
    manifest_path = DIST / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Manifest 不存在：{manifest_path}")
    if OUTPUT_DIR == DIST or DIST in OUTPUT_DIR.parents:
        raise SystemExit("产物输出目录不得位于扩展 dist 内部")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest.get("version")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise SystemExit("Manifest 缺少有效数字 version")

    entries = sorted(DIST.rglob("*"))
    symlinks = [path for path in entries if path.is_symlink()]
    if symlinks:
        names = ", ".join(path.relative_to(DIST).as_posix() for path in symlinks[:5])
        raise SystemExit(f"扩展目录不得包含符号链接：{names}")

    files = [path for path in entries if path.is_file()]
    if not files:
        raise SystemExit(f"扩展目录为空：{DIST}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    archive = OUTPUT_DIR / f"atab-extension-{version}.zip"
    checksum_file = archive.with_suffix(".zip.sha256")
    temp_archive = archive.with_suffix(".zip.tmp")
    temp_checksum = checksum_file.with_suffix(".sha256.tmp")
    for path in (temp_archive, temp_checksum):
        if path.exists():
            path.unlink()

    with zipfile.ZipFile(
        temp_archive,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as zf:
        for path in files:
            relative = path.relative_to(DIST).as_posix()
            info = zipfile.ZipInfo(relative, FIXED_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zf.writestr(info, path.read_bytes())

    if archive.exists():
        archive.unlink()
    shutil.move(temp_archive, archive)

    with zipfile.ZipFile(archive, "r") as zf:
        names = zf.namelist()
        if "manifest.json" not in names:
            raise SystemExit("生成的 ZIP 缺少 manifest.json")
        if len(names) != len(set(names)):
            raise SystemExit("生成的 ZIP 包含重复路径")
        if any(name.startswith("/") or ".." in pathlib.PurePosixPath(name).parts for name in names):
            raise SystemExit("生成的 ZIP 包含不安全路径")

    digest = sha256_file(archive)
    temp_checksum.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    if checksum_file.exists():
        checksum_file.unlink()
    shutil.move(temp_checksum, checksum_file)

    print(json.dumps({
        "status": "ok",
        "version": version,
        "archive": display_path(archive),
        "checksum": display_path(checksum_file),
        "sha256": digest,
        "files": len(files),
        "bytes": archive.stat().st_size,
    }, ensure_ascii=False, indent=2))
    return 0


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_path(path: pathlib.Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("打包已取消", file=sys.stderr)
        raise SystemExit(130)
