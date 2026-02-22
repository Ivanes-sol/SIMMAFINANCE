// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";

contract DeploySettlementOnly is Script {
    function run() external {
        // Keystore-friendly: uses --account + --sender
        address owner = msg.sender;

        vm.startBroadcast();
        IntentSettlement settlement = new IntentSettlement(owner);
        vm.stopBroadcast();

        console2.log("IntentSettlement:", address(settlement));
        console2.log("owner:", owner);
    }
}
