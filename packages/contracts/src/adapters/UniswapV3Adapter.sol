// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../interfaces/IAdapter.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {IUniversalRouter} from "../interfaces/IUniversalRouter.sol";

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Adapter that swaps via Uniswap Universal Router (V3 exact-in, single hop)
contract UniswapV3Adapter is IAdapter, Ownable2Step {
    error FeeTierNotAllowed(uint24 fee);
    error RouterZero();

    IUniversalRouter public immutable router;

    // allowlist fee tiers for safety
    mapping(uint24 => bool) public feeAllowed;

    constructor(address initialOwner, address _router) Ownable(initialOwner) {
        if (_router == address(0)) revert RouterZero();
        router = IUniversalRouter(_router);

        // defaults: 0.05% and 0.30%
        feeAllowed[500] = true;
        feeAllowed[3000] = true;
    }

    function setFeeAllowed(uint24 fee, bool allowed) external onlyOwner {
        feeAllowed[fee] = allowed;
    }

    /// @dev data encoding: abi.encode(uint24 fee, uint256 deadline)
    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external returns (uint256 amountOut) {
        (uint24 fee, uint256 dl) = abi.decode(data, (uint24, uint256));
        if (!feeAllowed[fee]) revert FeeTierNotAllowed(fee);

        // Pull tokenIn from caller (IntentSettlement)
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);

        // Move funds into the UniversalRouter, then swap with payerIsUser=false
        _safeTransfer(tokenIn, address(router), amountIn);

        // Path encoding: tokenIn (20) + fee (3) + tokenOut (20)
        bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);

        // Universal Router command: V3_SWAP_EXACT_IN = 0x00
        bytes memory commands = hex"00";

        // inputs: (recipient, amountIn, minOut, path, payerIsUser=false)
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(recipient, amountIn, minAmountOut, path, false);

        uint256 balBefore = IERC20Minimal(tokenOut).balanceOf(recipient);
        router.execute(commands, inputs, dl);

        uint256 balAfter = IERC20Minimal(tokenOut).balanceOf(recipient);
        amountOut = balAfter - balBefore;
        return amountOut;

    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }
}
