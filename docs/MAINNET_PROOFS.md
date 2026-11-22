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

## SolidCash hash-time-lock, 22 Nov 2026

Run with `contracts/solidcash/htlc-demo.mjs mainnet` (see the
[SolidCash README](../contracts/solidcash/README.md#hash-time-lock-and-stableswap-runs)).
The sender is `bitcoincash:qrx2q58hue6zw2nqeffqcdsycm56j3y7s5dwzcddew`. The
receiver, `bitcoincash:qrdmakng5ywtnwkhqfnxfm9gujunx3a6ugev0t8n5d`, is a key
derived from the sender's, so one run signs both sides. Each lock holds 2,000
sats. The app does not use this contract.

| Step | Transaction |
|------|-------------|
| Give the receiver four coins for its call inputs and fees | [`f74c4541…`](https://blockchair.com/bitcoin-cash/transaction/f74c45410827a76dddfb68aa10b3253d8df56b06e1049c8c3b2eb8a63e75cc5c) |
| Lock 1: deploy, claimable for 2 hours | [`b7f2a425…`](https://blockchair.com/bitcoin-cash/transaction/b7f2a425c68b4ab534a86c339e1842c37f60953bea34bc44e5c0a7f46e9f3e34) |
| Lock 1: lock 2,000 sats to the SHA-256 of a secret | [`fcfdfc8c…`](https://blockchair.com/bitcoin-cash/transaction/fcfdfc8c449328679a44db54c1ed89ad73e03643850ac639ff11687433ea5e07) |
| Lock 1: claim with a wrong secret | Refused at `HashedTimeLock.scash:48` (`Wrong preimage`) before broadcast |
| Lock 1: claimed by the receiver with the secret | [`37f3163a…`](https://blockchair.com/bitcoin-cash/transaction/37f3163aa53a1b1e032d2592c61afd3653d08002aebfd719b43c29d605aca5cc) |
| Lock 2: deploy, its deadline already past | [`de3fb510…`](https://blockchair.com/bitcoin-cash/transaction/de3fb510cbb84407c5360543983f2801d6b6d55f06c7c07997c623efeaa8e346) |
| Lock 2: lock 2,000 sats | [`5e5abdb8…`](https://blockchair.com/bitcoin-cash/transaction/5e5abdb8dac6e175ca60b4972bdd8d620babc1102b27cd637beb3f38c6518ee0) |
| Lock 2: claim after the deadline | Refused at `HashedTimeLock.scash:50` (`Claim window expired`) before broadcast |
| Lock 2: refunded to the sender | [`7d8231c3…`](https://blockchair.com/bitcoin-cash/transaction/7d8231c3b8b43ecd8663ded47df841475eef13d812882d7bbaa6b73d56ebd18f) |
| The receiver's leftover coins back to the sender | [`e224334b…`](https://blockchair.com/bitcoin-cash/transaction/e224334bd6997cd57e56398c531db5b83ae681f064b69b7d188ef4eaace729a3) |

The claim put the secret on chain:
`68207b6e17c3f5c18f854a482735b62cb04bd350e5633b4d4a7e6e231148e628`. Its
SHA-256 is the hash lock 1 was locked to. The run cost 41,923 sats: fees plus
the state outputs SolidCash leaves in each contract.

An earlier attempt the same night stopped after its first lock, because the
receiver had too few coins to pay for its calls: deploy
[`c68557d8…`](https://blockchair.com/bitcoin-cash/transaction/c68557d85af5b75ee161d040934faa4b2132b748d3fa7d4e3fea2e72f811b4d0),
lock [`10a605b1…`](https://blockchair.com/bitcoin-cash/transaction/10a605b146d8f9d6627a9b696a335f2a21049a61e1b83d790710b716b88fd707).
Its 2,000 sats stay in that contract.

## SolidCash StableSwap, 22 Nov 2026

Run with `contracts/solidcash/swap-demo.mjs mainnet`, with a test token minted
for the run: category
`0ba2e9bc43181a8d681ca451db75be6f9d44516017b03d052675a629123fb89b`, not PUSD
and of no value. The wallet,
`bitcoincash:qrx2q58hue6zw2nqeffqcdsycm56j3y7s5dwzcddew`, is the pool's admin
and its only trader. The app does not use this contract.

| Step | Transaction |
|------|-------------|
| Split coins for the mint | [`0ba2e9bc…`](https://blockchair.com/bitcoin-cash/transaction/0ba2e9bc43181a8d681ca451db75be6f9d44516017b03d052675a629123fb89b) |
| Mint 1,000,000 test tokens | [`a2ada84c…`](https://blockchair.com/bitcoin-cash/transaction/a2ada84cfedef1452fbd8e3d21964c9af50d84b65756970ce3f9c9de6e3eb727) |
| Deploy the pool | [`fb745731…`](https://blockchair.com/bitcoin-cash/transaction/fb745731b7a50171e00e689a779b825dd55c2bb4f6cd5b906f684f84ad3984f3) |
| Add 10,000 sats and 1,000,000 tokens | [`b446aa60…`](https://blockchair.com/bitcoin-cash/transaction/b446aa60e0a5b22108ede6d54ecffdb29c5cc4bf659400902bafb1bde20d25e2) |
| Swap 1,000 sats, asking for one token more than the quote | Refused at `StableSwap.scash:43` (`Slippage: PUSD output below minimum`) before broadcast |
| Swap 1,000 sats for 90,661 tokens | [`d3cb2dad…`](https://blockchair.com/bitcoin-cash/transaction/d3cb2dadff5867284e5e2c2a68d9d3b7819425ebfce431d92ade5525f8a8c579) |
| Swap the 90,661 tokens back for 994 sats | [`555c5583…`](https://blockchair.com/bitcoin-cash/transaction/555c55831a526bbd097a8615d7521c137b30738db0c23ef97da46ed7eacd9d74) |
| Withdrawal signed by another key | Not shown in this run: it asked for a 1-sat output, below the dust limit, so the SDK stopped it before the contract's admin check (`StableSwap.scash:115`) ran. `swap.test.mjs` covers that check offline. |
| The admin withdraws 9,006 sats and the 1,000,000 tokens | [`710f8e7f…`](https://blockchair.com/bitcoin-cash/transaction/710f8e7ff11d2d50780839670793af1749cb2d38ed1bcff97de12cd5533099e1) |

The SDK keeps the pool's last 1,000 sats. The run cost 46,279 sats.
