<div align="center">

# tui-bridge

**Bridge any TUI to your phone.** No port forwarding, no central server, no network configuration.

[![npm version](https://img.shields.io/npm/v/tui-bridge.svg)](https://www.npmjs.com/package/tui-bridge)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A522-green.svg)](https://nodejs.org)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](#platform-support)

</div>

---

`tui-bridge` runs any terminal UI inside a local PTY and exposes it over an
ephemeral HTTPS URL via a Cloudflare Quick Tunnel. Scan the QR code it prints,
and drive the **same** terminal from your phone — with a mobile-friendly
xterm.js UI, on-screen modifier keys, and horizontal-scroll mirroring that
keeps the desktop terminal grid intact.

```
 your terminal ──► tui-bridge ──► node-pty ──► <any TUI: opencode, htop, lazygit…>
                       │
                       └──► localhost HTTP/WS └──► cloudflared quick tunnel ──► mobile xterm.js
```

## Table of contents

- [Quick start](#quick-start)
- [Manual install (without npm)](#manual-install-without-npm)
- [How it works](#how-it-works)
- [CLI reference](#cli-reference)
- [Input model](#input-model)
- [Security model](#security-model)
- [Repository layout](#repository-layout)
- [Commands](#commands)
- [Publishing (maintainers)](#publishing-maintainers)
- [Platform support](#platform-support)
- [What is intentionally omitted](#what-is-intentionally-omitted)
- [License](#license)

## Quick start

```bash
# one-line install (macOS & Linux)
curl -fsSL https://tui-bridge.vercel.app/install | bash

# Windows (PowerShell)
irm https://tui-bridge.vercel.app/install.ps1 | iex

# or with a package manager
npm i -g tui-bridge@latest
```

Run it **from any folder** — the TUI uses your current directory as its working
directory:

```bash
cd ~/my-project
tui-bridge opencode      # or: htop, lazygit, vim, btop, …
```

On start, `tui-bridge`:

1. Spawns the target command in a `node-pty` PTY (ConPTY on Windows).
2. Opens a local HTTP + WebSocket server on a random port.
3. Starts `cloudflared` Quick Tunnel (if installed) and prints the public
   `https://*.trycloudflare.com` URL.
4. Issues a one-time pairing token and prints a QR code containing
   `https://<url>#pair=<token>`.
5. **Pauses** — the QR stays on screen until you press Enter, so you have time
   to scan it before the TUI takes over the terminal.
6. Attaches your local terminal to the PTY (raw stdin ↔ PTY).

Scan the QR (or open the full `#pair=…` URL) on your phone. The pairing token is
single-use and expires in 5 minutes; after pairing you get a rotating session
credential stored in the browser. The pairing URL is also saved to
`~/.tui-bridge/session-url.txt` in case the TUI clears the screen.

### Prerequisite: `cloudflared`

For mobile access over the internet (any network), install the `cloudflared`
binary on your `PATH`:

| OS | Command |
|---|---|
| Windows | `winget install --id Cloudflare.cloudflared` |
| Debian/Ubuntu | `sudo apt install cloudflared` |
| macOS | `brew install cloudflared` |

### Without cloudflared — use `--lan` (same WiFi)

If `cloudflared` is not installed, `tui-bridge` will **not** print a QR (a
`127.0.0.1` URL is unreachable from a phone). To reach the session from your
phone on the **same WiFi network**, pass `--lan`:

```bash
tui-bridge --lan opencode
```

This binds to `0.0.0.0` and uses your LAN IP (e.g.
`http://192.168.1.20:<port>`), so the phone can open that URL directly. The QR
will then contain the LAN URL.

### Manual install (without npm)

If you can't (or don't want to) use the npm package, you can run `tui-bridge`
straight from source. You need **Node ≥ 22** plus a native build toolchain for
`node-pty` (it compiles a C++ addon):

| OS | Build prerequisites |
|---|---|
| Windows | Visual Studio Build Tools (Desktop C++ workload) + Python 3 (`winget install --id Microsoft.VisualStudio.2022.BuildTools` / `Python.Python.3.12`) |
| Debian/Ubuntu | `sudo apt install -y build-essential python3` |
| macOS | `xcode-select --install` (Xcode Command Line Tools) |

Then clone and build:

```bash
git clone https://github.com/Metee01/tui-bridge.git
cd tui-bridge
npm install          # installs all workspaces + builds node-pty
npm run build        # protocol -> tui-bridge -> web -> site
```

Run it directly without a global install:

```bash
# from the repo root, launches the built CLI
node packages/tui-bridge/dist/cli.js opencode
```

Or link it onto your PATH so `tui-bridge` works from anywhere:

```bash
npm link --workspace tui-bridge     # exposes the "tui-bridge" bin globally
tui-bridge opencode                 # now usable from any folder
```

To update later: `git pull && npm install && npm run build` (and re-run
`npm link` only if you linked from a different checkout). To remove a linked
install: `npm unlink -g tui-bridge`.

> **Note:** `node-pty`'s native build is skipped on hosts that only need the
> marketing site (Vercel uses `npm install --ignore-scripts`). For actually
> running the CLI you do need the native build to succeed.

## How it works

A single PTY is shared between your desktop terminal and any number of phone
clients. Output from the TUI is mirrored into a headless `@xterm/headless`
terminal on the server, which lets `tui-bridge` serialize a full-screen
**snapshot** for any client that connects or reconnects mid-session. After the
snapshot, live binary output streams over the same WebSocket.

```
 Desktop terminal (raw stdin) ─┐
                               ├─► PtySession (node-pty + headless mirror)
 Phone (xterm.js over WSS) ────┘         │
                                         └─► snapshot + live binary frames
```

The desktop terminal is the **primary authority** on PTY dimensions: resizing
your host window resizes the shared PTY and the new grid is broadcast to every
connected phone, which reflows automatically.

## CLI reference

```
tui-bridge <command> [args...]                Run a TUI and expose it on the web
tui-bridge [options] <command> [args...]      Options before the command
tui-bridge start -- <command> [args...]       Explicit form (optional)
tui-bridge -- <command> [args...]             Use -- to pass flags to the TUI

  --no-tunnel       Skip cloudflared; local-only (or --lan) access.
  --lan             Bind to 0.0.0.0 and use your LAN IP (phone on same WiFi).
                    Use this when cloudflared is not installed.
  --no-pause        Do not wait for Enter before opening the TUI (default pauses
                    so you can scan the QR code while it stays on screen).
  --web-root <dir>  Serve web assets from <dir> instead of the bundled build.
  -v, --verbose     Verbose logging.
  -V, --version     Print version and exit.
  -h, --help        Show this help.
```

`tui-bridge <tui>` is shorthand for `tui-bridge start -- <tui>`: only `start`
and `help` are treated as subcommands, so any other first token is the target
command. After `npm i -g tui-bridge`, the `tui-bridge` command is on your PATH
everywhere.

## Input model

Both local and mobile can send input **simultaneously** — there is no input lock.
Anyone authenticated can send keystrokes from either side, and output updates
both screens in real time.

The phone always mirrors the desktop terminal's grid. There is no "fit" or
"resize" button: the TUI is laid out for the desktop dimensions, exactly as it
appears on your computer. On a narrow phone viewport the canvas scrolls
horizontally so coordinate-based TUIs never reflow by accident. When you resize
your desktop terminal window, the new dimensions are broadcast to every phone
and the view reflows automatically.

### Mobile input

Use the phone's native keyboard: tap the terminal or the **Keyboard** button.
The on-screen toolbar intentionally contains only keys that phones normally
lack: `Ctrl`, `Alt`, `Esc`, `Tab`, arrows, `Home`, `End`, `PgUp`, `PgDn`, and
`Del`.

Screen state survives reconnects: the server's headless mirror serializes a
snapshot for every newly connected / reconnecting client before live binary
output resumes.

## Security model

- The Quick Tunnel URL is public; it is **not** the secret. Authentication is
  the one-time pairing token delivered only through the QR code at session start.
- The token travels in the URL **fragment** (`#pair=…`) so it never reaches the
  HTTP server or Cloudflare. The web client sends it only in the first WebSocket
  auth message.
- After pairing: short-lived, revocable session credential stored in
  `sessionStorage`. Tokens are hashed server-side; comparisons are
  constant-time.
- By default the server binds to `127.0.0.1`. With `--lan` it binds to
  `0.0.0.0` (expose to your local network) — use only on trusted networks.
- WebSocket `Origin` is checked. Terminal contents are never logged.

## Repository layout

```
packages/
  protocol/        shared WebSocket message schemas (zod), browser+node safe
  tui-bridge/      CLI + server core (PTY, ws gateway, tunnel, auth, platform)
apps/
  web/             Vite + React + xterm.js mobile terminal UI
  site/            Astro + Starlight marketing site & docs (https://tui-bridge.vercel.app)
```

## Commands

```bash
npm install        # install all workspaces
npm run build      # protocol → tui-bridge → web → site (fixed order)
npm run typecheck  # builds protocol, then typechecks all workspaces
npm run lint       # eslint (JS/MJS config files only; TS is covered by typecheck)
npm run dev        # vite dev server for the web app (HMR, no backend)
npm run site       # astro dev server for the marketing site
npm start          # node packages/tui-bridge/dist/cli.js (requires a prior build)
npm run clean      # DESTRUCTIVE: deletes all dist/ and node_modules/
```

## Publishing (maintainers)

The two public packages are `@tui-bridge/protocol` and `tui-bridge` (the root
and `@tui-bridge/web` / `@tui-bridge/site` stay private). Build and publish in
order so the `tui-bridge` package can resolve its `@tui-bridge/protocol`
dependency from npm:

```bash
npm run build --workspace @tui-bridge/protocol
npm publish --access public --workspace @tui-bridge/protocol
npm run build --workspace tui-bridge
npm publish --access public --workspace tui-bridge
```

## Platform support

| Platform | Status |
|---|---|
| Windows (ConPTY) | Primary |
| Linux | Supported |
| macOS | Fast-follower (untested in MVP) |

`node-pty` (a native module) is required. `npm install` may need a native
build toolchain or use prebuilt binaries. Node `>=22` is required.

## What is intentionally omitted

- Multi-session / daemon mode (single active PTY per process).
- Named Cloudflare tunnels / custom domains (Quick Tunnel only).
- SSO / PIN / device approval (QR pairing token only).
- OpenCode-specific integration (it is a general TUI wrapper).

These are deferred to later phases once the lifecycle and security model are
proven in real use.

## License

MIT
