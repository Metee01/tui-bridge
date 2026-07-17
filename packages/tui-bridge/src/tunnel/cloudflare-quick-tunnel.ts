import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "../logger.js";

export interface TunnelReady {
  url: string;
}

export interface TunnelProvider extends EventEmitter {
  start(targetPort: number): Promise<TunnelReady>;
  stop(): Promise<void>;
}

export type TunnelEvents = {
  ready: (info: TunnelReady) => void;
  down: (reason: string) => void;
  warning: (message: string) => void;
};

export class CloudflareQuickTunnel extends EventEmitter {
  readonly #logger = createLogger();
  #child: ChildProcess | null = null;
  #stopped = false;
  #url: string | null = null;

  async start(targetPort: number): Promise<TunnelReady> {
    if (this.#child) throw new Error("Tunnel already started");
    const target = `http://127.0.0.1:${targetPort}`;
    this.#logger.info(`Starting cloudflared quick tunnel -> ${target}`);
    const child = spawn(
      "cloudflared",
      ["tunnel", "--url", target, "--no-autoupdate", "--metrics", "127.0.0.1:0"],
      { windowsHide: true },
    );
    this.#child = child;

    return new Promise<TunnelReady>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#url) {
          reject(new Error("cloudflared did not produce a tunnel URL within 30s"));
          this.kill();
        }
      }, 30_000);

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        this.#logger.debug("cloudflared stdout:", text);
        const url = extractTunnelUrl(text);
        if (url && !this.#url) {
          this.#url = url;
          clearTimeout(timeout);
          const info: TunnelReady = { url };
          this.emit("ready", info);
          resolve(info);
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        this.#logger.debug("cloudflared stderr:", text);
        const url = extractTunnelUrl(text);
        if (url && !this.#url) {
          this.#url = url;
          clearTimeout(timeout);
          const info: TunnelReady = { url };
          this.emit("ready", info);
          resolve(info);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn cloudflared: ${err.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (this.#stopped) return;
        if (!this.#url) {
          reject(new Error(`cloudflared exited before producing a URL (code ${code})`));
        } else {
          this.emit("down", `cloudflared exited with code ${code}`);
        }
      });
    });
  }

  get url(): string | null {
    return this.#url;
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.kill();
  }

  private kill(): void {
    if (!this.#child) return;
    const child = this.#child;
    this.#child = null;
    try {
      if (process.platform === "win32") {
        // taskkill tree ensures cloudflared child processes are reaped on Windows.
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // ignore
    }
  }
}

export interface CloudflareQuickTunnel extends EventEmitter {
  on<K extends keyof TunnelEvents>(event: K, listener: TunnelEvents[K]): this;
  emit<K extends keyof TunnelEvents>(event: K, ...args: Parameters<TunnelEvents[K]>): boolean;
}

const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function extractTunnelUrl(text: string): string | null {
  const match = text.match(TUNNEL_URL);
  return match ? match[0] : null;
}