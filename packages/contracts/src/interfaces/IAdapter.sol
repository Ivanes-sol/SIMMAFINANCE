// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAdapter {
    /// @notice Execute an exact-input swap.
    /// @dev Adapter MUST return amountOut received by `recipient`.
    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external returns (uint256 amountOut);
}
