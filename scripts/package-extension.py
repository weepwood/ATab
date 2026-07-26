#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import pathlib
import shutil
import sys
import zipfile

ROOT = pathlib.Path.cwd()
DIST = (ROOT / os.environ.get("ATAB_EXTENSION_DIR", "apps/extension/dist")).resolve()
OUTPUT_DIR = (ROOT / os.environ.get("ATAB_ARTIFACT_DIR", "artifacts")).resolve()
FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def main() -> int:
    manifest_path = DIST / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Manifest 不存在：{manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise SystemExit("Manifest 缺少有效 version")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    archive = OUTPUT_DIR / f"atab-extension-{version}.zip"
    temp_archive = archive.with_suffix(".zip.tmp")
    if temp_archive.exists():
        temp_archive.unlink()

    files = sorted(path for path in DIST.rglob("*") if path.is_file())
    if not files:
        raise SystemExit(f"扩展目录为空：{DIST}")

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
        if any(name.startswith("/") or ".." in pathlib.PurePosixPath(name).parts for name in names):
            raise SystemExit("生成的 ZIP 包含不安全路径")

    print(json.dumps({
        "status": "ok",
        "version": version,
        "archive": str(archive.relative_to(ROOT)),
        "files": len(files),
        "bytes": archive.stat().st_size,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("打包已取消", file=sys.stderr)
        raise SystemExit(130)
