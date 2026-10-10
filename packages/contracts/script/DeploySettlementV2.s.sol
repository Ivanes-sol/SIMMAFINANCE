// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";

/// @notice Deploys Settlement V2 ONLY. Configuration (tokens, adapter, fee, hook) is done afterwards
///         one transaction at a time with `cast send`, each verified with `cast call`.
/// @dev Keystore-friendly: run with --account <name> --sender 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53.
///      Without --broadcast this is a dry run (simulation only, nothing is sent).
contract DeploySettlementV2 is Script {
    address constant EXPECTED_OWNER = 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53;

    function run() external returns (IntentSettlement settlement) {
        require(block.chainid == 8453, "not Base mainnet");
        require(msg.sender == EXPECTED_OWNER, "sender is not the expected owner");

        vm.startBroadcast();
        settlement = new IntentSettlement(EXPECTED_OWNER);
        vm.stopBroadcast();

        require(settlement.owner() == EXPECTED_OWNER, "owner mismatch");
        require(settlement.feeBps() == 0, "unexpected fee");
        require(address(settlement.hook()) == address(0), "unexpected hook");

        console2.log("Settlement V2:", address(settlement));
        console2.log("owner:", settlement.owner());
        console2.log("chainId:", block.chainid);
    }
}
