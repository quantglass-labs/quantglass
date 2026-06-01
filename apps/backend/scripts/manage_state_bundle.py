# SPDX-FileCopyrightText: 2026 QuantGlass contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import argparse
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _bundle_entries() -> list[tuple[str, Path]]:
    settings = get_settings()
    secrets_dir = settings.sqlite_path.parent / "secrets"
    return [
        ("state/quantglass.db", settings.sqlite_path),
        ("analytics/quantglass.duckdb", settings.duckdb_path),
        ("parquet", settings.parquet_dir),
        ("state/secrets/api_keys.enc", secrets_dir / "api_keys.enc"),
        ("state/secrets/api_keys.key", secrets_dir / "api_keys.key"),
    ]


def export_bundle(output_path: Path | None = None) -> Path:
    settings = get_settings()
    backup_dir = settings.data_dir / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = output_path or backup_dir / f"quantglass-backup-{_timestamp()}.zip"
    manifest: dict[str, object] = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "service": settings.app_name,
        "files": [],
    }

    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for archive_root, source_path in _bundle_entries():
            if not source_path.exists():
                continue
            if source_path.is_file():
                archive.write(source_path, archive_root)
                manifest["files"].append(archive_root)
                continue
            for file_path in source_path.rglob("*"):
                if not file_path.is_file():
                    continue
                relative_path = file_path.relative_to(source_path).as_posix()
                archive_name = f"{archive_root}/{relative_path}"
                archive.write(file_path, archive_name)
                manifest["files"].append(archive_name)

        archive.writestr("manifest.json", json.dumps(manifest, indent=2, sort_keys=True))

    print(bundle_path)
    return bundle_path


def restore_bundle(bundle_path: Path) -> None:
    settings = get_settings()
    if not bundle_path.exists():
        raise FileNotFoundError(bundle_path)

    pre_restore_bundle = settings.data_dir / "backups" / f"pre-restore-{_timestamp()}.zip"
    export_bundle(pre_restore_bundle)

    with zipfile.ZipFile(bundle_path, "r") as archive:
        for member in archive.namelist():
            if member.endswith("/") or member == "manifest.json":
                continue
            target_path = settings.data_dir / member
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member, "r") as source_handle, target_path.open("wb") as target_handle:
                shutil.copyfileobj(source_handle, target_handle)

    print(pre_restore_bundle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export or restore QuantGlass local state bundles.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("output", nargs="?", type=Path)

    restore_parser = subparsers.add_parser("restore")
    restore_parser.add_argument("bundle", type=Path)

    args = parser.parse_args()
    if args.command == "export":
        export_bundle(args.output)
        return
    restore_bundle(args.bundle)


if __name__ == "__main__":
    main()