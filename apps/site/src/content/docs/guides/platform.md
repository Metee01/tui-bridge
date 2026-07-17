---
title: Platform support
description: Operating systems and external dependencies.
---

## Platform status

| Platform | Status |
| --- | --- |
| Windows (ConPTY) | Primary |
| Linux | Supported (secondary) |
| macOS | Fast-follower (untested in MVP) |

## Native dependency: `node-pty`

`tui-bridge` uses `node-pty` (ConPTY on Windows) to spawn the TUI. `npm install`
may need a native build toolchain or prebuilt binaries.

If the global install fails to build `node-pty`, install a compiler:

- **Windows**: Visual Studio Build Tools (`winget install Microsoft.VisualStudio.2022.BuildTools`) with the "Desktop development with C++" workload.
- **Linux**: `sudo apt install build-essential` (Debian/Ubuntu).
- **macOS**: `xcode-select --install`.

## External dependency: `cloudflared`

`cloudflared` is an **external binary on PATH**, not an npm package. It is
optional; it enables the public Quick Tunnel so your phone can connect from any
network.

- Windows: `winget install --id Cloudflare.cloudflared`
- Debian/Ubuntu: `sudo apt install cloudflared`
- macOS: `brew install cloudflared`

Without it, use `--lan` (same-WiFi, binds `0.0.0.0`) or `--no-tunnel`
(local-only `127.0.0.1`).

## Node.js

Node `>=22` is required (`engines` field in `package.json`).
