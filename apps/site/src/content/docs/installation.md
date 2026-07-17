---
title: Installation
description: Install tui-bridge on macOS, Linux, or Windows.
---

## One-line install (macOS & Linux)

```bash
curl -fsSL https://tui-bridge.vercel.app/install | bash
```

## Windows (PowerShell)

```powershell
irm https://tui-bridge.vercel.app/install.ps1 | iex
```

## Package managers

```bash
npm i -g tui-bridge@latest        # or bun/pnpm/yarn
```

## Prerequisites

- **Node.js ≥ 22** — required at runtime. The installer checks for it and
  points you to an installer if it is missing:
  - macOS/Linux: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash` then `nvm install 22`
  - Windows: `winget install OpenJS.NodeJS.LTS`
- **`cloudflared`** (optional, for internet access) — enables the public Quick
  Tunnel so your phone can connect from any network:
  - Windows: `winget install --id Cloudflare.cloudflared`
  - Debian/Ubuntu: `sudo apt install cloudflared`
  - macOS: `brew install cloudflared`

  Without `cloudflared`, use `--lan` (same WiFi) or `--no-tunnel` (local only).

## Verify

```bash
tui-bridge --version
```

## Upgrading

Re-run the install command, or `npm i -g tui-bridge@latest`. The installer
skips the download when the requested version is already installed.

## Install directory

The npm-based install puts `tui-bridge` on your global PATH via npm's global
bin directory. No shell config edits are required. If `tui-bridge` is not on
PATH after install, ensure npm's global bin is on your PATH
(`npm config get prefix` → `<prefix>/bin` on Unix, `<prefix>` on Windows).
