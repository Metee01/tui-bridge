import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { spawn as ptySpawn, type IPty } from "node-pty";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import { createLogger } from "./logger.js";

// @xterm/headless ships as UMD/CJS without a detected ESM named `Terminal`
// export, so load it via require and keep strong types via a cast.
const headlessRequire = createRequire(import.meta.url);
const { Terminal } = headlessRequire("@xterm/headless") as typeof import("@xterm/headless");

export interface PtySessionOptions {
  command: string;
  args: string[];
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string>;
}

export type PtySessionEvents = {
  data: (output: PtyOutput) => void;
  exit: (info: { exitCode: number; signal?: string }) => void;
  resize: (dims: { cols: number; rows: number }) => void;
};

export interface PtyOutput {
  chunk: Buffer;
  sequence: number;
}

const SNAPSHOT_MAX_BYTES = 512 * 1024;

export class PtySession extends EventEmitter {
  readonly #logger = createLogger();
  readonly #pty: IPty;
  readonly #term: HeadlessTerminal;
  readonly #serialize: SerializeAddon;
  #closed = false;
  #ringBuffer: Buffer[] = [];
  #ringBytes = 0;
  #outputSequence = 0;
  #mirrorWrites: Promise<void> = Promise.resolve();
  #cols: number;
  #rows: number;

  constructor(opts: PtySessionOptions) {
    super();
    this.#cols = opts.cols;
    this.#rows = opts.rows;
    let shell = opts.command;
    let shellArgs = opts.args;
    if (process.platform === "win32") {
      // node-pty on Windows spawns via ConPTY. If the user gives a bare command
      // like `opencode` we let node-pty resolve it through the system shell.
      shell = opts.command;
      shellArgs = opts.args;
    } else {
      if (opts.args.length === 0 && opts.command.includes(" ")) {
        // Allow `tui-bridge start -- "lazygit -p"` style single-string commands.
        const parts = opts.command.split(/\s+/);
        shell = parts[0];
        shellArgs = parts.slice(1);
      }
    }

    this.#term = new Terminal({
      cols: opts.cols,
      rows: opts.rows,
      convertEol: false,
      allowProposedApi: true, // required by SerializeAddon for snapshot
    });
    this.#serialize = new SerializeAddon();
    this.#term.loadAddon(this.#serialize);

    this.#pty = ptySpawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, ...(opts.env ?? {}) } as Record<string, string>,
    });

    this.#pty.onData((data) => {
      const buf = Buffer.from(data, "utf-8");
      this.mirrorWrite(data);
      this.pushRing(buf);
      this.emit("data", { chunk: buf, sequence: ++this.#outputSequence });
    });

    this.#pty.onExit(({ exitCode, signal }) => {
      this.#closed = true;
      this.#logger.info(`PTY exited: code=${exitCode} signal=${signal ?? "none"}`);
      this.emit("exit", { exitCode, signal: signal ? String(signal) : undefined });
      this.disposeTerm();
    });
  }

  private mirrorWrite(data: string): void {
    this.#mirrorWrites = this.#mirrorWrites
      .then(
        () =>
          new Promise<void>((resolve) => {
            this.#term.write(data, resolve);
          }),
      )
      .catch((err: unknown) => {
        this.#logger.debug("terminal mirror write failed", err);
      });
  }

  private pushRing(buf: Buffer): void {
    this.#ringBuffer.push(buf);
    this.#ringBytes += buf.length;
    while (this.#ringBytes > SNAPSHOT_MAX_BYTES && this.#ringBuffer.length > 1) {
      const dropped = this.#ringBuffer.shift()!;
      this.#ringBytes -= dropped.length;
    }
  }

  get cols(): number {
    return this.#cols;
  }
  get rows(): number {
    return this.#rows;
  }

  write(data: string): void {
    if (this.#closed) return;
    this.#pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.#closed) return;
    this.#cols = cols;
    this.#rows = rows;
    try {
      this.#pty.resize(cols, rows);
    } catch (err) {
      this.#logger.debug("pty resize failed", err);
    }
    this.#mirrorWrites = this.#mirrorWrites
      .then(() => {
        this.#term.resize(cols, rows);
      })
      .catch((err: unknown) => {
        this.#logger.debug("terminal mirror resize failed", err);
      });
    this.emit("resize", { cols, rows });
  }

  async snapshot(): Promise<{ data: string; cols: number; rows: number; sequence: number }> {
    // Capture the queue and sequence together. Output received after this point
    // is sent after the snapshot by WsGateway, never replayed before it.
    const completedWrites = this.#mirrorWrites;
    const sequence = this.#outputSequence;
    try {
      await completedWrites;
      const data = this.#serialize.serialize();
      return { data, cols: this.#cols, rows: this.#rows, sequence };
    } catch (err) {
      this.#logger.warn("snapshot serialize failed, falling back to ring buffer", err);
      return {
        data: Buffer.concat(this.#ringBuffer).toString("utf-8"),
        cols: this.#cols,
        rows: this.#rows,
        sequence,
      };
    }
  }

  kill(signal: string = "SIGTERM"): void {
    if (this.#closed) return;
    try {
      this.#pty.kill(signal);
    } catch (err) {
      this.#logger.debug("pty kill failed", err);
    }
  }

  private disposeTerm(): void {
    try {
      this.#term.dispose();
    } catch {
      // ignore
    }
  }

  async stop(): Promise<void> {
    this.kill();
    this.disposeTerm();
  }
}

export interface PtySession extends EventEmitter {
  on<K extends keyof PtySessionEvents>(event: K, listener: PtySessionEvents[K]): this;
  emit<K extends keyof PtySessionEvents>(event: K, ...args: Parameters<PtySessionEvents[K]>): boolean;
}
