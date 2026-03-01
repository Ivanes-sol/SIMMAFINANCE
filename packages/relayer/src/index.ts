import "dotenv/config";
import express from "express";
import { z } from "zod";

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  isAddress,
  keccak256,
  encodeAbiParameters,
  hexToBytes,
  bytesToHex,
  parseAbiItem,
  decodeEventLog,
  recoverAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { NonceStore } from "./nonces";
import {
  parseCsvAddrs,
  parsePairs,
  ensureAllowed,
  assertAllowlistsConfigured,
} from "./allowlist";

// ---------------------------
// Types
// ---------------------------
type SwapIntent = {
  signer: `0x${string}`;
  adapter: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
  nonce: bigint;
  adapterData: `0x${string}`;
};

// ---------------------------
// ABI (minimal)
// ---------------------------
const settlementViewAbi = [
  {
    type: "function",
    name: "SWAP_INTENT_TYPEHASH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "eip712Domain",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "bytes1" },
      { type: "string" },
      { type: "string" },
      { type: "uint256" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "intent",
        type: "tuple",
        components: [
          { name: "signer", type: "address" },
          { name: "adapter", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "adapterData", type: "bytes" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const intentExecutedEvent = parseAbiItem(
  "event IntentExecuted(address indexed signer,address indexed adapter,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,uint256 feePaid,uint256 nonce)"
);

// ---------------------------
// Helpers: JSON response (BigInt safe)
// ---------------------------
function sendJson(res: any, status: number, obj: any) {
  const body = JSON.stringify(
    obj,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
  res.status(status);
  res.setHeader("content-type", "application/json");
  return res.send(body);
}

// ---------------------------
// EIP-712 helpers (match your Solidity domain logic)
// ---------------------------
function utf8ToHex(s: string): `0x${string}` {
  const bytes = new TextEncoder().encode(s);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

function domainSeparatorFromEip712Domain(
  fieldsHex: string,
  name: string,
  version: string,
  chainId: bigint,
  verifyingContract: `0x${string}`,
  salt: `0x${string}`
): `0x${string}` {
  const fieldsByte = BigInt(fieldsHex);
  const saltIsZero = salt === ("0x" + "0".repeat(64));
  const hasSalt = (fieldsByte & 0x10n) !== 0n || !saltIsZero;

  if (hasSalt) {
    const typeHash = keccak256(
      hexToBytes(
        utf8ToHex(
          "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)"
        )
      )
    );
    return keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
          { type: "bytes32" },
        ],
        [
          typeHash,
          keccak256(hexToBytes(utf8ToHex(name))),
          keccak256(hexToBytes(utf8ToHex(version))),
          chainId,
          verifyingContract,
          salt,
        ]
      )
    );
  }

  const typeHash = keccak256(
    hexToBytes(
      utf8ToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    )
  );
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        typeHash,
        keccak256(hexToBytes(utf8ToHex(name))),
        keccak256(hexToBytes(utf8ToHex(version))),
        chainId,
        verifyingContract,
      ]
    )
  );
}

function buildSwapIntentDigest(
  domainSeparator: `0x${string}`,
  typeHash: `0x${string}`,
  intent: SwapIntent
): `0x${string}` {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        typeHash,
        intent.signer,
        intent.adapter,
        intent.tokenIn,
        intent.tokenOut,
        intent.amountIn,
        intent.minAmountOut,
        intent.deadline,
        intent.nonce,
        keccak256(intent.adapterData),
      ]
    )
  );

  return keccak256(
    (`0x1901${domainSeparator.slice(2)}${structHash.slice(2)}`) as `0x${string}`
  );
}

// adapterData = abi.encode(uint24 fee, uint256 deadline)
function abiEncodeFeeDeadline(fee: bigint, deadline: bigint): `0x${string}` {
  const feeHex = fee.toString(16).padStart(64, "0");
  const dlHex = deadline.toString(16).padStart(64, "0");
  return (`0x${feeHex}${dlHex}`) as `0x${string}`;
}

// ---------------------------
// Validation schemas
// ---------------------------
const ExecuteBody = z.object({
  chainId: z.number(),
  intent: z.object({
    signer: z.string(),
    adapter: z.string(),
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    minAmountOut: z.string(),
    deadline: z.string(),
    nonce: z.string(),
    adapterData: z.string(),
  }),
  signature: z.string(),
});

const BuildBody = z.object({
  signer: z.string(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  minAmountOut: z.string().optional(),
  fee: z.number().optional(),
  adapter: z.string().optional(),
});

// ---------------------------
// Boot / env
// ---------------------------
const Env = z.object({
  PORT: z.string().default("8787"),
  RELAYER_BASE_RPC_URL: z.string().url(),
  RELAYER_PK: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  SETTLEMENT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),

  INTENT_TTL_SECONDS: z.string().optional(),
  NONCE_DB_PATH: z.string().optional(),

  ALLOWED_ADAPTERS: z.string().optional(),
  ALLOWED_TOKENS: z.string().optional(),
  ALLOWED_PAIRS: z.string().optional(),
});

