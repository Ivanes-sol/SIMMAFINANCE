// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntentSettlement} from "../src/settlement/IntentSettlement.sol";
import {IAdapter} from "../src/interfaces/IAdapter.sol";
import {ISettlementHook} from "../src/interfaces/ISettlementHook.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

contract MockERC20 {
    string public name;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, uint8 _decimals) {
        name = _name;
        decimals = _decimals;
    }

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "insufficient allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        require(balanceOf[from] >= value, "insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }
}

/// @dev Behaves like the real adapter: pulls tokenIn from caller, delivers tokenOut to `recipient`.
contract MockAdapter is IAdapter {
    mapping(address => mapping(address => uint256)) public rateNum;
    mapping(address => mapping(address => uint256)) public rateDen;
    uint256 public reportMultiplier = 1; // >1 simulates an adapter that over-reports amountOut

    function setRate(address tokenIn, address tokenOut, uint256 num, uint256 den) external {
        rateNum[tokenIn][tokenOut] = num;
        rateDen[tokenIn][tokenOut] = den;
    }

    function setReportMultiplier(uint256 m) external {
        reportMultiplier = m;
    }

    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256, /* minAmountOut */
        address recipient,
        bytes calldata /* data */
    ) external returns (uint256) {
        require(MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "adapter pull failed");
        uint256 out = (amountIn * rateNum[tokenIn][tokenOut]) / rateDen[tokenIn][tokenOut];
        MockERC20(tokenOut).mint(recipient, out);
        return out * reportMultiplier;
    }
}

/// @dev Adapter that tries to re-enter settlement.execute during the swap.
contract ReentrantAdapter is IAdapter {
    address public settlement;
    bytes public payload;

    function arm(address _settlement, bytes calldata _payload) external {
        settlement = _settlement;
        payload = _payload;
    }

    function swapExactIn(address, address, uint256, uint256, address, bytes calldata) external returns (uint256) {
        (bool ok, bytes memory ret) = settlement.call(payload);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return 0;
    }
}

