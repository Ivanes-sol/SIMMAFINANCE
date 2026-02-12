// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Optional hook module called by IntentSettlement.
/// @dev Default should be address(0) or a NoopHook. Keep it minimal.
interface ISettlementHook {
    /// @notice Called before the adapter swap is executed.
    /// @dev Implementations may revert to block execution, or do accounting.
    function beforeExecute(
        address signer,
        address adapter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 nonce
    ) external;

    /// @notice Called after the adapter swap is executed.
    function afterExecute(
        address signer,
        address adapter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feePaid,
        uint256 nonce
    ) external;
}

