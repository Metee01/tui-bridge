import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../logger.js";

const logger = createLogger();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function resolveWebRoot(explicit?: string): string {
  if (explicit) return resolve(explicit);

  // Compiled file lives at <pkg>/dist/server/http-server.js.
  const hereDir = dirname(fileURLToPath(import.meta.url));

  // 1) Published npm layout: web assets are bundled at <pkg>/dist/web/
  //    (sibling of dist/server/). Check this first so a globally installed
  //    tui-bridge serves its bundled UI without a monorepo checkout.
  const bundled = join(hereDir, "..", "web");
  if (existsSync(bundled)) return bundled;

  // 2) Development/monorepo layout: walk up until we find a sibling
  //    apps/web/dist directory.
  let dir = hereDir;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "apps", "web", "dist");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Last-resort fallback (relative to this package dist).
  return resolve(hereDir, "..", "..", "..", "..", "apps", "web", "dist");
}

export function createStaticServer(explicitWebRoot?: string) {
  const webRoot = resolveWebRoot(explicitWebRoot);
  logger.debug(`web root: ${webRoot}`);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/")) {
        res.writeHead(400).end();
        return;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/index.html";
      // Prevent path traversal.
      const safe = join(webRoot, pathname);
      if (!safe.startsWith(webRoot)) {
        res.writeHead(403).end();
        return;
      }
      const stats = await stat(safe).catch(() => null);
      if (stats && stats.isFile()) {
        const body = await readFile(safe);
        const mime = MIME[extname(safe).toLowerCase()] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
        res.end(body);
        return;
      }
      // SPA fallback for client-side routing (pairing path etc.).
      const index = await readFile(join(webRoot, "index.html")).catch(() => null);
      if (index) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(index);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    } catch (err) {
      logger.warn("static server error", err);
      res.writeHead(500).end();
    }
  });
}
