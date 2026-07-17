import { networkInterfaces } from "node:os";

export interface LanAddress {
  ip: string;
  family: "IPv4" | "IPv6";
}

export function detectLanIp(): string | null {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}
