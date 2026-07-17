import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type SessionStatus,
} from "@tui-bridge/protocol";
import "@xterm/xterm/css/xterm.css";

export type ConnState = "connecting" | "live" | "reconnecting" | "down" | "ended";

export interface TerminalClientCallbacks {
  onState: (state: ConnState) => void;
  onStatus: (status: SessionStatus) => void;
  onEnded: (info: { exitCode: number | null; signal: string | null }) => void;
  onError: (message: string) => void;
  onTerminalReady: (term: Terminal) => void;
  onNativeInput?: (data: string) => void;
}

const SESSION_STORAGE_KEY = "tui-bridge.session";
const PING_MS = 25_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;

export class TerminalClient {
  readonly #cb: TerminalClientCallbacks;
  readonly #term: Terminal;
  readonly #fit: FitAddon;
  #ws: WebSocket | null = null;
  #pairingToken: string | null;
  #sessionToken: string | null = null;
  #state: ConnState = "connecting";
  #reconnectAttempts = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #pingTimer: ReturnType<typeof setInterval> | null = null;
  #manuallyClosed = false;
  #snapshotApplied = false;
  #serverCols = 80;
  #serverRows = 24;

  constructor(cb: TerminalClientCallbacks, container: HTMLElement) {
    this.#cb = cb;
    this.#term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      cols: 80,
      rows: 24,
      allowProposedApi: true,
    });
    this.#fit = new FitAddon();
    this.#term.loadAddon(this.#fit);
    this.#term.loadAddon(new WebLinksAddon());

    this.#pairingToken = readPairingTokenFromFragment();
    this.#sessionToken = readSessionToken();

    this.#term.open(container);
    // The phone always mirrors the desktop terminal's grid. A narrow viewport
    // scrolls horizontally instead of reflowing the PTY; the xterm canvas keeps
    // the real cols/rows so escape-sequence coordinates stay aligned. We only
    // sync the element footprint so .app__terminal can expose a real scrollbar.
    this.syncViewportSize();
    this.#cb.onTerminalReady(this.#term);

    this.#term.onData((data: string) => {
      this.#cb.onNativeInput?.(data);
    });

    let resizeRaf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (!this.#snapshotApplied) return;
        this.syncViewportSize();
      });
    });
    observer.observe(container);
  }

  get state(): ConnState {
    return this.#state;
  }

  get hasToken(): boolean {
    return this.#pairingToken !== null || this.#sessionToken !== null;
  }

  connect(): void {
    if (this.#manuallyClosed) return;
    this.setState(this.#reconnectAttempts === 0 ? "connecting" : "reconnecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl());
    } catch (err) {
      this.#cb.onError(`Cannot open WebSocket: ${String(err)}`);
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.#ws = ws;

    ws.addEventListener("open", () => {
      this.#reconnectAttempts = 0;
      this.sendAuth();
      this.startPings();
    });
    ws.addEventListener("message", (event) => this.onMessage(event));
    ws.addEventListener("close", () => {
      this.stopPings();
      if (!this.#manuallyClosed) this.scheduleReconnect();
    });
    ws.addEventListener("error", () => this.#cb.onError("WebSocket error"));
  }

  sendInput(data: string): void {
    // Input is always allowed — both local and mobile can type simultaneously.
    this.send({ type: "input", data });
  }

  focus(): void {
    this.#term.focus();
  }

  dispose(): void {
    this.#manuallyClosed = true;
    this.stopPings();
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    try {
      this.#ws?.close();
    } catch {
      // Ignore close errors during component teardown.
    }
    this.#term.dispose();
  }

  private onMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.#term.write(new Uint8Array(event.data));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
    } catch {
      this.#cb.onError("Malformed server message");
      return;
    }
    const message: ServerMessage | null = parseServerMessage(parsed);
    if (!message) return;

    switch (message.type) {
      case "authed":
        this.#sessionToken = message.sessionToken;
        writeSessionToken(message.sessionToken);
        this.#serverCols = message.cols;
        this.#serverRows = message.rows;
        this.setState("live");
        this.restoreServerGrid();
        break;
      case "snapshot":
        // Terminal escape sequences use the PTY's grid dimensions, so the local
        // buffer must match the server grid before replaying the snapshot.
        this.#serverCols = message.cols;
        this.#serverRows = message.rows;
        this.#term.resize(message.cols, message.rows);
        this.#term.reset();
        this.#term.write(message.data, () => {
          this.#snapshotApplied = true;
          this.syncViewportSize();
        });
        break;
      case "resize":
        // The desktop terminal's window was resized. Track the real grid and
        // reflow our local buffer so escape-sequence coordinates stay aligned.
        this.#serverCols = message.cols;
        this.#serverRows = message.rows;
        this.restoreServerGrid();
        break;
      case "status":
        this.#cb.onStatus(message.status);
        if (message.status === "tunnel_down") this.setState("down");
        else if (message.status === "live") this.setState("live");
        break;
      case "ended":
        this.setState("ended");
        this.#cb.onEnded({ exitCode: message.exitCode, signal: message.signal });
        break;
      case "error":
        this.#cb.onError(`${message.code}: ${message.message}`);
        break;
      case "pong":
        break;
    }
  }

  private sendAuth(): void {
    this.send({
      type: "auth",
      pairingToken: this.#pairingToken ?? undefined,
      sessionToken: this.#sessionToken ?? undefined,
      cols: this.#term.cols,
      rows: this.#term.rows,
    });
  }

  private send(message: ClientMessage): void {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(message));
  }

  private restoreServerGrid(): void {
    // Revert the local buffer to the server's (desktop) grid so escape-sequence
    // coordinates line up. The PTY is never resized from the phone; the canvas
    // keeps the desktop cols/rows and .app__terminal scrolls horizontally when
    // the grid is wider than the phone viewport.
    if (this.#term.cols === this.#serverCols && this.#term.rows === this.#serverRows) {
      this.syncViewportSize();
      return;
    }
    this.#term.resize(this.#serverCols, this.#serverRows);
    this.syncViewportSize();
  }

  private syncViewportSize(): void {
    requestAnimationFrame(() => {
      const element = this.#term.element;
      const canvas = element?.querySelector("canvas") as HTMLCanvasElement | null;
      if (!element || !canvas?.style.width || !canvas.style.height) return;
      // xterm's screen canvases are absolutely positioned, so their size does
      // not expand their parent automatically. Give the outer element the same
      // footprint so .app__terminal can expose a real horizontal scrollbar.
      element.style.width = canvas.style.width;
      element.style.height = canvas.style.height;
    });
  }

  private startPings(): void {
    this.stopPings();
    let sequence = 0;
    this.#pingTimer = setInterval(() => this.send({ type: "ping", sequence: sequence++ }), PING_MS);
  }

  private stopPings(): void {
    if (this.#pingTimer) clearInterval(this.#pingTimer);
    this.#pingTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.#manuallyClosed) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.#reconnectAttempts, RECONNECT_MAX_MS);
    this.#reconnectAttempts++;
    this.#reconnectTimer = setTimeout(() => this.connect(), delay);
    this.setState("reconnecting");
  }

  private setState(state: ConnState): void {
    this.#state = state;
    this.#cb.onState(state);
  }
}

function readPairingTokenFromFragment(): string | null {
  const match = window.location.hash.match(/[#&]pair=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSessionToken(token: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Storage can be disabled by a browser privacy policy.
  }
}

function buildWsUrl(): string {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}/ws`;
}
