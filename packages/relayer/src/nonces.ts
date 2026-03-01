import fs from "node:fs";
import path from "node:path";

type Status = "reserved" | "used";
type Entry = { status: Status; ts: number };

// signer -> nonce -> Entry
type NonceDB = Record<string, Record<string, Entry>>;

export class NonceStore {
  private filePath: string;
  private ttlMs: number;
  private db: NonceDB = {};

  constructor(filePath: string, ttlSeconds: number) {
    this.filePath = path.resolve(filePath);
    this.ttlMs = Math.max(60, ttlSeconds) * 1000;
    this.load();
    this.gc();
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.db = {};
        return;
      }
      const raw = fs.readFileSync(this.filePath, "utf8");
      this.db = raw ? (JSON.parse(raw) as NonceDB) : {};
    } catch {
      this.db = {};
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.db, null, 2));
  }

  private gc() {
    const now = Date.now();
    for (const signer of Object.keys(this.db)) {
      for (const nonce of Object.keys(this.db[signer] || {})) {
        const e = this.db[signer][nonce];
        if (!e?.ts || now - e.ts > this.ttlMs) delete this.db[signer][nonce];
      }
      if (Object.keys(this.db[signer] || {}).length === 0) delete this.db[signer];
    }
    this.save();
  }

  // -----------------------------
  // Compatibility layer
  // -----------------------------

  // old code might call isUsed()
  isUsed(signer: string, nonce: bigint): boolean {
    this.gc();
    const e = this.db[signer]?.[nonce.toString()];
    return e?.status === "used";
  }

  // new build-intent code calls isKnown()
  isKnown(signer: string, nonce: bigint): boolean {
    this.gc();
    return Boolean(this.db[signer]?.[nonce.toString()]);
  }

  // reserve nonce (for build-intent)
  reserve(signer: string, nonce: bigint) {
    this.gc();
    const key = nonce.toString();
    if (!this.db[signer]) this.db[signer] = {};
    if (this.db[signer][key]) return; // already reserved/used
    this.db[signer][key] = { status: "reserved", ts: Date.now() };
    this.save();
  }

  // mark used (after execute succeeds)
  markUsed(signer: string, nonce: bigint) {
    this.gc();
    const key = nonce.toString();
    if (!this.db[signer]) this.db[signer] = {};
    this.db[signer][key] = { status: "used", ts: Date.now() };
    this.save();
  }
}
