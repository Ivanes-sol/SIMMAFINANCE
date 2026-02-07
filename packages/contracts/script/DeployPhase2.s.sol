// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

contract DeployPhase2 is Script {
    function run() external {
        address deployer = msg.sender;
        address owner = deployer;

        address router = vm.envAddress("UNISWAP_V3_ROUTER");

        vm.startBroadcast();

        UniswapV3Adapter adapter = new UniswapV3Adapter(owner, router);
        IntentSettlement settlement = new IntentSettlement(owner);

        vm.stopBroadcast();

        console2.log("UniswapV3Adapter:", address(adapter));
        console2.log("IntentSettlement:", address(settlement));
    }
}
