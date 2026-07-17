import { spawn } from "node:child_process";

export interface CloudflaredInfo {
  found: boolean;
  path: string | null;
  version: string | null;
}

export async function findCloudflared(): Promise<CloudflaredInfo> {
  return new Promise((resolve) => {
    const child = spawn("cloudflared", ["--version"], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", () => resolve({ found: false, path: null, version: null }));
    child.on("close", (code) => {
      if (code === 0 || stdout.length > 0) {
        resolve({ found: true, path: "cloudflared", version: extractVersion(stdout || stderr) });
      } else {
        resolve({ found: false, path: null, version: null });
      }
    });
  });
}

function extractVersion(text: string): string | null {
  const match = text.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}