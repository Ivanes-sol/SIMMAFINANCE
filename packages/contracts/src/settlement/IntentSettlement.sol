// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../interfaces/IAdapter.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice v1: exact-input only, recipient = signer (msg.sender enforced by signature), allowlisted tokens.
contract IntentSettlement is EIP712, Ownable2Step {
    using ECDSA for bytes32;

    // ---- Errors ----
    error TokenNotAllowed(address token);
    error AdapterNotAllowed(address adapter);
    error DeadlineExpired(uint256 deadline);
    error BadSignature();
    error NonceUsed(address signer, uint256 nonce);
    error Slippage(uint256 amountOut, uint256 minAmountOut);

    // ---- Events ----
    event TokenAllowlistSet(address token, bool allowed);
    event AdapterAllowlistSet(address adapter, bool allowed);
    event FeeBpsSet(uint16 feeBps, address feeRecipient);

    event IntentExecuted(
        address indexed signer,
        address indexed adapter,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feePaid,
        uint256 nonce
    );

    // ---- State ----
    mapping(address => bool) public tokenAllowed;
    mapping(address => bool) public adapterAllowed;

    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    // fee on output token
    uint16 public feeBps; // e.g. 30 = 0.30%
    address public feeRecipient;

    // ---- Types ----
    struct SwapIntent {
        address signer;      // the user
        address adapter;     // adapter contract
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;    // unix seconds
        uint256 nonce;
        bytes   adapterData; // passed to adapter
    }

    bytes32 public constant SWAP_INTENT_TYPEHASH = keccak256(
        "SwapIntent(address signer,address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 adapterDataHash)"
    );

    constructor(address initialOwner)
        EIP712("SimmaIntentSettlement", "1")
        Ownable(initialOwner)
    {}

    // ---- Admin ----
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        tokenAllowed[token] = allowed;
        emit TokenAllowlistSet(token, allowed);
    }

    function setAdapterAllowed(address adapter, bool allowed) external onlyOwner {
        adapterAllowed[adapter] = allowed;
        emit AdapterAllowlistSet(adapter, allowed);
    }

    function setFee(uint16 _feeBps, address _feeRecipient) external onlyOwner {
        require(_feeBps <= 1000, "fee too high"); // <=10%
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        emit FeeBpsSet(_feeBps, _feeRecipient);
    }

    // ---- Core ----
    function execute(SwapIntent calldata intent, bytes calldata signature) external returns (uint256 amountOut) {
        // v1 receiver constraint
        // Recipient is always the signer (NOT arbitrary). Solver can submit tx, but funds go to signer.
        if (block.timestamp > intent.deadline) revert DeadlineExpired(intent.deadline);

        if (!tokenAllowed[intent.tokenIn]) revert TokenNotAllowed(intent.tokenIn);
        if (!tokenAllowed[intent.tokenOut]) revert TokenNotAllowed(intent.tokenOut);
        if (!adapterAllowed[intent.adapter]) revert AdapterNotAllowed(intent.adapter);

        if (nonceUsed[intent.signer][intent.nonce]) revert NonceUsed(intent.signer, intent.nonce);

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                SWAP_INTENT_TYPEHASH,
                intent.signer,
                intent.adapter,
                intent.tokenIn,
                intent.tokenOut,
                intent.amountIn,
                intent.minAmountOut,
                intent.deadline,
                intent.nonce,
                keccak256(intent.adapterData)
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);
        if (recovered != intent.signer) revert BadSignature();

        // Mark nonce used
        nonceUsed[intent.signer][intent.nonce] = true;

        // Pull tokenIn from signer to this contract
        _safeTransferFrom(intent.tokenIn, intent.signer, address(this), intent.amountIn);

        // Approve adapter to spend tokenIn
        _safeApprove(intent.tokenIn, intent.adapter, intent.amountIn);

        // Execute via adapter; recipient must be signer (v1)
        amountOut = IAdapter(intent.adapter).swapExactIn(
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            intent.minAmountOut,
            intent.signer,
            intent.adapterData
        );

        if (amountOut < intent.minAmountOut) revert Slippage(amountOut, intent.minAmountOut);

        // Fee charged on output token (already delivered to signer).
        // v1: fee is optional and off by default. If enabled, we collect fee by pulling from signer.
        uint256 feePaid = 0;
        if (feeBps != 0 && feeRecipient != address(0)) {
            feePaid = (amountOut * feeBps) / 10_000;
            if (feePaid != 0) {
                _safeTransferFrom(intent.tokenOut, intent.signer, feeRecipient, feePaid);
            }
        }

        emit IntentExecuted(
            intent.signer,
            intent.adapter,
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            amountOut,
            feePaid,
            intent.nonce
        );
    }

    // ---- ERC20 helpers (handle non-standard tokens) ----
    function _safeApprove(address token, address spender, uint256 value) internal {
        // Some tokens require setting allowance to 0 before changing it.
        // We'll do: approve(0) then approve(value).
        (bool ok1, bytes memory d1) = token.call(abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, 0));
        require(ok1 && (d1.length == 0 || abi.decode(d1, (bool))), "approve0 failed");

        (bool ok2, bytes memory d2) = token.call(abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, value));
        require(ok2 && (d2.length == 0 || abi.decode(d2, (bool))), "approve failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }
}
