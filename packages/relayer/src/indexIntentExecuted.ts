import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createPublicClient, http, getAddress, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { openDb } from "./db";

const Env = z.object({
  RELAYER_BASE_RPC_URL: z.string().url(),
  SETTLEMENT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  INDEX_FROM_BLOCK: z.string().optional(),      // default: last ~50k blocks
  INDEX_POLL_SECONDS: z.string().optional(),    // default: 10
  INTENTS_DB_PATH: z.string().optional(),       // default: ./data/intents.jsonl
  INDEX_STATE_PATH: z.string().optional(),      // default: ./data/index_state.json
  INDEX_STORE: z.enum(["json", "sqlite"]).optional(), // default: json
  RELAYER_DB_PATH: z.string().optional(),            // default: ./data/relayer.db
});

const env = Env.parse({
  RELAYER_BASE_RPC_URL: process.env.RELAYER_BASE_RPC_URL,
  SETTLEMENT: process.env.SETTLEMENT,
  INDEX_FROM_BLOCK: process.env.INDEX_FROM_BLOCK,
  INDEX_POLL_SECONDS: process.env.INDEX_POLL_SECONDS,
  INTENTS_DB_PATH: process.env.INTENTS_DB_PATH,
  INDEX_STATE_PATH: process.env.INDEX_STATE_PATH,
  INDEX_STORE: process.env.INDEX_STORE,
  RELAYER_DB_PATH: process.env.RELAYER_DB_PATH,
});

const settlement = getAddress(env.SETTLEMENT);
const pollSeconds = Number(env.INDEX_POLL_SECONDS ?? "10");
const chunkDelayMs = Number(process.env.INDEX_CHUNK_DELAY_MS ?? "300"); // pause between eth_getLogs calls
const backoff429Ms = Number(process.env.INDEX_BACKOFF_429_MS ?? "5000"); // wait on rate-limit
const intentsPath = env.INTENTS_DB_PATH ?? "./data/intents.jsonl";
const statePath = env.INDEX_STATE_PATH ?? "./data/index_state.json";
const indexStore = env.INDEX_STORE ?? "json";
const dbPath = env.RELAYER_DB_PATH ?? "./data/relayer.db";

let db: ReturnType<typeof openDb> | null = null;

if (indexStore === "sqlite") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = openDb(dbPath);
}

const KV_LAST_BLOCK = "indexer:lastProcessedBlock";
const KV_LAST_HEARTBEAT = "indexer:lastHeartbeatMs";

function loadStateSqlite(): State | null {
  if (!db) return null;
  const row = db.stmts.kvGet.get(KV_LAST_BLOCK) as any; // positional bind
  if (!row?.v) return null;
  const n = Number(row.v);
  return Number.isFinite(n) ? { lastProcessedBlock: n } : null;
}

function saveStateSqlite(s: State) {
  if (!db) return;
  db.stmts.kvSet.run(KV_LAST_BLOCK, String(s.lastProcessedBlock)); // positional bind
}

function writeIntentSqlite(obj: any) {
  if (!db) return;
  db.stmts.intentInsert.run(
    obj.chainId,
    obj.blockNumber,
    obj.txHash,
    obj.logIndex,
    obj.signer,
    obj.adapter,
    obj.tokenIn,
    obj.tokenOut,
    obj.amountIn,
    obj.amountOut,
    obj.feePaid,
    obj.nonce,
    Date.now()
  );
}


if (indexStore === "json") {
  fs.mkdirSync(path.dirname(intentsPath), { recursive: true });
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
}

const client = createPublicClient({
  chain: base,
  transport: http(env.RELAYER_BASE_RPC_URL),
});

const intentExecutedEvent = parseAbiItem(
  "event IntentExecuted(address indexed signer,address indexed adapter,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,uint256 feePaid,uint256 nonce)"
);

type State = { lastProcessedBlock: number };

function loadState(): State | null {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const j = JSON.parse(raw);
    if (typeof j?.lastProcessedBlock === "number") return { lastProcessedBlock: j.lastProcessedBlock };
    return null;
  } catch {
    return null;
  }
}

function saveState(s: State) {
  fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
}

