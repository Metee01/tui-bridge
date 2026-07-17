#!/usr/bin/env node
/*
 * After tsc builds tui-bridge to dist/, copy the pre-built web UI assets
 * (apps/web/dist) into dist/web/ so the published npm package can serve
 * them without a local monorepo checkout.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const webDist = resolve(pkgRoot, "..", "..", "apps", "web", "dist");
const target = resolve(pkgRoot, "dist", "web");

if (!existsSync(webDist)) {
  console.error(
    `[bundle-web] Web dist not found at ${webDist}. ` +
      `Build @tui-bridge/web first (npm run build --workspace @tui-bridge/web).`,
  );
  process.exit(1);
}

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
}
mkdirSync(target, { recursive: true });
cpSync(webDist, target, { recursive: true, force: true });
console.log(`[bundle-web] Copied ${webDist} -> ${target} (${countFiles(target)} files)`);

function countFiles(dir) {
  let n = 0;
  function walk(d) {
    const entries = existsSync(d) ? readdirSync(d, { withFileTypes: true }) : [];
    for (const e of entries) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) walk(p);
      else n++;
    }
  }
  walk(dir);
  return n;
}
