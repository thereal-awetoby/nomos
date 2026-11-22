# Security Model and Limitations

## Status

This document describes the trust boundaries of the current code. The
CashScript and SolidCash vaults have run on mainnet (see `MAINNET_PROOFS.md`);
as with any new contract, start with small amounts. StableSwap and
HashedTimeLock have mock-network tests and have run on mainnet with test
amounts; they remain prototypes. The PUSD and
USDC swap locks real funds on two chains; each lock refunds its sender after
its timeout.

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

`contracts/solidcash/StableSwap.scash` is a prototype pool for BCH and one
configured CashToken category. The implementation includes bounded arithmetic,
token-container/reserve consistency checks, minimum-output checks, and
admin-only liquidity operations. It has no LP-share accounting or oracle, the
configured PUSD category and metadata are not verified, and its live-run script
uses a test token minted for the run, not PUSD. Its tests use seeded mock
tokens on the BCH VM. The app does not use it.

## BCH-side HTLC prototype

`contracts/solidcash/HashedTimeLock.scash` locks native BCH, tracks the amount
locked through its `lock` method, permits a SHA-256 preimage claim before a
timestamp deadline, and permits the sender to refund at or after the deadline.
It does not hold PUSD, inspect another chain, or prove an external transaction.
The mock-network test and the live-run script cover claim/refund and refusal
cases on Bitcoin Cash only; neither is a cross-chain test. A cross-chain protocol would additionally
need a separately implemented and reviewed contract on the other chain,
compatible hash semantics, safely ordered timeouts, monitoring, and recovery
procedures. None is integrated here.

## Verification and deployment checklist

Before the StableSwap or HashedTimeLock prototypes hold real funds, the project
needs to:

- Verify the intended PUSD category, decimals, and supply metadata.
- Review the contracts and transaction-building paths.
- Define LP ownership/redemption and admin-key recovery for any pool launch.
- Test deployments, claim/refund timing, fees, token-container behavior, and
  recovery on public test networks.
- For cross-chain use, review and deploy the other-chain counterpart and prove
  end-to-end claim and refund paths with independently verifiable evidence.
- Publish source/compiler versions, artifact hashes, constructor arguments,
  transaction IDs and addresses in [`MAINNET_PROOFS.md`](MAINNET_PROOFS.md).
