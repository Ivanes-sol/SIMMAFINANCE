// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwapWethToUsdc is Script {
    // Deployed contracts (Base mainnet)
    address constant SETTLEMENT = 0x7bC94a08f7d9E277856EFF692EA3A67FAadB35DA;
    address constant ADAPTER = 0x7A06A2456C52Ba3D2EcA230A27A74662d53BE258;

    // Tokens (Base mainnet)
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // EIP-712 domain constants (must match IntentSettlement constructor)
    string constant NAME = "SimmaIntentSettlement";
    string constant VERSION = "1";

    bytes32 constant EIP712DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // Must match IntentSettlement.SWAP_INTENT_TYPEHASH
    bytes32 constant SWAP_INTENT_TYPEHASH = keccak256(
        "SwapIntent(address signer,address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 adapterDataHash)"
    );

    function run() external {
        address signer = 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53;
        // Ensure Settlement can pull WETH from signer
        uint256 amountIn = 0.001 ether;

        uint256 allowance = IERC20(WETH).allowance(signer, SETTLEMENT);
        if (allowance < amountIn) {
        vm.startBroadcast(signer);
        IERC20(WETH).approve(SETTLEMENT, type(uint256).max);
        vm.stopBroadcast();

}


        // Build intent
        IntentSettlement.SwapIntent memory intent;
        intent.signer = signer;
        intent.adapter = ADAPTER;
        intent.tokenIn = WETH;
        intent.tokenOut = USDC;
        intent.amountIn = amountIn;
        intent.minAmountOut = 1000000; // 1.000000 USDC (6 decimals) as a safe floor for 0.0005 WETH test
        intent.deadline = block.timestamp + 600;
        intent.nonce = uint256(block.number); // simple unique nonce per run
        intent.adapterData = abi.encode(uint24(500), intent.deadline);

        // Domain separator
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                SETTLEMENT
            )
        );

        // Struct hash
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

        // EIP-712 digest
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Sign
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.startBroadcast(signer);
        uint256 amountOut = IntentSettlement(SETTLEMENT).execute(intent, sig);
        vm.stopBroadcast();


        console2.log("Swap amountOut (raw):", amountOut);
    }
}
