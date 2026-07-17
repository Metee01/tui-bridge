#!/usr/bin/env node
import { createRequire } from "node:module";
import { Bridge } from "./bridge.js";

const require = createRequire(import.meta.url);
const VERSION: string = require("../package.json").version as string;

function parseArgs(argv: string[]): {
  verbose: boolean;
  help: boolean;
  version: boolean;
  noTunnel: boolean;
  lan: boolean;
  pause: boolean;
  webRoot?: string;
  target: string[];
} {
  let verbose = false;
  let help = false;
  let version = false;
  let noTunnel = false;
  let lan = false;
  let pause = true;
  let webRoot: string | undefined;
  const target: string[] = [];
  let seenDashDash = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (seenDashDash) {
      target.push(arg);
      continue;
    }
    if (arg === "--") {
      seenDashDash = true;
      continue;
    }
    switch (arg) {
      case "-h":
      case "--help":
        help = true;
        break;
      case "-V":
      case "--version":
        version = true;
        break;
      case "-v":
      case "--verbose":
        verbose = true;
        break;
      case "--no-tunnel":
        noTunnel = true;
        break;
      case "--lan":
        lan = true;
        break;
      case "--no-pause":
        pause = false;
        break;
      case "--web-root":
        webRoot = argv[++i];
        break;
      default:
        target.push(arg);
    }
  }
  return { verbose, help, version, noTunnel, lan, pause, webRoot, target };
}

const HELP = `tui-bridge - bridge any TUI application to a mobile web terminal

Usage:
  tui-bridge <command> [args...]                Run a TUI and expose it on the web
  tui-bridge [options] <command> [args...]      Options before the command
  tui-bridge start -- <command> [args...]       Explicit form (optional)
  tui-bridge -- <command> [args...]             Use -- to pass flags to the TUI

Examples:
  tui-bridge opencode
  tui-bridge htop
  tui-bridge lazygit
  tui-bridge "npm run dev"
  tui-bridge --lan opencode
  tui-bridge -- opencode --verbose

Options:
  --no-tunnel       Skip cloudflared; local-only (or --lan) access.
  --lan             Bind to 0.0.0.0 and use your LAN IP (phone on same WiFi).
                    Use this when cloudflared is not installed.
  --no-pause        Do not wait for Enter before opening the TUI (default pauses
                    so you can scan the QR code while it stays on screen).
  --web-root <dir>  Serve web assets from <dir> instead of the bundled build
  -v, --verbose     Verbose logging
  -V, --version     Print version and exit
  -h, --help        Show this help

Local terminal:
  Both local and mobile can type simultaneously. No key to release or
  reclaim control. Use "Fit screen" on mobile to resize the TUI to the
  phone's dimensions.

Notes:
  - The TUI runs in your current working directory, so run tui-bridge from the
    folder you want to work in.
  - The pairing URL is also saved to ~/.tui-bridge/session-url.txt in case the
    TUI overwrites the screen before you finish scanning.
`;

const KNOWN_SUBCOMMANDS = new Set(["start", "help"]);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Only treat the first token as a subcommand when it is a known one.
  // Anything else (opencode, htop, "npm run dev", ...) is the target command,
  // so `tui-bridge opencode` works as a shorthand for `tui-bridge start opencode`.
  let subcommand = "start";
  let rest = argv;
  if (
    argv.length > 0 &&
    !argv[0].startsWith("-") &&
    KNOWN_SUBCOMMANDS.has(argv[0])
  ) {
    subcommand = argv[0];
    rest = argv.slice(1);
  }

  const opts = parseArgs(rest);

  if (opts.version) {
    process.stdout.write(`tui-bridge ${VERSION}\n`);
    return;
  }

  if (opts.help || subcommand === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (subcommand !== "start") {
    process.stderr.write(`Unknown command: ${subcommand}\n\n${HELP}`);
    process.exit(2);
  }

  if (opts.target.length === 0) {
    process.stderr.write("Error: no target command provided.\n\n" + HELP);
    process.exit(2);
  }

  const bridge = new Bridge({
    argv: opts.target,
    webRoot: opts.webRoot,
    noTunnel: opts.noTunnel,
    lan: opts.lan,
    pause: opts.pause,
    verbose: opts.verbose,
  });
  const code = await bridge.run();
  if (code !== 0) process.exit(code);
}

main().catch((err) => {
  process.stderr.write(`tui-bridge: ${err?.stack ?? err}\n`);
  process.exit(1);
});
