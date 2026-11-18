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

The SolidCash suite compiles `NomosVault`, `StableSwap`, and
`HashedTimeLock`, then runs 14 vault checks plus one StableSwap and one HTLC
mock-network test. The pool test seeds a synthetic CashToken category,
initializes reserves, swaps in both directions, checks reserve/fee behavior,
rejects slippage, and exercises admin-only withdrawal. The HTLC test checks
claim and refund with wrong preimage/signer and deadline cases. These run in
the BCH VM through a mock provider; they do not use live BCH or PUSD.

## 2. Run the wallet UI

```bash
cd frontend
npm ci
npm run dev
```

Connect a BCH wallet to explore the vault screens. The banner shows the
configured BCH network. Vault balances can be refreshed manually and are
refreshed periodically while connected; the top-up section includes the
token-aware deposit address and QR. The theme control switches between dark
and light modes; vault and WalletConnect QR codes adapt to the active theme.
Activity shows paid/refused counts and total sent, and receipts can be
downloaded as PNGs with clipboard text as a fallback. The Bridge route has
Swap, Bridge In, and Bridge Out preview tabs, but all transaction actions are
disabled. Mercar and Asgaya are external links only; no pool or cross-chain
transaction can be submitted from the app.

No wallet is needed to explore the `/simulate` page, which is a local-only
illustration of limit and allowlist checks rather than a contract execution.
The `/identity` page also works without a wallet, but contacts the entered
NIP-05 domain when applicable and queries public Nostr relays.

For static validation:

```bash
npm run build
```

## 3. What to inspect

- `contracts/NomosVault.cash` and `contracts/solidcash/NomosVault.scash`:
  spend-mandate rules and covenant tests.
- `contracts/solidcash/StableSwap.scash` and
  `contracts/solidcash/swap.test.mjs`: experimental BCH/token pool and
  mock-network coverage.
- `contracts/solidcash/HashedTimeLock.scash` and
  `contracts/solidcash/htlc.test.mjs`: BCH-only HTLC prototype; not a bridge.
- `docs/BRIDGE_DESIGN.md`: bridge/swap scope, assumptions, and safety gaps.
- `docs/MAINNET_PROOFS.md`: mainnet evidence checklist. Empty proof fields mean
  deployment has not been demonstrated here.

A green local build or mock test does not establish that a contract is audited,
deployed, funded, or safe to use with real BCH or PUSD.
