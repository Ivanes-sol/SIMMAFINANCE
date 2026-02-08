# Deployments

## Base Mainnet (chainId 8453)

**SIMMA (ERC-20):** 0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156  
**TeamVesting:** 0xF397A7adc5EAc91A054F530FA1701E8405f0D04d  
**StrategicVesting:** 0x4502F0c56587Cc258b2d8023d6c07A3dfeeCcCCc  

### Tx hashes
- SIMMA deploy: 0x5fc7a81a7b27c981d76382d17c4c6ea5a61997acea7ef1f17e477d729e62435b
- StrategicVesting deploy: 0x02350cec3e02cf4ef7e73bfbe69d55e5124c8adf954676d549923e7afbaf2d39
- TeamVesting deploy: 0x0abc07f7122f935ea31927abed730f78b5d9ed11c97f5e692f14c5443ddbe38e

### Supply sanity
- totalSupply: 1,000,000,000 SIMMA (1e27 wei)
- Team vesting balance: 200,000,000 SIMMA (2e26 wei)
- Strategic vesting balance: 200,000,000 SIMMA (2e26 wei)

### Vesting schedule sanity
- Team start: 1801444245, duration: 94608000 (≈3 years after 1y cliff)
- Strategic start: 1769908245, duration: 46656000 (≈18 months)

### SIMMA token + vesting (Base mainnet, chainId 8453)
- SIMMA: 0x5DD41109A63ceF816F9A92392593963F752A7254
  - Deploy tx: 0x054af179f20089ec5206d329ebea0bd33dbb4611c1471f1bdd2fe1408e944b2d
- Team VestingWallet: 0x1A29C9728D8C34A3ceB473DeDE8A56775E301317
  - Deploy tx: 0xaee84dcadf0d2f77989749cd2563370f385ccab2489f1d69e866f4e6f6fd0637
- Strategic VestingWallet: 0x406Fe1bDF11D8E6fE9A9e7Dc8F93908844793105
  - Deploy tx: 0xb0e5b484dbc2f3df2e6667253150275db0ddfdf103428ca819da8868e7452fea
- Funding txs:
  - 0xc5d67a9cb980fc927279db86c2ad0819239ac2f9b0738024cdf2cec7e94d8820
  - 0xf62c4233489f8843f7b806aad098ba6263cd14e65441ea5f03f5d4814185b536
- Block: 41857683

### SIMMA token + vesting deploy (Base mainnet, chainId 8453)
- Deployer/Owner (initial): 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53
- SIMMA token: 0x5DD41109A63ceF816F9A92392593963F752A7254
- Total supply minted: 1,000,000,000 SIMMA (1e27, 18 decimals)
- Vesting wallets:
  - TeamVesting: 0x1A29C9728D8C34A3ceB473DeDE8A56775E301317
  - StrategicVesting: 0x406Fe1bDF11D8E6fE9A9e7Dc8F93908844793105
- Allocations funded:
  - Team: 20% (200,000,000 SIMMA)
  - Strategic/MM: 20% (200,000,000 SIMMA)
- Deploy txs (block 41857683):
  - Token deploy tx: 0x054af179f20089ec5206d329ebea0bd33dbb4611c1471f1bdd2fe1408e944b2d
  - TeamVesting deploy tx: 0xaee84dcadf0d2f77989749cd2563370f385ccab2489f1d69e866f4e6f6fd0637
  - StrategicVesting deploy tx: 0xb0e5b484dbc2f3df2e6667253150275db0ddfdf103428ca819da8868e7452fea
  - Team funding transfer tx: 0xc5d67a9cb980fc927279db86c2ad0819239ac2f9b0738024cdf2cec7e94d8820
  - Strategic funding transfer tx: 0xf62c4233489f8843f7b806aad098ba6263cd14e65441ea5f03f5d4814185b536

### SIMMA token deploy (Base mainnet, chainId 8453)
- SIMMA: 0x5DD41109A63ceF816F9A92392593963F752A7254
- Total supply: 1,000,000,000 SIMMA (18 decimals)
- Deployer / Owner: 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53

- Team VestingWallet: 0xf397a7adc5eac91a054f530fa1701e8405f0d04d
  - start: 1801444245 (now + 365 days)
  - duration: 94608000 (3 years)
  - funded: 200,000,000 SIMMA
- Strategic VestingWallet: 0x4502f0c56587cc258b2d8023d6c07a3dfeeccccc
  - start: 1769908245 (now)
  - duration: 46656000 (18 months)
  - funded: 200,000,000 SIMMA

Proof (Base mainnet txs):
- Deploy SIMMA: 0x5fc7a81a7b27c981d76382d17c4c6ea5a61997acea7ef1f17e477d729e62435b
- Deploy Team VestingWallet: 0x0abc07f7122f935ea31927abed730f78b5d9ed11c97f5e692f14c5443ddbe38e
- Deploy Strategic VestingWallet: 0x02350cec3e02cf4ef7e73bfbe69d55e5124c8adf954676d549923e7afbaf2d39
- Transfer SIMMA → Team Vesting: 0xf5478575b259f2822dd4eb5ad2ec3cf99a56c80c97463b057a983461fbf5d9d2
- Transfer SIMMA → Strategic Vesting: 0x063bb5bc01c89dad62e59ba6ad5c08402d43dcca1f41cbb918594ff07d2c4602

