const LEVEL_PREFIX = {
  debug: "[debug]",
  info: "[info]",
  warn: "[warn]",
  error: "[error]",
};

export function createLogger(verbose = false) {
  const emit = (level: keyof typeof LEVEL_PREFIX, message: string, args: unknown[]) => {
    // stderr shares the user's terminal while a TUI is attached. Any background
    // lifecycle message written here corrupts the TUI's screen, so logging is
    // strictly opt-in via --verbose.
    if (!verbose) return;
    const prefix = LEVEL_PREFIX[level];
    const rest = args.length > 0 ? " " + args.map((a) => formatArg(a)).join(" ") : "";
    process.stderr.write(`${prefix} ${message}${rest}\n`);
  };
  return {
    debug: (m: string, ...a: unknown[]) => emit("debug", m, a),
    info: (m: string, ...a: unknown[]) => emit("info", m, a),
    warn: (m: string, ...a: unknown[]) => emit("warn", m, a),
    error: (m: string, ...a: unknown[]) => emit("error", m, a),
  };
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
