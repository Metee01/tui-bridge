---
title: Input model
description: How local and mobile input interact, and how screen state survives reconnects.
---

## No input lock

Both local and mobile can send input simultaneously — there is no input lock.
Anyone authenticated can send keystrokes from either side, and output updates
both screens in real time.

## Resize authority

The local (desktop) terminal is the sole authority on PTY dimensions. The phone
**never resizes** the shared PTY — there is no "fit" or "control" button. When
the host window is resized, the new size is propagated to the PTY immediately
and broadcast to every connected phone, which reflows its view automatically.

## Mobile scrolling

The mobile view always mirrors the desktop terminal's grid and scrolls
horizontally when the grid is wider than the phone viewport, so coordinate-based
TUIs never reflow by accident. What you see on the phone is exactly what is on
the desktop.

## Mobile toolbar

The on-screen toolbar intentionally contains only keys that phones normally
lack: `Ctrl`, `Alt`, `Esc`, `Tab`, arrows, `Home`, `End`, `PgUp`, `PgDn`, and
`Del`. Use the phone's native keyboard for everything else (tap the terminal or
the **Keyboard** button).

## Reconnect resilience

Screen state survives reconnects: the server keeps an `@xterm/headless` mirror
of the terminal and sends a serialized snapshot to every newly connected /
reconnecting client before live binary output resumes.
