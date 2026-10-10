import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = ReturnType<typeof openDb>;

export function openDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS nonces (
      signer TEXT NOT NULL,
      nonce  TEXT NOT NULL,
      status TEXT NOT NULL,            -- 'reserved' | 'used'
      ts_ms  INTEGER NOT NULL,
      PRIMARY KEY (signer, nonce)
    );

    CREATE INDEX IF NOT EXISTS idx_nonces_signer_status_ts
    ON nonces (signer, status, ts_ms);

    CREATE TABLE IF NOT EXISTS intents (
      chain_id     INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      tx_hash      TEXT NOT NULL,
      log_index    INTEGER NOT NULL,
      signer       TEXT NOT NULL,
      adapter      TEXT NOT NULL,
      token_in     TEXT NOT NULL,
      token_out    TEXT NOT NULL,
      amount_in    TEXT NOT NULL,
      amount_out   TEXT NOT NULL,
      fee_paid     TEXT NOT NULL,
      nonce        TEXT NOT NULL,
      ts_ms        INTEGER NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );

    CREATE INDEX IF NOT EXISTS idx_intents_block
    ON intents (block_number);

    CREATE INDEX IF NOT EXISTS idx_intents_signer
    ON intents (signer);

    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
  `);

  // Prepared statements (returned as helpers)
  const stmts = {
    // nonces
    nonceGet: db.prepare(`SELECT status, ts_ms FROM nonces WHERE signer=? AND nonce=?`),
    nonceUpsert: db.prepare(
      `INSERT INTO nonces(signer, nonce, status, ts_ms)
       VALUES(?,?,?,?)
       ON CONFLICT(signer, nonce) DO UPDATE SET status=excluded.status, ts_ms=excluded.ts_ms`
    ),
    nonceDeleteExpiredReserved: db.prepare(
      `DELETE FROM nonces
       WHERE status='reserved' AND ts_ms < ?`
    ),

    // intents
    intentInsert: db.prepare(
      `INSERT OR IGNORE INTO intents(
         chain_id, block_number, tx_hash, log_index,
         signer, adapter, token_in, token_out,
         amount_in, amount_out, fee_paid, nonce, ts_ms
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ),
    intentsRecent: db.prepare(
      `SELECT chain_id as chainId, block_number as blockNumber, tx_hash as txHash, log_index as logIndex,
              signer, adapter, token_in as tokenIn, token_out as tokenOut,
              amount_in as amountIn, amount_out as amountOut, fee_paid as feePaid, nonce
       FROM intents
       ORDER BY block_number DESC, log_index DESC
       LIMIT ?`
    ),

    // kv
    kvGet: db.prepare(`SELECT v FROM kv WHERE k=?`),
    kvSet: db.prepare(
      `INSERT INTO kv(k,v) VALUES(?,?)
       ON CONFLICT(k) DO UPDATE SET v=excluded.v`
    ),
  };

  return { db, stmts };
}
