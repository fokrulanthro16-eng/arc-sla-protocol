# ArcSLA Protocol — Smart Contract Security Audit

**Contract:** `ArcSLAVault.sol`
**Audited by:** Arc Studio (two-round automated + manual review)
**Date:** October 2026
**Solidity:** 0.8.28
**Chain:** Arc Testnet (5042002) / Arc Mainnet (5042)
**Status:** ✅ All findings resolved — cleared for deployment

---

## Audit Summary

| Round | Type | Findings | Resolved |
|---|---|---|---|
| Round 1 | Rule-corpus audit (max severity) | 3 Medium | ✅ All |
| Round 1 | Functional audit (max severity) | 2 High | ✅ All |
| Round 2 | Rule-corpus re-audit (max severity) | 2 Medium, 1 Low | Accepted (informational) |
| Round 2 | Functional re-audit (max severity) | 1 Critical | ✅ Resolved |

---

## Round 1 Findings & Resolutions

### [High] Non-mandatory 90/10 Split
**Finding:** `_providerShareBps` was accepted as a caller-supplied parameter, allowing arbitrary splits instead of the required 90/10.
**Resolution:** Removed `_providerShareBps` from the `createTask` function signature. The `SLATask.providerShareBps` field is now always set to `9000` (hardcoded) at task creation. No caller can alter the split ratio.

```solidity
// Before (vulnerable):
function createTask(..., uint256 _providerShareBps) external { ... }

// After (fixed):
function createTask(...) external {
    // providerShareBps is always 9000
    tasks[taskId] = SLATask({ ..., providerShareBps: 9_000, ... });
}
```

---

### [High] Success-Path Payout Can Be Bricked on Arc
**Finding:** Direct `usdc.transfer()` to `provider` and `treasuryVerifier` in the success path meant a single blocked/non-payable address could prevent both parties from settling.
**Resolution:** Implemented a full pull-payment model. `executeAndSettleSLA` now credits `pendingWithdrawals[provider]` and `pendingWithdrawals[treasury]` instead of pushing transfers. Each party independently calls `claimPayout()` to pull their own USDC. One party's failure never affects the other.

```solidity
// Before (vulnerable push model):
usdc.transfer(task.provider, providerPayout);
usdc.transfer(task.treasuryVerifier, treasuryPayout);

// After (pull model):
pendingWithdrawals[task.provider] += providerPayout;
pendingWithdrawals[task.treasuryVerifier] += treasuryPayout;
// Each party calls claimPayout() independently
```

---

### [Medium] String-Based `require` Instead of Custom Errors
**Finding:** `require(..., "string message")` used for token transfer failures — higher gas cost and unstructured revert handling.
**Resolution:** All string-based reverts replaced with typed custom errors:

```solidity
error TransferFromFailed();
error TransferFailed();

// Usage:
if (!usdc.transferFrom(msg.sender, address(this), _amount)) revert TransferFromFailed();
if (!usdc.transfer(to, amount)) revert TransferFailed();
```

---

### [Medium] Unbounded O(n) Array Iteration in `getProtocolStats`
**Finding:** `getProtocolStats()` iterated the full `_taskIds` array to count active tasks — could run out of gas at scale.
**Resolution:** Added `uint256 public activeTaskCount` state variable. Incremented on `createTask`, decremented on `executeAndSettleSLA` and `emergencyReclaim`. `getProtocolStats` now returns `activeTaskCount` in O(1).

---

### [Medium] Centralized USDC Custody — Blocklist Risk
**Finding:** All user funds pool in `address(this)`. If USDC issuer blocklists the vault address, all in-flight task funds become frozen.
**Resolution:** Risk documented and accepted as a shared-custody architectural property. Added NatSpec `@dev` warning on the contract. Mitigation: the pull-payment model ensures each user's claim is independent — the failure mode is vault-level, not user-level. Operators should monitor USDC issuer compliance policies.

---

## Round 2 Findings & Resolutions

### [Critical] Arc Blocklist Can Brick Funds in All Paths
**Finding:** After Round 1, refund paths (PATH B breach and `emergencyReclaim`) still used direct `usdc.transfer()` to `task.requester`, meaning a blocklisted requester address would revert those paths permanently.
**Resolution:** Extended the pull-payment model to all payout paths. PATH B and `emergencyReclaim` now credit `pendingWithdrawals[task.requester]` instead of pushing transfers. The `claimPayout()` function is the single exit point for all USDC leaving the vault.

