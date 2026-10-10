import "dotenv/config";
import { createPublicClient, http, getAddress, keccak256, toHex } from "viem";
import { base } from "viem/chains";

const settlement = getAddress(process.env.SETTLEMENT || "");
if (!settlement) throw new Error("SETTLEMENT env missing");

const rpc = process.env.RELAYER_BASE_RPC_URL || "";
if (!rpc) throw new Error("RELAYER_BASE_RPC_URL env missing");

const client = createPublicClient({
  chain: base,
  transport: http(rpc),
});

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

function h(s: string) {
  return keccak256(toHex(s));
}

async function main() {
  const typehash = (await client.readContract({
    address: settlement,
    abi: settlementViewAbi,
    functionName: "SWAP_INTENT_TYPEHASH",
  })) as `0x${string}`;

  const dom = (await client.readContract({
    address: settlement,
    abi: settlementViewAbi,
    functionName: "eip712Domain",
  })) as any;

  const fields = dom[0] as string;
  const name = dom[1] as string;
  const version = dom[2] as string;
  const chainId = dom[3] as bigint;
  const verifyingContract = dom[4] as string;
  const salt = dom[5] as string;

  console.log("Settlement:", settlement);
  console.log("SWAP_INTENT_TYPEHASH:", typehash);
  console.log("Domain fields:", fields);
  console.log("Domain name:", name);
  console.log("Domain version:", version);
  console.log("Domain chainId:", chainId.toString());
  console.log("Domain verifyingContract:", verifyingContract);
  console.log("Domain salt:", salt);

  const names = ["SwapIntent", "Intent", "Swap", "Order", "SwapOrder"];
  const adapterTypes = ["bytes", "bytes32"];

  const baseFields = [
    "address signer",
    "address adapter",
    "address tokenIn",
    "address tokenOut",
    "uint256 amountIn",
    "uint256 minAmountOut",
    "uint256 deadline",
    "uint256 nonce",
  ];

  let found = false;

  for (const n of names) {
    for (const adType of adapterTypes) {
      const typeStr = `${n}(${baseFields.join(",")},${adType} adapterData)`;
      const cand = h(typeStr);
      if (cand.toLowerCase() === typehash.toLowerCase()) {
        console.log("\n✅ MATCH");
        console.log("Type string:", typeStr);
        console.log("Typehash:", cand);
        found = true;
      }
    }
  }

  // also try alternate field name for adapterData (hash)
  for (const n of names) {
    const typeStr = `${n}(${baseFields.join(",")},bytes32 adapterDataHash)`;
    const cand = h(typeStr);
    if (cand.toLowerCase() === typehash.toLowerCase()) {
      console.log("\n✅ MATCH");
      console.log("Type string:", typeStr);
      console.log("Typehash:", cand);
      found = true;
    }
  }

  if (!found) {
    console.log("\n❌ No match found in candidate set.");
    console.log("Next step: expand candidate list / inspect contract source for struct/type.");
  }
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
