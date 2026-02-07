// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

contract DeployAdapterOnly is Script {
    function run() external {
        address deployer = msg.sender;
        address owner = vm.addr(pk);
        address router = vm.envAddress("UNISWAP_V3_ROUTER");

        vm.startBroadcast();
        UniswapV3Adapter adapter = new UniswapV3Adapter(owner, router);
        vm.stopBroadcast();

        console2.log("New UniswapV3Adapter:", address(adapter));
    }
}
