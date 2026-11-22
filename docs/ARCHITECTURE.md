# Nomos Architecture

## Scope

Nomos is a browser application for Bitcoin Cash spend-mandate vaults, with a
landing page, a peer-to-peer PUSD and USDC swap with Base, and a BCH and Nostr
identity link. The repository also contains SolidCash StableSwap and BCH-side
HTLC prototypes, which the app does not use.

## System overview

```text
┌──────────────────────── Browser ───────────────────────────┐
│ React Router pages                                         │
│ Landing · Connect · Vault · Rules · Pay · Activity · Proof │
│ Rescue · Swap · Identity · Simulate · Architecture         │
│                           │                                │
│                     WalletContext                          │
│              wallet · vault config · receipts               │
│                 /             |              \              │
│          wallet.ts       contract.ts        nostr.ts        │
│       wallet signing   read/build BCH tx   identity lookup  │
│             |                |                  |           │
└─────────────|────────────────|──────────────────|───────────┘
              |                |                  |
        Wallet providers   CashScript SDK     Nostr relays
              |          Electrum provider          |
              |                |          signed events checked
              |                |
              └──────── Bitcoin Cash network ──────┘
                         │
             ┌───────────┴───────────┐
             │ BCH covenant contracts │
             │ NomosVault · prototypes│
             └───────────────────────┘
```

The application has no server that holds or signs user funds. Wallet
signatures are requested from the connected wallet. The network is mainnet
or chipnet: `VITE_BCH_NETWORK` sets the default, and the Mainnet / Chipnet
switch in the header changes it for this browser (`lib/network.ts`). Each
network keeps its own wallet, vaults and history in local storage, and each
wallet sees only the vault its key owns or is the agent of. The `contract.ts`
module uses CashScript's `ElectrumNetworkProvider` to read UTXOs and build or
broadcast transactions.

Over WizardConnect the wallet shares one extended public key per path
(receive, change and, if it has one, DeFi). `lib/hdwallet.ts` derives the
wallet's addresses from them and finds their coins the way an HD wallet does,
path by path until 20 unused addresses in a row, so the app shows the whole
balance. Creating a vault, or the wallet menu's Gather button, merges coins
from several addresses into one coin at the address Nomos works with. Nomos
names the path and index for each input and the wallet signs each with that
key. `frontend/tests/hdwallet.test.ts` checks the scan and the gathering
against an emulated BIP44 wallet and the BCH virtual machine. A WalletConnect
wallet shares a single address, so Nomos uses the coins there. Nostr lookups run client-side but contact external
NIP-05 domains and public relays; event signatures are verified before an
address is used. The Simulator is local-only and does not execute a covenant.

## Frontend routes and modules

| Route | Page | Responsibility |
|---|---|---|
| `/` | `Landing` | What Nomos is, how it works, mainnet transactions, FAQ. |
| `/connect` | `Connect` | Pair a wallet using WizardConnect or WalletConnect. |
| `/vault` | `VaultHome` | Show balance, mandate, funding address, and vault actions. |
| `/mandate` | `SetMandate` | Rules: create a vault or change its limit, allowlist, agent key and rescue key. |
| `/pay` | `Pay` | Prepare a payment under the current vault rules. |
| `/activity` | `Activity` | Show locally saved receipts, node script-failure counts, and a JSON export. |
| `/proof` | `Proof` | Wallet-free signed-transaction checker, optional vault-assisted signing, and browser-local node-check records. |
| `/rescue` | `Rescue` | Present the owner/co-signer emergency path. The current in-app signing flow has limitations for separate keys; see the root README. |
| `/bridge` | `Bridge` | Swap PUSD on Bitcoin Cash and USDC on Base with another person (hash-time locks on both chains), found on a Nostr offer board (`lib/board.ts`) or sent a link. |
| `/identity` | `Identity` | Create and verify BCH and Nostr links, check signed login responses, and look up published addresses. |
| `/simulate` | `Simulate` | Local illustration of daily-limit and exact-text allowlist rules; no wallet, contract execution, or transaction. |
| `/architecture` | `Architecture` | In-app overview of the system stack, contract surfaces, security boundaries, repository coverage, and validation entry points. |

`WalletContext` coordinates the wallet session, vault configuration, receipts,
and periodic vault refresh. The `wallet.ts` module adapts wallet providers;
`contract.ts` handles BCH covenant interactions; `nostr.ts` resolves Nostr
identifiers and verifies address events; `proofs.ts` classifies node rejections
and stores recent results in this browser. Wallet configuration, receipts, and
saved node checks are local browser data, not an application-server database.
`KeyboardShortcuts` provides optional single-key navigation that can be disabled
from its help palette and does not intercept keystrokes in editable fields.

The refusal-proof signing path is separate from the regular broadcasting spend
helper. It re-reads the deployed vault state, signs a transaction that violates
a stable rule, then submits the raw signed hex to the configured Electrum
`blockchain.transaction.broadcast` RPC for a verdict. The public `/proof`
checker accepts arbitrary signed hex, requires no wallet, and can therefore
submit a valid spend as well as a deliberately invalid one. The interface warns
that an accepted transaction may be relayed/mined and that anyone with the hex
can rebroadcast it. A node rejection is not mined/confirmed state: script
failures, missing/spent inputs, other RPC rejections, and transport errors are
presented separately. A reported script failure does not identify which input
script failed or prove that the Nomos covenant rule caused it.

## Contract surfaces

| Contract | File | Purpose and current boundary |
|---|---|---|
| NomosVault (CashScript) | `contracts/NomosVault.cash` | BCH spend mandate; spend state is carried by the CashTokens NFT commitment. Run on mainnet from the app; see `docs/MAINNET_PROOFS.md`. |
| NomosVault (SolidCash) | `contracts/solidcash/NomosVault.scash` | SolidCash edition with mock-network tests; run on mainnet with `demo.mjs`. |
| SwapLock | `contracts/SwapLock.cash`, `contracts/evm/SwapLock.sol` | Hash-time locks for the PUSD and USDC swap; tested in the BCH VM and on a local EVM node. |
| StableSwap | `contracts/solidcash/StableSwap.scash` | Prototype BCH / one configured CashToken-category pool. Admin-only liquidity management; no LP-share accounting. Run on mainnet with a test token; PUSD metadata is not verified. |
| HashedTimeLock | `contracts/solidcash/HashedTimeLock.scash` | BCH-only native-satoshi lock, SHA-256 claim, and timestamp refund prototype, run on mainnet with test amounts. It does not hold PUSD or verify another chain. |

The StableSwap and HTLC tests run compiled contracts on SolidCash's mock BCH
VM. Each prototype has also run on mainnet with test amounts (see
[MAINNET_PROOFS.md](MAINNET_PROOFS.md)); the app uses neither. A real cross-chain flow would require a
separate contract on the other chain and reviewed timeout/recovery behavior.

## Validation entry points

```bash
cd contracts/solidcash
npm ci
npm test
```

The suite builds all three contracts, then runs the vault, StableSwap, and
HashedTimeLock mock-network test scripts. [The XO guide](../xo/README.md)
documents separate offline template checks. [MAINNET_PROOFS.md](MAINNET_PROOFS.md)
lists every mainnet transaction.