const env = Env.parse({
  PORT: process.env.PORT ?? "8787",
  RELAYER_BASE_RPC_URL: process.env.RELAYER_BASE_RPC_URL,
  RELAYER_PK: process.env.RELAYER_PK,
  SETTLEMENT: process.env.SETTLEMENT,

  INTENT_TTL_SECONDS: process.env.INTENT_TTL_SECONDS,
  NONCE_DB_PATH: process.env.NONCE_DB_PATH,

  ALLOWED_ADAPTERS: process.env.ALLOWED_ADAPTERS,
  ALLOWED_TOKENS: process.env.ALLOWED_TOKENS,
  ALLOWED_PAIRS: process.env.ALLOWED_PAIRS,
});

const PORT = Number(env.PORT);
const settlement = getAddress(env.SETTLEMENT) as `0x${string}`;

const ttlSeconds = Number(env.INTENT_TTL_SECONDS || "1200");
const nonceDbPath = env.NONCE_DB_PATH || "./data/nonces.json";
const nonceStore = new NonceStore(nonceDbPath, ttlSeconds);

const ALLOW_ADAPTERS = parseCsvAddrs(env.ALLOWED_ADAPTERS);
const ALLOW_TOKENS = parseCsvAddrs(env.ALLOWED_TOKENS);
const ALLOW_PAIRS = parsePairs(env.ALLOWED_PAIRS);

const relayerAccount = privateKeyToAccount(env.RELAYER_PK as `0x${string}`);

const publicClient = createPublicClient({
  chain: base,
  transport: http(env.RELAYER_BASE_RPC_URL),
});

const walletClient = createWalletClient({
  chain: base,
  transport: http(env.RELAYER_BASE_RPC_URL),
  account: relayerAccount,
});

const app = express();
app.use(express.json({ limit: "1mb" }));

console.log("RELAYER_BOOT", new Date().toISOString());
console.log(`Relayer running on http://localhost:${PORT}`);
console.log("Relayer address:", relayerAccount.address);
console.log("Settlement:", settlement);

// ---------------------------
// Health
// ---------------------------
app.get("/health", async (_req, res) => {
  return sendJson(res, 200, {
    ok: true,
    relayer: relayerAccount.address,
    settlement,
    chainId: 8453,
  });
});

