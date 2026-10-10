/**
 * Base mainnet (chainId 8453) — SIMMA.FINANCE deployments
 */
export const base = {
  chainId: 8453,

  // Tokens
  SIMMA: "0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156",
  WETH:  "0x4200000000000000000000000000000000000006",
  USDC:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

  // Vesting
  TeamVesting:      "0xF397A7adc5EAc91A054F530FA1701E8405f0D04d",
  StrategicVesting: "0x4502F0c56587Cc258b2d8023d6c07a3dfeeCcCCc",

  // Protocol (existing)
  IntentSettlement: "0xeF913A73c8279987eE9a5f549593e7029a7Ac48E", // Settlement V2 (fee-flow fix), live 2026-10-09
  IntentSettlementV1: "0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b", // retired
  UniswapV3Adapter: "0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0", // live adapter (see contracts/DEPLOYMENTS.md)
  UniversalRouter:  "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC",
  Owner:            "0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53",
} as const;