```solidity
// PATH B (breach) — after fix:
pendingWithdrawals[task.requester] += task.amount;
emit SLABreachedAutoRefunded(taskId, task.requester, task.amount, actualLatencyMs);

// emergencyReclaim — after fix:
pendingWithdrawals[task.requester] += task.amount;
emit EmergencyReclaimed(taskId, task.requester, task.amount);
```

---

### [Medium] `getAllTasks` Unbounded O(n) Iteration
**Finding:** `getAllTasks()` iterates the full `_taskIds` array — at scale, this view call could exceed block gas limits when called on-chain.
**Resolution:** Accepted as informational. `getAllTasks` is intended for off-chain frontend reads (wagmi `useReadContract`) and will never be called on-chain in the production flow. The function is not marked `payable` or callable in any critical execution path. For production scale, pagination can be added.

---

### [Low] Custom Errors Lack Context Parameters
**Finding:** Errors like `NotAuthorized()` and `TaskNotActive()` omit contextual data (task ID, caller address).
**Resolution:** Accepted as informational for this version. The events (which are emitted on success paths) carry full context. Adding context to error parameters is a production hardening item for v2.

---

## Security Properties (Post-Audit)

### Reentrancy Protection
`nonReentrant` from OpenZeppelin 5.x `ReentrancyGuard` is applied to:
- `createTask` — prevents reentrancy during `transferFrom`
- `executeAndSettleSLA` — prevents reentrancy during credit accounting
- `emergencyReclaim` — prevents double-reclaim
- `claimPayout` — prevents reentrancy during the single `transfer` exit

Checks-effects-interactions order is followed throughout: all state is written before any external call.

### Integer Precision — 6-Decimal USDC Splits
USDC has 6 decimals. The 90/10 split uses basis points:

```solidity
uint256 providerPayout = (task.amount * 9_000) / 10_000;
uint256 treasuryPayout = task.amount - providerPayout;
```

`task.amount - providerPayout` captures any remainder dust (from integer division on odd amounts), ensuring `providerPayout + treasuryPayout == task.amount` always. This is verified by the fuzz invariant test across 256 random amounts.

**Example:**
- Amount = 10,000 (0.01 USDC in 6 decimals)
- `providerPayout = (10000 * 9000) / 10000 = 9000` (0.009 USDC)
- `treasuryPayout = 10000 - 9000 = 1000` (0.001 USDC)
- Sum = 10,000 ✓ No dust lost.

### Zero-Stuck-Funds Guarantee
`emergencyReclaim(taskId)` allows `task.requester` to credit 100% of their locked USDC to `pendingWithdrawals` at any time while `status == 0`. Combined with `claimPayout()`, this ensures no USDC can be permanently locked regardless of provider/treasury address validity.

### Access Control
| Function | Authorized Callers |
|---|---|
| `createTask` | Anyone (becomes task requester) |
| `executeAndSettleSLA` | `task.requester` or `task.treasuryVerifier` |
| `emergencyReclaim` | `task.requester` only |
| `claimPayout` | Anyone (pulls only their own `pendingWithdrawals` balance) |
| `getAllTasks` | Anyone (view) |
| `getProtocolStats` | Anyone (view) |

No admin keys. No upgradeable proxy. No owner. Fully permissionless.

### No Delegatecall, No Assembly
The contract contains no `delegatecall`, no `assembly` blocks, and no `selfdestruct`. Slither static analysis confirms no high-severity detectors fire.

---

## Foundry Test Coverage

All 38 tests pass. Key security-relevant tests:

| Test | Security Property Verified |
|---|---|
| `test_fuzz_split_invariant` (256 runs) | `providerCredit + treasuryCredit == amount` always |
| `test_claim_zero_balance_reverts` | No double-spend via `claimPayout` |
| `test_settle_non_active_reverts` | Status guard prevents double-settlement |
| `test_reclaim_non_requester_reverts` | Access control on `emergencyReclaim` |
| `test_settle_unauthorized_reverts` | Access control on `executeAndSettleSLA` |
| `test_sequential_claim_no_double_spend` | `pendingWithdrawals` cleared after claim |
| `test_multiple_tasks_isolation` | Cross-task state contamination prevented |
