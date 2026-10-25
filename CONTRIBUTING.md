# Contributing to ArcSLA Protocol

Thank you for your interest in contributing to ArcSLA Protocol. This guide covers the development workflow, branching strategy, and submission standards.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| [Bun](https://bun.sh) | >= 1.0 | `curl -fsSL https://bun.sh/install | bash` |
| [Foundry](https://getfoundry.sh) | latest | `curl -L https://foundry.paradigm.xyz | bash && foundryup` |
| Node.js | >= 18 | For Foundry tooling compatibility |

---

## Local Setup

```bash
# Clone the repo
git clone https://github.com/fokrulanthro16-eng/arc-sla-protocol.git
cd arc-sla-protocol

# Install frontend dependencies
bun install

# Copy environment template
cp .env.example .env
# Edit .env and fill in required values

# Compile contracts
forge build

# Run all tests
forge test -vvv

# Start the dev server
bun run dev
```

---

## Project Structure

```
arc-sla-protocol/
├── contracts/
│   ├── ArcSLAVault.sol          # Main escrow contract
│   └── test/
│       └── ArcSLAVault.t.sol    # 38 Foundry unit + fuzz tests
├── src/
│   ├── App.tsx                  # Composition root
│   ├── components/              # UI panels and widgets
│   │   ├── Header.tsx           # Brand bar + KPI cards
│   │   ├── CreateTaskPanel.tsx  # Escrow creation form
│   │   ├── TaskList.tsx         # Live task cards + settlement
│   │   ├── TxLedger.tsx         # Transaction audit table
│   │   └── SelfLoopButton.tsx   # 1-click self-loop demo
│   ├── hooks/
│   │   ├── useSLAVault.ts       # Contract read/write hooks
│   │   └── useSelfLoop.ts       # 3-step self-loop pipeline
│   └── contract-config.ts       # ABI + address constants
├── docs/
│   └── assets/
│       └── arcsla-hero-preview.svg
├── .github/
│   └── workflows/
│       └── ci.yml               # Foundry tests + Vite build CI
├── foundry.toml                 # Foundry config
├── ARCHITECTURE.md              # Technical deep-dive
├── SECURITY_AUDIT.md            # 2-round audit report
└── DORAHACKS_SUBMISSION.md      # Hackathon submission kit
```

---

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Production — always deployable |
| `develop` | Integration branch |
| `feat/<name>` | Feature branches |
| `fix/<name>` | Bug fixes |
| `audit/<name>` | Security audit work |

---

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(contract): add multi-task batch settlement
fix(frontend): correct latency slider range validation
test(vault): add fuzz test for edge-case BPS amounts
docs(readme): update deployed contract addresses
chore(ci): add Slither static analysis step
```

---

## Pull Request Process

1. Fork the repository and create a feature branch from `develop`
2. Write or update tests for any contract changes — maintain 100% coverage of new paths
3. Run the full test suite: `forge test -vvv`
4. Run lint and typecheck: `bun run check`
5. Submit a PR to `develop` with a clear description of the change and any security implications
6. All contract changes require a note in `SECURITY_AUDIT.md` if they touch fund flows, access control, or arithmetic

---

## Contract Change Policy

Any change to `ArcSLAVault.sol` that modifies:
- Fund custody logic (deposits, credits, withdrawals)
- Access control (`NotAuthorized`, `TaskNotActive` guards)
- Settlement arithmetic (BPS math, split ratios)
- Status transitions

...must be accompanied by new Foundry tests covering the changed behavior AND a security note explaining why the change does not introduce new risk.

---

## Reporting Security Issues

**Do not open a public issue for security vulnerabilities.**

Email: [security contact — add your email here]

Include:
- Contract function affected
- Attack vector description
- Proof-of-concept Foundry test if possible
- Estimated impact (which funds at risk, under what conditions)

We aim to respond within 48 hours.

---

## Code Style

**Solidity:**
- Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use `/// @notice` NatSpec on all public/external functions and events
- Custom errors over string reverts everywhere
- Checks-Effects-Interactions ordering always

**TypeScript/React:**
- No `any` types
- No `setState` inside `useEffect` — derive from existing state or use `useReducer`
- Floating promise lint rule active — always `void` or `await` async calls
- Tailwind only — no new CSS files

---

## License

By contributing, you agree your contributions are licensed under the MIT License.