function appendJsonl(obj: any) {
  fs.appendFileSync(intentsPath, JSON.stringify(obj) + "\n");
}
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function main() {
  console.log("INDEXER_BOOT", new Date().toISOString());
  console.log("Settlement:", settlement);
  console.log("RPC:", env.RELAYER_BASE_RPC_URL.replace(/\/v2\/.*/, "/v2/REDACTED"));
  console.log("INDEX_STORE:", indexStore);
  console.log("intentsPath:", intentsPath);
  console.log("statePath:", statePath);
  console.log("dbPath:", dbPath);

  const current = await withTimeout(client.getBlockNumber(), 15000, "getBlockNumber(initial)");
  const fallbackFrom = Number(env.INDEX_FROM_BLOCK ?? (current > 50_000n ? (current - 50_000n).toString() : "0"));
  const s0 = indexStore === "sqlite" ? loadStateSqlite() : loadState();  

  let fromBlock = BigInt(s0?.lastProcessedBlock ?? fallbackFrom);
  console.log("Starting from block:", fromBlock.toString());

  // naive in-memory dedupe by txHash:logIndex for the session
  const seen = new Set<string>();

  while (true) {
    const latest = await withTimeout(client.getBlockNumber(), 15000, "getBlockNumber(loop)");
    const toBlock = latest;

    if (fromBlock > toBlock) {
      await new Promise((r) => setTimeout(r, pollSeconds * 1000));
      continue;
    }

    // Alchemy free tier can restrict eth_getLogs to small ranges (e.g., 10 blocks).
    // So we chunk the query.
    const MAX_RANGE = 10n;

    let chunkFrom = fromBlock;
    while (chunkFrom <= toBlock) {
      const chunkTo = (chunkFrom + (MAX_RANGE - 1n)) > toBlock ? toBlock : (chunkFrom + (MAX_RANGE - 1n));

            let logs: any[] = [];
      try {
    logs = await withTimeout(
  client.getLogs({
    address: settlement,
    event: intentExecutedEvent,
    fromBlock: chunkFrom,
    toBlock: chunkTo,
  }),
  15000,
  `getLogs(${chunkFrom.toString()}-${chunkTo.toString()})`
);
      } catch (e: any) {
       const msg = String(e?.message || "");
       const full = (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
        // Backoff on rate limiting
        if (msg.includes("429") || full.includes("429") || msg.toLowerCase().includes("too many requests") || full.toLowerCase().includes("too many requests")) {
          console.log(`Rate limited (429). Sleeping ${backoff429Ms}ms then retrying chunk...`);
          await new Promise((r) => setTimeout(r, backoff429Ms));
          continue; // retry same chunkFrom/chunkTo
        }
        throw e;
      }     

      for (const log of logs) {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const args: any = log.args;
        const row = {
          chainId: 8453,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          signer: args.signer,
          adapter: args.adapter,
          tokenIn: args.tokenIn,
          tokenOut: args.tokenOut,
          amountIn: args.amountIn?.toString?.() ?? String(args.amountIn),
          amountOut: args.amountOut?.toString?.() ?? String(args.amountOut),
          feePaid: args.feePaid?.toString?.() ?? String(args.feePaid),
          nonce: args.nonce?.toString?.() ?? String(args.nonce),
        };

        if (indexStore === "sqlite") writeIntentSqlite(row);
        else appendJsonl(row);
        console.log("IntentExecuted", row);
      }

      // next chunk
     // Persist progress frequently (so Ctrl+C / restarts don't lose work)
      const nextChunkFrom = chunkTo + 1n;
      const chunkState = { lastProcessedBlock: Number(nextChunkFrom) };

      if (indexStore === "sqlite") {
        saveStateSqlite(chunkState);
        // heartbeat for dashboards/ops
        db?.stmts.kvSet.run(KV_LAST_HEARTBEAT, String(Date.now()));
      } else {
        saveState(chunkState);
      }

      chunkFrom = chunkTo + 1n;
      await new Promise((r) => setTimeout(r, chunkDelayMs));
    }

    // move forward (avoid re-reading)
    const nextFrom = toBlock + 1n;
    const newState = { lastProcessedBlock: Number(nextFrom) };
    if (indexStore === "sqlite") saveStateSqlite(newState);
    else saveState(newState);
    fromBlock = nextFrom;

    await new Promise((r) => setTimeout(r, pollSeconds * 1000));
  }
}

async function runForever() {
  // never exit on transient RPC/provider errors; back off and retry
  while (true) {
    try {
      await main();
    } catch (e: any) {
      const msg = String(e?.message || e);
      console.error("indexer fatal:", msg);

      // longer backoff for rate limits
      const is429 = msg.includes("429") || msg.toLowerCase().includes("too many requests");
      const sleepMs = is429 ? backoff429Ms : 5000;

      console.error(`indexer restarting in ${sleepMs}ms...`);
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }
}

runForever();
