# ArcSLA Protocol — Technical Architecture

**Contract:** `ArcSLAVault.sol`
**Chain:** Arc (USDC as native gas token, Chain IDs: 5042002 testnet / 5042 mainnet)
**Solidity:** 0.8.28, EVM Cancun, OpenZeppelin 5.x

---

## Overview

ArcSLA Protocol is a trustless escrow clearinghouse for AI-to-AI service-level agreements. It combines three primitives:

1. **Conditional USDC Escrow** — funds locked until an SLA condition is deterministically evaluated
2. **Atomic Revenue Splitting** — 90/10 basis-point split enforced on-chain, not negotiable
3. **Circuit-Breaker Auto-Refund** — latency threshold exceeded triggers instant 100% credit back to requester

All fund movements use a pull-payment model to eliminate push-transfer failure modes on blocklistable ERC-20s.

---

## Contract: `ArcSLAVault`

**Inheritance:** `ReentrancyGuard` (OpenZeppelin 5.x)
**Immutable:** `IERC20 public immutable usdc`

---

## Core Data Structure: `SLATask`

```solidity
struct SLATask {
    uint256 id;                  // Auto-incrementing task counter
    address requester;           // Party locking USDC (AI agent / client)
    address provider;            // Target service / worker agent (receives 90%)
    address treasuryVerifier;    // Protocol oracle / verifier (receives 10%)
    uint256 amount;              // USDC locked, in 6-decimal raw units
    uint256 maxLatencyMs;        // SLA threshold in milliseconds
    uint256 actualLatencyMs;     // Reported latency (set on settlement)
    uint256 providerShareBps;    // Always 9000 — hardcoded at creation
    bytes32 telemetryProofHash;  // SHA-256 hash of off-chain telemetry proof
    uint8   status;              // 0=Locked_Active 1=Settled_Split_Paid
                                 // 2=Breached_Refunded 3=Emergency_Reclaimed
    uint256 createdAt;           // block.timestamp at creation
}
```

### Status Enum

| Value | Name | Description |
|---|---|---|
| `0` | `Locked_Active` | USDC held in escrow, awaiting settlement |
| `1` | `Settled_Split_Paid` | SLA met, 90/10 credits recorded |
| `2` | `Breached_Refunded` | SLA breached, 100% credit to requester |
| `3` | `Emergency_Reclaimed` | Requester withdrew before settlement |

---

## State Variables

```solidity
IERC20 public immutable usdc;             // USDC contract on Arc
uint256 public taskCount;                 // Total tasks ever created
uint256 public activeTaskCount;           // O(1) live task counter
uint256 public totalVolumeUsdc;           // Cumulative USDC locked (all time)
uint256 public totalSplitsSettled;        // Count of status=1 outcomes
uint256 public totalBreachRefunds;        // Count of status=2 outcomes
mapping(uint256 => SLATask) public tasks; // taskId => SLATask
mapping(address => uint256) public pendingWithdrawals; // Pull-payment ledger
uint256[] private _taskIds;              // Enumeration array for getAllTasks()
```

---

## Basis-Points Split Math

The 90/10 split uses integer basis-point arithmetic (BPS where 10000 = 100%):

```solidity
uint256 providerShareBps = 9_000;  // Always hardcoded

uint256 providerPayout = (task.amount * providerShareBps) / 10_000;
uint256 treasuryPayout = task.amount - providerPayout;
// treasury = remainder, capturing any integer division dust
```

**Invariant:** `providerPayout + treasuryPayout == task.amount` for all possible `task.amount` values.

**Proof:** `providerPayout = floor(amount * 9000 / 10000)`. The remainder `amount - providerPayout` is at most `9999 / 10000 * 10000 = 9999` raw units (< 0.00001 USDC). No dust is lost — it goes to `treasuryPayout`.

**6-Decimal USDC examples:**

| USDC Amount | Raw Units | Provider (90%) | Treasury (10%) |
|---|---|---|---|
| 0.01 USDC | 10,000 | 9,000 | 1,000 |
| 0.10 USDC | 100,000 | 90,000 | 10,000 |
| 1.00 USDC | 1,000,000 | 900,000 | 100,000 |
| 100.00 USDC | 100,000,000 | 90,000,000 | 10,000,000 |
| 0.000001 USDC | 1 | 0 | 1 |

Note: On a 1-unit amount, providerPayout = 0 due to integer division floor. The treasury receives 1. This is the expected behavior for amounts below the BPS resolution.

---

## Function Specifications

### `createTask`

```solidity
function createTask(
    address _provider,
    address _treasuryVerifier,
    uint256 _amount,
    uint256 _maxLatencyMs
) external nonReentrant returns (uint256 taskId)
```

**Pre-conditions:**
- `_provider != address(0)` and `_treasuryVerifier != address(0)` → `ZeroAddress()`
- `_amount > 0` → `InvalidAmount()`
- Caller must have pre-approved `_amount` USDC to this contract

**Effects:**
1. `taskId = ++taskCount`
2. `usdc.transferFrom(msg.sender, address(this), _amount)` → `TransferFromFailed()` on failure
3. Stores `SLATask` with `status=0`, `providerShareBps=9000`, `createdAt=block.timestamp`
4. `_taskIds.push(taskId)`
5. `activeTaskCount++`
6. `totalVolumeUsdc += _amount`
7. Emits `TaskCreated(taskId, requester, provider, amount, maxLatencyMs)`

---

### `executeAndSettleSLA`

