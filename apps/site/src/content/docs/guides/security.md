---
title: Security model
description: How tui-bridge authenticates mobile clients and protects terminal contents.
---

## The public URL is not the secret

The Quick Tunnel URL is public; it is **not** the secret. Authentication is the
one-time pairing token delivered only through the QR code at session start.

## Pairing token

- The token travels in the URL **fragment** (`#pair=…`) so it never reaches the
  HTTP server or Cloudflare. The web client sends it only in the first
  WebSocket auth message.
- Single-use and expires in 5 minutes.

## Session credential

After pairing, the client receives a short-lived, revocable session credential
stored in `sessionStorage`. Tokens are hashed server-side; comparisons are
constant-time.

## Network binding

- By default the server binds to `127.0.0.1` (local only).
- With `--lan` it binds to `0.0.0.0` (expose to your local network) — use only
  on trusted networks.

## WebSocket origin check

WebSocket `Origin` is checked. Terminal contents are never logged.
