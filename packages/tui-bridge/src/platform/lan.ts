import { networkInterfaces } from "node:os";

export interface LanAddress {
  ip: string;
  family: "IPv4" | "IPv6";
}

export interface LanCandidate {
  name: string;
  ip: string;
}

const VIRTUAL_IFACE_PATTERNS = [
  /^virtualbox/i,
  /^vmware/i,
  /^vethernet/i,
  /^hyper-v/i,
  /^wsl/i,
  /^tailscale/i,
  /^docker/i,
  /^br-/i,
  /^tap/i,
  /^hamachi/i,
];

function isVirtualInterface(name: string): boolean {
  return VIRTUAL_IFACE_PATTERNS.some((re) => re.test(name));
}

function isBlacklistedIp(ip: string): boolean {
  if (ip.startsWith("100.")) {
    const o = Number(ip.split(".")[1]);
    if (o >= 64 && o <= 127) return true;
  }
  if (ip.startsWith("169.254.")) return true;
  return false;
}

export function listLanCandidates(): LanCandidate[] {
  const nets = networkInterfaces();
  const out: LanCandidate[] = [];
  for (const [name, list] of Object.entries(nets)) {
    if (!list) continue;
    if (isVirtualInterface(name)) continue;
    for (const net of list) {
      if (net.family !== "IPv4") continue;
      if (net.internal) continue;
      if (isBlacklistedIp(net.address)) continue;
      out.push({ name, ip: net.address });
    }
  }
  return out;
}

function rankPriority(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (ip.startsWith("172.")) {
    const o = Number(ip.split(".")[1]);
    if (o >= 16 && o <= 31) return 2;
  }
  return 3;
}

export function detectLanIp(): string | null {
  const candidates = listLanCandidates();
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestRank = rankPriority(best.ip);
  for (let i = 1; i < candidates.length; i++) {
    const r = rankPriority(candidates[i].ip);
    if (r < bestRank) {
      best = candidates[i];
      bestRank = r;
    }
  }
  return best.ip;
}