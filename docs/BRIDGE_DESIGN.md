# Nomos bridge and stable-swap design

## Cross-chain swap (live)

PUSD on Bitcoin Cash and USDC on Base are swapped with a hash-time-lock atomic
swap: `contracts/SwapLock.cash`, `contracts/evm/SwapLock.sol` and the Swap page.
See the "Swap PUSD and USDC" section of the README. The rest of this document
covers the earlier same-chain StableSwap and BCH-only HTLC prototypes.

## Scope

The planned bridge surface is for converting BCH and PUSD (ParyonUSD) on
Bitcoin Cash. The first contract prototype is
[`contracts/solidcash/StableSwap.scash`](../contracts/solidcash/StableSwap.scash).
Despite the UI route's “Bridge” label, the contract is a same-chain CashTokens
AMM; it is not a cross-chain bridge and does not mint, burn, or custody a
wrapped asset on another chain.

## Prototype behavior

- BCH ↔ one CashToken category selected at deployment (`pusdCategory`).
- Constant-product quote with a 0.3% fee retained by the pool:
  `amountOut = amountInWithFee × reserveOut / (reserveIn × 1000 + amountInWithFee)`,
  where `amountInWithFee = amountIn × 997`.
- A caller supplies a minimum output; a trade reverts if the quote falls below
  it. The contract checks its stored PUSD reserve against the token-container
  balance and checks incoming PUSD deposits against the resulting token
  container balance.
- Liquidity changes and withdrawals are restricted to the configured admin.
  Deposits after the initial deposit must stay within 1% of the current ratio.
  The prototype does **not** issue LP shares, so the admin currently owns all
  liquidity-management authority.
- Arithmetic is bounded to keep the constant-product intermediate values in
  the signed 64-bit integer range used by the target VM.

## BCH-side HTLC prototype

[`contracts/solidcash/HashedTimeLock.scash`](../contracts/solidcash/HashedTimeLock.scash)
is a separate BCH-only primitive. A sender locks BCH against a SHA-256 hash
and timestamp; the receiver claims before the deadline by revealing the
preimage, while the sender can refund at or after the deadline. It tracks the
BCH explicitly locked through its `lock` method and does not hold PUSD.

This does not verify an event on another chain and is not a bridge. A
cross-chain flow would require a separately implemented and reviewed
counterpart on the other chain, matching hash semantics, safely ordered
refund deadlines, monitoring, and a recovery procedure. No counterpart,
deployment, or end-to-end integration is configured in this repository.

## Not production-ready

`StableSwap.scash` and `HashedTimeLock.scash` are experimental
mock-network implementations. Neither has been independently audited or
claimed as deployed. Before any pool deployment, the project must identify and
verify the intended PUSD category, review decimal and supply metadata, audit
the covenant and transaction-building path, add LP ownership/redemption
accounting (or clearly limit a custodial pilot), test adversarial token
and fee/dust behavior, and publish a deployment manifest. Before a bridge,
the other-chain contract, timeout ordering, monitoring, and end-to-end recovery
must also be reviewed and proven. The UI intentionally disables swap and
bridge actions. Do not send funds based on these prototypes.

## Test

From `contracts/solidcash`:

```bash
npm ci
npm test
```

`swap.test.mjs` seeds test CashToken UTXOs, deploys to a mock network,
initializes reserves, exercises both swap directions, verifies reserve
transitions and slippage rejection, checks fee/invariant math, and tests
admin-only liquidity withdrawal. `htlc.test.mjs` runs claim/refund cases and
checks signer, preimage, and deadline refusals. Both execute compiled covenants
in the BCH VM without live network access or funds. Passing mock tests are not
a security audit, mainnet deployment proof, or cross-chain integration proof.
