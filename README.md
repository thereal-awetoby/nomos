# Nomos

Spending rules for Bitcoin Cash that every node enforces.

Built for BCH BLAZE 2026 · [nomos.asgaya.org](https://nomos.asgaya.org/) · EMBER2026 votes: `bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h`

## What it is

Nomos is a spend mandate for Bitcoin Cash. Your BCH sits in a CashScript
covenant, and the rules you set (a daily limit, an allowlist, an agent key)
are checked by every node on the network, not by a server or by the app.
A payment that breaks the rules is not a transaction anyone can mine.

That makes it safe to hand spending power to someone else, including an AI
agent: give it the agent key, and it can pay up to the limit, to the
addresses you chose, and nothing more.

## Proof on mainnet

**CashScript vault, run from the Nomos app with Paytaca over WizardConnect.**
A vault was created, paid 2,000 sats under its daily limit, and had its rules
changed by the owner. A signed payment over the limit was sent to a mainnet
node, which rejected it:

```
mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation)
```

The rejected transaction was fully signed with its fee included. The only
covenant rule it broke was the daily limit (`NomosVault.cash` line 45), so no
node relays it and no miner can include it. Transaction links are in
[`docs/MAINNET_PROOFS.md`](docs/MAINNET_PROOFS.md).

**SolidCash vault, 20 Nov 2026** (daily limit 2,000 sats):

| Step | Result |
|------|--------|
| Deploy, 5,000 sats deposited | [`bee48c5f…`](https://blockchair.com/bitcoin-cash/transaction/bee48c5f73f16a9ad83669b4a1350d01e07ebf104d155e2b557837e9fd04113d) |
| Pay 1,000 sats | **Paid** [`93e9fdad…`](https://blockchair.com/bitcoin-cash/transaction/93e9fdadaf3ebc5b5182a5b3dcd527b8ab9c6d8480160276a573b9d7b616aae6) |
| Pay 1,500 more the same day | **Refused** at `NomosVault.scash:43` |
| Rescue the remaining 4,000 sats (owner + co-signer) | [`305c7a47…`](https://blockchair.com/bitcoin-cash/transaction/305c7a47a2721ba1b290782df991b5a99bc1da7553b734d764f53e5f81ff913f) |

### Earlier chipnet test

`contracts/test/vault.test.mjs` against a chipnet vault (limit 10,000 sats):
paid 3,000 sats ([`2dac2f0f…`](https://chipnet.chaingraph.cash/tx/2dac2f0f7aa9020bc884bd6a1a871e135ef9ff2989729da233972971b3d77ed2)),
then a node refused 7,001 more with the same `OP_VERIFY` failure. Vault genesis:
[`5ce59ecf…`](https://chipnet.chaingraph.cash/tx/5ce59ecf85cc26a3ab3b6d3790d8247d53b5dd701fc6978cb462d3e0f7d2173b).

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
the StableSwap and BCH-only HTLC prototypes on the mock network. The vault has
run on mainnet: deployed, paid under its limit, refused over it, then rescued
(transaction links in the SolidCash README). Details in
[`contracts/solidcash/README.md`](contracts/solidcash/README.md).

## StableSwap — BCH ↔ PUSD AMM

`contracts/solidcash/StableSwap.scash` is a prototype BCH ↔ one configured
CashToken-category pool using a constant-product quote and a proposed 0.3% fee.
The implementation bounds arithmetic, checks the pool's token-container
reserves and incoming token amounts, enforces caller-supplied minimum outputs,
and restricts liquidity changes to its configured administrator. It has no LP
shares. The intended PUSD category and its metadata have not been verified or
configured here.

The mock-network test uses seeded test tokens in the BCH VM to cover both swap
directions, reserve and fee behavior, slippage rejection, and admin-only
liquidity withdrawal. It does not use live BCH or PUSD. The pool is not
deployed, and the app does not use it. See
[`docs/BRIDGE_DESIGN.md`](docs/BRIDGE_DESIGN.md) and
[`docs/MAINNET_PROOFS.md`](docs/MAINNET_PROOFS.md).

## Swap PUSD and USDC (Bitcoin Cash and Base)

The **Swap** page (`/bridge`) trades PUSD on Bitcoin Cash for USDC on Base, in
either direction, between two people, with no custodian. It is a hash-time-lock
atomic swap:

1. The offer creator makes a random 32-byte secret and shares only its sha256
   hash, inside an offer link.
2. Each side locks its stablecoin behind that hash: PUSD in
   [`contracts/SwapLock.cash`](contracts/SwapLock.cash) on Bitcoin Cash, USDC in
   [`contracts/evm/SwapLock.sol`](contracts/evm/SwapLock.sol) on Base.
3. The creator claims the other side's funds, which publishes the secret on
   that chain. The counterparty reads it there and claims the creator's funds.
4. The creator's lock refunds after 24 hours and the counterparty's after 12,
   so the creator must claim (revealing the secret) while the counterparty
   still has time to claim.

| | Bitcoin Cash | Base |
|---|---|---|
| Asset | PUSD, category `2469acc5…2544`, 2 decimals | USDC `0x8335…2913` (Circle), 6 decimals |
| Lock | `SwapLock.cash`: `claim(sig, secret)` checks `sha256(secret)` and the recipient's signature; `refund(sig)` after `tx.time` passes the deadline | `SwapLock.sol`: `lock`, `claim(secret)` (anyone may submit; tokens go to the recipient), `refund` after the deadline |
| Wallet | Paytaca over WizardConnect | Browser wallet (EIP-1193) or WalletConnect |

Both contracts were checked before deployment. `SwapLock.cash` (compiled with
cashc 0.11.5) was run in the BCH VM through CashScript's mock network: a claim
with the right secret and key passes; a wrong secret, the wrong key, an early
refund and a refund by the recipient fail at their exact `require`.
`SwapLock.sol` (solc 0.8.24) was run on a local Foundry node against a mock
USDC: lock, reuse of a hash, wrong secret, early and late claims, third-party
claim, reading the secret back from the `Claimed` event, and refund.

Each swap needs a counterparty; Nomos runs no pool or market maker. Offers can
be found through Mercar or any chat and are completed on this page. One person
can also play both sides with two wallets. Mainnet swap transactions are listed
in [`docs/MAINNET_PROOFS.md`](docs/MAINNET_PROOFS.md).

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
an over-limit payment is refused.

A live run through XO's engine on chipnet created the vault (the genesis
transaction was accepted by the network). The pay and rescue steps could not
finish because XO's Electrum library rejects valid chipnet block headers that
use the test network's minimum-difficulty rule. Details in
[`xo/README.md`](xo/README.md) and [`xo/REPRODUCE.md`](xo/REPRODUCE.md).

## Rules

- **Daily limit**: most sats per locktime-derived day (UTC seconds, with the
  same three-hour backdate used for transactions), enforced on-chain.
- **Allowlist**: optionally restrict payments to up to 5 P2PKH addresses
  (entered as addresses or Nostr names).
- **Agent key**: a second key that can pay under the same rules, nothing more.
- **Rescue key**: with the owner, moves the whole vault in an emergency.

## Pay by Nostr name

No more pasting addresses. In **Pay**, type a Nostr identity (`npub…`,
`nprofile…`, `nostr:` link or `name@domain`) instead of a BCH address:

1. The name resolves to a Nostr key through NIP-05 (the person's own domain)
   or straight from the npub. No Nomos server is involved.
2. If the key has a proven link (below), Nomos pays the linked address and
   shows "Linked by both keys" with the anchor transaction. Otherwise
   it reads the address the key published, in the format Paytaca and OPTN
   wallets already write: kind `30078`, `d = paytaca:bch-address`, signed by
   the Nostr key only. A setting in Pay allows linked addresses only.
3. The event's signature is checked in the browser, so a relay can't swap in
   a different address. If the person removed their address, the newest event
   wins and the payment is blocked.
4. The payment still goes through the covenant, so the daily limit and the
   allowlist apply to Nostr payees too. Allowlist entries can also be Nostr
   names; they're resolved once when you save the rules.

Receipts show who you paid by name as well as the address, and the anchor
transaction and claim event when the address was linked.

## Linking a BCH address to a Nostr key

The lookup above trusts whatever address a Nostr key publishes. A link goes
further: both keys sign, each on its own network, and anyone can check it
without Nomos. Create, verify and use one on the **Nostr Identity** page.

| Half | Signed by | Where it lives | Content |
|------|-----------|----------------|---------|
| BCH anchor | The BCH address's key | A BCH transaction from the address to itself | `OP_RETURN "NOMOSID1" <32-byte Nostr pubkey>` |
| Nostr claim | The Nostr key (NIP-07 signer) | Nostr relays, NIP-39 kind `10011` | `["i", "bch:<cashaddr without prefix>", "<anchor txid>"]` |

The BCH half is a transaction because WizardConnect wallets sign transactions,
not messages. The two keys stay separate: neither signs for the other network.

**Verifying a link** from an npub, a NIP-05 name or a BCH address:

1. Query relays for kind `10011` events, by author or by the `i` tag (relays
   index it, so a BCH address finds its Nostr key). Keep the newest event per
   key and check its signature.
2. For each `bch:` claim, fetch the anchor transaction from a BCH node. It must
   carry `NOMOSID1` and this Nostr key in an `OP_RETURN`, and one of its inputs
   must be spent by the claimed address's public key. The node only relays
   transactions with valid signatures, so this shows the address's owner made it.
3. The link holds only when both halves name each other.

**Authenticating** a user of a linked identity is challenge-response, with
either key:

- Nostr: the user signs a kind `22242` event with tag `["challenge", <nonce>]`.
  The verifier checks the signature, the linked pubkey, the nonce and that the
  event is under 10 minutes old.
- BCH: the wallet signs, without broadcasting, a transaction from the linked
  address to itself carrying `OP_RETURN "NOMOSAUTH" <nonce>`. The verifier
  checks the nonce, that every input is spent by the linked address, and runs
  the transaction through libauth's BCH virtual machine with its source outputs.
  Nothing is sent; the signed transaction only pays the address back to itself.

Nomos hands out each response with the link it claims (address, npub,
anchor txid). Another app checks it against the challenge it issued, then
fetches the claim from relays and the anchor from a BCH node again, with no
call to Nomos. The **Check someone's signed response** panel on
`/identity` does this in the browser.

A link can be shared as `nomos.asgaya.org/identity?verify=<npub, name or
address>`, which runs every check in the visitor's browser. The Nostr key can
remove a link by republishing its identity list without the claim.

The full protocol, including the response format, removal, rotation and what
a link does not prove, is in
[`docs/IDENTITY_PROTOCOL.md`](docs/IDENTITY_PROTOCOL.md). The verification
code is `frontend/src/lib/identity.ts`, with the Nostr side in
`frontend/src/lib/nostr.ts` and the BCH side in `frontend/src/lib/contract.ts`.

## Try it

1. Open [nomos.asgaya.org](https://nomos.asgaya.org/) and choose **Open app**.
   Connect Paytaca with WizardConnect, or a WalletConnect wallet.
2. Create a vault with a small deposit and a low daily limit.
3. Pay under the limit. The receipt links to the transaction.
4. Try to pay more than the whole daily limit. The app refuses before your
   wallet signs, and **Check with a node** opens the proof checker, which signs
   that payment and sends it to a node so you can see the network reject it.

No wallet? The [simulator](https://nomos.asgaya.org/simulate) shows the rules
without one.

## Check a refusal (`/proof`)

The proof checker asks the connected wallet to sign a payment that breaks a
rule that cannot change later (more than the whole daily limit, or an address
outside the allowlist), then sends it to a BCH node and saves the node's
answer in this browser. It can also send signed transaction hex without a
wallet.

Sending is real: a node that accepts a transaction relays it, and anyone with
the signed hex can rebroadcast it. A node's rejection is its answer at that
moment, not a record of chain state, and a script failure does not say which
input failed.

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
| Contract | CashScript 0.11 covenant with CashTokens NFT state |
| SolidCash | Vault edition (run on mainnet); StableSwap and HTLC prototypes (mock tests) |
| Swap | `SwapLock.cash` on Bitcoin Cash, `SwapLock.sol` on Base |
| Frontend | Vite, React, TypeScript, Tailwind |
| Wallets | Paytaca over WizardConnect, WalletConnect v2; any EVM wallet for Base |
| Network | BCH mainnet (chipnet for tests) |

## Known limitations

- **Real BCH on mainnet.** Start with a small amount.
- **Rescue needs two signatures** (owner + co-signer). A wallet connection
  signs with one key, so in the app rescue only works when both are the same
  key; for separate keys, use the XO template's rescue action.
- **Top-ups and agents.** BCH sent straight to the vault (outside the NFT
  coin) can only be merged by the owner. An agent pays from the main vault
  coin; the owner merges top-ups by paying once or updating the rules.
- **Swaps need a counterparty.** Nomos runs no pool or market maker.
- **Nostr lookups** depend on public relays, which can be slow or return
  stale results.

## UX and features

- **Landing page** (`/`): what Nomos is, how it works, the mainnet
  transactions and an FAQ. **Open app** starts at `/connect`.
- **Vault**: balance, the vault and token-aware deposit addresses with QR codes,
  today's spending against the limit, and a seven-day chart.
- **Pay**: checks each payment against the rules as you type, pays addresses or
  Nostr names, and saves a receipt.
- **Rules**: create the vault or change its limit, allowlist, agent key and
  rescue key.
- **Activity**: every payment, refusal and vault change, each with a receipt
  you can save as an image, copy or share.
- **Proof checker**, **Simulator**, **Nostr identity** and **Swap** work as
  described above; the simulator and identity checks need no wallet.
- Light and dark themes, bottom tabs on phones, and keyboard shortcuts on
  desktop (press `?`).

## Bounty and ecosystem coverage

| Area | What is in the repository | Limits |
|------|---------------------------|--------|
| BCH BLAZE 2026, Mainnet Track | The Nomos app; the CashScript vault created, paid and updated on mainnet from Paytaca, and a signed over-limit payment rejected by a mainnet node | Real BCH; start with a small amount |
| Best SolidCash Application | Vault edition run on mainnet (deploy, pay, refusal, rescue); StableSwap and HTLC prototypes with mock tests | StableSwap and HTLC not deployed |
| Decentralized Identity | BCH and Nostr link signed by both keys (on-chain anchor plus NIP-39 claim), shareable verify links, challenge-response login that other apps can check, pay and allowlist by linked identity; protocol in [`docs/IDENTITY_PROTOCOL.md`](docs/IDENTITY_PROTOCOL.md) | Relays may withhold results |
| Stablecoin Bridge | PUSD (Bitcoin Cash) and USDC (Base) atomic swap in both directions: `SwapLock.cash`, `SwapLock.sol` and the Swap page | Peer-to-peer; each swap needs a counterparty |
| Build with XO / Migrate to XO | `xo/nomos.template.json` with 14 offline checks against CashScript; chipnet genesis accepted through XO | Live pay and rescue blocked by XO's Electrum header check on chipnet ([`xo/REPRODUCE.md`](xo/REPRODUCE.md)) |
| Community Choice | EMBER2026 vote address on the landing page, in the app banner and here | — |

## Documentation

- [`docs/JUDGE_PATH.md`](docs/JUDGE_PATH.md): the fastest way through the app and the tests.
- [`docs/MAINNET_PROOFS.md`](docs/MAINNET_PROOFS.md): every mainnet transaction, by component.
- [`docs/IDENTITY_PROTOCOL.md`](docs/IDENTITY_PROTOCOL.md): the BCH and Nostr
  identity link: formats, verification, challenge-response, removal.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): routes, modules and contracts.
- [`docs/SECURITY.md`](docs/SECURITY.md): trust boundaries and known risks.
- [`docs/BRIDGE_DESIGN.md`](docs/BRIDGE_DESIGN.md): the PUSD and USDC swap, and
  the earlier StableSwap and HTLC prototypes.
- [`contracts/solidcash/README.md`](contracts/solidcash/README.md): SolidCash
  contracts, mock tests and the mainnet run.
- [`xo/README.md`](xo/README.md) and [`xo/REPRODUCE.md`](xo/REPRODUCE.md): the
  XO template, offline checks and the live chipnet attempt.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): setup and package commands.

## Project structure

```
nomos/
├── contracts/
│   ├── NomosVault.cash          # CashScript spend-mandate covenant
│   ├── solidcash/
│   │   ├── NomosVault.scash     # SolidCash vault edition
│   │   ├── StableSwap.scash     # BCH/token pool prototype
│   │   ├── HashedTimeLock.scash # BCH-only HTLC prototype
│   │   └── *.test.mjs           # mock-network contract tests
│   ├── SwapLock.cash            # PUSD side of the swap
│   ├── evm/SwapLock.sol         # USDC side of the swap (Base)
│   └── test/                    # chipnet mint + paid/refused tests
├── frontend/src/
│   ├── pages/                   # Landing, Connect, VaultHome, SetMandate (Rules), Pay,
│   │                            # Activity, Proof, Rescue, Bridge (Swap), Identity,
│   │                            # Simulate, Architecture
│   ├── components/              # layout, banner, tabs, receipts, identity link
│   └── lib/                     # wallet, covenant, Nostr, identity, swap, Base, links
├── docs/                        # judge path, mainnet proofs, identity protocol
├── xo/                          # XO template + offline checks
└── README.md
```

## Links

- App: https://nomos.asgaya.org/
- Source: https://github.com/thereal-awetoby/nomos
- Get BCH peer to peer: [Mercar](https://mercar.asgaya.org/) · [Asgaya](https://asgaya.org/)
- EMBER2026 votes (CashTokens address): `bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h`

## License

MIT — see [`LICENSE`](LICENSE).
