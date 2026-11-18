# Nomos

Pay or withdraw BCH only under rules the chain itself enforces.
Violate → refuse on-chain. Obey → pay + receipt.

Built for BCH BLAZE 2026 · [Live demo](https://nomos.asgaya.org/) · EMBER2026 votes: `bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h`

## What it is

Nomos is a spend mandate for Bitcoin Cash. Your BCH sits in a CashScript
covenant, and the rules you set (a daily limit, an allowlist, an agent key)
are checked by every node on the network, not by a server or by the app.
A payment that breaks the rules is not a transaction anyone can mine.

That makes it safe to hand spending power to someone else, including an AI
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

## SolidCash edition

`contracts/solidcash/` has the same vault written in
[SolidCash](https://solidcash.org), Solidity syntax for Bitcoin Cash. There,
`spentToday` is a plain state variable and the compiler generates the NFT
covenant; BCH sits in a satoshi container. Fourteen mock-network checks (real
BCH VM) cover vault payments, refusals, allowlist, day reset, deposit, and
rescue, with refusals failing at their exact `require`. The suite also tests
the StableSwap and BCH-only HTLC prototypes on the mock network. A chipnet demo
script is included. Details in
[`contracts/solidcash/README.md`](contracts/solidcash/README.md).

## StableSwap — BCH ↔ PUSD AMM

`contracts/solidcash/StableSwap.scash` is an experimental BCH ↔ one configured
CashToken-category pool using a constant-product quote and a proposed 0.3% fee.
The implementation bounds arithmetic, checks the pool's token-container
reserves and incoming token amounts, enforces caller-supplied minimum outputs,
and restricts liquidity changes to its configured administrator. It has no LP
shares, so it is not a permissionless or production-ready market. The intended
PUSD category and its metadata have not been verified or configured here.

The mock-network test uses seeded test tokens in the BCH VM to cover both swap
directions, reserve and fee behavior, slippage rejection, and admin-only
liquidity withdrawal. It does not use live BCH or PUSD. The pool has not been
audited or deployed; the UI keeps all swap actions disabled. See
[`docs/BRIDGE_DESIGN.md`](docs/BRIDGE_DESIGN.md) and
[`docs/MAINNET_PROOFS.md`](docs/MAINNET_PROOFS.md).

## BCH hash-time-lock prototype

`contracts/solidcash/HashedTimeLock.scash` is a BCH-only HTLC primitive: the
receiver can claim locked BCH before a timestamp deadline by revealing a
SHA-256 preimage, and the sender can refund at or after the deadline. The mock test
covers claim, refund, wrong preimage/signer, and deadline cases. This contract
is a local prototype, not a deployed bridge; it does not hold PUSD or verify an
other-chain transaction. A real cross-chain flow would also need an independently
reviewed, deployed contract on the other chain, matching hash and timeout
parameters, and operational monitoring. No such integration is present.

## XO template

`xo/nomos.template.json` describes the vault as an [XO](https://xo.cash)
template with four actions: pay (owner or agent), top up, withdraw, and a
two-party emergency rescue. Rescue needs owner **and** co-signer signatures,
which one wallet connection can't provide, and an XO invitation can. The
template does the state math itself (new commitment, remaining today). 14
offline checks with XO's own parser and compiler show every script matches
CashScript byte for byte inside transactions the covenant accepts, and that
an over-limit payment is refused. Details in [`xo/README.md`](xo/README.md).

## Mandate rules

- **Daily limit** — max sats per locktime-derived day (UTC seconds, with the
  same three-hour backdate used for transactions), enforced on-chain
- **Allowlist** — restrict destinations to up to 5 P2PKH addresses (or Nostr names)
- **Agent key** — spend-only access under the same rules
- **Rescue** — emergency sweep with owner + rescue co-signer

## Pay by Nostr name

No more pasting addresses. In **Pay**, type a Nostr identity (`npub…`,
`nprofile…`, `nostr:` link or `name@domain`) instead of a BCH address:

1. The name resolves to a Nostr key through NIP-05 (the person's own domain)
   or straight from the npub. No Nomos server is involved.
2. Nomos reads the BCH address that key published, using the format Paytaca
   and OPTN wallets already write: kind `30078`, `d = paytaca:bch-address`.
3. The event's signature is checked in the browser, so a relay can't swap in
   a different address. If the person removed their address, the newest event
   wins and the payment is blocked.
4. The payment still goes through the covenant, so the daily limit and the
   allowlist apply to Nostr payees too. Allowlist entries can also be Nostr
   names; they're resolved once when you save the mandate.

Receipts show who you paid by name as well as the address.

## Try it

1. Open the [live demo](https://nomos.asgaya.org/) and connect with WizardConnect or a
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
| SolidCash | Vault, StableSwap, and BCH-side HTLC prototypes (mock tests) |
| Frontend | Vite + React + TypeScript, Tailwind |
| Wallets | WizardConnect, WalletConnect v2 (XO) |
| Network | BCH mainnet (chipnet for tests) |

## Known limitations

- **Rescue needs two signatures** (owner + co-signer). A wallet connection
  signs with one key, so in the app rescue only works when both are the same
  key; for separate keys, use the XO template's rescue action.
- **Top-ups and agents.** BCH sent straight to the vault (outside the NFT
  coin) can only be merged by the owner. An agent pays from the main vault
  coin; the owner merges top-ups by paying once or updating the mandate.
- The in-app pay path hasn't yet been run end-to-end with a live wallet; the
  covenant itself is verified by the chipnet tests above.

## UX and features

- The banner identifies the configured BCH network. The vault-creation form
  shows the wallet balance and reports an estimated funding shortfall; vault
  balances can also be refreshed manually and every 30 seconds while connected.
- The vault screen provides copyable addresses and a token-aware top-up
  address/QR code, plus a low-balance notice. Use the token-aware address when
  funding the vault so the NFT is preserved.
- A dark/light theme toggle is available. Vault and WalletConnect QR codes
  adapt to the active theme.
- Activity shows paid/refused counts and total BCH sent; receipts can be
  downloaded as PNG images with clipboard text as a fallback.
- The vault mandate card visualizes today’s effective spend against its daily
  limit, and successful payments show a brief confirmation animation.
- The Bridge route is a disabled preview with Swap, Bridge In, and Bridge Out
  tabs. Mercar and Asgaya are external links only; they are not integrated
  bridge providers. Do not send funds based on this preview.

## Bounty and ecosystem coverage

This table describes code in the repository, not bounty eligibility, judging,
or awards:

| Area | Repository coverage | Status boundary |
|------|---------------------|-----------------|
| BCH BLAZE 2026 | Nomos BCH spend-mandate project and linked chipnet proof | No prize or audit claim |
| Build with XO / Migrate to XO | `xo/nomos.template.json` plus offline parser/compiler checks | Not yet run in XO's live engine |
| SolidCash | Vault, StableSwap, and BCH HTLC contracts with mock-network tests | Prototypes only; no StableSwap/HTLC deployment |
| Stablecoin Bridge ($750 PUSD) | StableSwap and BCH-side HTLC prototypes plus preview UI | No mainnet pool or cross-chain integration |
| Nostr identity | Payee resolution and name labels in the app | No server-side custody or payment processing |
| Community Choice | EMBER2026 vote address listed in the README and banner | No vote result claimed |
| Mercar / Asgaya | External links in the interface | No transaction or bridge integration |

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, package commands, and
  contribution guidelines.
- [`docs/JUDGE_PATH.md`](docs/JUDGE_PATH.md) — local test and UI walkthrough.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — application components,
  routes, contract surfaces, and current scope.
- [`docs/SECURITY.md`](docs/SECURITY.md) — trust boundaries, prototype risks,
  and verification gaps; not an audit.
- [`docs/BRIDGE_DESIGN.md`](docs/BRIDGE_DESIGN.md) — StableSwap and HTLC
  scope, assumptions, and production gaps.
- [`docs/MAINNET_PROOFS.md`](docs/MAINNET_PROOFS.md) — evidence still required
  before any mainnet pool or bridge claim.
- [`contracts/solidcash/README.md`](contracts/solidcash/README.md) — SolidCash
  contracts, mock tests, and chipnet demo.
- [`xo/README.md`](xo/README.md) — XO template structure and offline checks.

## Project structure

```
nomos/
├── contracts/
│   ├── NomosVault.cash          # CashScript spend-mandate covenant
│   ├── solidcash/
│   │   ├── NomosVault.scash     # SolidCash vault edition
│   │   ├── StableSwap.scash     # unaudited BCH/token pool prototype
│   │   ├── HashedTimeLock.scash # BCH-only HTLC prototype
│   │   └── *.test.mjs           # mock-network contract tests
│   └── test/                    # chipnet mint + paid/refused tests
├── frontend/src/
│   ├── pages/                   # Connect, Vault, Pay, Activity, Bridge, …
│   ├── components/              # layout, banner, theme, receipts, gauge, payment success
│   └── lib/                     # wallet, covenant, Nostr, theme, and app types
├── docs/                        # judge path, bridge design, proof checklist
├── xo/                          # XO template + offline checks
└── README.md
```

## Links

- Live demo: https://nomos.asgaya.org/
- Widget Factory deck: TBD
- External BCH ecosystem links: [Mercar](https://www.mercar.app/) · [Asgaya](https://asgaya.org/)
- EMBER2026 votes (CashTokens address): `bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h`

## License

MIT — see [`LICENSE`](LICENSE).
