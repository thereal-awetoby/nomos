# Mainnet proofs

Every Nomos transaction on Bitcoin Cash mainnet (and Base, for the swap),
by component. Each link opens the transaction on a public explorer.

## CashScript vault (Nomos app, Paytaca over WizardConnect)

| Step | Transaction |
|------|-------------|
| Create the vault | pending: to be added |
| Pay 2,000 sats under the daily limit | pending: to be added |
| Owner changes the rules (vault moves to a new address) | pending: to be added |

Over-limit payment: signed in Paytaca through the proof checker and sent to a
mainnet node, which rejected it with
`mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation)`.
A rejected transaction is never mined, so it has no explorer page; the node
response and the signed transaction are saved in the app's proof checker.

## SolidCash vault, 20 Nov 2026

Daily limit 2,000 sats. Run with `contracts/solidcash/demo.mjs mainnet`.

| Step | Transaction |
|------|-------------|
| Deploy, 5,000 sats deposited | [`bee48c5f…`](https://blockchair.com/bitcoin-cash/transaction/bee48c5f73f16a9ad83669b4a1350d01e07ebf104d155e2b557837e9fd04113d) |
| Pay 1,000 sats | [`93e9fdad…`](https://blockchair.com/bitcoin-cash/transaction/93e9fdadaf3ebc5b5182a5b3dcd527b8ab9c6d8480160276a573b9d7b616aae6) |
| Pay 1,500 more the same day | Refused at `NomosVault.scash:43` before broadcast |
| Rescue the remaining 4,000 sats (owner + co-signer) | [`305c7a47…`](https://blockchair.com/bitcoin-cash/transaction/305c7a47a2721ba1b290782df991b5a99bc1da7553b734d764f53e5f81ff913f) |

## PUSD and USDC swap

| Step | Transaction |
|------|-------------|
| Deploy `SwapLock.sol` on Base | pending |
| PUSD to USDC: lock PUSD, lock USDC, claim USDC, claim PUSD | pending |
| USDC to PUSD: lock USDC, lock PUSD, claim PUSD, claim USDC | pending |

## BCH and Nostr identity link

| Step | Proof |
|------|-------|
| BCH anchor transaction (`OP_RETURN "NOMOSID1" <Nostr key>`) | pending |
| NIP-39 claim event (kind 10011) | pending |

Anyone can check a link at `https://nomos.asgaya.org/identity?verify=<npub or address>`.

## XO template (chipnet)

The live run through XO's engine created the vault on chipnet: genesis
[`d73393f2…`](https://chipnet.chaingraph.cash/tx/d73393f2355f97bf98f2c8827f5e6ddf2b8d76756e27369d1b5f460c70db2b66).
Pay and rescue could not finish; see [`xo/REPRODUCE.md`](../xo/REPRODUCE.md).

## Not deployed

StableSwap and the BCH-only HashedTimeLock (`contracts/solidcash/`) have
mock-network tests only. They are not deployed and the app does not use them.
