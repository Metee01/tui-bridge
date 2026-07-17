---
title: CLI reference
description: tui-bridge command-line usage and options.
---

## Usage

```
tui-bridge <command> [args...]                Run a TUI and expose it on the web
tui-bridge [options] <command> [args...]      Options before the command
tui-bridge start -- <command> [args...]       Explicit form (optional)
tui-bridge -- <command> [args...]             Use -- to pass flags to the TUI
```

## Examples

```bash
tui-bridge opencode
tui-bridge htop
tui-bridge lazygit
tui-bridge "npm run dev"
tui-bridge --lan opencode
tui-bridge -- opencode --verbose
```

## Options

| Flag | Description |
| --- | --- |
| `--no-tunnel` | Skip cloudflared; local-only (or `--lan`) access. |
| `--lan` | Bind to `0.0.0.0` and use your LAN IP (phone on same WiFi). Use when cloudflared is not installed. |
| `--no-pause` | Do not wait for Enter before opening the TUI (default pauses so you can scan the QR code while it stays on screen). |
| `--web-root <dir>` | Serve web assets from `<dir>` instead of the bundled build. |
| `-v`, `--verbose` | Verbose logging. |
| `-V`, `--version` | Print version and exit. |
| `-h`, `--help` | Show help. |

## The `--` separator

Use `--` to forward flags to the target TUI itself:

```bash
tui-bridge -- opencode --verbose
```

Everything after `--` is passed verbatim to the TUI and never parsed by
`tui-bridge`.

## Local terminal

Both local and mobile can type simultaneously — there is no input lock. The
phone always mirrors the desktop terminal's grid (scrolling horizontally on a
narrow viewport); there is no "fit" button. Resizing your local terminal window
updates the shared PTY and every connected phone reflows automatically.

## Notes

- The TUI runs in your current working directory, so run `tui-bridge` from the
  folder you want to work in.
- The pairing URL is also saved to `~/.tui-bridge/session-url.txt` in case the
  TUI overwrites the screen before you finish scanning.
