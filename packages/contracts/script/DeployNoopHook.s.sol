// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {NoopSettlementHook} from "../src/hooks/NoopSettlementHook.sol";

contract DeployNoopHook is Script {
    function run() external {
        vm.startBroadcast();
        NoopSettlementHook hook = new NoopSettlementHook();
        vm.stopBroadcast();

        console2.log("NoopSettlementHook:", address(hook));
    }
}