contract RecordingHook is ISettlementHook {
    uint256 public beforeCalls;
    uint256 public afterCalls;
    uint256 public lastAmountOut;
    uint256 public lastFeePaid;

    function beforeExecute(address, address, address, address, uint256, uint256, uint256) external {
        beforeCalls++;
    }

    function afterExecute(address, address, address, address, uint256, uint256 amountOut, uint256 feePaid, uint256)
        external
    {
        afterCalls++;
        lastAmountOut = amountOut;
        lastFeePaid = feePaid;
    }
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

contract IntentSettlementV2Test is Test {
    IntentSettlement settlement;
    MockERC20 usdc;
    MockERC20 simma;
    MockERC20 weth;
    MockAdapter adapter;

    uint256 constant USER_PK = 0xA11CE;
    uint256 constant OTHER_PK = 0xB0B;
    address user;
    address relayer = address(0xCD36);
    address feeRecipient = address(0xFEE);

    uint16 constant FEE_BPS = 30;
    uint256 constant USDC_IN = 100_000; // 0.1 USDC (6 decimals)
    uint256 constant SIMMA_PER_USDC_RAW = 3e12; // 1 raw USDC -> 3e12 raw SIMMA (i.e. 1 USDC = 3 SIMMA)

    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        user = vm.addr(USER_PK);

        settlement = new IntentSettlement(address(this));
        usdc = new MockERC20("USDC", 6);
        simma = new MockERC20("SIMMA", 18);
        weth = new MockERC20("WETH", 18);
        adapter = new MockAdapter();

        adapter.setRate(address(usdc), address(simma), SIMMA_PER_USDC_RAW, 1);
        adapter.setRate(address(simma), address(usdc), 1, SIMMA_PER_USDC_RAW);

        settlement.setTokenAllowed(address(usdc), true);
        settlement.setTokenAllowed(address(simma), true);
        settlement.setAdapterAllowed(address(adapter), true);
        settlement.setFee(FEE_BPS, feeRecipient);
    }

    // ---------------- helpers ----------------

    function _intent(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 nonce, address adp)
        internal
        view
        returns (IntentSettlement.SwapIntent memory it)
    {
        it = IntentSettlement.SwapIntent({
            signer: user,
            adapter: adp,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minOut,
            deadline: block.timestamp + 600,
            nonce: nonce,
            adapterData: abi.encode(uint24(3000), block.timestamp + 600)
        });
    }

    function _digest(IntentSettlement.SwapIntent memory it) internal view returns (bytes32) {
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
        return keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
    }

    function _sign(IntentSettlement.SwapIntent memory it, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(it));
        return abi.encodePacked(r, s, v);
    }

    function _fundBuyer(uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(settlement), amount);
    }

    function _fundSeller(uint256 amount) internal {
        simma.mint(user, amount);
        vm.prank(user);
        simma.approve(address(settlement), amount);
    }

    function _exec(IntentSettlement.SwapIntent memory it, bytes memory sig) internal returns (uint256) {
        vm.prank(relayer);
        return settlement.execute(it, sig);
    }

    // ---------------- core V2 behavior ----------------

    /// The production bug: buyer has NO tokenOut (SIMMA) allowance. Must succeed in V2.
    function test_Buy_UsdcToSimma_OnlyTokenInApproval() public {
        _fundBuyer(USDC_IN);
        assertEq(simma.allowance(user, address(settlement)), 0, "precondition: no SIMMA allowance");

        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        uint256 out = _exec(it, _sign(it, USER_PK));

        uint256 gross = USDC_IN * SIMMA_PER_USDC_RAW;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(out, gross, "return value = gross");
        assertEq(simma.balanceOf(user), gross - fee, "user gets net");
        assertEq(simma.balanceOf(feeRecipient), fee, "fee recipient gets fee");
        assertEq(simma.balanceOf(address(settlement)), 0, "settlement keeps no SIMMA");
        assertEq(usdc.balanceOf(address(settlement)), 0, "settlement keeps no USDC");
        assertEq(usdc.balanceOf(user), 0, "user spent USDC");
        assertEq(usdc.allowance(address(settlement), address(adapter)), 0, "no dangling adapter allowance");
    }

    /// Reverse direction: seller has NO USDC allowance. Must succeed.
    function test_Sell_SimmaToUsdc_OnlyTokenInApproval() public {
        uint256 simmaIn = 3e17; // 0.3 SIMMA -> 100_000 raw USDC
        _fundSeller(simmaIn);
        assertEq(usdc.allowance(user, address(settlement)), 0, "precondition: no USDC allowance");

        IntentSettlement.SwapIntent memory it = _intent(address(simma), address(usdc), simmaIn, 1, 1, address(adapter));
        _exec(it, _sign(it, USER_PK));

        uint256 gross = simmaIn / SIMMA_PER_USDC_RAW; // 100_000
        uint256 fee = (gross * FEE_BPS) / 10_000; // 300
        assertEq(usdc.balanceOf(user), gross - fee);
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(usdc.balanceOf(address(settlement)), 0);
        assertEq(simma.balanceOf(address(settlement)), 0);
    }

    function test_EmitsIntentExecuted_WithGrossAndFee() public {
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 7, address(adapter));
        bytes memory sig = _sign(it, USER_PK);

        uint256 gross = USDC_IN * SIMMA_PER_USDC_RAW;
        uint256 fee = (gross * FEE_BPS) / 10_000;

        vm.expectEmit(true, true, true, true, address(settlement));
        emit IntentSettlement.IntentExecuted(
            user, address(adapter), address(usdc), address(simma), USDC_IN, gross, fee, 7
        );
        _exec(it, sig);
    }

    function test_FeeDisabled_UserGetsEverything() public {
        settlement.setFee(0, feeRecipient);
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        _exec(it, _sign(it, USER_PK));

        assertEq(simma.balanceOf(user), USDC_IN * SIMMA_PER_USDC_RAW);
        assertEq(simma.balanceOf(feeRecipient), 0);
    }

    function test_FeeRecipientZero_NoFeeCharged() public {
        settlement.setFee(FEE_BPS, address(0));
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        _exec(it, _sign(it, USER_PK));

        assertEq(simma.balanceOf(user), USDC_IN * SIMMA_PER_USDC_RAW);
        assertEq(simma.balanceOf(address(settlement)), 0);
    }

    /// Settlement must trust its own balance change, not the adapter's return value.
    function test_UsesMeasuredOutput_NotAdapterReport() public {
        adapter.setReportMultiplier(2);
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        uint256 out = _exec(it, _sign(it, USER_PK));

        uint256 gross = USDC_IN * SIMMA_PER_USDC_RAW;
        assertEq(out, gross, "uses real delivered amount");
        assertEq(simma.balanceOf(user) + simma.balanceOf(feeRecipient), gross);
    }

    function test_Hook_BeforeAndAfterCalledWithCorrectValues() public {
        RecordingHook hook = new RecordingHook();
        settlement.setHook(address(hook));
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        _exec(it, _sign(it, USER_PK));

        uint256 gross = USDC_IN * SIMMA_PER_USDC_RAW;
        assertEq(hook.beforeCalls(), 1);
        assertEq(hook.afterCalls(), 1);
        assertEq(hook.lastAmountOut(), gross);
        assertEq(hook.lastFeePaid(), (gross * FEE_BPS) / 10_000);
    }

    // ---------------- protections ----------------

    function test_Revert_Slippage() public {
        _fundBuyer(USDC_IN);
        uint256 gross = USDC_IN * SIMMA_PER_USDC_RAW;
        IntentSettlement.SwapIntent memory it =
            _intent(address(usdc), address(simma), USDC_IN, gross + 1, 1, address(adapter));
        bytes memory sig = _sign(it, USER_PK);

        vm.expectRevert(abi.encodeWithSelector(IntentSettlement.Slippage.selector, gross, gross + 1));
        _exec(it, sig);
    }

    function test_Revert_NonceReplay() public {
        _fundBuyer(USDC_IN * 2);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 42, address(adapter));
        bytes memory sig = _sign(it, USER_PK);
        _exec(it, sig);

        vm.expectRevert(abi.encodeWithSelector(IntentSettlement.NonceUsed.selector, user, 42));
        _exec(it, sig);
    }

    function test_Revert_DeadlineExpired() public {
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        bytes memory sig = _sign(it, USER_PK);
        vm.warp(it.deadline + 1);

        vm.expectRevert(abi.encodeWithSelector(IntentSettlement.DeadlineExpired.selector, it.deadline));
        _exec(it, sig);
    }

    function test_Revert_WrongSigner() public {
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        bytes memory sig = _sign(it, OTHER_PK);

        vm.expectRevert(IntentSettlement.BadSignature.selector);
        _exec(it, sig);
    }

    function test_Revert_TamperedIntent() public {
        _fundBuyer(USDC_IN * 2);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        bytes memory sig = _sign(it, USER_PK);
        it.amountIn = USDC_IN * 2;

        vm.expectRevert(IntentSettlement.BadSignature.selector);
        _exec(it, sig);
    }

    function test_Revert_TokenNotAllowed() public {
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(weth), USDC_IN, 1, 1, address(adapter));
        bytes memory sig = _sign(it, USER_PK);

        vm.expectRevert(abi.encodeWithSelector(IntentSettlement.TokenNotAllowed.selector, address(weth)));
        _exec(it, sig);
    }

    function test_Revert_AdapterNotAllowed() public {
        MockAdapter rogue = new MockAdapter();
        _fundBuyer(USDC_IN);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(rogue));
        bytes memory sig = _sign(it, USER_PK);

        vm.expectRevert(abi.encodeWithSelector(IntentSettlement.AdapterNotAllowed.selector, address(rogue)));
        _exec(it, sig);
    }

    function test_Revert_NoTokenInAllowance() public {
        usdc.mint(user, USDC_IN); // funded but NOT approved
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(adapter));
        bytes memory sig = _sign(it, USER_PK);

        vm.expectRevert(bytes("transferFrom failed"));
        _exec(it, sig);
    }

    function test_Revert_Reentrancy() public {
        ReentrantAdapter evil = new ReentrantAdapter();
        settlement.setAdapterAllowed(address(evil), true);
        _fundBuyer(USDC_IN * 2);

        IntentSettlement.SwapIntent memory inner = _intent(address(usdc), address(simma), USDC_IN, 1, 2, address(adapter));
        evil.arm(address(settlement), abi.encodeCall(IntentSettlement.execute, (inner, _sign(inner, USER_PK))));

        IntentSettlement.SwapIntent memory outer = _intent(address(usdc), address(simma), USDC_IN, 1, 1, address(evil));
        bytes memory sig = _sign(outer, USER_PK);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _exec(outer, sig);
    }

    // ---------------- admin ----------------

    function test_Revert_NonOwnerAdmin() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        settlement.setFee(0, user);
    }

    function test_Revert_FeeTooHigh() public {
        vm.expectRevert(bytes("fee too high"));
        settlement.setFee(1001, feeRecipient);
    }

    // ---------------- fuzz ----------------

    function testFuzz_FeeAccounting_Buy(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, 1e15); // up to 1e9 USDC
        _fundBuyer(amountIn);
        IntentSettlement.SwapIntent memory it = _intent(address(usdc), address(simma), amountIn, 1, 1, address(adapter));
        _exec(it, _sign(it, USER_PK));

        uint256 gross = amountIn * SIMMA_PER_USDC_RAW;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(simma.balanceOf(feeRecipient), fee);
        assertEq(simma.balanceOf(user), gross - fee);
        assertEq(simma.balanceOf(address(settlement)), 0);
    }

    function testFuzz_FeeAccounting_Sell(uint256 amountIn) public {
        amountIn = bound(amountIn, SIMMA_PER_USDC_RAW, 1e27);
        _fundSeller(amountIn);
        IntentSettlement.SwapIntent memory it = _intent(address(simma), address(usdc), amountIn, 1, 1, address(adapter));
        _exec(it, _sign(it, USER_PK));

        uint256 gross = amountIn / SIMMA_PER_USDC_RAW;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(usdc.balanceOf(user), gross - fee);
        assertEq(usdc.balanceOf(address(settlement)), 0);
    }
}
