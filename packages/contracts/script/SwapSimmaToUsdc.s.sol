// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";

/// @notice Swap SIMMA -> USDC via IntentSettlement.execute(intent, signature)
/// @dev Fixes "stack too deep" by moving digest building into helper functions.
contract SwapSimmaToUsdc is Script {
    // --- Base mainnet addresses (chainId 8453) ---
    address constant SETTLEMENT = 0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b;
    address constant ADAPTER   = 0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0;

    // Tokens
    address constant SIMMA = 0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156;
    address constant USDC  = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Uniswap V3 fee tier (0.30% = 3000)
    uint24 constant FEE = 3000;

   function run() external {
    address signer = vm.envAddress("SIGNER");

    uint256 amountIn = vm.envUint("AMOUNT_IN");
    uint256 minAmountOut = vm.envUint("MIN_OUT");
    uint256 deadline = block.timestamp + 2 hours;
    uint256 nonce = uint256(block.number); // ok for testing

    bytes memory adapterData = abi.encode(FEE, deadline);

    IntentSettlement.SwapIntent memory intent = IntentSettlement.SwapIntent({
        signer: signer,
        adapter: ADAPTER,
        tokenIn: SIMMA,
        tokenOut: USDC,
        amountIn: amountIn,
        minAmountOut: minAmountOut,
        deadline: deadline,
        nonce: nonce,
        adapterData: adapterData
    });

    IntentSettlement settlement = IntentSettlement(SETTLEMENT);
    bytes32 digest = _buildDigest(settlement, intent);

    // IMPORTANT: this requires a wallet backend (use --account deployer)
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer, digest);
    bytes memory signature = abi.encodePacked(r, s, v);

console2.log(
  string.concat(
    '{"chainId":8453,"intent":{"signer":"', vm.toString(signer),
    '","adapter":"', vm.toString(ADAPTER),
    '","tokenIn":"', vm.toString(SIMMA),
    '","tokenOut":"', vm.toString(USDC),
    '","amountIn":"', vm.toString(amountIn),
    '","minAmountOut":"', vm.toString(minAmountOut),
    '","deadline":"', vm.toString(deadline),
    '","nonce":"', vm.toString(nonce),
    '","adapterData":"', vm.toString(adapterData),
    '"},"signature":"', vm.toString(signature),
    '"}'
  )
);
}

    function _buildDigest(IntentSettlement settlement, IntentSettlement.SwapIntent memory intent)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = _buildStructHash(settlement, intent);
        bytes32 domainSeparator = _domainSeparator(settlement);
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _buildStructHash(IntentSettlement settlement, IntentSettlement.SwapIntent memory intent)
        internal
        view
        returns (bytes32)
    {
        bytes32 typeHash = settlement.SWAP_INTENT_TYPEHASH();
        return keccak256(
            abi.encode(
                typeHash,
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
    }

    function _domainSeparator(IntentSettlement settlement) internal view returns (bytes32) {
        (bytes1 fields, string memory name, string memory version, uint256 chainId, address verifyingContract, bytes32 salt, ) =
            settlement.eip712Domain();

        bool hasSalt = (uint8(fields) & 0x10) != 0 || salt != bytes32(0);

        if (hasSalt) {
            return keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)"),
                    keccak256(bytes(name)),
                    keccak256(bytes(version)),
                    chainId,
                    verifyingContract,
                    salt
                )
            );
        }

        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );
    }
}
