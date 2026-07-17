#!/usr/bin/env node
/*
 * Pre-build asset generator: rasterizes the SVG sources in public/ into the
 * PNG assets referenced by the site (<meta og:image>, apple-touch-icon, PWA
 * manifest, legacy favicon sizes) using sharp.
 *
 * Designed to degrade gracefully: if sharp or SVG rasterization is unavailable
 * on the build host, it logs a warning and exits 0 so `astro build` still runs.
 * The site references these PNGs by URL; a missing file only means no social
 * preview image / apple touch icon — never a broken build.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "..", "public");

const targets = [
  { src: "og.svg", out: "og.png", w: 1200, h: 630 },
  { src: "icon.svg", out: "apple-touch-icon.png", w: 180, h: 180 },
  { src: "icon.svg", out: "icon-192.png", w: 192, h: 192 },
  { src: "icon.svg", out: "icon-512.png", w: 512, h: 512 },
  { src: "icon.svg", out: "favicon-32.png", w: 32, h: 32 },
  { src: "icon.svg", out: "favicon-16.png", w: 16, h: 16 },
];

let sharp;
try {
  sharp = require("sharp");
} catch {
  console.warn("[og] sharp not available — skipping PNG generation.");
  process.exit(0);
}

let ok = 0;
let skipped = 0;
let failed = 0;

for (const t of targets) {
  const srcPath = resolve(publicDir, t.src);
  const outPath = resolve(publicDir, t.out);
  if (!existsSync(srcPath)) {
    console.warn(`[og] source missing: ${t.src}`);
    failed++;
    continue;
  }
  if (existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(srcPath).mtimeMs) {
    skipped++;
    continue;
  }
  try {
    const svg = readFileSync(srcPath);
    await sharp(svg, { density: 300 })
      .resize(t.w, t.h, { fit: "fill" })
      .png()
      .toFile(outPath);
    ok++;
  } catch (err) {
    console.warn(`[og] failed ${t.out}: ${err.message}`);
    failed++;
  }
}

console.log(`[og] generated=${ok} skipped=${skipped} failed=${failed}`);
process.exit(0);
