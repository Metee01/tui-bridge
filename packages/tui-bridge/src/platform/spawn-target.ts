export interface TargetCommand {
  command: string;
  args: string[];
}

/**
 * Parse the raw argv tokens that follow `--` on the CLI into a platform-aware
 * spawn target. On Windows we route through cmd.exe so PATH-resolved scripts
 * (opencode.cmd, lazygit.bat, npx shims, etc.) launch correctly under ConPTY.
 * On Unix we spawn the resolved executable directly.
 */
export function parseTargetCommand(tokens: string[]): TargetCommand {
  if (tokens.length === 0) {
    throw new Error("No target command provided. Usage: tui-bridge start -- <command> [args...]");
  }
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/c", tokens.join(" ")] };
  }
  // Unix: if a single token contains spaces treat it as a shell line via sh -c.
  if (tokens.length === 1 && tokens[0].includes(" ")) {
    return { command: "sh", args: ["-c", tokens[0]] };
  }
  return { command: tokens[0], args: tokens.slice(1) };
}

export function detectSize(): { cols: number; rows: number } {
  const fallback = { cols: 120, rows: 30 };
  if (!process.stdout.isTTY) return fallback;
  const cols = process.stdout.columns;
  const rows = process.stdout.rows;
  if (cols && rows && cols > 0 && rows > 0) return { cols, rows };
  return fallback;
}