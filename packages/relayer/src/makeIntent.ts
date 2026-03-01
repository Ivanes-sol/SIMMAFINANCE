import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { SwapIntent, swapIntentTypes } from "./intent.js";

// === config from env ===
const CHAIN_ID = Number(process.env.CHAIN_ID ?? "8453");
const SETTLEMENT = process.env.SETTLEMENT as `0x${string}`;
const DOMAIN_NAME = (process.env.DOMAIN_NAME ?? "SimmaIntentSettlement") as string;
const DOMAIN_VERSION = (process.env.DOMAIN_VERSION ?? "1") as string;

// === IMPORTANT ===
// This is the USER key that SIGNS intents (not the relayer key).
// For testing, set USER_PK in your shell (not in .env) so you don't accidentally commit it.
const USER_PK = process.env.USER_PK as `0x${string}`;
if (!USER_PK) {
  throw new Error("Missing USER_PK in env. Example: export USER_PK=0x... then run node src/makeIntent.ts");
}
const user = privateKeyToAccount(USER_PK);

// === hardcoded project addresses (Base mainnet) ===
const SIMMA = "0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156" as const;
const USDC  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ADAPTER= "0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0" as const;

// === parameters ===
const amountIn = 10n * 10n ** 18n;     // 10 SIMMA
const minAmountOut = 1n;               // 0.000001 USDC (loose for testing)
const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 60 * 60); // +20 min
const nonce = BigInt(Math.floor(Math.random() * 1e9));            // random for testing
const fee = 3000n;

// adapterData = abi.encode(uint24 fee, uint256 deadline)
// in solidity this is 32-byte words: fee then deadline.
// easiest: pack like solidity abi.encode (not packed) -> 2 x 32 bytes
function abiEncodeFeeDeadline(fee: bigint, deadline: bigint): `0x${string}` {
  const feeHex = fee.toString(16).padStart(64, "0");
  const dlHex  = deadline.toString(16).padStart(64, "0");
  return (`0x${feeHex}${dlHex}`) as `0x${string}`;
}

const intent: SwapIntent = {
  signer: user.address,
  adapter: ADAPTER,
  tokenIn: SIMMA,
  tokenOut: USDC,
  amountIn,
  minAmountOut,
  deadline,
  nonce,
  adapterData: abiEncodeFeeDeadline(fee, deadline)
};

const domain = {
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  chainId: CHAIN_ID,
  verifyingContract: SETTLEMENT
} as const;

const signature = await user.signTypedData({
  domain,
  types: swapIntentTypes,
  primaryType: "SwapIntent",
  message: intent
});

const printableIntent = {
  ...intent,
  amountIn: intent.amountIn.toString(),
  minAmountOut: intent.minAmountOut.toString(),
  deadline: intent.deadline.toString(),
  nonce: intent.nonce.toString()
};

if (!intent.signer || !intent.adapter || !intent.tokenIn || !intent.tokenOut) {
  throw new Error("Intent has undefined address field(s)");
}
console.log(JSON.stringify({ chainId: CHAIN_ID, intent: printableIntent, signature }, null, 2));
