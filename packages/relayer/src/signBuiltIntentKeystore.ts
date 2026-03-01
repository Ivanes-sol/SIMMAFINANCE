// src/signBuiltIntentKeystore.ts
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { z } from "zod";

import {
  createPublicClient,
  http,
  getAddress,
  isAddress,
  keccak256,
  encodeAbiParameters,
  hexToBytes,
  parseAbi,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { base } from "viem/chains";

import { Wallet } from "@ethereumjs/wallet";

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

type BuiltFile = {
  chainId: number;
  intent: {
    signer: string;
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    deadline: string;
    nonce: string;
    adapterData: string;
  };
};

// ---------------------------
// ABI (minimal)
// ---------------------------
const settlementViewAbi = parseAbi([
  "function eip712Domain() view returns (bytes1,string,string,uint256,address,bytes32,uint256[])",
  "function SWAP_INTENT_TYPEHASH() view returns (bytes32)",
]);

// ---------------------------
// EIP-712 helpers (match Solidity)
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

// ---------------------------
// Password prompt (NO ECHO) using stty on /dev/tty
// ---------------------------
async function promptPasswordFromTTY(question: string): Promise<string> {
  const ttyPath = "/dev/tty";
  const ttyIn = fs.createReadStream(ttyPath);
  const ttyOut = fs.createWriteStream(ttyPath);

  const stty = (args: string[]) => {
    const r = spawnSync("sh", ["-lc", `stty ${args.join(" ")} < ${ttyPath}`], { stdio: "ignore" });
    if (r.status !== 0) throw new Error(`stty failed: ${args.join(" ")}`);
  };

  try {
    ttyOut.write(question);
    stty(["-echo"]);

    const rl = readline.createInterface({ input: ttyIn, crlfDelay: Infinity });
    const pw = await new Promise<string>((resolve) => rl.once("line", (line) => resolve(line ?? "")));
    rl.close();

    stty(["echo"]);
    ttyOut.write("\n");

    const trimmed = pw.trim();
    if (!trimmed) throw new Error("Empty password entered.");
    return trimmed;
  } finally {
    try {
      spawnSync("sh", ["-lc", `stty echo < /dev/tty`], { stdio: "ignore" });
    } catch {}
    try { ttyIn.close(); } catch {}
    try { ttyOut.close(); } catch {}
  }
}

// ---------------------------
// Normalize viem signature -> 65-byte hex string
// ---------------------------
function normalizeSignatureTo65(sigAny: any): `0x${string}` {
  // If viem returns a string already:
  if (typeof sigAny === "string") {
    if (!sigAny.startsWith("0x")) throw new Error("Signature string missing 0x");
    if (sigAny.length !== 132) throw new Error(`Bad signature length: ${sigAny.length} (expected 132)`);
    return sigAny as `0x${string}`;
  }

  // If viem returns { r, s, v?, yParity? }:
  if (sigAny && typeof sigAny === "object" && sigAny.r && sigAny.s) {
    const r = String(sigAny.r).replace(/^0x/, "");
    const s = String(sigAny.s).replace(/^0x/, "");
    if (r.length !== 64 || s.length !== 64) throw new Error("Bad r/s length");

    const vNum =
      sigAny.v != null
        ? Number(sigAny.v)
        : (Number(sigAny.yParity) === 1 ? 28 : 27);

    if (vNum !== 27 && vNum !== 28) throw new Error(`Bad v: ${vNum}`);

    const vHex = vNum.toString(16).padStart(2, "0");
    const sig = (`0x${r}${s}${vHex}`) as `0x${string}`;
    if (sig.length !== 132) throw new Error(`Bad signature length after normalize: ${sig.length}`);
    return sig;
  }

  throw new Error(`Unexpected sign() return: ${JSON.stringify(sigAny)}`);
}

// ---------------------------
// Env
// ---------------------------
const Env = z.object({
  RELAYER_BASE_RPC_URL: z.string().url(),
  SETTLEMENT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  KEYSTORE_PATH: z.string().optional(),
});

const env = Env.parse({
  RELAYER_BASE_RPC_URL: process.env.RELAYER_BASE_RPC_URL,
  SETTLEMENT: process.env.SETTLEMENT,
  KEYSTORE_PATH: process.env.KEYSTORE_PATH,
});

// ---------------------------
// Main
// ---------------------------
const builtPath = process.argv[2];
if (!builtPath) {
  console.error("Usage: node --import tsx src/signBuiltIntentKeystore.ts /tmp/built.json");
  process.exit(1);
}

const built = JSON.parse(fs.readFileSync(builtPath, "utf8")) as BuiltFile;
if (!built?.intent) throw new Error("built.json missing .intent");
if (built.chainId !== 8453) throw new Error(`Unsupported chainId: ${built.chainId}`);

const intent: SwapIntent = {
  signer: getAddress(built.intent.signer),
  adapter: getAddress(built.intent.adapter),
  tokenIn: getAddress(built.intent.tokenIn),
  tokenOut: getAddress(built.intent.tokenOut),
  amountIn: BigInt(built.intent.amountIn),
  minAmountOut: BigInt(built.intent.minAmountOut),
  deadline: BigInt(built.intent.deadline),
  nonce: BigInt(built.intent.nonce),
  adapterData: built.intent.adapterData as `0x${string}`,
};

if (!isAddress(intent.signer)) throw new Error("intent.signer invalid");

const defaultKs = path.join(process.env.HOME || "/root", ".foundry", "keystores", "deployer");
const keystorePath = env.KEYSTORE_PATH || defaultKs;
if (!fs.existsSync(keystorePath)) throw new Error(`Keystore not found: ${keystorePath}`);

const password = await promptPasswordFromTTY(`Enter keystore password for ${keystorePath}: `);

// Decrypt keystore
const keystoreJson = fs.readFileSync(keystorePath, "utf8");
const wallet = await Wallet.fromV3(keystoreJson, password, true);
const pkBytes = new Uint8Array(wallet.getPrivateKey());
if (pkBytes.length !== 32) throw new Error(`Bad private key length: ${pkBytes.length}`);

// Convert pk -> 0x... hex
const pkHex = ("0x" + Buffer.from(pkBytes).toString("hex")) as `0x${string}`;
const acct = privateKeyToAccount(pkHex);
const decryptedAddr = getAddress(acct.address);

// MUST match intent.signer
if (decryptedAddr !== getAddress(intent.signer)) {
  throw new Error(`Keystore decrypted address mismatch: decrypted=${decryptedAddr} expected=${getAddress(intent.signer)}`);
}

// Read domain + typehash from settlement
const publicClient = createPublicClient({
  chain: base,
  transport: http(env.RELAYER_BASE_RPC_URL),
});

const settlement = getAddress(env.SETTLEMENT) as `0x${string}`;

const dom = (await publicClient.readContract({
  address: settlement,
  abi: settlementViewAbi,
  functionName: "eip712Domain",
})) as any;

const fields: string = dom[0];
const name: string = dom[1];
const version: string = dom[2];
const chainIdOnContract = BigInt(dom[3]);
const verifyingContract = getAddress(dom[4]) as `0x${string}`;
const salt = dom[5] as `0x${string}`;

const typeHash = (await publicClient.readContract({
  address: settlement,
  abi: settlementViewAbi,
  functionName: "SWAP_INTENT_TYPEHASH",
})) as `0x${string}`;

const ds = domainSeparatorFromEip712Domain(
  fields,
  name,
  version,
  chainIdOnContract,
  verifyingContract,
  salt
);

const digest = buildSwapIntentDigest(ds, typeHash, intent);

// Sign digest (NO prefix)
const sigAny = await sign({ hash: digest, privateKey: pkHex });
const signature = normalizeSignatureTo65(sigAny);

// Output JSON (all numeric fields as strings)
const out = {
  chainId: 8453,
  intent: {
    signer: intent.signer,
    adapter: intent.adapter,
    tokenIn: intent.tokenIn,
    tokenOut: intent.tokenOut,
    amountIn: intent.amountIn.toString(),
    minAmountOut: intent.minAmountOut.toString(),
    deadline: intent.deadline.toString(),
    nonce: intent.nonce.toString(),
    adapterData: intent.adapterData,
  },
  signature, // STRING "0x..." length 132
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
