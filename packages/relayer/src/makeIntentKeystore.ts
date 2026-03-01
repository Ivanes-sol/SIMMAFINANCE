import "dotenv/config";

import fs from "node:fs";
import readline from "node:readline";
import { z } from "zod";

import {
  createPublicClient,
  http,
  getAddress,
  keccak256,
  encodeAbiParameters,
  hexToBytes,
  bytesToHex,
  concatHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import { Wallet } from "@ethereumjs/wallet";

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
] as const;

// abi.encode(uint24 fee, uint256 deadline) => 2 * 32-byte words
function abiEncodeFeeDeadline(fee: bigint, deadline: bigint): `0x${string}` {
  const feeHex = fee.toString(16).padStart(64, "0");
  const dlHex = deadline.toString(16).padStart(64, "0");
  return (`0x${feeHex}${dlHex}`) as `0x${string}`;
}

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

function buildStructHash(
  swapIntentTypeHash: `0x${string}`,
  intent: SwapIntent
): `0x${string}` {
  // MUST match Solidity:
  // keccak256(abi.encode(
  //   typeHash,
  //   signer, adapter, tokenIn, tokenOut,
  //   amountIn, minAmountOut, deadline, nonce,
  //   keccak256(adapterData)
  // ))
  return keccak256(
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
        swapIntentTypeHash,
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
}

function buildDigest(domainSeparator: `0x${string}`, structHash: `0x${string}`): `0x${string}` {
  // keccak256("\x19\x01" || domainSeparator || structHash)
  return keccak256(concatHex(["0x1901", domainSeparator, structHash]));
}

async function promptPassword(keystorePath: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  const password = await new Promise<string>((resolve) => {
    rl.question(`Enter keystore password for ${keystorePath}: `, (ans) => resolve(ans.trim()));
  });
  rl.close();
  if (!password) throw new Error("Empty password entered.");
  return password;
}

const Env = z.object({
  RELAYER_BASE_RPC_URL: z.string().url(),
  SETTLEMENT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  AMOUNT_IN_WEI: z.string().optional(),
  MIN_OUT: z.string().optional(),
});

const env = Env.parse({
  RELAYER_BASE_RPC_URL: process.env.RELAYER_BASE_RPC_URL,
  SETTLEMENT: process.env.SETTLEMENT,
  AMOUNT_IN_WEI: process.env.AMOUNT_IN_WEI,
  MIN_OUT: process.env.MIN_OUT,
});

const EXPECTED_SIGNER = "0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53" as const;
const KEYSTORE_PATH = "/root/.foundry/keystores/deployer";

if (!fs.existsSync(KEYSTORE_PATH)) {
  console.error(`Keystore not found: ${KEYSTORE_PATH}`);
  process.exit(1);
}

const publicClient = createPublicClient({
  chain: base,
  transport: http(env.RELAYER_BASE_RPC_URL),
});

const settlement = getAddress(env.SETTLEMENT) as `0x${string}`;

// Project addresses
const ADAPTER = "0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0" as const;
const SIMMA = "0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156" as const;
const USDC  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const fee = 3000n;
const now = BigInt(Math.floor(Date.now() / 1000));
const deadline = now + 2n * 60n * 60n;
const nonce = BigInt(Math.floor(Math.random() * 1e9)); // nicer nonce than Date.now()

const amountIn = env.AMOUNT_IN_WEI ? BigInt(env.AMOUNT_IN_WEI) : 10n * 10n ** 18n;
const minAmountOut = env.MIN_OUT ? BigInt(env.MIN_OUT) : 1n;

// --- Decrypt Foundry keystore ---
const password = await promptPassword(KEYSTORE_PATH);
const keystoreJson = fs.readFileSync(KEYSTORE_PATH, "utf8");

const wallet = await Wallet.fromV3(keystoreJson, password, true);
const pkRaw: any = wallet.getPrivateKey();
const pkBytes = pkRaw instanceof Uint8Array ? pkRaw : new Uint8Array(pkRaw);
if (pkBytes.length !== 32) throw new Error(`Private key is not 32 bytes (got ${pkBytes.length})`);

const pkHex = bytesToHex(pkBytes) as `0x${string}`;
const signerAccount = privateKeyToAccount(pkHex);
const signer = signerAccount.address as `0x${string}`;

console.error("Keystore decrypted address:", signer);
if (signer.toLowerCase() !== EXPECTED_SIGNER.toLowerCase()) {
  throw new Error(`Wrong key decrypted. Expected ${EXPECTED_SIGNER}, got ${signer}`);
}

// Build intent
const intent: SwapIntent = {
  signer,
  adapter: ADAPTER,
  tokenIn: SIMMA,
  tokenOut: USDC,
  amountIn,
  minAmountOut,
  deadline,
  nonce,
  adapterData: abiEncodeFeeDeadline(fee, deadline),
};

// Read domain + typehash from settlement
const [fields, name, version, chainIdOnContract, verifyingContract, salt] =
  (await publicClient.readContract({
    address: settlement,
    abi: settlementViewAbi,
    functionName: "eip712Domain",
  })) as any;

const swapIntentTypeHash = (await publicClient.readContract({
  address: settlement,
  abi: settlementViewAbi,
  functionName: "SWAP_INTENT_TYPEHASH",
})) as `0x${string}`;

const domainSep = domainSeparatorFromEip712Domain(
  fields,
  name,
  version,
  BigInt(chainIdOnContract),
  getAddress(verifyingContract),
  salt
);

const structHash = buildStructHash(swapIntentTypeHash, intent);
const digest = buildDigest(domainSep, structHash);

// ✅ SIGN EXACT DIGEST (no prefix). viem does it correctly.
let signature = await signerAccount.sign({ hash: digest });

// Normalize v to 27/28 if viem returns 0/1 (some libs do)
const sigHex = signature.slice(2);
const v = parseInt(sigHex.slice(-2), 16);
if (v === 0 || v === 1) {
  const vFixed = (v + 27).toString(16).padStart(2, "0");
  signature = (`0x${sigHex.slice(0, -2)}${vFixed}`) as `0x${string}`;
}

const printable = {
  chainId: 8453,
  intent: {
    ...intent,
    amountIn: intent.amountIn.toString(),
    minAmountOut: intent.minAmountOut.toString(),
    deadline: intent.deadline.toString(),
    nonce: intent.nonce.toString(),
  },
  signature,
};

console.log(JSON.stringify(printable, null, 2));