```solidity
function executeAndSettleSLA(
    uint256 _taskId,
    uint256 _actualLatencyMs,
    bytes32 _telemetryProofHash
) external nonReentrant
```

**Pre-conditions:**
- `tasks[_taskId].status == 0` → `TaskNotActive()`
- `msg.sender == task.requester || msg.sender == task.treasuryVerifier` → `NotAuthorized()`

**PATH A — SLA MET** (`_actualLatencyMs <= task.maxLatencyMs`):
1. `task.status = 1`
2. `task.actualLatencyMs = _actualLatencyMs`
3. `task.telemetryProofHash = _telemetryProofHash`
4. `providerPayout = (task.amount * 9000) / 10000`
5. `treasuryPayout = task.amount - providerPayout`
6. `pendingWithdrawals[task.provider] += providerPayout`
7. `pendingWithdrawals[task.treasuryVerifier] += treasuryPayout`
8. `totalSplitsSettled++`, `activeTaskCount--`
9. Emits `SLASettledWithSplit(taskId, providerPayout, treasuryPayout, actualLatencyMs, proofHash)`

**PATH B — SLA BREACHED** (`_actualLatencyMs > task.maxLatencyMs`):
1. `task.status = 2`
2. `task.actualLatencyMs = _actualLatencyMs`
3. `task.telemetryProofHash = _telemetryProofHash`
4. `pendingWithdrawals[task.requester] += task.amount`
5. `totalBreachRefunds++`, `activeTaskCount--`
6. Emits `SLABreachedAutoRefunded(taskId, requester, amount, actualLatencyMs)`

---

### `emergencyReclaim`

```solidity
function emergencyReclaim(uint256 _taskId) external nonReentrant
```

**Pre-conditions:**
- `tasks[_taskId].status == 0` → `TaskNotActive()`
- `msg.sender == task.requester` → `NotAuthorized()`

**Effects:**
1. `task.status = 3`
2. `pendingWithdrawals[task.requester] += task.amount`
3. `activeTaskCount--`
4. Emits `EmergencyReclaimed(taskId, requester, amount)`

---

### `claimPayout`

```solidity
function claimPayout() external nonReentrant
```

**Pre-conditions:**
- `pendingWithdrawals[msg.sender] > 0` → `InsufficientPendingBalance()`

**Effects (Checks-Effects-Interactions):**
1. `uint256 amount = pendingWithdrawals[msg.sender]`
2. `pendingWithdrawals[msg.sender] = 0` ← state cleared BEFORE transfer
3. `usdc.transfer(msg.sender, amount)` → `TransferFailed()` on failure

---

## Cryptographic Telemetry Proof

`telemetryProofHash` is a `bytes32` value — a SHA-256 hash of the off-chain telemetry attestation string. The frontend generates this as:

```typescript
const proofInput = `ArcSLA_Verified_Telemetry_${latencyMs}ms_task${taskId}_${Date.now()}`;
const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proofInput));
// Convert to bytes32 hex for the contract call
```

The contract stores this hash on-chain but does not verify it cryptographically (no oracle verification in v1). It serves as an immutable audit trail — once settled, the proof hash is permanently recorded in the task struct and emitted in the settlement event.

**V2 roadmap:** ZK-proof based latency attestation from a decentralized oracle network.

---

## Pull-Payment Model

All USDC exits the vault through a single codepath: `claimPayout()`. This prevents:

- **Push-failure bricking:** A blocked/non-payable recipient cannot prevent other parties from receiving funds
- **Reentrancy via push:** No external call during settlement — credits are pure state writes
- **Cross-party coupling:** Provider failure to claim does not affect treasury claim, and vice versa

The `pendingWithdrawals` mapping accumulates credits across multiple tasks. A provider/treasury with multiple settled tasks can call `claimPayout()` once to receive all accumulated USDC.

---

## Events

```solidity
event TaskCreated(
    uint256 indexed taskId,
    address indexed requester,
    address indexed provider,
    uint256 amount,
    uint256 maxLatencyMs
);

event SLASettledWithSplit(
    uint256 indexed taskId,
    uint256 providerPayout,
    uint256 treasuryPayout,
    uint256 actualLatencyMs,
    bytes32 proofHash
);

event SLABreachedAutoRefunded(
    uint256 indexed taskId,
    address indexed requester,
    uint256 refundedAmount,
    uint256 actualLatencyMs
);

event EmergencyReclaimed(
    uint256 indexed taskId,
    address indexed requester,
    uint256 reclaimedAmount
);
```

---

## Custom Errors

```solidity
error InvalidAmount();            // _amount == 0
error InvalidShareBps();          // Legacy — unused after hardcoding
error ZeroAddress();              // provider or treasuryVerifier is address(0)
error TaskNotActive();            // task.status != 0
error NotAuthorized();            // msg.sender not requester/verifier
error TransferFromFailed();       // USDC transferFrom returned false
error TransferFailed();           // USDC transfer returned false (claimPayout)
error InsufficientPendingBalance(); // pendingWithdrawals[msg.sender] == 0
```

---

## USDC Address on Arc

| Network | Chain ID | USDC Address |
|---|---|---|
| Arc Testnet | 5042002 | `0x3600000000000000000000000000000000000000` |
| Arc Mainnet | 5042 | `0x3600000000000000000000000000000000000000` |

On Arc, USDC is also the native gas token. The ERC-20 address is a precompile at `0x3600...0000` with 6 decimals.
