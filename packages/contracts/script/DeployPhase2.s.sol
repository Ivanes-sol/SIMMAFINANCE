// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

contract DeployPhase2 is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY"); // expects 0x... in .env (works with envUint)
        address owner = vm.addr(pk);

        address router = vm.envAddress("UNISWAP_V3_ROUTER");

        vm.startBroadcast(pk);

        UniswapV3Adapter adapter = new UniswapV3Adapter(owner, router);
        IntentSettlement settlement = new IntentSettlement(owner);

        vm.stopBroadcast();

        console2.log("UniswapV3Adapter:", address(adapter));
        console2.log("IntentSettlement:", address(settlement));
    }
}
