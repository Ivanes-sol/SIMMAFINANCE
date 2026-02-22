// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

contract DeployAdapterOnly is Script {
    function run() external {
        // Keystore-friendly: Foundry will use --sender / --account to sign.
        address owner = msg.sender;

        vm.startBroadcast();
        address router = vm.envAddress("UNIVERSAL_ROUTER");
        UniswapV3Adapter adapter = new UniswapV3Adapter(owner, router);


        vm.stopBroadcast();

        console2.log("UniswapV3Adapter:", address(adapter));
        console2.log("owner:", owner);
    }
}

