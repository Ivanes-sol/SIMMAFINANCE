// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract ApproveSettlement is Script {
    // Base mainnet addresses (from DEPLOYMENTS)
    address constant SETTLEMENT = 0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b;

    address constant SIMMA = 0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156;
    address constant USDC  = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH  = 0x4200000000000000000000000000000000000006;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK"); // keep using your existing pattern
        address owner = vm.addr(pk);

        console2.log("ApproveSettlement");
        console2.log("Owner:", owner);
        console2.log("Settlement:", SETTLEMENT);

        vm.startBroadcast(pk);

        _approveIfNeeded(IERC20(SIMMA), owner, "SIMMA");
        _approveIfNeeded(IERC20(USDC), owner, "USDC");
        _approveIfNeeded(IERC20(WETH), owner, "WETH");

        vm.stopBroadcast();
    }

    function _approveIfNeeded(IERC20 token, address owner, string memory label) internal {
        uint256 cur = token.allowance(owner, SETTLEMENT);
        console2.log(label, "current allowance:", cur);

        if (cur == type(uint256).max) {
            console2.log(label, "already MaxUint256, skipping");
            return;
        }

        bool ok = token.approve(SETTLEMENT, type(uint256).max);
        require(ok, "approve failed");
        console2.log(label, "approved MaxUint256");
    }
}
