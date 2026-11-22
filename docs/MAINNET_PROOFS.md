# Mainnet proofs

Every Nomos transaction on Bitcoin Cash mainnet (and Base, for the swap),
by component. Each link opens the transaction on a public explorer.

## CashScript vault (Nomos app, Paytaca over WizardConnect), 21 and 22 Nov 2026

Daily limit 1,000 sats. Vault address
`bitcoincash:p0e4xanccaweute4m9ft280fk38tp05v36kz0xplhk0vmtf3lnx3z2g44gp8d`,
created and funded from `bitcoincash:qpqrel837enktgz3vanchsf7uapj883ruy76h8h7jw`.

| Step | Transaction |
|------|-------------|
| Create the vault with 10,000 sats | [`35355e91…`](https://blockchair.com/bitcoin-cash/transaction/35355e91cc2361dabcd7fc7517c8522f498ce78bd181c819a1ddeaa47cb83abb) |
| Pay 1,000 sats, the whole day's limit | [`5c8aaa04…`](https://blockchair.com/bitcoin-cash/transaction/5c8aaa0479398235d27395e65baaededb404b2296fdf17dc71b9bd61daab7520) |
| Pay 1,000 more the same day | Refused by the app before signing: 0 sats left that day |
| Pay 5,000 more, signed and sent anyway | Rejected by a mainnet node (below) |
| Owner closes the vault (22 Nov): 6,458 sats back to the owner's address, the state NFT to its token address | [`17db1d6d…`](https://blockchair.com/bitcoin-cash/transaction/17db1d6d6bd7fccde2b4b5be401935f681a32c7ca9a4a47188c6aa7f85c6ab34) |

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

### The same owner's next vault, 22 Nov 2026

After the close, the owner created a vault with the same rules. The same rules
give the same address as above, and the new vault carries a new state NFT
(category
`638886b6b32cabbc73ec11c83b8e2fde39aed2d01e366e5d7b582081c3bc4405`).

| Step | Transaction |
|------|-------------|
| Create the vault with 10,000 sats, daily limit 1,000 sats | [`dc438a43…`](https://blockchair.com/bitcoin-cash/transaction/dc438a4309c375fa109d68e26061871108ca1e991057e5f30fa4e662ad0ed7e7) |
| Pay 1,000 sats, the whole day's limit | [`9abc77b6…`](https://blockchair.com/bitcoin-cash/transaction/9abc77b6e5eaad547a931600b8ea986aba3b24e5e61b2d6bc8122aafdf397cbc) |
| Owner raises the daily limit to 2,000 sats. The vault's 7,508 sats move to its new address, `bitcoincash:r0s32z6a0l90v9weyq3yexnmq7csv9az2srywjt785ag07zfdwwvzxcv0l5tw`, and the day's spending starts again from zero | [`fe184c1f…`](https://blockchair.com/bitcoin-cash/transaction/fe184c1f3d20276ec11be996d2294ace83639af77f4a61447852f5b4e11c6eb8) |
| Pay 1,000 sats to `npub1lx04…c5u5rv`, resolved to its linked address (below) | [`02c712c8…`](https://blockchair.com/bitcoin-cash/transaction/02c712c842800fa4f736ad593fe2b147be62f4a278d607ee4bfd941323e110d6) |

## SolidCash vault, 20 Nov 2026

Daily limit 2,000 sats. Run with `contracts/solidcash/demo.mjs mainnet`.

| Step | Transaction |
|------|-------------|
| Deploy, 5,000 sats deposited | [`bee48c5f…`](https://blockchair.com/bitcoin-cash/transaction/bee48c5f73f16a9ad83669b4a1350d01e07ebf104d155e2b557837e9fd04113d) |
| Pay 1,000 sats | [`93e9fdad…`](https://blockchair.com/bitcoin-cash/transaction/93e9fdadaf3ebc5b5182a5b3dcd527b8ab9c6d8480160276a573b9d7b616aae6) |
| Pay 1,500 more the same day | Refused at `NomosVault.scash:43` before broadcast |
| Rescue the remaining 4,000 sats (owner + co-signer) | [`305c7a47…`](https://blockchair.com/bitcoin-cash/transaction/305c7a47a2721ba1b290782df991b5a99bc1da7553b734d764f53e5f81ff913f) |

## PUSD and USDC swap

`SwapLock.sol` runs on Base at
[`0xe366dae0ccd2cfab7fc311652d9d4b48c82c1446`](https://basescan.org/address/0xe366dae0ccd2cfab7fc311652d9d4b48c82c1446),
deployed from the Swap page on 22 Nov 2026. The page compares the code at that
address with the runtime bytecode of `contracts/evm/SwapLock.sol` before it
uses it, and showed that it matches. The site uses this contract by default.

| Step | Transaction |
|------|-------------|
| Deploy `SwapLock.sol` on Base | [`0x82b1e501…`](https://basescan.org/tx/0x82b1e50182fd6383bff76df08258a31fbd08fe9478558c17581adef43569e74f) |
| PUSD to USDC: lock PUSD, lock USDC, claim USDC, claim PUSD | pending |
| USDC to PUSD: lock USDC, lock PUSD, claim PUSD, claim USDC | pending |

## BCH and Nostr identity link

Nostr key `npub1lx04uta90k4ytqnuxrd9pt7u9hjrnhv5zgpmr4jtm8afxdwhp37sc5u5rv`,
linked to `bitcoincash:qpqrel837enktgz3vanchsf7uapj883ruy76h8h7jw`.

| Step | Proof |
|------|-------|
| First BCH anchor transaction (`OP_RETURN "NOMOSID1" <Nostr key>`), signed by the address, 21 Nov | [`8cd9f453…`](https://blockchair.com/bitcoin-cash/transaction/8cd9f453ae7f6ce506805136700a17f7cd87341f29d1857c7f4ce7c4729359ae) |
| Current BCH anchor transaction, the one the key's identity list names now | [`1e46c9d3…`](https://blockchair.com/bitcoin-cash/transaction/1e46c9d3159429c1cdf3c995011cf2e999fe5441c0889a2d8e0cd689dcd404f4) |
| NIP-39 claim (kind 10011), signed by the Nostr key | The 21 Nov claim was event `4cfe0756ee885e3b7fe2d176c1aa6a5a33af2457c8c69c21ba858c3fd560e4a3`; the current claim names the current anchor |
| Payment to the npub, resolved to the linked address, from the vault above | [`02c712c8…`](https://blockchair.com/bitcoin-cash/transaction/02c712c842800fa4f736ad593fe2b147be62f4a278d607ee4bfd941323e110d6) |
| Prove it's you, 22 Nov: challenge `953adfe0274963b1090c58e659694c0c` answered with the BCH wallet (Paytaca over WizardConnect) and checked on the site: Authenticated, with the signature, the Nostr claim and the anchor all matching | Off chain: the answer is a signed transaction carrying the challenge, never broadcast |

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
`ab9567fcb60162284ff2c66e9242a8bf1d198bbe890b1a9b39277e2d564491de`, not PUSD
and of no value. The wallet,
`bitcoincash:qrx2q58hue6zw2nqeffqcdsycm56j3y7s5dwzcddew`, is the pool's admin
and its only trader. The app does not use this contract.

| Step | Transaction |
|------|-------------|
| Split coins for the mint | [`ab9567fc…`](https://blockchair.com/bitcoin-cash/transaction/ab9567fcb60162284ff2c66e9242a8bf1d198bbe890b1a9b39277e2d564491de) |
| Mint 1,000,000 test tokens | [`869b1b51…`](https://blockchair.com/bitcoin-cash/transaction/869b1b51d0e42dc97d3d68745b793eb5c908b9a3c199071a54e120f903af5ca9) |
| Deploy the pool | [`bec65e04…`](https://blockchair.com/bitcoin-cash/transaction/bec65e049335264c528ffca47530332cc1b657f00af06be9b9a8f7f1cff47d64) |
| Add 10,000 sats and 1,000,000 tokens | [`faf0562b…`](https://blockchair.com/bitcoin-cash/transaction/faf0562b56841f0229c152194e3bfb29ecd2ea0523f6780d4d517f70012f12e3) |
| Swap 1,000 sats, asking for one token more than the quote | Refused at `StableSwap.scash:43` (`Slippage: PUSD output below minimum`) before broadcast |
| Swap 1,000 sats for 90,661 tokens | [`b9bb8a81…`](https://blockchair.com/bitcoin-cash/transaction/b9bb8a81ef2748fc3b54047691c533d2325cfec3c62db5eb28ed77be56d1bb75) |
| Swap the 90,661 tokens back for 994 sats | [`8191f08e…`](https://blockchair.com/bitcoin-cash/transaction/8191f08ec59bd0f0239973f0fa647274fa675f31b1208fe20a31276bf9699c74) |
| Withdraw 1,000 sats and 1 token, signed by another key | Refused at `StableSwap.scash:115` (`Admin signature required`) before broadcast |
| The admin withdraws 9,006 sats and the 1,000,000 tokens | [`f7a30992…`](https://blockchair.com/bitcoin-cash/transaction/f7a309925a31b32ec4b78d9834fdcf5bf1a36406072932c156910401198510d2) |

The SDK keeps the pool's last 1,000 sats. The run cost 45,997 sats.

An earlier run the same night went through the same steps with pool
[`fb745731…`](https://blockchair.com/bitcoin-cash/transaction/fb745731b7a50171e00e689a779b825dd55c2bb4f6cd5b906f684f84ad3984f3)
(swaps [`d3cb2dad…`](https://blockchair.com/bitcoin-cash/transaction/d3cb2dadff5867284e5e2c2a68d9d3b7819425ebfce431d92ade5525f8a8c579)
and [`555c5583…`](https://blockchair.com/bitcoin-cash/transaction/555c55831a526bbd097a8615d7521c137b30738db0c23ef97da46ed7eacd9d74),
withdrawal [`710f8e7f…`](https://blockchair.com/bitcoin-cash/transaction/710f8e7ff11d2d50780839670793af1749cb2d38ed1bcff97de12cd5533099e1)).
Its withdrawal signed by another key asked for a 1-sat output, below the dust
limit, so the SDK stopped it before the contract's admin check ran. The script
now asks for 1,000 sats, and the run above shows the check.
