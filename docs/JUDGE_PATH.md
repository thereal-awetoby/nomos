# Judge path

This guide is a fast, reproducible route through the Nomos demo. It separates
what can be verified locally from what would require a live-network proof.

## 1. Run the contract tests

Requirements: Node.js 22 or newer.

```bash
cd contracts/solidcash
npm ci
npm test
```

The SolidCash suite runs `NomosVault` covenant checks and the StableSwap
mock-network test. The latter seeds a PUSD-like CashToken category, deploys the
pool, adds initial liquidity, swaps BCH → PUSD and PUSD → BCH, verifies reserve
updates, and confirms a too-optimistic minimum output is refused.

## 2. Run the wallet UI

```bash
cd frontend
npm ci
npm run dev
```

Connect a BCH wallet to explore the vault screens. The banner shows the
configured BCH network. The theme control switches between dark and light
modes, and Activity receipts can be downloaded as PNG images. The Bridge route,
reached from the banner or a low balance prompt, is intentionally a
non-interactive placeholder: no swap transaction can be submitted from it.

For static validation:

```bash
npm run build
```

## 3. What to inspect

- `contracts/NomosVault.cash` and `contracts/solidcash/NomosVault.scash`:
  spend-mandate rules and covenant tests.
- `contracts/solidcash/StableSwap.scash` and
  `contracts/solidcash/swap.test.mjs`: experimental BCH/PUSD pool and
  mock-network coverage.
- `docs/BRIDGE_DESIGN.md`: bridge/swap scope, assumptions, and safety gaps.
- `docs/MAINNET_PROOFS.md`: mainnet evidence checklist. Empty proof fields mean
  deployment has not been demonstrated here.

A green local build or mock test does not establish that a contract is audited,
deployed, funded, or safe to use with real BCH or PUSD.
