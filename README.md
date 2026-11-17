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
covenant; BCH sits in a satoshi container. 14 tests on SolidCash's mock
network (real BCH VM) cover paid, refused by limit, refused stranger,
allowlist, day reset, deposit and rescue, each refusal failing on its exact
`require`. A chipnet demo script is included. Details in
[`contracts/solidcash/README.md`](contracts/solidcash/README.md).

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

## Project structure

```
nomos/
├── contracts/
│   ├── NomosVault.cash      # the covenant
│   ├── solidcash/           # same vault in SolidCash (Solidity syntax)
│   └── test/                # chipnet mint + paid/refused tests
├── frontend/
│   └── src/
│       ├── pages/           # Connect, VaultHome, SetMandate, Pay, Activity, Rescue
│       ├── components/      # Banner, Layout, Receipt
│       └── lib/             # contract, wallet, nostr, types
├── xo/                      # XO template + offline checks
└── README.md
```

## Links

- Live demo: https://nomos.asgaya.org/
- Widget Factory deck: TBD
- EMBER2026 votes (CashTokens address): `bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h`

## License

MIT
