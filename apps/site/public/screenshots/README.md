# Screenshots

Place demo screenshots shown on the landing page in this directory.

## How to add

1. **Take a screenshot** — capture your phone browser running a TUI via tui-bridge (e.g. opencode running on your phone).
2. **Drop the file here** with this exact name:
   - `phone-demo.png` — the terminal view on a phone (portrait, vertical)
3. **Commit & push** — Vercel auto-deploys. The image appears on the site immediately.

## Optional second image

- `qr-pairing.png` — a screenshot of the QR code shown in the desktop terminal. If present, it shows beside the phone demo with a "scan to pair" caption. If absent, it is hidden automatically.

## Recommended sizes

| File | Size | Format |
|---|---|---|
| `phone-demo.png` | 540×960 or 1080×1920 (9:16 portrait) | PNG or JPG |
| `qr-pairing.png` | 540×540 or wider | PNG or JPG |

Images render with a `width="270"` HTML attribute; 2x resolution is recommended for retina screens.

## What if no image exists?

If you haven't added any screenshot, the "How it works" section shows only the ASCII diagram + 3-step list — no empty space. When you drop a file in, it shows up automatically — no code changes needed.
