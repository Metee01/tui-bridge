import { rmSync } from "node:fs";

const targets = [
  "packages/protocol/dist",
  "packages/tui-bridge/dist",
  "apps/web/dist",
  "node_modules",
];

for (const t of targets) {
  rmSync(t, { recursive: true, force: true });
  console.log(`removed ${t}`);
}