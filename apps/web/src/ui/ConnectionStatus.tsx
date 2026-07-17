import type { JSX } from "react";
import type { SessionStatus } from "@tui-bridge/protocol";
import type { ConnState } from "../terminal/terminal-client";

interface ConnectionStatusProps {
  state: ConnState;
  status: SessionStatus | null;
}

export function ConnectionStatus({ state, status }: ConnectionStatusProps): JSX.Element {
  const dotClass =
    state === "live"
      ? "status-dot--live"
      : state === "down" || state === "ended"
        ? "status-dot--down"
        : "status-dot--connecting";
  const label = describe(state, status);
  return (
    <>
      <span className={`status-dot ${dotClass}`} />
      <span>{label}</span>
    </>
  );
}

function describe(state: ConnState, status: SessionStatus | null): string {
  if (state === "ended") return "Session ended";
  if (state === "down" || status === "tunnel_down") return "Tunnel down — reconnecting…";
  if (state === "reconnecting") return "Reconnecting…";
  if (state === "connecting") return "Connecting…";
  return "Live";
}