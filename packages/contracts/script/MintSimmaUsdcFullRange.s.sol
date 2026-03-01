// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
    function balanceOf(address a) external view returns (uint256);
}

interface INPM {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

contract MintSimmaUsdcFullRange is Script {
    // Base addresses
    address constant NPM  = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // token0
    address constant SIMMA= 0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156; // token1

    uint24 constant FEE = 3000;

    function run() external {
       

        // Choose small but real amounts:
        // USDC has 6 decimals. 10 USDC = 10_000_000
        // SIMMA has 18 decimals. 10_000 SIMMA = 10_000e18
        uint256 amount0Desired = vm.envUint("USDC_AMOUNT");   // e.g. 10000000 for 10 USDC
        uint256 amount1Desired = vm.envUint("SIMMA_AMOUNT");  // e.g. 10000e18

        vm.startBroadcast();

        IERC20(USDC).approve(NPM, amount0Desired);
        IERC20(SIMMA).approve(NPM, amount1Desired);

        INPM.MintParams memory p = INPM.MintParams({
            token0: USDC,
            token1: SIMMA,
            fee: FEE,
            tickLower: -887220,
            tickUpper:  887220,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: msg.sender,
            deadline: block.timestamp + 1800
        });

        (uint256 tokenId, uint128 liq, uint256 a0, uint256 a1) = INPM(NPM).mint(p);

        console2.log("Minted tokenId:", tokenId);
        console2.log("Liquidity:", uint256(liq));
        console2.log("Used USDC amount0:", a0);
        console2.log("Used SIMMA amount1:", a1);

        vm.stopBroadcast();
    }
}
