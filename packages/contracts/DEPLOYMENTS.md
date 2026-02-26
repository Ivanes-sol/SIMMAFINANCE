# SIMMA.FINANCE Deployments (Base Mainnet)

## Network
- Chain: Base Mainnet
- chainId: 8453
- RPC: Alchemy (project-specific key; do not commit)
- Timezone: America/New_York

## Addresses

### Tokens
- SIMMA (18d): `0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156`
- WETH (Base): `0x4200000000000000000000000000000000000006`
- USDC (Base, 6d): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### Core Protocol
- IntentSettlement (hook-enabled): `0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b`
  - Deploy tx: `0xcd214bb940f65569c9aa4a31742f3d35b0dcee6df4693675a69e1afc7840f362`
  - Owner: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - Fee: 30 bps
  - Fee recipient: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - Hook: `hook() -> 0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0`

- NoopSettlementHook: `0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0`
  - Deploy tx: `0x1c0ad11c19317fb507069d1b523ad07ab92c6320a6a6daa4b9eb8f422ee2c720`

- UniswapV3Adapter (wired to Universal Router): `0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0`

- Base Universal Router: `0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC`

### Uniswap V3 Infra (Base)
- NonfungiblePositionManager (NPM): `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`

---

## Uniswap V3 Pools

### 1) SIMMA / WETH (fee 3000 = 0.3%)
- Pool: `0xFb378d2B4C2680cC8E9c1d537d07ed8456C65A77`
- Factory createPool tx: `0x98fd1e2ffbe6ddf45c6514789d0a330eba87e9eee320184334f4e2f3b82ddba1`
- token0: WETH `0x4200000000000000000000000000000000000006`
- token1: SIMMA `0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156`
- LP NFT tokenId: `4680814`
- Evidence (point-in-time):
  - `pool.liquidity()` ≈ `1000000000000000054`
  - `WETH.balanceOf(pool)` ≈ `0.001 WETH` (raw `1000000000000000`)
  - `SIMMA.balanceOf(pool)` ≈ `1000 SIMMA` (raw `1000000000000000054000`)

### 2) SIMMA / USDC (fee 3000 = 0.3%)
- Pool: `0x39dFa56056a92cf43bdfF15c845f696495eD0625`
- token0: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- token1: SIMMA `0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156`

#### Full-range liquidity mint (confirmed)
- Script: `script/MintSimmaUsdcFullRange.s.sol`
- Amounts requested:
  - USDC: `10` USDC (raw `10000000`)
  - SIMMA: `10000` SIMMA (raw `10000000000000000000000`)
- Mint result (pool took):
  - USDC used: `10000000` (10 USDC)
  - SIMMA used: `6848277114528298915368` (~6848.277 SIMMA)
- Mint txs (from broadcast run-latest.json):
  - SIMMA approve NPM: `0x46f68f6b4ec489ad6593615f83ccb7da65608d17b2daf633c9a9e7ef22b8914d`
  - SIMMA approve NPM (script ordering): `0x999e98f4d6f2df78bf74ec9d5b9cdd491664ef2f5e1337fb399b3aceb26e1adf`
  - USDC approve NPM: `0xfbccabb1eaed1b70bf44f40844bae5bfcb0c2c9028ce46ee1b17bd9c6923c47b`
- LP NFT tokenId minted: `4689379`
- Post-mint sanity (on-chain reads):
  - `pool.liquidity()` = `275983641065751`
  - `USDC.balanceOf(pool)` ≈ `10.548654` USDC (raw `10548654`)
  - `SIMMA.balanceOf(pool)` ≈ `18452.027895...` SIMMA (raw `18452027895212514117082`)
  - `slot0.sqrtPriceX96` ≈ `2073338664086341871282459755579619086`
  - `slot0.tick` ≈ `341618`

---

## Swap / Intent Proofs

### A) Direct on-chain intent execution (Foundry)
- Script: `script/SwapSimmaToUsdc.s.sol`
- Execute tx: `0x3e2f22e135156da1ed973d08411840d25212a6bfcb63e26bf0b5990b93065a63`
- Approve tx: `0xe688d4c33ccd28ec43d6701751e1a74785c30dc225b9b591f4d5ac0780b2c911`
- amountIn: `1000 SIMMA` (raw `1000000000000000000000`)
- amountOut: `0.524663 USDC` (raw `524663`)
- feePaid: `0.001573 USDC` (raw `1573`)
- Event: `IntentExecuted(signer=0x7Ab2..., amountOut=524663, feePaid=1573, nonce=42516854)`

### B) Relayer v0 (Option A) proof (local signer → relayer → settlement.execute)
Relayer endpoint: `POST /v1/execute` with `{chainId, intent, signature}`.
Relayer signs the tx with relayer key, but **intent signature is from user key**.

- Relayer-executed tx #1:
  - txHash: `0x2bd877fe5e8bfec211c9aa6095fa87a72ccab137611c6c177982521862fbd677`
  - amountIn: `10 SIMMA` (raw `10000000000000000000`)
  - amountOut: `15124` (0.015124 USDC)
  - feePaid: `45` (0.000045 USDC)
  - nonce: `291397214`

- Relayer-executed tx #2:
  - txHash: `0x58eef92f4303f4c27fd8c880b344a3b13f57e22061017cc21481e3e250f172d4`
  - amountIn: `10 SIMMA` (raw `10000000000000000000`)
  - amountOut: `15081` (0.015081 USDC)
  - feePaid: `45` (0.000045 USDC)
  - nonce: `571331780`

---

## Operational Notes

### RPC hygiene
- `cast receipt` uses `$BASE_RPC_URL`. Ensure it matches relayer `.env` (RELAYER_BASE_RPC_URL).
- If you see `403 App is inactive` from Alchemy, your env is pointing at an old/deactivated key.

### Allowances
For relayer flow, user must approve Settlement to spend tokenIn:
- `SIMMA.approve(SETTLEMENT, MaxUint256)` from signer.

### Common sanity commands
- Pool liquidity:
  - `cast call --rpc-url "$BASE_RPC_URL" $POOL "liquidity()(uint128)"`
- Slot0:
  - `cast call --rpc-url "$BASE_RPC_URL" $POOL "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)"`
