import { createHash, randomBytes } from "node:crypto";

const SAFE_SECRET_BYTES = 24;
export const SESSION_TTL_MS = 60 * 60 * 1000;

function toHex(bytes: Buffer): string {
  return bytes.toString("hex");
}

export interface SessionCredential {
  token: string;
  hash: Buffer;
  expiresAt: number;
  clientId: string;
}

export class SessionService {
  #creds = new Map<string, SessionCredential>(); // tokenHashHex -> credential
  #byClientId = new Map<string, SessionCredential>();
  #paired = 0;

  issue(clientId: string): string {
    const token = toHex(randomBytes(SAFE_SECRET_BYTES));
    const hash = createHash("sha256").update(token).digest();
    const cred: SessionCredential = { token, hash, expiresAt: Date.now() + SESSION_TTL_MS, clientId };
    const key = hash.toString("hex");
    this.#creds.set(key, cred);
    this.#byClientId.set(clientId, cred);
    this.#paired++;
    return token;
  }

  verify(token: string): SessionCredential | null {
    const hash = createHash("sha256").update(token).digest();
    const key = hash.toString("hex");
    const cred = this.#creds.get(key);
    if (!cred) return null;
    if (Date.now() > cred.expiresAt) {
      this.revoke(cred.token);
      return null;
    }
    return cred;
  }

  revoke(token: string): void {
    const hash = createHash("sha256").update(token).digest();
    const key = hash.toString("hex");
    const cred = this.#creds.get(key);
    if (!cred) return;
    this.#creds.delete(key);
    this.#byClientId.delete(cred.clientId);
  }

  revokeClient(clientId: string): void {
    const cred = this.#byClientId.get(clientId);
    if (cred) this.revoke(cred.token);
  }

  get pairedCount(): number {
    return this.#paired;
  }
}