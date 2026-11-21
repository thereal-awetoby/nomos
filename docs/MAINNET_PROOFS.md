# Mainnet proofs

Every Nomos transaction on Bitcoin Cash mainnet (and Base, for the swap),
by component. Each link opens the transaction on a public explorer.

## CashScript vault (Nomos app, Paytaca over WizardConnect), 21 Nov 2026

Daily limit 1,000 sats. Vault address
`bitcoincash:p0e4xanccaweute4m9ft280fk38tp05v36kz0xplhk0vmtf3lnx3z2g44gp8d`,
created and funded from `bitcoincash:qpqrel837enktgz3vanchsf7uapj883ruy76h8h7jw`.

| Step | Transaction |
|------|-------------|
| Create the vault with 10,000 sats | [`35355e91…`](https://blockchair.com/bitcoin-cash/transaction/35355e91cc2361dabcd7fc7517c8522f498ce78bd181c819a1ddeaa47cb83abb) |
| Pay 1,000 sats, the whole day's limit | [`5c8aaa04…`](https://blockchair.com/bitcoin-cash/transaction/5c8aaa0479398235d27395e65baaededb404b2296fdf17dc71b9bd61daab7520) |
| Pay 1,000 more the same day | Refused by the app before signing: 0 sats left that day |
| Pay 5,000 more, signed and sent anyway | Rejected by a mainnet node (below) |
| Owner changes the rules (vault moves to a new address) | pending: to be added |

After the payment, the vault's state NFT carries the commitment
`e8030000000000002a51000000000000`: 1,000 sats spent (`e803…`, little-endian)
on day 20,778 (`2a51…`), which is 21 November 2026 and the day of the
payment's locktime (1,795,256,677 ÷ 86,400).

Over-limit payment: 5,000 sats, signed in the wallet and sent to a mainnet node
on 21 Nov 2026 at 13:27:10 UTC, which rejected it with
`mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation) (code 16)`.
The signed transaction, `779086218792f5d729ea8665cf21331ead490a4a5116db9864da6d974a23e93a`,
was never mined, so it has no explorer page. The node response and the signed
transaction are saved with the receipt in the app.

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

## BCH and Nostr identity link, 21 Nov 2026

Nostr key `npub1lx04uta90k4ytqnuxrd9pt7u9hjrnhv5zgpmr4jtm8afxdwhp37sc5u5rv`,
linked to `bitcoincash:qpqrel837enktgz3vanchsf7uapj883ruy76h8h7jw`.

| Step | Proof |
|------|-------|
| BCH anchor transaction (`OP_RETURN "NOMOSID1" <Nostr key>`), signed by the address | [`8cd9f453…`](https://blockchair.com/bitcoin-cash/transaction/8cd9f453ae7f6ce506805136700a17f7cd87341f29d1857c7f4ce7c4729359ae) |
| NIP-39 claim event (kind 10011), signed by the Nostr key | event id `4cfe0756ee885e3b7fe2d176c1aa6a5a33af2457c8c69c21ba858c3fd560e4a3` |
| Payment to the npub, resolved to the linked address | pending |

Check this link in a browser:
[nomos.asgaya.org/identity?verify=npub1lx04…](https://nomos.asgaya.org/identity?verify=npub1lx04uta90k4ytqnuxrd9pt7u9hjrnhv5zgpmr4jtm8afxdwhp37sc5u5rv).
Anyone can check any link at `https://nomos.asgaya.org/identity?verify=<npub or address>`.

## XO template (chipnet)

XO's engine ran the vault on chipnet (BCH testnet) on 21 November 2026, every
step after genesis an XO invitation. Daily limit 10,000 sats. Chipnet
transaction IDs:

| Step | Transaction |
|------|-------------|
| Pay 3,000 sats | [`130d19ad…`](https://chipnet.chaingraph.cash/tx/130d19ad7b009126f56d1f4c969d5960bed47c4184b0aeb00f4fc5a315be5695) |
| Pay 3,000 sats | [`4236d8ac…`](https://chipnet.chaingraph.cash/tx/4236d8ac82930401c33e4eb639603580e6c8234e680dd9c0ad24307290a915d3) |
| Pay 4,000 sats (10,000 spent that day) | [`ca1df856…`](https://chipnet.chaingraph.cash/tx/ca1df8563f8ac631072d0d5f7c3944fd8d9aa0f0b74daaa851e046a95cdd0515) |
| Pay 5,000 more, tried twice | Refused by the node, `Script failed an OP_VERIFY operation`: the daily limit at `NomosVault.cash:45` |
| Rescue, signed by the owner and the rescuer in two engines | [`ac6fa394…`](https://chipnet.chaingraph.cash/tx/ac6fa39439fd4486b6dae6984e2e727a47e909f3ec4986819cbb7434adcbbfb1) |

`npm run replay` in `xo/` rebuilds the saved transactions from their XO
invitations and checks them in the BCH VM, offline; see
[`xo/REPRODUCE.md`](../xo/REPRODUCE.md#results). The first attempt, before
the template fix, created an earlier vault: genesis
[`d73393f2…`](https://chipnet.chaingraph.cash/tx/d73393f2355f97bf98f2c8827f5e6ddf2b8d76756e27369d1b5f460c70db2b66).

## SolidCash hash-time-lock and StableSwap

Both have mock-network tests and a script for a live run
(`contracts/solidcash/htlc-demo.mjs` and `swap-demo.mjs`, see the
[SolidCash README](../contracts/solidcash/README.md#hash-time-lock-and-stableswap-runs)).
Their mainnet runs are pending. The app does not use either contract.
