// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementHook} from "../interfaces/ISettlementHook.sol";

/// @notice No-op hook: does nothing before/after execute.
contract NoopSettlementHook is ISettlementHook {
    function beforeExecute(
        address, /* signer */
        address, /* adapter */
        address, /* tokenIn */
        address, /* tokenOut */
        uint256, /* amountIn */
        uint256, /* minAmountOut */
        uint256 /* nonce */
    ) external {}

    function afterExecute(
        address, /* signer */
        address, /* adapter */
        address, /* tokenIn */
        address, /* tokenOut */
        uint256, /* amountIn */
        uint256, /* amountOut */
        uint256, /* feePaid */
        uint256 /* nonce */
    ) external {}
}
