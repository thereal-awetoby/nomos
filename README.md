# Nomos

Pay or withdraw BCH only under rules the chain itself enforces.
Violate → refuse on-chain. Obey → pay + receipt.

Built for BCH BLAZE 2026.

## What it is

Nomos is a spend mandate for Bitcoin Cash. Your BCH sits in a CashScript
covenant, and the rules you set (a daily limit, an allowlist, an agent key)
are checked by every node on the network, not by a server or by the app.
A payment that breaks the rules is not a transaction anyone can mine.

That makes it possible to delegate spending power, including to an AI
agent: give it the agent key, and it can pay up to the limit, to the
addresses you chose, and nothing more.

## Proof on chipnet

Run with `contracts/test/vault.test.mjs` against a live chipnet vault
(daily limit 10,000 sats):

| Case | Result |
|------|--------|
| Pay 3,000 sats (under limit) | **Paid** — [`2dac2f0f…`](https://chipnet.chaingraph.cash/tx/2dac2f0f7aa9020bc884bd6a1a871e135ef9ff2989729da233972971b3d77ed2) |
| Pay 7,001 more the same day (10,001 total) | **Refused by the network** — `mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation)` |

The refused transaction was fully signed with a 1,000-sat fee included and
submitted to a chipnet node. The only covenant rule it broke was the daily
limit (`NomosVault.cash` line 45). The node rejected it before inclusion in
a block, so no fee was paid for that transaction.

Vault genesis (state NFT minted into the covenant):
[`5ce59ecf…`](https://chipnet.chaingraph.cash/tx/5ce59ecf85cc26a3ab3b6d3790d8247d53b5dd701fc6978cb462d3e0f7d2173b)

## How it works

```
            ┌───────────────────── NomosVault covenant ─────────────────────┐
  input 0 → │ NFT commitment = spentToday (8 B) ‖ dayMarker (8 B)            │
            │ today = tx.locktime / 86400                                    │
            │ require(spentToday' + amount ≤ dailyLimit)                     │
            │ require(dest ∈ allowlist)            (if enabled)              │
            │ require(output 0 = same contract, same NFT, updated state)     │
            └────────────────────────────────────────────────────────────────┘
  output 0 → vault continues, NFT carries the new spentToday
  output 1 → the payment
```

- **State lives in a CashTokens NFT.** The vault's mutable NFT stores how
  much was spent today. Each spend must re-create the vault with the
  commitment updated, so the limit can't be reset by the spender.
- **Config lives in the contract.** Owner, agent, limit, allowlist and
  rescue key are constructor parameters, so they're part of the address.
- **Changing the rules** (`setMandate`) needs the owner's signature and
  moves the vault to a new address with the new parameters.

## Mandate rules

- **Daily limit** — max sats per locktime-derived day (UTC seconds, with the
  same three-hour backdate used for transactions), enforced on-chain
- **Allowlist** — restrict destinations to up to 5 P2PKH addresses
- **Agent key** — spend-only access under the same rules
- **Rescue** — emergency sweep with owner + rescue co-signer

## Try it

1. Open the live demo (URL TBD) and connect with WizardConnect or a
   WalletConnect wallet (XO).
2. Set a mandate with a low daily limit.
3. Fund the vault and pay under the limit → **Paid**, with a receipt and
   explorer link.
4. Try to pay over the limit → **Refused by Nomos**. The app checks the
   mandate first so you don't waste a fee; the chipnet test above shows the
   chain refuses the same payment if it's broadcast anyway.

## Run locally

```bash
cd frontend
cp .env.example .env      # VITE_BCH_NETWORK=chipnet for testing
npm install
npm run dev
```

Chipnet contract tests (needs a funded chipnet WIF):

```bash
cd contracts
npm install
PRIVATE_KEY=YOUR_CHIPNET_WIF node test/mint-nft.mjs     # create the vault
PRIVATE_KEY=YOUR_CHIPNET_WIF node test/vault.test.mjs   # paid + refused
```

On Windows Command Prompt, replace `YOUR_CHIPNET_WIF` with your WIF (without
angle brackets), then run each Node command:

```bat
set "PRIVATE_KEY=YOUR_CHIPNET_WIF"
node test/mint-nft.mjs
node test/vault.test.mjs
```

## Tech stack

| Layer | Choice |
|-------|--------|
| Contract | CashScript 0.11 covenant + CashTokens NFT state |
| Frontend | Vite + React + TypeScript, Tailwind |
| Wallets | WizardConnect, WalletConnect v2 (XO) |
| Network | BCH mainnet (chipnet for tests) |

## Known limitations

- **Rescue needs two signatures** (owner + co-signer). Current wallet
  connections sign for one key at a time, so rescue isn't usable from the
  app yet.
- **Top-ups and agents.** BCH sent straight to the vault (outside the NFT
  coin) can only be merged by the owner. An agent pays from the main vault
  coin; the owner merges top-ups by paying once or updating the mandate.
- The in-app pay path hasn't yet been run end-to-end with a live wallet; the
  covenant itself is verified by the chipnet tests above.

## Project structure

```
nomos/
├── contracts/
│   ├── NomosVault.cash      # the covenant
│   └── test/                # chipnet mint + paid/refused tests
├── frontend/
│   └── src/
│       ├── pages/           # Connect, VaultHome, SetMandate, Pay, Activity, Rescue
│       ├── components/      # Banner, Layout, Receipt
│       └── lib/             # contract, wallet, types
└── README.md
```

## Links

- Live demo: TBD
- Widget Factory: TBD
- EMBER2026 address: TBD

## License

MIT
