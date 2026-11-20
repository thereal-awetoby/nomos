# Reproducing the XO chipnet bounty run

This document records how to reproduce the offline checks for the Nomos XO
template and what the live chipnet (BCH testnet) demo attempt reached.

## Offline checks

All offline checks run without a chipnet Electrum connection and require only
Node.js and the dependencies in `xo/package.json`:

```bash
cd xo
npm ci
npm test
```

`npm test` (`test/xo.test.mjs`) validates:

- `parseTemplate` accepts `nomos.template.json`, before and after a JSON
  round-trip, and every script, input, output, locking script, transaction,
  role and variable it mentions is defined.
- `compileCashAssemblyString` compiles each script with variables converted
  the way `@xo-cash/engine` converts them, and the results match CashScript
  **byte for byte**, inside transactions the covenant accepts (CashScript
  debug / BCH VM). This covers the vault redeem script and P2SH32 address
  (allowlist off and on), the pay unlocking script for a first payment, a
  second same-day payment, and a new-day reset, plus the withdraw and rescue
  unlocking scripts.
- An over-limit payment is refused by the covenant at `NomosVault.cash:45`;
  a rescue with the wrong co-signer at line 93.
- Changing one vault parameter changes the address, so the checks have teeth.

Expected result: `14/14 passed`.

The chipnet demo script itself can be syntax-checked offline:

```bash
cd xo
node --check scripts/chipnet.mjs
```

## Live chipnet attempt

The chipnet demo script (`scripts/chipnet.mjs`) runs the full vault lifecycle
on BCH testnet against `chipnet.imaginary.cash`. It was attempted on CI via a
push-triggered GitHub Actions workflow that derived fixed BIP39 mnemonics,
derived the owner and rescuer keys at derivation index 0, published the funding
address, funded it, and ran the demo.

### What was confirmed

1. **Funding** — 60,000 sats were sent to the owner address
   (`bchtest:qqjm5vzp2fr0vqrm5prl2g3xfsws0xf2scw70mfhy8`) in transaction
   `c0356c25dffcd351f4515ee28c68d37a9254761de2c6a154afa9b7157a215b51`,
   output 1, confirmed at block 339,699.

2. **Pre-genesis vout-0 self-send** — because the funding UTXO was at output
   index 1 (not 0), a pre-genesis transaction was broadcast that spent the
   funding coin and sent a self-transfer back to the owner, landing a vout-0
   UTXO. This vout-0 UTXO is the required genesis input per CHIP-2022-02.

3. **Genesis broadcast and accepted** — the CashScript genesis transaction
   was built with `TransactionBuilder` + `SignatureTemplate` (ECDSA) and
   broadcast successfully. Its txid is:

   ```
   d73393f2355f97bf98f2c8827f5e6ddf2b8d76756e27369d1b5f460c70db2b66
   ```

   The genesis transaction spent the vout-0 UTXO and created the vault NFT
   output (CashToken genesis with `nft: { capability: 'mutable' }`) at output
   index 1, plus a change output at index 2. The change output (8,000 sats)
   was visible as unspent on the owner script hash.

### What was not completed

The pay and rescue steps were **not** completed. After the genesis transaction
was broadcast, subsequent runs could not reliably detect the vault on-chain to
proceed to the pay invitations. The specific blockers encountered are listed
below.

## Blockers encountered

### 1. The vout-0 genesis rule (CHIP-2022-02)

A CashToken category's genesis input must spend output index 0 of its parent
transaction. The initial funding UTXO was at output index 1, which cannot
serve as a token genesis input. Broadcasting the genesis tx directly from the
funding coin produced `bad-txns-token-invalid-category` (node error code 16).

**Fix applied:** a two-stage genesis. A pre-genesis self-send moves the coin
to a vout-0 UTXO, then the genesis tx spends that vout-0 UTXO with
`category: genesisUtxo.txid` (display/big-endian order, per CHIP-2022-02).
The genesis tx broadcast cleanly after this fix.

### 2. BigInt / Number mixing

The engine and CashScript APIs expect satoshi amounts as `bigint` (BigInt),
while Electrum and some helper functions return `Number`. Mixing the two
produced runtime errors during the funding and genesis flow.

**Fix applied:** all satoshi amounts in `chipnet.mjs` are `BigInt` literals
(e.g. `50_000n`, `10_000n`) and conversions are explicit.

### 3. Stale chipnet block-header checkpoint in `@electrum-cash/application`

`@electrum-cash/application` caches the chipnet block-header checkpoint in
IndexedDB under the `checkpoints` key, keyed by `uniqueBlockchainHash`.
`setActiveBlockchain` only stores a checkpoint if one is absent, so a stale
checkpoint from an earlier run persisted. The cached checkpoint height (~306k)
was far below the actual chipnet chain tip (~339k), causing
`engine.listUnspentOutputs()` to throw because the requested block height
exceeded `currentCheckpoint.height`.

**Fix applied:** `confirmedVaultUtxos` in `chipnet.mjs` bypasses the engine's
checkpoint-dependent UTXO listing and queries Electrum directly via
`fetchUnspentOutputsForLockingBytecode`, deriving the output status from each
entry's `height` field. A "check for existing vault" step was also added at
the start of the run to detect a previously created vault.

### Note on contract addresses across runs

The compiled contract address (P2SH32) and token address changed between
commits. This is **not** due to compiler non-determinism. The contract's
input parameters (owner and rescuer public keys) were changed between commits
during development, and changing any vault parameter changes the resulting
script and therefore the address. Within a single commit, compilation is
deterministic.

## Script-hash derivation

Because the vault script hash must match the on-chain genesis output for the
engine to track the vault UTXO, `chipnet.mjs` derives the vault script hash
from the on-chain genesis transaction: it queries Electrum for the owner
script-hash history, decodes each transaction with libauth's
`decodeTransaction`, finds the output carrying the `token.nft`, and returns
that output's script hash. `scriptToScriptHash` is implemented with Node's
`crypto` (`createHash('sha256')` with byte reversal), avoiding any dependency
on the `@xo-cash/utils` re-export.
