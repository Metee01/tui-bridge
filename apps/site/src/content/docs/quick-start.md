---
title: Quick start
description: Start a TUI and drive it from your phone in under a minute.
---

## 1. Start a TUI

From the folder you want to work in:

```bash
cd ~/my-project
tui-bridge opencode
```

That's the shorthand for `tui-bridge start -- opencode`. Any TUI works:

```bash
tui-bridge htop
tui-bridge lazygit
tui-bridge "npm run dev"
```

## 2. Scan the QR code

On start, `tui-bridge`:

1. Spawns the target command in a `node-pty` PTY (ConPTY on Windows), using
   your current directory as the TUI's working directory.
2. Opens a local HTTP + WebSocket server (random port).
3. Starts `cloudflared` Quick Tunnel (if installed) and prints the public
   `https://*.trycloudflare.com` URL.
4. Issues a one-time pairing token and prints a QR code containing
   `https://<url>#pair=<token>`.
5. **Pauses** — the QR stays on screen until you press Enter, so you have time
   to scan it before the TUI takes over the terminal.
6. Attaches your local terminal to the PTY (raw stdin ↔ PTY).

Scan the QR (or open the full `#pair=…` URL) on your phone. The pairing token
is single-use and expires in 5 minutes; after pairing you get a rotating
session credential stored in the browser. The pairing URL is also saved to
`~/.tui-bridge/session-url.txt` in case the TUI clears the screen.

## 3. Drive it from your phone

Use the phone's native keyboard (tap the terminal or the **Keyboard** button).
The on-screen toolbar contains keys phones normally lack: `Ctrl`, `Alt`, `Esc`,
`Tab`, arrows, `Home`, `End`, `PgUp`, `PgDn`, and `Del`.

The mobile view mirrors the desktop terminal's grid exactly. On a narrow phone
viewport it scrolls horizontally so coordinate-based TUIs never reflow by
accident. Resize your desktop terminal window and the phone reflows
automatically.

## Without cloudflared — use `--lan` (same WiFi)

If `cloudflared` is not installed, `tui-bridge` will **not** print a QR (a
`127.0.0.1` URL is unreachable from a phone). To reach the session from your
phone on the **same WiFi network**, pass `--lan`:

```bash
tui-bridge --lan opencode
```

This binds to `0.0.0.0` and uses your LAN IP (e.g. `http://192.168.1.20:<port>`),
so the phone can open that URL directly. The QR will then contain the LAN URL.

## Running from any folder

`tui-bridge` spawns the TUI with `cwd = process.cwd()`, so just `cd` into the
project folder you want to work in and run `tui-bridge <tui>`. After install,
the `tui-bridge` command is on your PATH everywhere.
