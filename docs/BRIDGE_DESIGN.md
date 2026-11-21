# Nomos bridge and stable-swap design

## Cross-chain swap: PUSD on Bitcoin Cash and USDC on Base

Two people trade PUSD (ParyonUSD, a CashToken) for native USDC on Base without
a custodian, a bridge operator or wrapped tokens. Each side locks its coins
behind the same secret hash; claiming one side publishes the secret that opens
the other. If either side stops, both locks refund their senders. Mainnet
transactions are listed in [`MAINNET_PROOFS.md`](MAINNET_PROOFS.md).

### The contracts

| Chain | Contract | Claim | Refund |
| --- | --- | --- | --- |
| Bitcoin Cash | [`contracts/SwapLock.cash`](../contracts/SwapLock.cash) | the recipient's signature and a secret whose SHA-256 is `secretHash` | the sender's signature, with `tx.time >= refundAfter` |
| Base | [`contracts/evm/SwapLock.sol`](../contracts/evm/SwapLock.sol) | anyone submits the secret before `refundAfter`; the tokens go to the recipient and `Claimed(secretHash, secret)` is emitted | anyone, from `refundAfter` on; the tokens go back to the sender |

Both chains hash a 32-byte secret with SHA-256, so the secret from either claim
opens the other lock. The PUSD token ID is
`2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544`
(2 decimals); USDC is Circle's native token on Base,
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals).

### An offer

The person making the offer generates the secret in their browser. The offer
link carries the secret hash, both amounts, both parties' BCH public keys and
Base addresses, both refund times, the SwapLock contract on Base and the Base
block to search for claims from. The secret itself never leaves the maker's
browser until the maker claims.

The maker's lock lasts 24 hours and the counterparty's 12. The maker therefore
has to claim, and reveal the secret, while the counterparty still has at least
12 hours to claim the other side.

| Direction | 1 | 2 | 3 (reveals the secret) | 4 |
| --- | --- | --- | --- | --- |
| Maker gives PUSD | maker locks PUSD on BCH (24 h) | counterparty locks USDC on Base (12 h) | maker claims the USDC | counterparty claims the PUSD with the secret from the `Claimed` event |
| Maker gives USDC | maker locks USDC on Base (24 h) | counterparty locks PUSD on BCH (12 h) | maker claims the PUSD | counterparty claims the USDC with the secret from the BCH claim transaction |

### What the Swap page checks before each step

- **The other side's lock.** On Base: the token is native USDC, the recipient,
  amount and refund time are the ones in the offer. On Bitcoin Cash: the lock
  address follows from the offer's keys, hash and refund time, and holds at
  least the agreed PUSD. Locking and claiming stay disabled until these match.
- **The Base contract itself.** An offer names its SwapLock contract, so the
  page compares that address's code (`eth_getCode`) with the audited runtime
  bytecode before it reads a lock from it, approves USDC to it or claims on it.
  A look-alike contract that reports fake locks is refused.
- **Timing.** USDC is not locked within 2 hours of its refund time. A maker
  claiming PUSD is told to do it at least an hour before the counterparty's
  refund time, and BCH refunds are offered an hour after theirs, because BCH
  time locks follow median time past, which trails the clock.

### If something goes wrong

- The counterparty never locks: the maker refunds after 24 hours.
- The maker never claims: the counterparty refunds after 12 hours and the
  maker after 24.
- The maker claims: the secret is public on that chain, so the counterparty
  can claim at any time before the maker's refund opens, from another device
  if need be.
- The secret is kept in the maker's browser storage. Clearing it before
  claiming leaves only the refunds.

### Tested

- `contracts/test/swaplock.test.mjs` (BCH VM, 8 checks): the shipped artifact
  is what cashc 0.11.5 builds from source; the recipient claims with the right
  secret; a wrong secret, another key, an early refund and a stranger's refund
  fail; fees for the app's claim and refund transactions are above 1 sat/byte.
- `contracts/evm/test/swaplock.test.mjs` (local EVM with a mock USDC, 29
  checks): the shipped creation and runtime bytecode are byte-for-byte what
  solc 0.8.24 builds from source; every selector and the event topic hard-coded
  in `frontend/src/lib/evm.ts` are right; lock, claim and refund work and every
  guard reverts (no approval, reused hash, wrong secret, expired claim, early
  refund, double claim).

### Limits

- A swap needs a counterparty; Nomos runs no market maker and sets no price.
- The Base side needs a little ETH for gas.
- Locks on Base are keyed by secret hash, so someone who sees a lock in the
  mempool can take that hash first. No funds are at risk; the maker starts a
  new offer.

The rest of this document covers the earlier same-chain StableSwap and
BCH-only HTLC prototypes.

## StableSwap prototype

An earlier idea was converting BCH and PUSD (ParyonUSD) on Bitcoin Cash. The
contract prototype is
[`contracts/solidcash/StableSwap.scash`](../contracts/solidcash/StableSwap.scash).
It is a same-chain CashTokens AMM, not a cross-chain bridge: it does not mint,
burn or custody a wrapped asset on another chain, and the app does not use it.

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

## Before deploying the prototypes

`StableSwap.scash` and `HashedTimeLock.scash` are prototypes tested on a mock
network; neither is deployed. Before any pool deployment, the project must identify and
verify the intended PUSD category, review decimal and supply metadata, review
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
in the BCH VM without live network access or funds.
