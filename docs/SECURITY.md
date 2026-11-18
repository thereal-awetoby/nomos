# Security Model and Limitations

## Status

This document describes the intended boundaries of the current code; it is
not an audit or a security certification. The CashScript vault has documented
chipnet evidence. StableSwap and HashedTimeLock have mock-network tests only;
neither is claimed as audited or deployed. The Bridge transaction actions are
disabled. Do not send real funds to either prototype.

## Trust boundaries

| Component | Boundary |
|---|---|
| BCH covenant validation | Enforces the conditions in the covenant when the covenant UTXO is spent. It does not protect funds after they leave that covenant. |
| Frontend | Builds transactions and displays state, but is not itself the enforcement layer. It may be unavailable, misleading, or compromised. |
| Wallet | Holds keys and authorizes signatures. Users must review wallet prompts and protect their recovery material. |
| Electrum network provider | Supplies UTXO/state data and relays transactions. It can fail, withhold, or return misleading data; BCH consensus validates transactions against the network state. |
| Nostr relays | Can censor or withhold events. The app verifies the event signature before using a published BCH address, but cannot guarantee relay availability or freshness. |
| Browser storage | Wallet configuration and receipts are stored locally and can be cleared or modified. They are not authoritative on-chain records. |

## NomosVault guarantees and limits

The CashScript vault checks owner/agent authorization, a positive spend amount,
timestamp-form transaction locktime, the daily limit derived from the NFT
commitment, and—when enabled—the configured destination allowlist. Its
continuation output must preserve the covenant and NFT lineage while updating
the commitment. These rules apply only to spends through the vault covenant.

Important limits:

- The allowlist is optional. If disabled, the daily limit does not restrict
  which destination receives a valid payment.
- The daily boundary is based on `tx.locktime`; transaction construction uses
  timestamp locktimes subject to network policy. Boundary behavior should be
  reviewed carefully before relying on a particular wall-clock cutoff.
- The owner can authorize `setMandate` to move funds to a new contract with
  changed rules. The mandate is a constraint on spends through the current
  vault, not an irrevocable restriction on the owner.
- The emergency rescue path requires the owner and rescue co-signer and
  bypasses the normal spending limit. Protect both keys and verify recovery
  procedures.
- Once funds leave the vault, Nomos cannot enforce how they are used.

## StableSwap prototype

`contracts/solidcash/StableSwap.scash` is an experimental pool for BCH and one
configured CashToken category. The implementation includes bounded arithmetic,
token-container/reserve consistency checks, minimum-output checks, and
admin-only liquidity operations. However, it has no LP-share accounting or
oracle; the configured PUSD category and metadata are not verified; and it has
no independent audit or deployment proof. Its tests use seeded mock tokens on
the BCH VM. The UI does not submit swaps. These controls do not make the
prototype suitable for production.

## BCH-side HTLC prototype

`contracts/solidcash/HashedTimeLock.scash` locks native BCH, tracks the amount
locked through its `lock` method, permits a SHA-256 preimage claim before a
timestamp deadline, and permits the sender to refund at or after the deadline.
It does not hold PUSD, inspect another chain, or prove an external transaction.
The mock-network test covers claim/refund and refusal cases, but is not a
public-network or cross-chain test. A cross-chain protocol would additionally
need a separately implemented and reviewed contract on the other chain,
compatible hash semantics, safely ordered timeouts, monitoring, and recovery
procedures. None is integrated here.

## Verification and deployment checklist

Before any real-fund use of a pool or bridge, the project still needs to:

- Verify the intended PUSD category, decimals, and supply metadata.
- Obtain independent review of the contracts and transaction-building paths.
- Define LP ownership/redemption and admin-key recovery for any pool launch.
- Test deployments, claim/refund timing, fees, token-container behavior, and
  recovery on public test networks.
- For cross-chain use, review and deploy the other-chain counterpart and prove
  end-to-end claim and refund paths with independently verifiable evidence.
- Publish source/compiler versions, artifact hashes, constructor arguments,
  transaction IDs, addresses, and audit findings in
  [`MAINNET_PROOFS.md`](MAINNET_PROOFS.md).

A passing mock test or frontend build is not an audit, deployment proof, or
assurance that funds are safe.
