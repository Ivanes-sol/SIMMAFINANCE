export const settlementAbi = [
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
          { name: "adapterData", type: "bytes" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: [{ name: "amountOut", type: "uint256" }]
  },
  {
    type: "event",
    name: "IntentExecuted",
    inputs: [
      { name: "signer", type: "address", indexed: true },
      { name: "adapter", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: true },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
      { name: "feePaid", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false }
    ],
    anonymous: false
  }
] as const;
