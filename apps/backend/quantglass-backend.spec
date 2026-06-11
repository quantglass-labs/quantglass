# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec that freezes the QuantGlass backend into one executable.

Produces a single-file ``quantglass-backend`` binary (``.exe`` on Windows) that
the Tauri desktop shell launches as a sidecar. Build via
``apps/backend/scripts/build_sidecar.py`` which renames the artifact to the Rust
target triple Tauri expects.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

hiddenimports: list[str] = []
hiddenimports += collect_submodules("app")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += [
    "duckdb",
    "cryptography",
    "websockets",
    "websockets.legacy",
    "websockets.legacy.server",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
]

datas: list = [("app/content", "app/content")]
binaries: list = []
for package in ("apscheduler", "tzlocal"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden


a = Analysis(
    ["run_server.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "matplotlib", "PySide6", "PyQt5"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="quantglass-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
