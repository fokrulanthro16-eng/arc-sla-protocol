// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcSLAVault} from "../ArcSLAVault.sol";

// ---------------------------------------------------------------------------
// Minimal inline MockERC20 — no external imports, mint/burn/approve/transfer
// ---------------------------------------------------------------------------
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// ArcSLAVault test suite
// ---------------------------------------------------------------------------
contract ArcSLAVaultTest is Test {
    ArcSLAVault internal vault;
    MockERC20   internal usdc;

    address internal requester       = makeAddr("requester");
    address internal provider        = makeAddr("provider");
    address internal treasury        = makeAddr("treasury");
    address internal stranger        = makeAddr("stranger");

    uint256 internal constant AMOUNT          = 1_000e6;  // 1 000 USDC (6 dec)
    uint256 internal constant MAX_LATENCY     = 500;       // ms
    bytes32 internal constant PROOF_HASH      = keccak256("telemetry-proof");

    // Expected split at providerShareBps = 9 000 / 10 000
    uint256 internal constant PROVIDER_PAYOUT  = 900e6;   // 90 %
    uint256 internal constant TREASURY_PAYOUT  = 100e6;   // 10 %

    function setUp() public {
        usdc  = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new ArcSLAVault(address(usdc));

        // Give the requester enough USDC for all tests
        usdc.mint(requester, 10_000e6);
    }

    // =========================================================================
    // Helper: create a task as `requester` and return its taskId
    // =========================================================================
    function _createTask() internal returns (uint256 taskId) {
        vm.startPrank(requester);
        usdc.approve(address(vault), AMOUNT);
        taskId = vault.createTask(provider, treasury, AMOUNT, MAX_LATENCY);
        vm.stopPrank();
    }

    // =========================================================================
    // 1. DEPLOYMENT & INITIALISATION
    // =========================================================================

    function test_Deploy_SetsUsdcAddress() public view {
        assertEq(address(vault.usdc()), address(usdc));
    }

    function test_Deploy_ZeroAddressUsdc_Reverts() public {
        vm.expectRevert(ArcSLAVault.ZeroAddress.selector);
        new ArcSLAVault(address(0));
    }

    function test_Deploy_InitialStatsAreZero() public view {
        (uint256 vol, uint256 splits, uint256 breaches, uint256 active) = vault.getProtocolStats();
        assertEq(vol,     0);
        assertEq(splits,  0);
        assertEq(breaches,0);
        assertEq(active,  0);
    }

    // =========================================================================
    // 2. createTask — happy path + escrow + event
    // =========================================================================

    function test_CreateTask_EscrwsUsdcInVault() public {
        uint256 balBefore = usdc.balanceOf(address(vault));

        _createTask();

        assertEq(usdc.balanceOf(address(vault)), balBefore + AMOUNT,
            "vault USDC balance should increase by AMOUNT");
        assertEq(usdc.balanceOf(requester),      10_000e6 - AMOUNT,
            "requester USDC should decrease by AMOUNT");
    }

    function test_CreateTask_TaskStructFields() public {
        uint256 taskId = _createTask();

        (
            uint256 id,
            address req,
            address prov,
            address tv,
            uint256 amt,
            uint256 maxLat,
            uint256 actLat,
            uint256 shareBps,
            bytes32 proofHash,
            uint8 status,
            uint256 createdAt
        ) = vault.tasks(taskId);

        assertEq(id,        taskId,          "id mismatch");
        assertEq(req,       requester,       "requester mismatch");
        assertEq(prov,      provider,        "provider mismatch");
        assertEq(tv,        treasury,        "treasuryVerifier mismatch");
        assertEq(amt,       AMOUNT,          "amount mismatch");
        assertEq(maxLat,    MAX_LATENCY,     "maxLatencyMs mismatch");
        assertEq(actLat,    0,               "actualLatencyMs should be 0 on creation");
        assertEq(shareBps,  9_000,           "providerShareBps should be hardcoded 9000");
        assertEq(proofHash, bytes32(0),      "telemetryProofHash should be 0 on creation");
        assertEq(status,    0,               "status should be 0 (Locked_Active)");
        assertEq(createdAt, block.timestamp, "createdAt should be block.timestamp");
    }

    function test_CreateTask_EmitsTaskCreated() public {
        vm.startPrank(requester);
        usdc.approve(address(vault), AMOUNT);

        // taskId will be 1 (first task)
        vm.expectEmit(true, true, true, true, address(vault));
        emit ArcSLAVault.TaskCreated(1, requester, provider, AMOUNT, MAX_LATENCY);

        vault.createTask(provider, treasury, AMOUNT, MAX_LATENCY);
        vm.stopPrank();
    }

    function test_CreateTask_IncrementsTaskCountAndStats() public {
        _createTask();
        _createTask();

        assertEq(vault.taskCount(), 2);
        (uint256 vol, , , uint256 active) = vault.getProtocolStats();
        assertEq(vol,    AMOUNT * 2);
        assertEq(active, 2);
    }

    // =========================================================================
    // 3. executeAndSettleSLA — SLA MET (actualLatencyMs=180, max=500)
    // =========================================================================

    function test_SLAMet_SplitsCreditsCorrectly() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        assertEq(vault.pendingWithdrawals(provider),  PROVIDER_PAYOUT,  "provider pending");
        assertEq(vault.pendingWithdrawals(treasury),  TREASURY_PAYOUT,  "treasury pending");
        assertEq(vault.pendingWithdrawals(requester), 0,                 "requester pending should be 0");
    }

    function test_SLAMet_TaskStatusIs1() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        (, , , , , , , , , uint8 status, ) = vault.tasks(taskId);
        assertEq(status, 1, "status should be 1 (Settled_Split_Paid)");
    }

    function test_SLAMet_EmitsSLASettledWithSplit() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vm.expectEmit(true, false, false, true, address(vault));
        emit ArcSLAVault.SLASettledWithSplit(
            taskId,
            PROVIDER_PAYOUT,
            TREASURY_PAYOUT,
            180,
            PROOF_HASH
        );
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);
    }

    function test_SLAMet_UpdatesStats() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        (uint256 vol, uint256 splits, uint256 breaches, uint256 active) = vault.getProtocolStats();
        assertEq(vol,     AMOUNT, "totalVolume");
        assertEq(splits,  1,      "totalSplitsSettled");
        assertEq(breaches,0,      "totalBreachRefunds");
        assertEq(active,  0,      "activeTaskCount");
    }

    function test_SLAMet_ExactBoundary_LatencyEqualsMax() public {
        // actualLatencyMs == maxLatencyMs should count as MET (<=)
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, MAX_LATENCY, PROOF_HASH);

        (, , , , , , , , , uint8 status, ) = vault.tasks(taskId);
        assertEq(status, 1, "equal-to-max latency should be SLA MET");
    }

    // =========================================================================
    // 4. executeAndSettleSLA — SLA BREACHED (actualLatencyMs=1420, max=500)
    // =========================================================================

    function test_SLABreached_RefundsRequesterFully() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 1420, PROOF_HASH);

        assertEq(vault.pendingWithdrawals(requester), AMOUNT, "requester pending should be full AMOUNT");
        assertEq(vault.pendingWithdrawals(provider),  0,      "provider pending should be 0");
        assertEq(vault.pendingWithdrawals(treasury),  0,      "treasury pending should be 0");
    }

    function test_SLABreached_TaskStatusIs2() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 1420, PROOF_HASH);

        (, , , , , , , , , uint8 status, ) = vault.tasks(taskId);
        assertEq(status, 2, "status should be 2 (Breached_Refunded)");
    }

    function test_SLABreached_EmitsSLABreachedAutoRefunded() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vm.expectEmit(true, true, false, true, address(vault));
        emit ArcSLAVault.SLABreachedAutoRefunded(taskId, requester, AMOUNT, 1420);
        vault.executeAndSettleSLA(taskId, 1420, PROOF_HASH);
    }

    function test_SLABreached_UpdatesStats() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 1420, PROOF_HASH);

        (, uint256 splits, uint256 breaches, uint256 active) = vault.getProtocolStats();
        assertEq(splits,   0, "totalSplitsSettled");
        assertEq(breaches, 1, "totalBreachRefunds");
        assertEq(active,   0, "activeTaskCount");
    }

    // =========================================================================
    // 5. emergencyReclaim
    // =========================================================================

    function test_EmergencyReclaim_CreditsRequester() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.emergencyReclaim(taskId);

        assertEq(vault.pendingWithdrawals(requester), AMOUNT, "requester pending should be AMOUNT");
    }

    function test_EmergencyReclaim_TaskStatusIs3() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.emergencyReclaim(taskId);

        (, , , , , , , , , uint8 status, ) = vault.tasks(taskId);
        assertEq(status, 3, "status should be 3 (Emergency_Reclaimed)");
    }

    function test_EmergencyReclaim_EmitsEvent() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vm.expectEmit(true, true, false, true, address(vault));
        emit ArcSLAVault.EmergencyReclaimed(taskId, requester, AMOUNT);
        vault.emergencyReclaim(taskId);
    }

    function test_EmergencyReclaim_DecrementsActiveTaskCount() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.emergencyReclaim(taskId);

        (, , , uint256 active) = vault.getProtocolStats();
        assertEq(active, 0, "activeTaskCount should be 0 after emergency reclaim");
    }

    // =========================================================================
    // 6. claimPayout — provider and treasury can withdraw after SLA MET
    // =========================================================================

    function test_ClaimPayout_ProviderReceivesUsdc() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        uint256 balBefore = usdc.balanceOf(provider);

        vm.prank(provider);
        vault.claimPayout();

        assertEq(usdc.balanceOf(provider), balBefore + PROVIDER_PAYOUT, "provider USDC after claim");
        assertEq(vault.pendingWithdrawals(provider), 0, "provider pending cleared");
    }

    function test_ClaimPayout_TreasuryReceivesUsdc() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        uint256 balBefore = usdc.balanceOf(treasury);

        vm.prank(treasury);
        vault.claimPayout();

        assertEq(usdc.balanceOf(treasury), balBefore + TREASURY_PAYOUT, "treasury USDC after claim");
        assertEq(vault.pendingWithdrawals(treasury), 0, "treasury pending cleared");
    }

    function test_ClaimPayout_RequesterAfterBreach() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 1420, PROOF_HASH);

        uint256 balBefore = usdc.balanceOf(requester);

        vm.prank(requester);
        vault.claimPayout();

        assertEq(usdc.balanceOf(requester), balBefore + AMOUNT, "requester USDC after breach claim");
    }

    function test_ClaimPayout_RequesterAfterEmergencyReclaim() public {
        uint256 taskId = _createTask();

        vm.prank(requester);
        vault.emergencyReclaim(taskId);

        uint256 balBefore = usdc.balanceOf(requester);

        vm.prank(requester);
        vault.claimPayout();

        assertEq(usdc.balanceOf(requester), balBefore + AMOUNT, "requester USDC after emergency claim");
    }

    function test_ClaimPayout_ZeroBalance_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(ArcSLAVault.InsufficientPendingBalance.selector);
        vault.claimPayout();
    }

    // =========================================================================
    // 7. Revert paths
    // =========================================================================

    function test_CreateTask_ZeroAmount_Reverts() public {
        vm.startPrank(requester);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(ArcSLAVault.InvalidAmount.selector);
        vault.createTask(provider, treasury, 0, MAX_LATENCY);
        vm.stopPrank();
    }

    function test_CreateTask_ZeroProvider_Reverts() public {
        vm.startPrank(requester);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(ArcSLAVault.ZeroAddress.selector);
        vault.createTask(address(0), treasury, AMOUNT, MAX_LATENCY);
        vm.stopPrank();
    }

    function test_CreateTask_ZeroTreasury_Reverts() public {
        vm.startPrank(requester);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(ArcSLAVault.ZeroAddress.selector);
        vault.createTask(provider, address(0), AMOUNT, MAX_LATENCY);
        vm.stopPrank();
    }

    function test_ExecuteSettle_NonActiveTask_Reverts() public {
        uint256 taskId = _createTask();

        // Settle once → status becomes 1
        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        // Second settle must revert TaskNotActive
        vm.prank(requester);
        vm.expectRevert(ArcSLAVault.TaskNotActive.selector);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);
    }

    function test_ExecuteSettle_Stranger_Reverts() public {
        uint256 taskId = _createTask();

        vm.prank(stranger);
        vm.expectRevert(ArcSLAVault.NotAuthorized.selector);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);
    }

    function test_ExecuteSettle_TreasuryVerifier_CanSettle() public {
        // treasuryVerifier is also an authorised caller
        uint256 taskId = _createTask();

        vm.prank(treasury);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        (, , , , , , , , , uint8 status, ) = vault.tasks(taskId);
        assertEq(status, 1, "treasury should be able to settle");
    }

    function test_EmergencyReclaim_NonActiveTask_Reverts() public {
        uint256 taskId = _createTask();

        // Settle first
        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        vm.prank(requester);
        vm.expectRevert(ArcSLAVault.TaskNotActive.selector);
        vault.emergencyReclaim(taskId);
    }

    function test_EmergencyReclaim_NonRequester_Reverts() public {
        uint256 taskId = _createTask();

        vm.prank(stranger);
        vm.expectRevert(ArcSLAVault.NotAuthorized.selector);
        vault.emergencyReclaim(taskId);
    }

    // =========================================================================
    // 8. getProtocolStats — aggregate across multiple tasks
    // =========================================================================

    function test_ProtocolStats_MultipleTasksCombined() public {
        // Task 1: SLA MET
        uint256 task1 = _createTask();
        vm.prank(requester);
        vault.executeAndSettleSLA(task1, 180, PROOF_HASH);

        // Task 2: SLA BREACHED
        uint256 task2 = _createTask();
        vm.prank(requester);
        vault.executeAndSettleSLA(task2, 1420, PROOF_HASH);

        // Task 3: still active
        _createTask();

        (uint256 vol, uint256 splits, uint256 breaches, uint256 active) = vault.getProtocolStats();
        assertEq(vol,     AMOUNT * 3, "totalVolumeUsdc");
        assertEq(splits,  1,          "totalSplitsSettled");
        assertEq(breaches,1,          "totalBreachRefunds");
        assertEq(active,  1,          "activeTaskCount");
    }

    function test_ProtocolStats_EmergencyReclaimDecrements() public {
        _createTask();
        uint256 taskId2 = _createTask();

        vm.prank(requester);
        vault.emergencyReclaim(taskId2);

        (, , , uint256 active) = vault.getProtocolStats();
        assertEq(active, 1, "one task still active");
    }

    // =========================================================================
    // 9. getAllTasks
    // =========================================================================

    function test_GetAllTasks_ReturnsCorrectArray() public {
        uint256 t1 = _createTask();
        uint256 t2 = _createTask();

        ArcSLAVault.SLATask[] memory all = vault.getAllTasks();

        assertEq(all.length, 2,   "should return 2 tasks");
        assertEq(all[0].id, t1,   "first task id");
        assertEq(all[1].id, t2,   "second task id");
        assertEq(all[0].requester, requester);
        assertEq(all[1].requester, requester);
    }

    // =========================================================================
    // 10. Fuzz — createTask amount
    // =========================================================================

    function testFuzz_CreateTask_ArbitraryAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);  // 1 to 1 million USDC

        // Seed requester with enough USDC
        usdc.mint(requester, amount);

        vm.startPrank(requester);
        usdc.approve(address(vault), amount);
        uint256 taskId = vault.createTask(provider, treasury, amount, MAX_LATENCY);
        vm.stopPrank();

        (, , , , uint256 storedAmt, , , , , , ) = vault.tasks(taskId);
        assertEq(storedAmt, amount);
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    function testFuzz_SLAMet_SplitAlwaysSumsToAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        usdc.mint(requester, amount);

        vm.startPrank(requester);
        usdc.approve(address(vault), amount);
        uint256 taskId = vault.createTask(provider, treasury, amount, MAX_LATENCY);
        vm.stopPrank();

        vm.prank(requester);
        vault.executeAndSettleSLA(taskId, 180, PROOF_HASH);

        uint256 providerCredit  = vault.pendingWithdrawals(provider);
        uint256 treasuryCredit  = vault.pendingWithdrawals(treasury);

        // Credits must sum to the full escrowed amount (no dust lost or gained)
        assertEq(providerCredit + treasuryCredit, amount,
            "provider + treasury credits must equal escrowed amount");
    }
}
