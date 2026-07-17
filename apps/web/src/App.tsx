import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { TerminalClient, type ConnState } from "./terminal/terminal-client";
import type { SessionStatus } from "@tui-bridge/protocol";
import { MobileToolbar } from "./ui/MobileToolbar";
import { ConnectionStatus } from "./ui/ConnectionStatus";

type Modifier = "Ctrl" | "Alt";

export function App(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<TerminalClient | null>(null);

  const [state, setState] = useState<ConnState>("connecting");
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<{ exitCode: number | null; signal: string | null } | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(true);
  const [mods, setMods] = useState<Set<Modifier>>(new Set());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const client = new TerminalClient(
      {
        onState: setState,
        onStatus: setStatus,
        onEnded: (info) => setEnded(info),
        onError: (message) => setError(message),
        onTerminalReady: () => {},
        // Native keyboard: phone's keyboard fires xterm.onData. Route it
        // through the same sendKey path so pending Ctrl/Alt modifiers apply.
        onNativeInput: (data) => {
          // Capture current mods at event time (not at sendKey definition time).
          sendKeyRef.current(data);
        },
      },
      container,
    );
    setHasToken(client.hasToken);
    clientRef.current = client;
    if (client.hasToken) client.connect();
    return () => {
      client.dispose();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sendKeyRef always points at the latest sendKey so onNativeInput (registered
  // once at mount) sees the current modifier state without re-registering.
  const sendKeyRef = useRef<(raw: string) => void>(() => {});
  const sendKey = useCallback(
    (raw: string) => {
      if (state !== "live") return;
      let seq = raw;
      if (mods.has("Alt")) seq = "\x1b" + seq;
      if (mods.has("Ctrl") && seq.length === 1) {
        const code = seq.charCodeAt(0) - 96;
        seq = String.fromCharCode(code < 0 ? code + 128 : code);
      }
      clientRef.current?.sendInput(seq);
      if (mods.size > 0) setMods(new Set());
    },
    [state, mods],
  );
  sendKeyRef.current = sendKey;

  const handleShowKeyboard = useCallback(() => {
    if (state === "live") clientRef.current?.focus();
  }, [state]);

  const toggleMod = (mod: Modifier) => {
    setMods((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const canControl = state === "live";

  return (
    <div className="app">
      <div className="app__status">
        <ConnectionStatus state={state} status={status} />
      </div>

      <div className="app__terminal">
        {!hasToken ? (
          <NoTokenScreen />
        ) : ended ? (
          <EndedScreen info={ended} />
        ) : (
          <div
            ref={containerRef}
            className="app__terminal-inner"
            onPointerDown={handleShowKeyboard}
          />
        )}
      </div>

      {hasToken && !ended && (
        <div className="app__toolbar">
          {error ? <div className="pair__error">{error}</div> : null}
          <MobileToolbar
            enabled={canControl}
            mods={mods}
            onToggleMod={toggleMod}
            onInput={sendKey}
            onShowKeyboard={handleShowKeyboard}
          />
        </div>
      )}
    </div>
  );
}

function NoTokenScreen(): JSX.Element {
  return (
    <div className="pair">
      <div className="pair__card">
        <h2>TUI Bridge</h2>
        <p>
          No pairing token found in this URL. Scan the QR code shown in your terminal, or open the full
          <code> trycloudflare.com </code> link that ends with <code>#pair=…</code>.
        </p>
        <p className="muted">The pairing token is delivered only through the QR code at session start.</p>
      </div>
    </div>
  );
}

function EndedScreen({ info }: { info: { exitCode: number | null; signal: string | null } }): JSX.Element {
  return (
    <div className="pair">
      <div className="pair__card">
        <h2>Session ended</h2>
        <p>
          Exit code: {info.exitCode ?? "?"}
          {info.signal ? ` · signal: ${info.signal}` : ""}
        </p>
        <p className="muted">The TUI process exited. Close this tab or start a new session.</p>
      </div>
    </div>
  );
}
