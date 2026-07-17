import { createServer, type Server as HttpServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type SessionStatus,
} from "@tui-bridge/protocol";
import type { PtyOutput, PtySession } from "../pty-session.js";
import type { PairingService, SessionService } from "../auth/index.js";
import { createLogger } from "../logger.js";

interface ClientConnection {
  ws: WebSocket;
  id: string;
  authed: boolean;
  sessionToken?: string;
  lastPong: number;
  syncing: boolean;
  pendingOutput: PtyOutput[];
}

export interface GatewayOptions {
  pty: PtySession;
  pairing: PairingService;
  sessions: SessionService;
  onStatus: (status: SessionStatus) => void;
}

const PING_INTERVAL_MS = 25_000;
const STALE_AFTER_MS = 70_000;
const MAX_QUEUE_PER_CLIENT = 256 * 1024;

export class WsGateway {
  readonly #logger = createLogger();
  readonly #pty: PtySession;
  readonly #pairing: PairingService;
  readonly #sessions: SessionService;
  readonly #clients = new Map<string, ClientConnection>();
  #onStatus: (status: SessionStatus) => void;
  #pingTimer: NodeJS.Timeout | null = null;

  constructor(opts: GatewayOptions) {
    this.#pty = opts.pty;
    this.#pairing = opts.pairing;
    this.#sessions = opts.sessions;
    this.#onStatus = opts.onStatus;
    // Whenever the shared PTY is resized (the desktop window is resized),
    // broadcast the new grid so every client reflows its local buffer to the
    // real PTY dimensions. The phone mirrors the desktop grid at all times.
    this.#pty.on("resize", ({ cols, rows }) => {
      this.broadcast({ type: "resize", cols, rows });
    });
  }

  attach(server: HttpServer): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      const { pathname } = new URL(req.url ?? "", "http://localhost");
      if (pathname !== "/ws") {
        socket.destroy();
        return;
      }
      if (!this.#originAllowed(req)) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });

    wss.on("connection", (ws, req) => this.handleConnection(ws, req));
    this.startPings();
    return wss;
  }

  #originAllowed(req: IncomingMessage): boolean {
    // Quick Tunnel forwards with origin; localhost connect may omit. Block obviously
    // foreign origins, but do not rely on this as the only gate (pairing token is).
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const url = new URL(origin);
      const host = url.hostname;
      return host === "127.0.0.1" || host === "localhost" || host.endsWith(".trycloudflare.com");
    } catch {
      return false;
    }
  }

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const id = randomUUID();
    const conn: ClientConnection = {
      ws,
      id,
      authed: false,
      lastPong: Date.now(),
      syncing: false,
      pendingOutput: [],
    };
    this.#clients.set(id, conn);
    this.#logger.info(`WebSocket client connected: ${id}`);
    ws.on("message", (raw, isBinary) => this.onMessage(conn, raw, isBinary));
    ws.on("close", () => this.onClose(conn));
    ws.on("error", (err) => {
      this.#logger.warn(`WebSocket error on ${id}`, err);
    });
    ws.on("pong", () => {
      conn.lastPong = Date.now();
    });
  }

  private onMessage(conn: ClientConnection, raw: unknown, isBinary: boolean): void {
    if (isBinary) return; // MVP server -> client only sends binary output
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : (raw as Buffer).toString("utf-8"));
    } catch {
      this.send(conn, { type: "error", code: "bad_json", message: "Invalid JSON frame" });
      return;
    }
    const msg: ClientMessage | null = parseClientMessage(parsed);
    if (!msg) {
      this.send(conn, { type: "error", code: "bad_message", message: "Unrecognized client message" });
      return;
    }
    switch (msg.type) {
      case "auth":
        this.handleAuth(conn, msg);
        break;
      case "input":
        this.handleInput(conn, msg);
        break;
      case "ping":
        this.send(conn, { type: "pong", sequence: msg.sequence });
        conn.lastPong = Date.now();
        break;
    }
  }

  private handleAuth(conn: ClientConnection, msg: { pairingToken?: string; sessionToken?: string; cols?: number; rows?: number }): void {
    if (conn.authed) {
      this.send(conn, { type: "error", code: "already_authed", message: "Already authenticated" });
      return;
    }
    if (msg.sessionToken) {
      const cred = this.#sessions.verify(msg.sessionToken);
      if (!cred) {
        this.send(conn, { type: "error", code: "bad_session", message: "Session token invalid or expired" });
        return;
      }
      conn.sessionToken = cred.token;
      conn.authed = true;
      void this.sendAuthedAndSnapshot(conn);
      return;
    }
    if (msg.pairingToken) {
      if (!this.#pairing.verifyAndConsume(msg.pairingToken)) {
        this.send(conn, { type: "error", code: "pairing_denied", message: "Pairing token invalid or already used" });
        return;
      }
      conn.authed = true;
      const sessionToken = this.#sessions.issue(conn.id);
      conn.sessionToken = sessionToken;
      void this.sendAuthedAndSnapshot(conn);
      return;
    }
    this.send(conn, { type: "error", code: "pairing_required", message: "Pairing or session token required" });
  }

  private async sendAuthedAndSnapshot(conn: ClientConnection): Promise<void> {
    conn.syncing = true;
    this.send(conn, {
      type: "authed",
      clientId: conn.id,
      sessionToken: conn.sessionToken ?? "",
      cols: this.#pty.cols,
      rows: this.#pty.rows,
    });
    const snap = await this.#pty.snapshot();
    this.send(conn, { type: "snapshot", data: snap.data, cols: snap.cols, rows: snap.rows });
    for (const output of conn.pendingOutput) {
      if (output.sequence > snap.sequence) this.sendBinary(conn, output.chunk);
    }
    conn.pendingOutput = [];
    conn.syncing = false;
    this.#logger.info(`Client ${conn.id} authed (${this.#pty.cols}x${this.#pty.rows})`);
  }

  private handleInput(conn: ClientConnection, msg: { data: string }): void {
    // Any authenticated client can send input. No input lock — both local and
    // mobile can type simultaneously.
    if (!conn.authed) return;
    this.#pty.write(msg.data);
  }

  private onClose(conn: ClientConnection): void {
    this.#clients.delete(conn.id);
    // NOTE: Do NOT revoke the session token on disconnect. The token has its own
    // TTL (1 hour) and is needed for reconnect after page refresh. Revoking here
    // breaks refresh/reconnect because the client still holds the token in
    // sessionStorage but the server has deleted it.
    this.#logger.info(`WebSocket client disconnected: ${conn.id}`);
  }

  private startPings(): void {
    this.#pingTimer = setInterval(() => {
      const now = Date.now();
      for (const conn of this.#clients.values()) {
        if (conn.ws.readyState !== WebSocket.OPEN) continue;
        if (now - conn.lastPong > STALE_AFTER_MS) {
          this.#logger.warn(`Terminating stale client ${conn.id}`);
          conn.ws.terminate();
          continue;
        }
        conn.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const conn of this.#clients.values()) {
      if (conn.ws.readyState !== WebSocket.OPEN) continue;
      this.sendRaw(conn, data);
    }
  }

  broadcastBinary(output: PtyOutput): void {
    for (const conn of this.#clients.values()) {
      if (conn.ws.readyState !== WebSocket.OPEN) continue;
      if (conn.syncing) {
        conn.pendingOutput.push(output);
      } else {
        this.sendBinary(conn, output.chunk);
      }
    }
  }

  status(status: SessionStatus): void {
    this.#onStatus(status);
    this.broadcast({ type: "status", status });
  }

  private send(conn: ClientConnection, message: ServerMessage): void {
    this.sendRaw(conn, JSON.stringify(message));
  }

  private sendRaw(conn: ClientConnection, data: string): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    if (conn.ws.bufferedAmount > MAX_QUEUE_PER_CLIENT) {
      // Backpressure: drop frame for slow client.
      return;
    }
    conn.ws.send(data);
  }

  private sendBinary(conn: ClientConnection, chunk: Buffer): void {
    if (conn.ws.bufferedAmount > MAX_QUEUE_PER_CLIENT) return;
    conn.ws.send(chunk);
  }

  dispose(): void {
    if (this.#pingTimer) clearInterval(this.#pingTimer);
    for (const conn of this.#clients.values()) {
      try {
        conn.ws.close();
      } catch {
        // ignore
      }
    }
    this.#clients.clear();
  }
}

export function createApp(): HttpServer {
  return createServer();
}

export function isServerMessage(value: unknown): value is ServerMessage {
  return parseServerMessage(value) !== null;
}
