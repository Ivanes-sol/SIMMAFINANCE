export type SwapIntent = {
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

export const swapIntentTypes = {
  SwapIntent: [
    { name: "signer", type: "address" },
    { name: "adapter", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "adapterData", type: "bytes" }
  ]
} as const;
