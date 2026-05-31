# 2. Installation

[← Introduction](01-introduction.md) · [Contents](README.md) · [Next: Getting started →](03-getting-started.md)

---

AlphaTerminal ships as a **single, self‑contained desktop application**. You do **not** need to install Python, Node.js, or start a server separately — the analytics backend is bundled inside the app and starts automatically when you launch it.

```mermaid
flowchart LR
    U[You double-click<br/>AlphaTerminal] --> D[Desktop window opens]
    D --> S[App silently starts<br/>the bundled backend]
    S --> P[Backend binds a private<br/>local port 127.0.0.1]
    P --> R[UI connects · Backend Online]
    style U fill:#1d4ed8,color:#fff
    style R fill:#0f766e,color:#fff
```

When you quit the app, the bundled backend is shut down with it. Nothing is left running.

---

## System requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Operating system | Linux (x86‑64), Windows 10, macOS 12 | Latest stable release |
| Memory (RAM) | 4 GB | 8 GB+ |
| Disk space | 500 MB for the app + data | 2 GB+ |
| Network | Needed to download market data | Broadband |
| Optional: local AI | — | [Ollama](https://ollama.com) for richer narration |

> AI narration is **optional**. Without Ollama installed, AlphaTerminal still produces clear, template‑based explanations for every signal. See [Settings → AI](10-settings.md#ai).

---

## Linux

Three package formats are produced. Pick the one that matches your distribution.

### AppImage (works on most distributions)

The AppImage is fully portable — no installation required.

```bash
# 1. Make it executable
chmod +x AlphaTerminal_0.1.0_amd64.AppImage

# 2. Run it
./AlphaTerminal_0.1.0_amd64.AppImage
```

### Debian / Ubuntu (.deb)

```bash
sudo apt install ./AlphaTerminal_0.1.0_amd64.deb
# then launch "AlphaTerminal" from your applications menu
```

### Fedora / RHEL (.rpm)

```bash
sudo dnf install ./AlphaTerminal-0.1.0-1.x86_64.rpm
# then launch "AlphaTerminal" from your applications menu
```

> **First‑run note (Linux):** if your desktop blocks the AppImage, ensure FUSE is available (`sudo apt install libfuse2` on Debian/Ubuntu) or extract and run with `./AlphaTerminal_0.1.0_amd64.AppImage --appimage-extract-and-run`.

---

## Windows

Run the installer (`AlphaTerminal_0.1.0_x64-setup.exe` / `.msi`) and follow the prompts, then launch **AlphaTerminal** from the Start menu.

> **SmartScreen:** because the current build is not yet code‑signed, Windows may show *"Windows protected your PC."* Click **More info → Run anyway**. A signed build removes this warning.

---

## macOS

Open the `.dmg` and drag **AlphaTerminal** into **Applications**, then launch it from Launchpad.

> **Gatekeeper:** an unsigned/un‑notarised build will report *"AlphaTerminal can't be opened because Apple cannot check it for malicious software."* Right‑click the app → **Open** → **Open**, or allow it under **System Settings → Privacy & Security**. A notarised build removes this step.

---

## Where your data is stored

On first launch the app creates a per‑user data folder. Nothing is stored system‑wide.

| OS | Data location |
|----|---------------|
| **Linux** | `~/.local/share/AlphaTerminal` (or `$XDG_DATA_HOME/AlphaTerminal`) |
| **Windows** | `%APPDATA%\AlphaTerminal` |
| **macOS** | `~/Library/Application Support/AlphaTerminal` |

This folder holds your SQLite state database, the analytics store, downloaded candles, and your encrypted secrets. See [Backup & recovery](13-backup-recovery.md) to learn how to copy or restore it.

---

## Verifying the install

After launching, look at the top of the window for a status pill:

- **● Backend Online** (green) — everything is working.
- **Backend Connecting…** — the bundled backend is still starting; this clears within a few seconds on first run.
- **Backend Unavailable** — see [Troubleshooting](14-troubleshooting-faq.md#backend-shows-unavailable).

---

[← Introduction](01-introduction.md) · [Contents](README.md) · [Next: Getting started →](03-getting-started.md)
