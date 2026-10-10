// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../interfaces/IAdapter.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {ISettlementHook} from "../interfaces/ISettlementHook.sol";

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Settlement V2: exact-input only, recipient = signer, allowlisted tokens/adapters.
/// @dev V2 fee-flow fix: the adapter delivers ALL tokenOut to this contract; the contract then
///      pays (amountOut - fee) to the signer and the fee to feeRecipient. The signer only ever
///      approves tokenIn. Optional hook module (0x0 disables).
contract IntentSettlement is EIP712, Ownable2Step, ReentrancyGuard {
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

    /// @notice Optional hook address changed (0x0 disables hooks)
    event HookSet(address hook);

    /// @dev amountOut is the GROSS output received from the adapter (before fee), unchanged from V1.
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

    /// @notice Optional hook module (can be 0x0)
    ISettlementHook public hook;

    // ---- Types ----
    struct SwapIntent {
        address signer; // the user
        address adapter; // adapter contract
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline; // unix seconds
        uint256 nonce;
        bytes adapterData; // passed to adapter
    }

    bytes32 public constant SWAP_INTENT_TYPEHASH = keccak256(
        "SwapIntent(address signer,address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 adapterDataHash)"
    );

    constructor(address initialOwner) EIP712("SimmaIntentSettlement", "1") Ownable(initialOwner) {}

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

    /// @notice Set optional settlement hook (0x0 disables)
    function setHook(address _hook) external onlyOwner {
        hook = ISettlementHook(_hook);
        emit HookSet(_hook);
    }

    // ---- Core ----
    function execute(SwapIntent calldata intent, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        // Recipient is always the signer (NOT arbitrary). Relayer submits tx, funds go to signer.
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

        // Optional hook (pre)
        if (address(hook) != address(0)) {
            hook.beforeExecute(
                intent.signer,
                intent.adapter,
                intent.tokenIn,
                intent.tokenOut,
                intent.amountIn,
                intent.minAmountOut,
                intent.nonce
            );
        }

        // Pull tokenIn from signer to this contract (the ONLY approval the signer needs)
        _safeTransferFrom(intent.tokenIn, intent.signer, address(this), intent.amountIn);

        // Approve adapter to spend tokenIn
        _safeApprove(intent.tokenIn, intent.adapter, intent.amountIn);

        // V2: adapter delivers ALL tokenOut to this contract; measure what actually arrived.
        uint256 outBefore = IERC20Minimal(intent.tokenOut).balanceOf(address(this));
        IAdapter(intent.adapter).swapExactIn(
            intent.tokenIn, intent.tokenOut, intent.amountIn, intent.minAmountOut, address(this), intent.adapterData
        );
        amountOut = IERC20Minimal(intent.tokenOut).balanceOf(address(this)) - outBefore;

        // Slippage on gross output (same semantics as V1 / current frontend quote)
        if (amountOut < intent.minAmountOut) revert Slippage(amountOut, intent.minAmountOut);

        // Fee charged on output token, paid out of the contract's own balance.
        uint256 feePaid = 0;
        uint256 netAmountOut = amountOut;
        if (feeBps != 0 && feeRecipient != address(0)) {
            feePaid = (amountOut * feeBps) / 10_000;
            netAmountOut = amountOut - feePaid;
        }

        if (netAmountOut != 0) {
            _safeTransfer(intent.tokenOut, intent.signer, netAmountOut);
        }
        if (feePaid != 0) {
            _safeTransfer(intent.tokenOut, feeRecipient, feePaid);
        }

        // Optional hook (post)
        if (address(hook) != address(0)) {
            hook.afterExecute(
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
        (bool ok1, bytes memory d1) = token.call(abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, 0));
        require(ok1 && (d1.length == 0 || abi.decode(d1, (bool))), "approve0 failed");

        (bool ok2, bytes memory d2) =
            token.call(abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, value));
        require(ok2 && (d2.length == 0 || abi.decode(d2, (bool))), "approve failed");
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }
}
