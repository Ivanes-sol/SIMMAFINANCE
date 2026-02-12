// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementHook} from "../interfaces/ISettlementHook.sol";

/// @notice Default hook that does nothing.
contract NoopHook is ISettlementHook {
    function beforeExecute(
        address,
        address,
        address,
        address,
        uint256,
        uint256,
        uint256
    ) external pure override {}

    function afterExecute(
        address,
        address,
        address,
        address,
        uint256,
        uint256,
        uint256,
        uint256
    ) external pure override {}
}

