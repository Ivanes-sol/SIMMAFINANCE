import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createPublicClient, http, getAddress, parseAbiItem } from "viem";
import { base } from "viem/chains";

const Env = z.object({
  RELAYER_BASE_RPC_URL: z.string().url(),
  SETTLEMENT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  INDEX_FROM_BLOCK: z.string().optional(),      // default: last ~50k blocks
  INDEX_POLL_SECONDS: z.string().optional(),    // default: 10
  INTENTS_DB_PATH: z.string().optional(),       // default: ./data/intents.jsonl
  INDEX_STATE_PATH: z.string().optional(),      // default: ./data/index_state.json
});

const env = Env.parse({
  RELAYER_BASE_RPC_URL: process.env.RELAYER_BASE_RPC_URL,
  SETTLEMENT: process.env.SETTLEMENT,
  INDEX_FROM_BLOCK: process.env.INDEX_FROM_BLOCK,
  INDEX_POLL_SECONDS: process.env.INDEX_POLL_SECONDS,
  INTENTS_DB_PATH: process.env.INTENTS_DB_PATH,
  INDEX_STATE_PATH: process.env.INDEX_STATE_PATH,
});

const settlement = getAddress(env.SETTLEMENT);
const pollSeconds = Number(env.INDEX_POLL_SECONDS ?? "10");

const intentsPath = env.INTENTS_DB_PATH ?? "./data/intents.jsonl";
const statePath = env.INDEX_STATE_PATH ?? "./data/index_state.json";

fs.mkdirSync(path.dirname(intentsPath), { recursive: true });
fs.mkdirSync(path.dirname(statePath), { recursive: true });

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

async function main() {
  console.log("INDEXER_BOOT", new Date().toISOString());
  console.log("Settlement:", settlement);
  console.log("RPC:", env.RELAYER_BASE_RPC_URL.replace(/\/v2\/.*/, "/v2/REDACTED"));
  console.log("intentsPath:", intentsPath);
  console.log("statePath:", statePath);

  const current = await client.getBlockNumber();
  const fallbackFrom = Number(env.INDEX_FROM_BLOCK ?? (current > 50_000n ? (current - 50_000n).toString() : "0"));
  const s0 = loadState();

  let fromBlock = BigInt(s0?.lastProcessedBlock ?? fallbackFrom);
  console.log("Starting from block:", fromBlock.toString());

  // naive in-memory dedupe by txHash:logIndex for the session
  const seen = new Set<string>();

  while (true) {
    const latest = await client.getBlockNumber();
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

      const logs = await client.getLogs({
        address: settlement,
        event: intentExecutedEvent,
        fromBlock: chunkFrom,
        toBlock: chunkTo,
      });

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

        appendJsonl(row);
        console.log("IntentExecuted", row);
      }

      // next chunk
      chunkFrom = chunkTo + 1n;
    }

    // move forward (avoid re-reading)
    const nextFrom = toBlock + 1n;
    saveState({ lastProcessedBlock: Number(nextFrom) });
    fromBlock = nextFrom;

    await new Promise((r) => setTimeout(r, pollSeconds * 1000));
  }
}

main().catch((e) => {
  console.error("indexer fatal:", e?.message || e);
  process.exit(1);
});
