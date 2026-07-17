import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

const SAFE_SECRET_BYTES = 24;
const PAIRING_TTL_MS = 5 * 60 * 1000;

function toHex(bytes: Buffer): string {
  return bytes.toString("hex");
}

export class PairingService {
  #pairingTokenHash: Buffer | null = null;
  #pairingTokenId: string | null = null;
  #pairingExpiresAt = 0;
  #issued = false;

  issue(): { id: string; token: string; expiresAt: number } {
    const id = nanoid(8);
    const token = toHex(randomBytes(SAFE_SECRET_BYTES));
    this.#pairingTokenId = id;
    this.#pairingTokenHash = createHash("sha256").update(token).digest();
    this.#pairingExpiresAt = Date.now() + PAIRING_TTL_MS;
    this.#issued = false;
    return { id, token, expiresAt: this.#pairingExpiresAt };
  }

  verifyAndConsume(token: string): boolean {
    if (!this.#pairingTokenHash || Date.now() > this.#pairingExpiresAt) return false;
    if (this.#issued) return false;
    const candidate = createHash("sha256").update(token).digest();
    if (candidate.length !== this.#pairingTokenHash.length) return false;
    try {
      if (!timingSafeEqual(candidate, this.#pairingTokenHash)) return false;
    } catch {
      return false;
    }
    this.#issued = true;
    return true;
  }

  get current(): { id: string; expiresAt: number } | null {
    if (!this.#pairingTokenId) return null;
    return { id: this.#pairingTokenId, expiresAt: this.#pairingExpiresAt };
  }

  get consumed(): boolean {
    return this.#issued;
  }
}