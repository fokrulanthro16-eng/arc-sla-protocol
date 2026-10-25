# ArcSLA Protocol — AI-to-AI SLA Escrow

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

AI-to-AI SLA Escrow, Revenue Splitter, and Instant Circuit-Breaker Refund Engine on Arc Testnet.
Locks USDC in escrow, settles with a hardcoded 90%/10% split (provider/treasury) on SLA met, or auto-refunds 100% on breach via a pull-payment model.

## Deployed Contracts

| Contract | Chain | Address |
|---|---|---|
| ArcSLAVault | Arc Testnet (5042002) | 0xdedc6e0d87dc3dd906a7532c0f8946fedbca7057 |
| USDC | Arc Testnet (5042002) | 0x3600000000000000000000000000000000000000 |

Explorer: https://explorer.testnet.arc.io/address/0xdedc6e0d87dc3dd906a7532c0f8946fedbca7057

## Environment Variables

- `VITE_CONTRACT_ADDRESS` — ArcSLAVault deployed contract address

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