// ---------------------------
// Build intent (server-side policy only; client still signs)
// POST /v1/build-intent
// ---------------------------
app.post("/v1/build-intent", async (req, res) => {
  try {
    // STRICT allowlists: block build if not configured
    assertAllowlistsConfigured(ALLOW_ADAPTERS, ALLOW_TOKENS, ALLOW_PAIRS);

    const body = BuildBody.parse(req.body);

    if (!isAddress(body.signer) || !isAddress(body.tokenIn) || !isAddress(body.tokenOut)) {
      return sendJson(res, 400, { error: "Invalid address in request" });
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const deadline = now + BigInt(ttlSeconds);

    // generate nonce that is not known (used or reserved)
    let nonce = 0n;
    for (let i = 0; i < 20; i++) {
      const candidate = BigInt(Math.floor(Math.random() * 1e9));
      if (!nonceStore.isKnown(getAddress(body.signer), candidate)) {
        nonce = candidate;
        break;
      }
    }
    if (nonce === 0n) throw new Error("Failed to generate unique nonce (try again)");

    const fee = BigInt(body.fee ?? 3000);
    const adapter = getAddress(
      body.adapter ?? process.env.ADAPTER ?? "0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0"
    );

    const intent: SwapIntent = {
      signer: getAddress(body.signer),
      adapter,
      tokenIn: getAddress(body.tokenIn),
      tokenOut: getAddress(body.tokenOut),
      amountIn: BigInt(body.amountIn),
      minAmountOut: BigInt(body.minAmountOut ?? "1"),
      deadline,
      nonce,
      adapterData: abiEncodeFeeDeadline(fee, deadline),
    };

    // allowlists (adapter/tokens/pair)
    ensureAllowed(intent, ALLOW_ADAPTERS, ALLOW_TOKENS, ALLOW_PAIRS);

    // Nonce replay protection:
    // - allow RESERVED nonces (from /v1/build-intent)
    // - reject only if already USED (consumed by a successful execute)
    if (nonceStore.isUsed(intent.signer, intent.nonce)) {
      return sendJson(res, 400, { error: "Nonce already used" });
    }

    // reserve nonce immediately
    nonceStore.reserve(intent.signer, intent.nonce);

    return sendJson(res, 200, {
      chainId: 8453,
      intent: {
        ...intent,
        amountIn: intent.amountIn.toString(),
        minAmountOut: intent.minAmountOut.toString(),
        deadline: intent.deadline.toString(),
        nonce: intent.nonce.toString(),
      },
    });
  } catch (e: any) {
    return sendJson(res, 400, { error: e?.message || String(e) });
  }
});

// ---------------------------
// Execute intent
// POST /v1/execute { chainId, intent, signature }
// ---------------------------
app.post("/v1/execute", async (req, res) => {
  try {
    // STRICT allowlists: block execute if not configured
    assertAllowlistsConfigured(ALLOW_ADAPTERS, ALLOW_TOKENS, ALLOW_PAIRS);

    const body = ExecuteBody.parse(req.body);

    if (body.chainId !== 8453) {
      return sendJson(res, 400, { error: "Unsupported chainId" });
    }

    const intent: SwapIntent = {
      signer: getAddress(body.intent.signer),
      adapter: getAddress(body.intent.adapter),
      tokenIn: getAddress(body.intent.tokenIn),
      tokenOut: getAddress(body.intent.tokenOut),
      amountIn: BigInt(body.intent.amountIn),
      minAmountOut: BigInt(body.intent.minAmountOut),
      deadline: BigInt(body.intent.deadline),
      nonce: BigInt(body.intent.nonce),
      adapterData: body.intent.adapterData as `0x${string}`,
    };

    const signature = body.signature as `0x${string}`;

    // deadline policy
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (intent.deadline < now) {
      return sendJson(res, 400, { error: "Intent expired (deadline < now)" });
    }

    // allowlists
    ensureAllowed(intent, ALLOW_ADAPTERS, ALLOW_TOKENS, ALLOW_PAIRS);

    // nonce replay protection (USED = reject)
    if (nonceStore.isUsed(intent.signer, intent.nonce)) {
      return sendJson(res, 400, { error: "Nonce already used" });
    }

    // ---- Read EIP712 domain + typehash from contract
    let fields: string,
      name: string,
      version: string,
      chainIdOnContract: bigint,
      verifyingContract: string,
      salt: `0x${string}`;

    try {
      const ret = (await publicClient.readContract({
        address: settlement,
        abi: settlementViewAbi,
        functionName: "eip712Domain",
      })) as any;
      fields = ret[0];
      name = ret[1];
      version = ret[2];
      chainIdOnContract = BigInt(ret[3]);
      verifyingContract = ret[4];
      salt = ret[5];
    } catch (err: any) {
      return sendJson(res, 500, {
        error: "Failed to read eip712Domain() from settlement",
        detail: err?.message || String(err),
      });
    }

    let typeHash: `0x${string}`;
    try {
      typeHash = (await publicClient.readContract({
        address: settlement,
        abi: settlementViewAbi,
        functionName: "SWAP_INTENT_TYPEHASH",
      })) as `0x${string}`;
    } catch (err: any) {
      return sendJson(res, 500, {
        error: "Failed to read SWAP_INTENT_TYPEHASH() from settlement",
        detail: err?.message || String(err),
      });
    }

    const domainSep = domainSeparatorFromEip712Domain(
      fields,
      name,
      version,
      chainIdOnContract,
      getAddress(verifyingContract),
      salt
    );

    const digest = buildSwapIntentDigest(domainSep, typeHash, intent);

    // ---- Recover signer & verify
    let recovered: `0x${string}`;
    try {
      recovered = await recoverAddress({
        hash: digest,
        signature,
      });
    } catch (err: any) {
      return sendJson(res, 400, {
        error: "Signature recover failed",
        detail: err?.message || String(err),
      });
    }

    if (getAddress(recovered) !== getAddress(intent.signer)) {
      return sendJson(res, 400, {
        error: "Invalid signature (recovered != intent.signer)",
        recovered,
        expected: intent.signer,
      });
    }

    // ---- Execute with relayer wallet
    let txHash: `0x${string}`;
    try {
      txHash = await walletClient.writeContract({
        address: settlement,
        abi: settlementViewAbi,
        functionName: "execute",
        args: [intent as any, signature],
      });
    } catch (err: any) {
      return sendJson(res, 500, {
        error: "writeContract failed",
        detail: err?.message || String(err),
      });
    }

    // Wait receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse IntentExecuted event (best-effort)
    let intentExecuted: any = null;
    try {
      for (const log of receipt.logs) {
        if (getAddress(log.address) !== getAddress(settlement)) continue;
        const decoded = decodeEventLog({
          abi: [intentExecutedEvent],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "IntentExecuted") {
          const a: any = decoded.args;
          intentExecuted = {
            signer: a.signer,
            adapter: a.adapter,
            tokenIn: a.tokenIn,
            tokenOut: a.tokenOut,
            amountIn: a.amountIn.toString(),
            amountOut: a.amountOut.toString(),
            feePaid: a.feePaid.toString(),
            nonce: a.nonce.toString(),
          };
          break;
        }
      }
    } catch {
      intentExecuted = null;
    }

    // Mark nonce used after success
    if (receipt.status === "success") {
      nonceStore.markUsed(intent.signer, intent.nonce);
    }

    return sendJson(res, 200, {
      txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      intentExecuted,
    });
  } catch (e: any) {
    return sendJson(res, 400, { error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  // noop
});
