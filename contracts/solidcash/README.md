# Nomos — SolidCash edition

The Nomos vault written in [SolidCash](https://solidcash.org) (Solidity syntax
for Bitcoin Cash). Same mandate as the CashScript covenant in
`../NomosVault.cash`, written the SolidCash way:

- `spentToday` and `dayMarker` are ordinary **state variables**. SolidCash
  stores them in CashToken NFTs and the compiler turns every write into a
  covenant check, so there's no hand-encoded commitment.
- The BCH sits in the contract's **satoshi container**; `pay()` moves it out
  with `this.transfer(...)`.
- Payments emit a `Paid` event (an on-chain NFT record) for receipts.

| Function | Who | Rule |
|---|---|---|
| `pay(to, amount, spenderPk, sig)` | owner or agent | daily limit per UTC day (from `tx.locktime`), optional 5-address allowlist |
| `deposit()` payable | anyone | adds BCH |
| `rescue(to, amount, ownerSig, rescueSig)` | owner + co-signer | bypasses the limit |

## Tests (mock network, real BCH VM)

```bash
npm ci
npm test
```

The suite compiles the vault, StableSwap, and BCH HTLC contracts, then runs
the vault rules plus one StableSwap and one HTLC mock-network test. The vault
test reports 14 checks, including refusals that fail on the exact rule:

```
✓ owner pays 3,000 (under limit)
✓ agent pays 6,000 (total 9,000)
✓ 2,000 more (11,000 > 10,000) refused — failing require in NomosVault:43 (Refused by Nomos: daily limit)
✓ stranger refused — failing require in NomosVault:31 (Not the owner or agent)
✓ next day: 9,000 allowed again
✓ rescue 20,000 (over the limit) with both keys
✓ non-allowlisted payee refused — failing require in NomosVault:46 (Refused by Nomos: destination not allowlisted)
```

## StableSwap prototype

`StableSwap.scash` is a prototype BCH ↔ one configured CashToken category
AMM with a 0.3% constant-product fee, bounded arithmetic, token-container
checks, minimum-output checks, and admin-only liquidity management. The mock
test seeds test tokens, exercises both swap directions, checks reserves and
slippage, and verifies that only the admin can withdraw liquidity. The intended
PUSD category and metadata are not verified or configured in this repository.

