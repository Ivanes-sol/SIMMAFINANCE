import { getAddress } from "viem";
import type { Db } from "./db";

export class SqliteNonceStore {
  private ttlMs: number;
  private db: Db;

  constructor(db: Db, ttlSeconds: number) {
    this.db = db;
    this.ttlMs = ttlSeconds * 1000;
  }

  private nowMs() {
    return Date.now();
  }

  private cleanup() {
    const cutoff = this.nowMs() - this.ttlMs;
    this.db.stmts.nonceDeleteExpiredReserved.run(cutoff);
  }

  // reserved OR used (known)
  isKnown(signer: string, nonce: bigint): boolean {
    const s = getAddress(signer);
    const n = nonce.toString();
    const row = this.db.stmts.nonceGet.get(s, n) as any;
    return !!row;
  }

  isUsed(signer: string, nonce: bigint): boolean {
    const s = getAddress(signer);
    const n = nonce.toString();
    const row = this.db.stmts.nonceGet.get(s, n) as any;
    return row?.status === "used";
  }

  reserve(signer: string, nonce: bigint) {
    this.cleanup();
    const s = getAddress(signer);
    const n = nonce.toString();

    const row = this.db.stmts.nonceGet.get(s, n) as any;
    if (row?.status === "used") throw new Error("Nonce already used");

    this.db.stmts.nonceUpsert.run(s, n, "reserved", this.nowMs());
  }

  markUsed(signer: string, nonce: bigint) {
    const s = getAddress(signer);
    const n = nonce.toString();
    this.db.stmts.nonceUpsert.run(s, n, "used", this.nowMs());
  }
}
