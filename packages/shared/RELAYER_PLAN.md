# SIMMA Relayer Plan (v0)

Goal: accept a signed SwapIntent from a user, submit it on-chain via Settlement.execute, and return tx hash + decoded result.

## Inputs (from client)
- chainId (must be 8453)
- intent (SwapIntent struct)
- signature (bytes)
- optional: maxFeePerGas / maxPriorityFeePerGas (or relayer uses its own policy)

## Validation (off-chain)
- verify EIP-712 signature against:
  - domain(name="SimmaIntentSettlement", version="1", chainId=8453, verifyingContract=SETTLEMENT)
  - struct hash as per INTENT_PACKET.md
- sanity checks:
  - intent.deadline in future (small grace ok)
  - intent.adapter is allowed (read settlement.adapterAllowed)
  - tokens are allowlisted (read settlement.tokenAllowed)
  - feeBps/feeRecipient read for UI display

## Execution (on-chain)
- submit: Settlement.execute(intent, signature)
- wait for receipt
- parse IntentExecuted event
- return:
  - txHash
  - amountOut
  - feePaid
  - nonce
  - tokenOut

## API (proposed)
- POST /v1/execute
  body: { chainId, intent, signature }
  resp: { txHash, status, amountOut, feePaid, nonce, tokenOut }

## Errors to surface
- DeadlineExpired
- TokenNotAllowed
- AdapterNotAllowed
- NonceUsed
- BadSignature
- Slippage
- "transferFrom failed" (missing approvals)

## Key management
- relayer hotkey = separate from owner key
- relayer only pays gas; cannot steal funds (recipient locked to signer)
