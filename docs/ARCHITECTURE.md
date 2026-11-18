# Nomos Architecture

## Scope

Nomos is a browser application for interacting with Bitcoin Cash spend-mandate
vaults. The repository also contains experimental SolidCash StableSwap and
BCH-side HTLC prototypes. The Bridge route is a nonfunctional preview: no
swap or bridge transaction can be initiated there; its action buttons are
disabled.

## System overview

```text
┌──────────────────────── Browser ───────────────────────────┐
│ React Router pages                                         │
│ Connect · Vault · Mandate · Pay · Activity · Rescue · Bridge│
│ Identity · Simulate · Architecture                         │
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
signatures are requested from the connected wallet. Network selection is
controlled by `VITE_BCH_NETWORK` (`mainnet` or `chipnet`). The `contract.ts`
module uses CashScript's `ElectrumNetworkProvider` to read UTXOs and build or
broadcast transactions. Nostr lookups run client-side but contact external
NIP-05 domains and public relays; event signatures are verified before an
address is used. The Simulator is local-only and does not execute a covenant.

## Frontend routes and modules

| Route | Page | Responsibility |
|---|---|---|
| `/` | `Connect` | Pair a wallet using WizardConnect or WalletConnect. |
| `/vault` | `VaultHome` | Show balance, mandate, funding address, and vault actions. |
| `/mandate` | `SetMandate` | Create a vault or update its owner-configured mandate. |
| `/pay` | `Pay` | Prepare a payment under the current vault rules. |
| `/activity` | `Activity` | Show locally saved receipts and summary counts. |
| `/rescue` | `Rescue` | Present the owner/co-signer emergency path. The current in-app signing flow has limitations for separate keys; see the root README. |
| `/bridge` | `Bridge` | Disabled Swap / Bridge In / Bridge Out preview. |
| `/identity` | `Identity` | Resolve a Nostr identity through external NIP-05/relay services and verify the signed BCH-address event. |
| `/simulate` | `Simulate` | Local illustration of daily-limit and exact-text allowlist rules; no wallet, contract execution, or transaction. |
| `/architecture` | `Architecture` | In-app overview of the system stack, contract surfaces, security boundaries, repository coverage, and validation entry points. |

`WalletContext` coordinates the wallet session, vault configuration, receipts,
and periodic vault refresh. The `wallet.ts` module adapts wallet providers;
`contract.ts` handles BCH covenant interactions; `nostr.ts` resolves Nostr
identifiers and verifies address events. `KeyboardShortcuts` provides optional
single-key navigation that can be disabled from its help palette and does not
intercept keystrokes in editable fields. Wallet configuration and receipts
are stored locally in the browser, not as an application-server database.

## Contract surfaces

| Contract | File | Purpose and current boundary |
|---|---|---|
| NomosVault (CashScript) | `contracts/NomosVault.cash` | BCH spend mandate; mutable spend state is carried by the CashTokens NFT commitment. Chipnet proofs are documented in the root README. |
| NomosVault (SolidCash) | `contracts/solidcash/NomosVault.scash` | SolidCash edition with mock-network tests and a chipnet demo script for the vault. |
| StableSwap | `contracts/solidcash/StableSwap.scash` | Experimental BCH / one configured CashToken-category pool. Admin-only liquidity management; no LP-share accounting. PUSD metadata and deployment are pending. |
| HashedTimeLock | `contracts/solidcash/HashedTimeLock.scash` | BCH-only native-satoshi lock, SHA-256 claim, and timestamp refund prototype. It does not hold PUSD or verify another chain. |

The StableSwap and HTLC tests run compiled contracts on SolidCash's mock BCH
VM. They are not evidence of an audit, a mainnet deployment, or a cross-chain
integration. A real cross-chain flow would require a separate contract on the
other chain and reviewed timeout/recovery behavior.

## Validation entry points

```bash
cd contracts/solidcash
npm ci
npm test
```

The suite builds all three contracts, then runs the vault, StableSwap, and
HashedTimeLock mock-network test scripts. [The XO guide](../xo/README.md)
documents separate offline template checks. The [mainnet proof checklist](MAINNET_PROOFS.md)
tracks evidence still required before deployment.
