// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {SIMMA} from "../src/SIMMA.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

contract DeployToken is Script {
    function run() external {
        // Keystore-friendly: use the script sender as deployer
        // IMPORTANT: run forge with --sender set to the same address as your --account keystore
        address deployer = msg.sender;

        // ---- CONFIG (EDIT THESE) ----
        address treasury = deployer;             // TODO: replace with multisig later
        address teamBeneficiary = deployer;      // TODO: replace
        address strategicBeneficiary = deployer; // TODO: replace

        uint256 totalSupply = 1_000_000_000 ether; // 1B SIMMA (18 decimals)

        // allocations (example)
        uint256 teamPct = 20;       // 20%
        uint256 strategicPct = 20;  // 20%

        // vesting schedule
        uint64 nowTs = uint64(block.timestamp);

        // Team: 4 years vest, 1-year cliff effect by starting after 1 year
        uint64 teamStart = nowTs + 365 days;
        uint64 teamDuration = 3 * 365 days; // after cliff, linear over remaining 3 years

        // Strategic/MM: start now, vest over 18 months
        uint64 stratStart = nowTs;
        uint64 stratDuration = uint64(18 * 30 days);

        // Broadcast using keystore signer (selected by --account) + sender (via --sender)
        vm.startBroadcast();

        // 1) Deploy token
        SIMMA token = new SIMMA(deployer, treasury, totalSupply);

        // 2) Deploy vesting wallets
        VestingWallet teamVesting = new VestingWallet(teamBeneficiary, teamStart, teamDuration);
        VestingWallet strategicVesting = new VestingWallet(strategicBeneficiary, stratStart, stratDuration);

        // 3) Fund vesting wallets from treasury
        uint256 teamAmt = (totalSupply * teamPct) / 100;
        uint256 stratAmt = (totalSupply * strategicPct) / 100;

        // Treasury currently holds total supply (minted in SIMMA constructor)
        // If treasury != deployer, you'll transfer from that treasury signer instead.
        require(token.transfer(address(teamVesting), teamAmt), "team transfer failed");
        require(token.transfer(address(strategicVesting), stratAmt), "strategic transfer failed");

        vm.stopBroadcast();

        // Print addresses
        console2.log("SIMMA:", address(token));
        console2.log("TeamVesting:", address(teamVesting));
        console2.log("StrategicVesting:", address(strategicVesting));
    }
}

