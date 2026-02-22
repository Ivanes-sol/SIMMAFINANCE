# SIMMA Deployments

Network: **Base mainnet**  
ChainId: **8453**

Primary wallet (current): `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`

---

## Swap tests (Base, chainId 8453)

### Universal Router direct swap (WETH -> USDC)
- Pair: WETH `0x4200000000000000000000000000000000000006` -> USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Amount in: `0.001 WETH` (`1000000000000000`)
- Amount out: `~2.092917 USDC` (`2092917`, USDC 6 decimals)
- Tx: `0xff886bf3da4216b6b0d0c77636da067514846f75b33a2ec545b1f1a40e2fd905`
- Universal Router (Base): `0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC`

### Intent swap proof (WETH -> USDC)
- Swap proof (WETH→USDC) tx: `0xc9b5e78847247739e5969ebe63d66556963461924da91187161724b4169cd217`
- Legacy IntentSettlement (older): `0x7bC94a08f7d9E277856EFF692EA3A67FAadB35DA`
  - Owner: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
- Legacy UniswapV3Adapter (older): `0x7A06A2456C52Ba3D2EcA230A27A74662d53BE258`

---

## Token deployment (Legacy / superseded)
> This section is kept for history. The currently-used SIMMA token address is listed under **Tokens (Current)** below.

- SIMMA token (legacy): `0x5DD41109A63ceF816F9A92392593963F752A7254`
  - Owner: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - Total supply: `1,000,000,000 SIMMA` (18 decimals)
- Team VestingWallet: `0x1A29C9728D8C34A3ceB473DeDE8A56775E301317`
  - Funded: `200,000,000 SIMMA` (20%)
- Strategic VestingWallet: `0x406Fe1bDF11D8E6fE9A9e7Dc8F93908844793105`
  - Funded: `200,000,000 SIMMA` (20%)
- Broadcast: `packages/contracts/broadcast/DeployToken.s.sol/8453/run-latest.json`

---

## Core Protocol (Current)

### IntentSettlement v1 (hook-enabled)
- IntentSettlement: `0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b`
  - Deploy tx: `0xcd214bb940f65569c9aa4a31742f3d35b0dcee6df4693675a69e1afc7840f362`
  - Owner: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - Fee: `30` bps
  - Fee recipient: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - Hook: `0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0` (NoopSettlementHook)

### Adapters
- UniswapV3Adapter (Universal Router wired): `0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0`
  - Universal Router (Base): `0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC`

### Hooks
- NoopSettlementHook: `0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0`
  - Deploy tx: `0x1c0ad11c19317fb507069d1b523ad07ab92c6320a6a6daa4b9eb8f422ee2c720`

---

## Tokens (Current)

- WETH (Base): `0x4200000000000000000000000000000000000006` (18 decimals)
- USDC (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- SIMMA (current): `0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156` (18 decimals)
  - Total supply: `1000000000000000000000000000` (1e27 = 1,000,000,000 SIMMA)
  - Ownership transferred to primary wallet: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - Full supply moved to primary wallet:
    - Old owner (previous): `0xe1E02e4dc3083007f7a94e493B363E9A0143bF10`
    - New owner/current holder: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`

---

## Uniswap V3 Infrastructure (Base)

- Uniswap V3 Factory (Base): `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`
- NonfungiblePositionManager (Base): `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`

---

## Pools (Uniswap V3) + Initial Liquidity (Base)

### SIMMA/WETH — 0.30% (fee=3000)
- Pool: `0xFb378d2B4C2680cC8E9c1d537d07ed8456C65A77`
- Factory createPool tx: `0x98fd1e2ffbe6ddf45c6514789d0a330eba87e9eee320184334f4e2f3b82ddba1`
- token0 (WETH): `0x4200000000000000000000000000000000000006`
- token1 (SIMMA): `0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156`
- Pool status (slot0 / liquidity proof):
  - tick: `138162`
  - liquidity(): `1000000000000000054`
- Seeded balances sitting in pool (sanity/proof):
  - WETH: `1000000000000000` (0.001 WETH)
  - SIMMA: `1000000000000000054000` (~1000.000000000000054 SIMMA)
- LP NFT (NonfungiblePositionManager):
  - tokenId: `4680814`
  - owner: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - ticks: `[-887220, 887220]` (full-range)
  - position liquidity: `1000000000000000054`

### SIMMA/USDC — 0.30% (fee=3000)
- Pool: `0x39dFa56056a92cf43bdfF15c845f696495eD0625`
- token0 (USDC): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- token1 (SIMMA): `0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156`
- Pool status (slot0 / liquidity proof):
  - sqrtPriceX96: `1131544825746778291021194869366836992`
  - tick: `329506`
  - unlocked: `true`
  - liquidity(): `166509091107467`
- Seeded balances sitting in pool (sanity/proof):
  - USDC: `7676` (0.007676 USDC)
  - SIMMA: `11221895849107971291571` (~11221.895849107971291571 SIMMA)
- LP NFT (NonfungiblePositionManager):
  - tokenId: `4681018`
  - owner: `0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53`
  - tickLower: `315120`
  - tickUpper: `329520`
  - position liquidity: `166509091107467`
