# SIMMA Intent Packet (v1)

Chain: Base mainnet (8453)

## Contracts
- Settlement: 0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b
- Adapter (UniswapV3Adapter): 0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0
- Hook: 0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0 (noop)

## EIP-712 Domain
- name: "SimmaIntentSettlement"
- version: "1"
- chainId: 8453
- verifyingContract: Settlement address

## Signed Payload: SwapIntent
Fields (must match on-chain typehash):
- signer (address)
- adapter (address)
- tokenIn (address)
- tokenOut (address)
- amountIn (uint256)
- minAmountOut (uint256)
- deadline (uint256, unix seconds)
- nonce (uint256)
- adapterData (bytes)

AdapterData (UniswapV3Adapter):
- fee (uint24)  e.g. 500
- deadline (uint256) must be <= intent.deadline

## Execution
Relayer submits:
- Settlement.execute(intent, signature)

Rules:
- Recipient is always signer (funds go to signer)
- Settlement pulls tokenIn from signer
- Settlement approves adapter
- Adapter swaps using Base Universal Router
- Fee charged on output token via transferFrom(signer -> feeRecipient)

## Required Approvals
User must approve:
- tokenIn allowance to Settlement
- tokenOut allowance to Settlement (only needed if feeBps > 0)