It has no LP-share accounting or oracle. `swap-demo.mjs` runs it on a live
network with a test token minted for the run, not PUSD; its mainnet run is in
[`docs/MAINNET_PROOFS.md`](../../docs/MAINNET_PROOFS.md#solidcash-stableswap-22-nov-2026). See [`docs/BRIDGE_DESIGN.md`](../../docs/BRIDGE_DESIGN.md) for what a
real PUSD pool would need.

## BCH hash-time-lock prototype

`HashedTimeLock.scash` locks BCH against a SHA-256 hash and a timestamp
deadline. Deploy a fresh instance per swap. The receiver can claim before the
deadline by revealing the preimage; the sender can refund at or after the
deadline. The test exercises
claim and refund paths, wrong preimage/signer refusals, and both sides of the
claim/refund deadline. `htlc-demo.mjs` runs it on a live network; its mainnet
run is in [`docs/MAINNET_PROOFS.md`](../../docs/MAINNET_PROOFS.md#solidcash-hash-time-lock-22-nov-2026). It is not an EVM contract, an other-chain contract, or a
cross-chain bridge. A genuine
cross-chain swap needs a separately reviewed contract on the other chain and
carefully ordered timeouts.

## Live demo (chipnet or mainnet)

```bash
PRIVATE_KEY=<funded chipnet WIF> npm run demo:chipnet
PRIVATE_KEY=<funded mainnet WIF> npm run demo:mainnet
```

Deploys a vault, pays under the daily limit, tries to pay over it the same day
and is refused by the contract, then rescues the remaining deposit back to the
wallet. On mainnet the limit is 2,000 sats with a 5,000-sat deposit. Deploying
also reserves two state NFTs and a 5,000-sat fee estimate, and each contract call
needs at least two separate coins in the wallet for fees, so fund about 30,000
sats split into a 16,000-sat coin plus a few smaller ones. Unspent funds come back.

### Mainnet run, 20 Nov 2026

| Step | Result |
|------|--------|
| Deploy NomosVault (limit 2,000 sats, 5,000 deposited) | [`bee48c5f…`](https://blockchair.com/bitcoin-cash/transaction/bee48c5f73f16a9ad83669b4a1350d01e07ebf104d155e2b557837e9fd04113d) · category `3ecf733d…` |
| Pay 1,000 sats (under the limit) | **Paid** [`93e9fdad…`](https://blockchair.com/bitcoin-cash/transaction/93e9fdadaf3ebc5b5182a5b3dcd527b8ab9c6d8480160276a573b9d7b616aae6) · `spentToday` = 1,000 on-chain |
| Pay 1,500 more the same day (2,500 > 2,000) | **Refused** at `NomosVault.scash:43`, `Refused by Nomos: daily limit` |
| Rescue the remaining 4,000 sats (owner + co-signer) | [`305c7a47…`](https://blockchair.com/bitcoin-cash/transaction/305c7a47a2721ba1b290782df991b5a99bc1da7553b734d764f53e5f81ff913f) |

The refused payment failed its `require` when the SDK evaluated the transaction
in the BCH VM, so it was never broadcast. A node rejecting a signed over-limit
spend is shown for the CashScript vault in the main README.

### Hash-time-lock and StableSwap runs

```bash
npm run key                                       # a throwaway key: address and WIF, printed once
PRIVATE_KEY=<WIF> node keys.mjs balance mainnet   # what the key and its run's receiver hold
PRIVATE_KEY=<WIF> npm run htlc:mainnet            # claimed with the secret, refunded after the deadline
PRIVATE_KEY=<WIF> npm run swap:mainnet            # test token, liquidity, swaps both ways, withdrawal
PRIVATE_KEY=<WIF> node keys.mjs sweep <your address> mainnet
```

On Windows, `set PRIVATE_KEY=<WIF>` first, then run the commands without the
`PRIVATE_KEY=<WIF>` part.

`htlc-demo.mjs` deploys two locks of 2,000 sats. The receiver is a second key
derived from the wallet's, so one key signs both sides. A contract call spends
some of its signer's coins as inputs and needs more for the fee, so the
receiver gets four 3,000-sat coins first and sends what is left back at the
end. The first lock refuses a wrong secret, then is claimed with the right one;
the second refuses a claim after its deadline, then refunds the sender.

`swap-demo.mjs` mints a test token (a new CashToken category with no value),
deploys the pool, adds 10,000 sats and 1,000,000 tokens, swaps 1,000 sats in and
the tokens back out, sees a quote one token too high and a withdrawal signed by
another key refused, then withdraws the pool. The SDK keeps about 1,000 sats in
the pool on that last withdrawal.

Each run costs about 45,000 sats: network fees plus the state and event outputs
SolidCash leaves in every contract it deploys. Fund one key with 150,000 sats
for both runs and sweep the rest back; the sweep also collects the receiver's
coins if a run stopped early. A refusal counts only when the contract's own
`require` turned the call down with the message the script expects. Anything
else (a call the key could not pay for, a dropped connection, an SDK rule)
prints NOT TESTED and fails the run. `node htlc-demo.mjs mock` and
`node swap-demo.mjs mock` run the same steps offline on the SDK's production
profile: mainnet's dust rules, and every fee paid from the key's own coins.
`npm test` includes them.

Lines starting `STB debug() best-effort error` come from the SDK trying a call
before its fee coins are added. The line after each says what happened.

The scripts keep one connection to `bch.imaginary.cash` open, retry a request
when it drops, and move to `electrum.imaginary.cash` if it keeps dropping.
`ELECTRUM=<host>` puts another server first.

If `npm ci` stalls on `@bitauth/libauth`, git is trying SSH for that GitHub
dependency. This makes it use HTTPS:

```bash
git config --global url."https://github.com/".insteadOf ssh://git@github.com/
```

## Notes

- Built and tested with SolidCash **0.51.1** (beta). The NomosVault compiled
  size is 2,517 bytes, well under the 10,000-byte input limit.
- In SolidCash 0.51, a call that reads `tx.locktime` and sends BCH can't
  auto-derive its payment output, so callers pass it with `.transfer(lock,
  amount)`. That's a supported SDK override; the covenant still checks the
  output matches what the contract computes.
- Locktimes are back-dated 3 hours: nodes reject a transaction whose
  timestamp locktime isn't below the chain's median time past.
