# ArcSLA Protocol — DoraHacks Submission

## Project Name
**ArcSLA Protocol: Autonomous AI-to-AI SLA Escrow, Revenue Splitter & Instant Circuit-Breaker Refund Engine**

---

## One-Line Summary
Trustless USDC escrow infrastructure for autonomous AI agent payments on Arc — enforces SLA thresholds atomically, splits revenue 90/10 on delivery, and triggers a 100% instant refund if any API timeout or breach occurs.

---

## The Problem

As autonomous AI agents, automated micro-SaaS platforms, and programmatic toolchains scale to millions of concurrent executions, **on-chain payments without counterparty risk** remain unsolved:

- **Pre-payment risk**: If an AI agent pays an API service upfront, bad outputs, infinite loops, or latency breaches leave the requester with no automated recourse and no recovered funds.
- **Revenue split complexity**: Routing 90% to a provider and 10% to a verifier treasury across many parallel tasks requires an enforced, auditable on-chain contract — not a gentleman's agreement.
- **No circuit-breaker**: Legacy payment flows have no concept of a SLA threshold. A 5-second API timeout looks identical to a 100ms successful response in most payment rails.

---

## The Solution

**ArcSLA Protocol** is an institutional-grade smart contract and full-stack clearinghouse built natively on Arc — the blockchain where USDC is the native gas token. It combines three core primitives into a single atomic workflow:

### Primitive 1: Conditional USDC Escrow
Lock any USDC amount into trustless escrow tied to a deterministic SLA threshold (`maxLatencyMs`). Funds cannot be accessed by anyone until the SLA is evaluated.

### Primitive 2: Automatic 90/10 Revenue Split
If the SLA is met (`actualLatencyMs <= maxLatencyMs`), the contract atomically credits:
- **90% → Provider Agent** (the AI service / API worker that delivered the work)
- **10% → Treasury Verifier** (the telemetry oracle / protocol DAO)

The split is **hardcoded on-chain at `providerShareBps = 9000`** — no admin key, no configuration parameter, no way to alter it after deployment.

### Primitive 3: On-Chain Circuit-Breaker Auto-Refund
If the SLA is breached (`actualLatencyMs > maxLatencyMs`), the contract instantly credits **100% of the locked USDC** back to the requester. Zero governance delay. Zero human arbitration. Fully deterministic.

### Bonus: Zero-Stuck-Funds Guarantee
`emergencyReclaim()` lets the requester withdraw their locked USDC at any time while the task is still active — ensuring no funds can ever be permanently locked.

---

## How We Built It With Arc Studio

We built the entire protocol from scratch using **Arc Studio** ([studio.arc.io](https://studio.arc.io)):

1. **Smart Contract Generation**: Arc Studio's contract pipeline authored `ArcSLAVault.sol` with full `SLATask` struct, pull-payment model, custom errors, and OpenZeppelin 5.x `ReentrancyGuard` — all targeting Arc's USDC-as-gas token architecture.

2. **Two-Round Security Review**: Arc Studio automatically ran both a rule-corpus audit and a functional audit at maximum severity. Five findings were identified (2 High, 2 Medium, 1 Critical across two rounds) and all were resolved before deployment. See [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

3. **38 Foundry Unit Tests**: Arc Studio's contract testing pipeline wrote and ran a complete Foundry test suite covering happy paths, breach paths, emergency reclaim, pull-payment claims, fuzz invariants, and all revert guards — all 38 pass.

4. **Institutional Dark-Mode UI**: Arc Studio generated the full-stack React + wagmi v2 + Tailwind frontend — an institutional command center with KPI cards, AI Execution Terminal simulator, settlement engine, and onchain transaction ledger.

5. **1-Click Self-Loop Demo**: The "Execute 1-Click 0.01 USDC Self-Loop Verification" button chains three on-chain transactions (`approve` → `createTask` → `executeAndSettleSLA(180ms)`) in the browser, demonstrating a complete SLA lifecycle with real USDC on testnet.

6. **Testnet Deployment**: Arc Studio deployed `ArcSLAVault` to Arc Testnet at `0xdedc6e0d87dc3dd906a7532c0f8946fedbca7057`.

---

## Links

| Resource | URL |
|---|---|
| Arc Studio Project | https://studio.arc.io/app/37bdb25d-c069-4c3c-abc5-dfc9b80abb3e |
| Live Web App | https://arc-sla-protocol.vercel.app |
| GitHub Repository | https://github.com/fokrulanthro16-eng/arc-sla-protocol |
| Arc Testnet Contract | https://explorer.testnet.arc.io/address/0xdedc6e0d87dc3dd906a7532c0f8946fedbca7057 |
| Security Audit | https://github.com/fokrulanthro16-eng/arc-sla-protocol/blob/main/SECURITY_AUDIT.md |
| Architecture Spec | https://github.com/fokrulanthro16-eng/arc-sla-protocol/blob/main/ARCHITECTURE.md |

---

## Self-Loop Testing Instructions for Judges

The fastest way to verify real USDC movement on Arc Testnet:

1. **Open** the live app: https://arc-sla-protocol.vercel.app
2. **Connect** your wallet (MetaMask or any wagmi-compatible wallet) to Arc Testnet (Chain ID: 5042002)
3. **Get test USDC**: Use the Arc Studio faucet or https://faucet.circle.com to get Arc Testnet USDC
4. **Click** the emerald hero button: **"🚀 Execute 1-Click 0.01 USDC Self-Loop Verification"**
5. **Approve** 3 wallet prompts in sequence:
   - Prompt 1: `approve(0.01 USDC)` to ArcSLAVault
   - Prompt 2: `createTask(yourAddress, yourAddress, 10000, 500)`
   - Prompt 3: `executeAndSettleSLA(taskId, 180, sha256ProofHash)`
6. **Verify** all 3 transaction hashes appear in the Verified Onchain Explorer Audit Ledger at the bottom, each with a live link to `explorer.testnet.arc.io`

**Expected result**: 0.009 USDC (90%) and 0.001 USDC (10%) are credited to `pendingWithdrawals[yourAddress]` — both claimable via the Claim Payout button. Since provider = treasury = your address, 100% returns to your wallet.

---

## Technical Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, Foundry, OpenZeppelin 5.x |
| Chain | Arc Testnet (5042002) / Arc Mainnet (5042) |
| Token | USDC `0x3600000000000000000000000000000000000000` (6 decimals) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Web3 | wagmi v2, viem v2, ConnectKit |
| Security | 2-round automated audit, 38 Foundry tests, Slither static analysis |
| CI | GitHub Actions — Foundry tests + Vite production build |

---

## Key Technical Achievements

- **Full pull-payment model**: No push transfers — every USDC exit goes through `claimPayout()`. Eliminates the entire class of "blocked recipient bricks settlement" vulnerabilities on Arc.
- **Hardcoded 90/10 split**: `providerShareBps = 9_000` is a constant in contract storage, never a parameter. Immutable split guarantee.
- **O(1) stats**: `activeTaskCount` is maintained as a live counter — no array iteration for protocol stats.
- **Zero admin keys**: No `Ownable`, no proxy, no upgradeable pattern. Fully permissionless and immutable.
- **Fuzz-verified arithmetic**: 256-run fuzz test proves `providerCredit + treasuryCredit == amount` for all possible USDC amounts.

---

*Built with Arc Studio · Copyright (c) 2026 FOKRUL ISLAM / intelliyash · MIT License*
