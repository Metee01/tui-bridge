---
title: Introduction
description: What tui-bridge is and why it exists.
---

`tui-bridge` bridges **any** TUI application to a mobile-friendly web terminal —
no port forwarding, no central server, no network configuration. The TUI runs
inside a local PTY; a Cloudflare Quick Tunnel exposes an ephemeral HTTPS URL;
you scan a QR code and drive the same terminal from your phone.

```
your terminal ──► tui-bridge ──► node-pty ──► <any TUI: opencode, htop, lazygit…>
                       │
                       └──► localhost HTTP/WS └──► cloudflared quick tunnel ──► mobile xterm.js
```

## Why

You run a TUI (`opencode`, `htop`, `lazygit`, `vim`…) on your laptop, but you
want to check on it or drive it from your phone — from the couch, the train,
anywhere. `tui-bridge` gives you that without exposing raw ports, setting up a
VPN, or running a central relay.

## What it is not

- Not a remote shell host — it wraps a **single** TUI you start explicitly.
- Not a multi-session daemon — one active PTY per process.
- Not tied to a specific TUI — it is a general terminal wrapper.

## What the MVP omits

- Multi-session / daemon mode (single active PTY per process).
- Named Cloudflare tunnels / custom domains (Quick Tunnel only).
- SSO / PIN / device approval (QR pairing token only).

These are deferred to later phases once the lifecycle and security model are
proven in real use.
