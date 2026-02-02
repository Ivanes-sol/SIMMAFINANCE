// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice SIMMA token for Simma.Finance (fixed supply minted once at deployment)
contract SIMMA is ERC20, Ownable2Step {
    constructor(
        address initialOwner,
        address treasury,
        uint256 initialSupply
    )
        ERC20("Simma", "SIMMA")
        Ownable(initialOwner)
    {
        require(treasury != address(0), "treasury=0");
        _mint(treasury, initialSupply);
    }
}
