import "dotenv/config";

import { z } from "zod";
import {
  createPublicClient,
  http,
  getAddress,
  keccak256,
  encodeAbiParameters,
  hexToBytes,
  bytesToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// ✅ Raw secp256k1 signing (no hashes config needed)
import { secp256k1 } from "ethereum-cryptography/secp256k1";

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

function utf8ToHex(s: string): `0x${string}` {
  const bytes = new TextEncoder().encode(s);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

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
      { type: "bytes1" }, // fields
      { type: "string" }, // name
      { type: "string" }, // version
      { type: "uint256" }, // chainId
      { type: "address" }, // verifyingContract
      { type: "bytes32" }, // salt
      { type: "uint256[]" }, // extensions
    ],
  },
] as const;

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

// abi.encode(uint24 fee, uint256 deadline) => 2 x 32-byte words
function abiEncodeFeeDeadline(fee: bigint, deadline: bigint): `0x${string}` {
  const feeHex = fee.toString(16).padStart(64, "0");
  const dlHex = deadline.toString(16).padStart(64, "0");
  return (`0x${feeHex}${dlHex}`) as `0x${string}`;
}

const Env = z.object({
  RELAYER_BASE_RPC_URL: z.string().url(),
  SETTLEMENT: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  USER_PK: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const env = Env.parse({
  RELAYER_BASE_RPC_URL: process.env.RELAYER_BASE_RPC_URL,
  SETTLEMENT: process.env.SETTLEMENT,
  USER_PK: process.env.USER_PK,
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(env.RELAYER_BASE_RPC_URL),
});

const settlement = getAddress(env.SETTLEMENT) as `0x${string}`;
const user = privateKeyToAccount(env.USER_PK as `0x${string}`);

// Hardcoded project addresses
const ADAPTER = "0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0" as const;
const SIMMA = "0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const now = BigInt(Math.floor(Date.now() / 1000));
const deadline = now + 2n * 60n * 60n;
const nonce = BigInt(Date.now()); // monotonic nonce (ms since epoch)
const fee = 3000n;

const amountIn = 10n * 10n ** 18n;
const minAmountOut = 1n;

const intent: SwapIntent = {
  signer: user.address,
  adapter: ADAPTER,
  tokenIn: SIMMA,
  tokenOut: USDC,
  amountIn,
  minAmountOut,
  deadline,
  nonce,
  adapterData: abiEncodeFeeDeadline(fee, deadline),
};

// Read domain + typehash from contract
const [fields, name, version, chainIdOnContract, verifyingContract, salt] =
  (await publicClient.readContract({
    address: settlement,
    abi: settlementViewAbi,
    functionName: "eip712Domain",
  })) as any;

const typeHash = (await publicClient.readContract({
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

const digest = buildSwapIntentDigest(domainSep, typeHash, intent);

// ✅ RAW ECDSA sign digest (no prefix). New API (no legacy options)
const digestBytes = hexToBytes(digest);
const pkBytes = hexToBytes(env.USER_PK as `0x${string}`);

// returns Signature object (has .recovery)
const sigObj = secp256k1.sign(digestBytes, pkBytes);

const sig64 = sigObj.toCompactRawBytes(); // Uint8Array(64) r||s
const recid = sigObj.recovery;            // 0 or 1

const vByte = recid === 0 ? 27 : 28;

const sig65 = new Uint8Array(65);
sig65.set(sig64, 0);
sig65[64] = vByte;

const signature = bytesToHex(sig65) as `0x${string}`;

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
