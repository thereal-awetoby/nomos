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

`StableSwap.scash` is an experimental BCH ↔ one configured CashToken category
AMM with a 0.3% constant-product fee, bounded arithmetic, token-container
checks, minimum-output checks, and admin-only liquidity management. The mock
test seeds test tokens, exercises both swap directions, checks reserves and
slippage, and verifies that only the admin can withdraw liquidity. The intended
PUSD category and metadata are not verified or configured in this repository.

It has no LP-share accounting or oracle, and has not been audited or deployed.
See [`docs/BRIDGE_DESIGN.md`](../../docs/BRIDGE_DESIGN.md) and
[`docs/MAINNET_PROOFS.md`](../../docs/MAINNET_PROOFS.md) before treating it as
anything other than a local prototype.

## BCH hash-time-lock prototype

`HashedTimeLock.scash` locks BCH against a SHA-256 hash and a timestamp
deadline. Deploy a fresh instance per swap. The receiver can claim before the
deadline by revealing the preimage; the sender can refund at or after the
deadline. The test exercises
claim and refund paths, wrong preimage/signer refusals, and both sides of the
claim/refund deadline. It runs only on the mock network; it is not an EVM
contract, an other-chain contract, or a deployed cross-chain bridge. A genuine
cross-chain swap needs a separately reviewed contract on the other chain and
carefully ordered timeouts.

## Chipnet demo

```bash
PRIVATE_KEY=<funded chipnet WIF> npm run demo:chipnet
```

Deploys a vault, pays 3,000 sats, then tries 8,000 more the same day and gets
refused by the daily limit.

## Notes

- Built and tested with SolidCash **0.51.1** (beta). The NomosVault compiled
  size is 2,517 bytes, well under the 10,000-byte input limit.
- In SolidCash 0.51, a call that reads `tx.locktime` and sends BCH can't
  auto-derive its payment output, so callers pass it with `.transfer(lock,
  amount)`. That's a supported SDK override; the covenant still checks the
  output matches what the contract computes.
- Locktimes are back-dated 3 hours: nodes reject a transaction whose
  timestamp locktime isn't below the chain's median time past.
