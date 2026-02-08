# Deployments

## Base Mainnet (chainId 8453)

### Core contracts
- **Deployer / Owner (initial):** 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53

### SIMMA token + vesting (Base mainnet)
- **SIMMA token (ERC-20):** 0x5DD41109A63ceF816F9A92392593963F752A7254
- **Total supply minted:** 1,000,000,000 SIMMA (18 decimals)

- **Team VestingWallet:** 0xf397a7adc5eac91a054f530fa1701e8405f0d04d
  - start: 1801444245 (now + 365 days)
  - duration: 94608000 (~3 years after 1y cliff)
  - funded: 200,000,000 SIMMA

- **Strategic VestingWallet:** 0x4502f0c56587cc258b2d8023d6c07a3dfeeccccc
  - start: 1769908245 (now)
  - duration: 46656000 (~18 months)
  - funded: 200,000,000 SIMMA

### Supply sanity (on-chain)
- totalSupply: 1,000,000,000 SIMMA
- deployer balance: 600,000,000 SIMMA
- team vesting balance: 200,000,000 SIMMA
- strategic vesting balance: 200,000,000 SIMMA

### Proof (Base mainnet txs)
- Deploy SIMMA: 0x5fc7a81a7b27c981d76382d17c4c6ea5a61997acea7ef1f17e477d729e62435b
- Deploy Team VestingWallet: 0x0abc07f7122f935ea31927abed730f78b5d9ed11c97f5e692f14c5443ddbe38e
- Deploy Strategic VestingWallet: 0x02350cec3e02cf4ef7e73bfbe69d55e5124c8adf954676d549923e7afbaf2d39
- Transfer SIMMA → Team Vesting (200,000,000): 0xf5478575b259f2822dd4eb5ad2ec3cf99a56c80c97463b057a983461fbf5d9d2
- Transfer SIMMA → Strategic Vesting (200,000,000): 0x063bb5bc01c89dad62e59ba6ad5c08402d43dcca1f41cbb918594ff07d2c4602

### Swap test (Base mainnet, chainId 8453)
- Pair: WETH (0x4200000000000000000000000000000000000006) -> USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- Amount in: 0.001 WETH (1e15)
- Amount out: ~2.092720 USDC (2092720, 6 decimals)
- Tx: 0xe2ba19388542bb6ac5389c132f30c6b38f854117347c31d6f5a44afebc87f817
- Universal Router: 0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC
- IntentSettlement: 0x7bC94a08f7d9E277856EFF692EA3A67FAadB35DA
  - Owner: 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53
- UniswapV3Adapter: 0x7A06A2456C52Ba3D2EcA230A27A74662d53BE258
- Swap proof (WETH→USDC) tx: 0xff886bf3da4216b6b0d0c77636da067514846f75b33a2ec545b1f1a40e2fd905

### Verification SIMMA 
- https://basescan.org/address/0xfcb4ac2cb9266e00c44b8e1b872b92a04cd28156#code
- https://basescan.org/address/0xf397a7adc5eac91a054f530fa1701e8405f0d04d#code
- https://basescan.org/address/0x4502f0c56587cc258b2d8023d6c07a3dfeeccccc#code
