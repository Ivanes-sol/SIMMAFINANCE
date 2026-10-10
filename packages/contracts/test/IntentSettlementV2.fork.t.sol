// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";

/// @notice Simulates Settlement V2 against REAL Base mainnet state (real USDC, SIMMA, live adapter,
///         Universal Router, SIMMA/USDC pool and NoopSettlementHook) on a LOCAL fork.
///         Nothing is broadcast; no transaction is sent. Skips if BASE_RPC_URL is not set.
contract IntentSettlementV2ForkTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant SIMMA = 0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156;
    address constant ADAPTER = 0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0;
    address constant HOOK = 0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0;
    address constant SIMMA_USDC_POOL = 0x39dFa56056a92cf43bdfF15c845f696495eD0625;
    address constant DEPLOYER = 0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53; // owner + fee recipient
    address constant RELAYER = 0xcd3635cF53eBEFAf433b04c49245cc4b4B86a441;

    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    uint256 constant USER_PK = 0xF2E5A11CE; // fresh wallet, unrelated to deployer
    address user;
    IntentSettlement settlement;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 8453, "must fork Base mainnet");

        user = vm.addr(USER_PK);

        settlement = new IntentSettlement(DEPLOYER);
        vm.startPrank(DEPLOYER);
        settlement.setTokenAllowed(USDC, true);
        settlement.setTokenAllowed(SIMMA, true);
        settlement.setAdapterAllowed(ADAPTER, true);
        settlement.setFee(30, DEPLOYER);
        settlement.setHook(HOOK);
        vm.stopPrank();
    }

    function _intent(address tokenIn, address tokenOut, uint256 amountIn, uint256 nonce)
        internal
        view
        returns (IntentSettlement.SwapIntent memory it)
    {
        it = IntentSettlement.SwapIntent({
            signer: user,
            adapter: ADAPTER,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: 1,
            deadline: block.timestamp + 600,
            nonce: nonce,
            adapterData: abi.encode(uint24(3000), block.timestamp + 600)
        });
    }

    function _sign(IntentSettlement.SwapIntent memory it) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                settlement.SWAP_INTENT_TYPEHASH(),
                it.signer,
                it.adapter,
                it.tokenIn,
                it.tokenOut,
                it.amountIn,
                it.minAmountOut,
                it.deadline,
                it.nonce,
                keccak256(it.adapterData)
            )
        );
        bytes32 domainSep = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("SimmaIntentSettlement")),
                keccak256(bytes("1")),
                block.chainid,
                address(settlement)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(USER_PK, keccak256(abi.encodePacked("\x19\x01", domainSep, structHash)));
        return abi.encodePacked(r, s, v);
    }

    /// 0.1 USDC -> SIMMA from a fresh wallet with ZERO SIMMA allowance (the production failure case).
    function test_Fork_Buy_01USDC_ToSimma_FreshWallet() public {
        uint256 amountIn = 100_000; // 0.1 USDC
        vm.prank(SIMMA_USDC_POOL); // fund the test wallet from an existing USDC holder (fork only)
        IERC20Minimal(USDC).transfer(user, amountIn);
        vm.prank(user);
        IERC20Minimal(USDC).approve(address(settlement), amountIn);
        assertEq(IERC20Minimal(SIMMA).allowance(user, address(settlement)), 0, "no SIMMA allowance");

        uint256 feeBefore = IERC20Minimal(SIMMA).balanceOf(DEPLOYER);
        IntentSettlement.SwapIntent memory it = _intent(USDC, SIMMA, amountIn, 1);
        bytes memory sig = _sign(it);

        vm.prank(RELAYER);
        uint256 gross = settlement.execute(it, sig);

        uint256 fee = (gross * 30) / 10_000;
        assertGt(gross, 0, "received SIMMA");
        assertEq(IERC20Minimal(SIMMA).balanceOf(user), gross - fee, "user net");
        assertEq(IERC20Minimal(SIMMA).balanceOf(DEPLOYER) - feeBefore, fee, "fee to recipient");
        assertEq(IERC20Minimal(SIMMA).balanceOf(address(settlement)), 0, "settlement holds no SIMMA");
        assertEq(IERC20Minimal(USDC).balanceOf(address(settlement)), 0, "settlement holds no USDC");
        emit log_named_uint("gross SIMMA (wei)", gross);
        emit log_named_uint("fee SIMMA (wei)", fee);
    }

    /// SIMMA -> USDC from a fresh wallet with ZERO USDC allowance.
    function test_Fork_Sell_SimmaToUsdc_FreshWallet() public {
        uint256 amountIn = 100e18; // 100 SIMMA
        vm.prank(DEPLOYER); // fund the test wallet (fork only)
        IERC20Minimal(SIMMA).transfer(user, amountIn);
        vm.prank(user);
        IERC20Minimal(SIMMA).approve(address(settlement), amountIn);
        assertEq(IERC20Minimal(USDC).allowance(user, address(settlement)), 0, "no USDC allowance");

        uint256 feeBefore = IERC20Minimal(USDC).balanceOf(DEPLOYER);
        IntentSettlement.SwapIntent memory it = _intent(SIMMA, USDC, amountIn, 1);
        bytes memory sig = _sign(it);

        vm.prank(RELAYER);
        uint256 gross = settlement.execute(it, sig);

        uint256 fee = (gross * 30) / 10_000;
        assertGt(gross, 0, "received USDC");
        assertEq(IERC20Minimal(USDC).balanceOf(user), gross - fee, "user net");
        assertEq(IERC20Minimal(USDC).balanceOf(DEPLOYER) - feeBefore, fee, "fee to recipient");
        assertEq(IERC20Minimal(USDC).balanceOf(address(settlement)), 0, "settlement holds no USDC");
        assertEq(IERC20Minimal(SIMMA).balanceOf(address(settlement)), 0, "settlement holds no SIMMA");
        emit log_named_uint("gross USDC (6dp)", gross);
        emit log_named_uint("fee USDC (6dp)", fee);
    }
}
