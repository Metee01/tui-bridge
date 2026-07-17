import { type Server as HttpServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { printQr } from "./qr.js";
import { PtySession } from "./pty-session.js";
import { PairingService, SessionService } from "./auth/index.js";
import { CloudflareQuickTunnel, findCloudflared } from "./tunnel/index.js";
import { WsGateway } from "./server/ws-gateway.js";
import { createStaticServer } from "./server/http-server.js";
import { parseTargetCommand, detectSize } from "./platform/spawn-target.js";
import { detectLanIp } from "./platform/lan.js";
import { createLogger } from "./logger.js";
import type { SessionStatus } from "@tui-bridge/protocol";

export interface BridgeOptions {
  argv: string[];
  webRoot?: string;
  noTunnel?: boolean;
  lan?: boolean;
  pause?: boolean;
  verbose?: boolean;
}

export class Bridge {
  readonly #logger;
  readonly #argv: string[];
  readonly #webRoot?: string;
  readonly #noTunnel: boolean;
  readonly #lan: boolean;
  readonly #pause: boolean;
  #pty: PtySession | null = null;
  #gateway: WsGateway | null = null;
  #http: HttpServer | null = null;
  #tunnel: CloudflareQuickTunnel | null = null;
  #pairing = new PairingService();
  #sessions = new SessionService();
  #stdinRaw = false;
  #cleanupDone = false;
  #localPaused = false;
  #pauseBuffer: Buffer[] = [];
  #hostCols = 120;
  #hostRows = 30;

  constructor(opts: BridgeOptions) {
    this.#logger = createLogger(opts.verbose);
    this.#argv = opts.argv;
    this.#webRoot = opts.webRoot;
    this.#noTunnel = opts.noTunnel ?? false;
    this.#lan = opts.lan ?? false;
    this.#pause = opts.pause ?? true;
  }

  async run(): Promise<number> {
    const target = parseTargetCommand(this.#argv);
    const size = detectSize();
    this.#hostCols = size.cols;
    this.#hostRows = size.rows;
    this.#logger.info(`Spawning PTY: ${target.command} ${target.args.join(" ")}`);

    this.#pty = new PtySession({
      command: target.command,
      args: target.args,
      cols: size.cols,
      rows: size.rows,
    });

    // Single data handler: broadcast to WS clients always; mirror to local
    // stdout only once the user has pressed Enter (so the QR stays visible).
    this.#localPaused = this.#pause && process.stdin.isTTY;
    this.#pty.on("data", (output) => {
      this.#gateway?.broadcastBinary(output);
      if (this.#localPaused) {
        this.#pauseBuffer.push(output.chunk);
      } else if (process.stdout.writable) {
        process.stdout.write(output.chunk);
      }
    });
    this.#pty.on("exit", (info) => {
      this.#gateway?.broadcast({
        type: "ended",
        exitCode: info.exitCode,
        signal: info.signal ?? null,
      });
      this.cleanup().finally(() => process.exit(info.exitCode === 0 ? 0 : info.exitCode));
    });

    // HTTP + WS
    const bindHost = this.#lan ? "0.0.0.0" : "127.0.0.1";
    const http = createStaticServer(this.#webRoot);
    this.#http = http;
    const gateway = new WsGateway({
      pty: this.#pty,
      pairing: this.#pairing,
      sessions: this.#sessions,
      onStatus: (status: SessionStatus) => this.onStatus(status),
    });
    this.#gateway = gateway;
    gateway.attach(http);

    const port = await new Promise<number>((resolve, reject) => {
      http.on("error", reject);
      http.listen(0, bindHost, () => {
        const addr = http.address();
        const p = typeof addr === "object" && addr ? addr.port : 0;
        if (!p) {
          reject(new Error("Failed to bind local HTTP port"));
          return;
        }
        this.#logger.info(`Local server: http://${bindHost}:${p}`);
        resolve(p);
      });
    });
    if (!this.#noTunnel) await this.startTunnel(port);

    // Determine the URL that is actually reachable from a phone.
    const publicUrl = this.resolvePublicUrl(port);
    const pairing = this.#pairing.issue();

    if (publicUrl) {
      const pairUrl = `${publicUrl}#pair=${pairing.token}`;
      const qr = await printQr(pairUrl);
      process.stderr.write("\n" + qr + "\n");
      process.stderr.write(`Mobile URL: ${publicUrl}\n`);
      process.stderr.write(`Scan the QR code or open:\n  ${pairUrl}\n`);
      process.stderr.write(`Pairing token expires in 5 minutes.\n`);
      this.saveSessionUrl(pairUrl);
    } else {
      // No mobile-reachable URL. Do NOT print a misleading QR.
      process.stderr.write(
        `\n[tui-bridge] Mobile access is NOT available.\n` +
          `  - cloudflared is not installed (no public tunnel).\n` +
          `  --lan was not passed (no LAN binding).\n` +
          `Install cloudflared (winget install --id Cloudflare.cloudflared) or re-run with --lan\n` +
          `to reach this session from your phone.\n` +
          `Local-only access: http://127.0.0.1:${port}\n\n`,
      );
    }

    // Give the user time to scan the QR before the TUI takes over the screen.
    if (this.#localPaused && publicUrl) {
      await this.waitForEnter(
        "Press Enter to open the TUI (scan the QR first)...",
      );
    } else if (this.#localPaused) {
      await this.waitForEnter("Press Enter to open the TUI...");
    }

    // Flush buffered PTY output to the local terminal, then attach.
    this.#localPaused = false;
    if (process.stdout.writable) {
      for (const chunk of this.#pauseBuffer) process.stdout.write(chunk);
    }
    this.#pauseBuffer = [];

    this.enableLocalAttach();
    this.installLocalResize();
    this.installSignalHandlers();
    return 0;
  }

  private installLocalResize(): void {
    // The local terminal is the primary authority on PTY dimensions. When the
    // host window is resized, record the new size and propagate it to the PTY
    // immediately — even if a mobile client has fitted the PTY to its phone.
    // A mobile "Fit screen" is a temporary override; any local resize reclaims
    // the grid for the host.
    if (!process.stdout.isTTY) return;
    process.stdout.on("resize", () => {
      const cols = process.stdout.columns;
      const rows = process.stdout.rows;
      if (cols && rows && cols > 0 && rows > 0) {
        this.#hostCols = cols;
        this.#hostRows = rows;
        this.reclaimLocalSize();
      }
    });
  }

  private reclaimLocalSize(): void {
    // Reclaim the PTY grid for the local terminal. Called when the desktop
    // window is resized. Resizing the PTY emits a "resize" event the gateway
    // broadcasts, so every client reflows to the desktop grid. The tracked host
    // size is used so this also works when there is no local TTY (falls back to
    // detectSize).
    this.#pty?.resize(this.#hostCols, this.#hostRows);
  }

  private resolvePublicUrl(port: number): string | null {
    if (this.#tunnel?.url) return this.#tunnel.url;
    if (this.#lan) {
      const ip = detectLanIp();
      if (ip) return `http://${ip}:${port}`;
      this.#logger.warn("--lan was set but no LAN IPv4 address was found");
    }
    return null;
  }

  private saveSessionUrl(pairUrl: string): void {
    try {
      const dir = join(homedir(), ".tui-bridge");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "session-url.txt"), pairUrl + "\n", "utf-8");
      process.stderr.write(`(URL also saved to ~/.tui-bridge/session-url.txt)\n`);
    } catch (err) {
      this.#logger.debug("could not save session url", err);
    }
  }

  private waitForEnter(prompt: string): Promise<void> {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      process.stderr.write(prompt + "\n");
      if (!stdin.isTTY) {
        resolve();
        return;
      }
      // Cooked mode: read one line (Enter).
      stdin.resume();
      const onData = (data: Buffer) => {
        if (data.includes(0x0d) || data.includes(0x0a)) {
          stdin.removeListener("data", onData);
          stdin.pause();
          resolve();
        }
      };
      stdin.on("data", onData);
    });
  }

  private async startTunnel(port: number): Promise<void> {
    const info = await findCloudflared();
    if (!info.found) {
      this.#logger.warn("cloudflared not found on PATH. Install it to enable mobile access:");
      process.stderr.write(
        "  winget install --id Cloudflare.cloudflared   (Windows)\n" +
          "  sudo apt install cloudflared   (Debian/Ubuntu)\n" +
          "  brew install cloudflared   (macOS)\n",
      );
      return;
    }
    this.#logger.info(`cloudflared ${info.version ?? "unknown"} detected`);
    const tunnel = new CloudflareQuickTunnel();
    this.#tunnel = tunnel;
    tunnel.on("down", (reason) => {
      this.#logger.warn(`Tunnel down: ${reason}`);
      this.#gateway?.status("tunnel_down");
    });
    const ready = await tunnel.start(port);
    this.#gateway?.status("live");
    this.#logger.info(`Tunnel ready: ${ready.url}`);
  }

  private onStatus(status: SessionStatus): void {
    this.#logger.info(`Session status: ${status}`);
  }

  private enableLocalAttach(): void {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      this.#logger.warn("stdin is not a TTY; local attach disabled. Mobile clients can control the session.");
      return;
    }
    stdin.setRawMode(true);
    this.#stdinRaw = true;
    stdin.resume();
    // Local terminal always sends input directly to the PTY. There is no
    // input lock — both local and mobile can type simultaneously.
    stdin.on("data", (data: Buffer) => {
      if (this.#pty) this.#pty.write(data.toString("utf-8"));
    });
    stdin.on("error", (err) => this.#logger.warn("stdin error", err));
  }

  private installSignalHandlers(): void {
    const handler = (sig: string) => {
      this.#logger.info(`Received ${sig}, shutting down`);
      this.cleanup().finally(() => process.exit(0));
    };
    process.on("SIGINT", () => handler("SIGINT"));
    process.on("SIGTERM", () => handler("SIGTERM"));
    process.on("exit", () => {
      void this.cleanupSync();
    });
  }

  async cleanup(): Promise<void> {
    if (this.#cleanupDone) return;
    this.#cleanupDone = true;
    if (this.#stdinRaw) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {
        // ignore
      }
    }
    try {
      this.#gateway?.dispose();
    } catch {
      // ignore
    }
    try {
      await this.#tunnel?.stop();
    } catch {
      // ignore
    }
    try {
      if (this.#pty && process.stdout.writable) process.stdout.resume();
      await this.#pty?.stop();
    } catch {
      // ignore
    }
    try {
      this.#http?.close();
    } catch {
      // ignore
    }
  }

  cleanupSync(): void {
    if (this.#cleanupDone) return;
    this.#cleanupDone = true;
    try {
      this.#pty?.kill();
    } catch {
      // ignore
    }
  }
}
