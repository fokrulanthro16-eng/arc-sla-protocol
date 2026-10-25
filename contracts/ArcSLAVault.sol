// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Funds are pooled in this contract's address. If the USDC issuer blocklists this contract address, in-flight task funds may become frozen. Operators should monitor USDC issuer compliance policies.
contract ArcSLAVault is ReentrancyGuard {
    struct SLATask {
        uint256 id;
        address requester;
        address provider;
        address treasuryVerifier;
        uint256 amount;
        uint256 maxLatencyMs;
        uint256 actualLatencyMs;
        uint256 providerShareBps;
        bytes32 telemetryProofHash;
        uint8 status; // 0=Locked_Active, 1=Settled_Split_Paid, 2=Breached_Refunded, 3=Emergency_Reclaimed
        uint256 createdAt;
    }

    error InvalidAmount();
    error InvalidShareBps();
    error ZeroAddress();
    error TaskNotActive();
    error NotAuthorized();
    error TransferFromFailed();
    error TransferFailed();
    error InsufficientPendingBalance();

    IERC20 public immutable usdc;
    uint256 public taskCount;
    mapping(uint256 => SLATask) public tasks;
    uint256[] private _taskIds;
    uint256 public totalVolumeUsdc;
    uint256 public totalSplitsSettled;
    uint256 public totalBreachRefunds;
    uint256 public activeTaskCount;
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Emitted when a requester creates and funds a new SLA task.
    event TaskCreated(
        uint256 indexed taskId,
        address indexed requester,
        address indexed provider,
        uint256 amount,
        uint256 maxLatencyMs
    );

    /// @notice Emitted when an SLA task is settled and funds are split between provider and treasury verifier.
    event SLASettledWithSplit(
        uint256 indexed taskId,
        uint256 providerPayout,
        uint256 treasuryPayout,
        uint256 actualLatencyMs,
        bytes32 proofHash
    );

    /// @notice Emitted when an SLA breach causes a full refund back to the requester.
    event SLABreachedAutoRefunded(
        uint256 indexed taskId,
        address indexed requester,
        uint256 refundedAmount,
        uint256 actualLatencyMs
    );

    /// @notice Emitted when a requester reclaims funds from an active task via emergency reclaim.
    event EmergencyReclaimed(uint256 indexed taskId, address indexed requester, uint256 reclaimedAmount);

    /// @notice Initializes the vault with the USDC token contract address.
    /// @param _usdc The USDC token address.
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    /// @notice Creates a new SLA task and locks requester funds in the vault.
    /// @param _provider Address of the service provider.
    /// @param _treasuryVerifier Address that can verify and settle telemetry.
    /// @param _amount USDC amount in 6-decimal raw units.
    /// @param _maxLatencyMs Maximum allowed latency in milliseconds.
    /// @return taskId Newly created task identifier.
    function createTask(
        address _provider,
        address _treasuryVerifier,
        uint256 _amount,
        uint256 _maxLatencyMs
    ) external nonReentrant returns (uint256 taskId) {
        if (_provider == address(0) || _treasuryVerifier == address(0)) revert ZeroAddress();
        if (_amount == 0) revert InvalidAmount();

        taskId = ++taskCount;

        if (!usdc.transferFrom(msg.sender, address(this), _amount)) revert TransferFromFailed();

        tasks[taskId] = SLATask({
            id: taskId,
            requester: msg.sender,
            provider: _provider,
            treasuryVerifier: _treasuryVerifier,
            amount: _amount,
            maxLatencyMs: _maxLatencyMs,
            actualLatencyMs: 0,
            providerShareBps: 9_000,
            telemetryProofHash: bytes32(0),
            status: 0,
            createdAt: block.timestamp
        });

        _taskIds.push(taskId);
        totalVolumeUsdc += _amount;
        activeTaskCount += 1;

        emit TaskCreated(taskId, msg.sender, _provider, _amount, _maxLatencyMs);
    }

    /// @notice Settles an active task by telemetry result and pays split or refund.
    /// @param _taskId Identifier of the task to settle.
    /// @param _actualLatencyMs Observed latency in milliseconds.
    /// @param _telemetryProofHash Hash of telemetry proof data.
    function executeAndSettleSLA(
        uint256 _taskId,
        uint256 _actualLatencyMs,
        bytes32 _telemetryProofHash
    ) external nonReentrant {
        SLATask storage task = tasks[_taskId];

        if (task.status != 0) revert TaskNotActive();
        if (msg.sender != task.requester && msg.sender != task.treasuryVerifier) revert NotAuthorized();

        task.actualLatencyMs = _actualLatencyMs;
        task.telemetryProofHash = _telemetryProofHash;

        if (_actualLatencyMs <= task.maxLatencyMs) {
            task.status = 1;

            uint256 providerPayout = (task.amount * task.providerShareBps) / 10_000;
            uint256 treasuryPayout = task.amount - providerPayout;

            pendingWithdrawals[task.provider] += providerPayout;
            pendingWithdrawals[task.treasuryVerifier] += treasuryPayout;

            totalSplitsSettled += 1;

            emit SLASettledWithSplit(
                _taskId,
                providerPayout,
                treasuryPayout,
                _actualLatencyMs,
                _telemetryProofHash
            );
        } else {
            task.status = 2;

            pendingWithdrawals[task.requester] += task.amount;

            totalBreachRefunds += 1;

            emit SLABreachedAutoRefunded(_taskId, task.requester, task.amount, _actualLatencyMs);
        }

        activeTaskCount -= 1;
    }

    /// @notice Allows any account to claim its accumulated payout credits.
    function claimPayout() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert InsufficientPendingBalance();

        pendingWithdrawals[msg.sender] = 0;

        if (!usdc.transfer(msg.sender, amount)) revert TransferFailed();
    }

    /// @notice Allows the requester to reclaim funds from an active task in emergencies.
    /// @param _taskId Identifier of the task to reclaim.
    function emergencyReclaim(uint256 _taskId) external nonReentrant {
        SLATask storage task = tasks[_taskId];

        if (task.status != 0) revert TaskNotActive();
        if (msg.sender != task.requester) revert NotAuthorized();

        task.status = 3;
        activeTaskCount -= 1;

        pendingWithdrawals[task.requester] += task.amount;

        emit EmergencyReclaimed(_taskId, task.requester, task.amount);
    }

    /// @notice Returns all tasks currently tracked by the vault.
    /// @return allTasks Array containing every SLA task.
    function getAllTasks() external view returns (SLATask[] memory allTasks) {
        uint256 len = _taskIds.length;
        allTasks = new SLATask[](len);

        for (uint256 i = 0; i < len; i++) {
            allTasks[i] = tasks[_taskIds[i]];
        }
    }

    /// @notice Returns protocol-level aggregate stats and current active task count.
    /// @return totalVolume Total USDC volume ever locked.
    /// @return splitsSettled Number of tasks settled with split payout.
    /// @return breachRefunds Number of tasks refunded after SLA breach.
    /// @return activeTasks Number of tasks still active.
    function getProtocolStats()
        external
        view
        returns (uint256 totalVolume, uint256 splitsSettled, uint256 breachRefunds, uint256 activeTasks)
    {
        totalVolume = totalVolumeUsdc;
        splitsSettled = totalSplitsSettled;
        breachRefunds = totalBreachRefunds;
        activeTasks = activeTaskCount;
    }
}
