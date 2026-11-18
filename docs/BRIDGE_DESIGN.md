# Nomos bridge and stable-swap design

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

## Not production-ready

`StableSwap.scash` is an experimental mock-network implementation. It has not
been audited or deployed and is not claimed safe for production. Before
deployment, the project must identify and verify the intended PUSD category,
review decimal and supply metadata, independently audit the covenant and
transaction-building path, add
LP ownership/redemption accounting (or clearly limit a custodial pilot), test
adversarial token deposits and fee/dust behavior, and publish a deployment
manifest. The UI intentionally disables swap inputs until those steps are
complete. Do not send funds based on this prototype.

## Test

From `contracts/solidcash`:

```bash
npm ci
npm test
```

`swap.test.mjs` compiles the contract, seeds test CashToken UTXOs, deploys to a
mock network, initializes reserves, executes both swap directions, checks
reserve transitions, exercises slippage rejection, and checks the fee/invariant
math. It uses no live network or funds. A passing mock test is not a security
audit or a mainnet deployment proof.
