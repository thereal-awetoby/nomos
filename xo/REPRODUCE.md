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
   output (CashToken genesis with `nft: { capability: 'mutable' }`) at the
   vault address, plus 8,000 sats of change back to the owner, which the
   engine listed as unspent at `d73393f2…:1`. The vault output can be checked
   on a chipnet explorer at
   `bchtest:rdmvyxulcv487tkfdwa664vdchs7wtdlx78pthfq9w0enyz8quvssd99rcz9j`.

### What was not completed

The pay and rescue steps were **not** completed. After the genesis
transaction was broadcast, the engine could not track the vault on chipnet
(blocker 3), so the run never reached the pay invitations. The workarounds
tried in `chipnet.mjs` did not get past this.

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

### 3. Chipnet block headers fail validation in `@electrum-cash/application`

The engine's Electrum layer stops syncing chipnet headers at height 332,451:

```
Header '00000000000ecc7187034ddaa4327af300c23fd57bfd2557af6ca2392a022671'
at height 332451 claims target 486604799, expected 437753688.
```

486604799 (`0x1d00ffff`) is the minimum difficulty, which test networks allow
for a block found more than 20 minutes after the previous one. The validator
does not apply that test-network rule, so it rejects a valid chipnet header,
and the header checkpoint stays far behind the tip (about 307k against a tip
of about 339k). Every transaction update after that fails with "The requested
header is ahead of the current checkpoint", so the engine cannot see new
outputs as confirmed, including the vault.

This is not something the template can fix; it happens on any machine using
this package on chipnet.

**Fixed upstream:** chipnet switched to 60-second blocks at height 332,451, so
the expected target there was computed with the wrong block time.
`@xo-cash/engine` 0.1.1-next.18230317763 brings `@electrum-cash/checkpoint`
0.8.0, whose chipnet parameters include that switch
(`{ fromHeight: 332451, idealBlockTimeInSeconds: 60 }`). `xo/package.json`
now pins that engine; see [Second run](#second-run) below.

**Workarounds tried:** querying Electrum directly instead of
`engine.listUnspentOutputs()`, and reading the vault script hash back from the
genesis transaction. Neither got the run to the pay step; the last run's
lookup failed with `object is not iterable`.

### Note on contract addresses across runs

Some intermediate runs computed a different contract address. This is
**not** compiler non-determinism: the first and the last runs, with the same
inputs, both computed vault script hash `2c40e316…` and contract address
`bchtest:pdmvyxulcv487tkfdwa664vdchs7wtdlx78pthfq9w0enyz8quvsslkezprue`.
Changing any vault parameter changes the script and therefore the address.

## Script-hash derivation (did not work)

`chipnet.mjs` tries to read the vault script hash from the on-chain genesis
transaction: it queries Electrum for the owner's history, decodes each
transaction with libauth's `decodeTransaction` and takes the output carrying
`token.nft`. In the last run this lookup failed (`object is not iterable`), so
the script fell back to the compiled script hash, which matched anyway.

## Second run

Prepared for the rest of the lifecycle: pay, pay again the same day, an
over-limit payment, and the rescue, all through XO invitations.

### What changed

- **Engine:** `@xo-cash/engine` 0.1.1-next.18230317763 (fixes blocker 3) and
  `@xo-cash/utils` 0.0.12 to match it. The 14 offline checks pass on both, and
  `npm run export` leaves `nomos.template.json` unchanged, so the template
  identifier, the derived keys and the vault address stay the same.
- **Reuses the vault.** When the vault for these keys already exists (the one
  created by genesis `d73393f2…`), the script continues from its NFT output
  and needs no new funding. Funding and genesis run only when there is none.
- **Fixes in `scripts/chipnet.mjs`**, none of which the first run reached:
  - stored key secrets are referenced by the lookup key State returns (the
    script used a random one, so signing would have failed);
  - the vault state is read as two little-endian 8-byte integers, the way the
    covenant writes it, and a commitment from an earlier day counts as nothing
    spent, as in the covenant;
  - each step waits for the vault coin it spends to confirm;
  - the refused over-limit invitation is archived, which releases its
    reservation of the vault coin before the rescue.
- **Rescue with two engines.** An XO engine signs only with keys from its own
  account, and the rescue needs the owner's and the rescuer's signatures. The
  owner creates the rescue invitation and adds its signature
  (`appendOwnInputResolutions`); a second engine for the rescuer, in its own
  process and state (`chipnet.mjs rescuer-sign`), accepts the invitation and
  signs the input (`signInvitation`); the owner merges the result and
  broadcasts it. The first version tried to sign both roles in one engine,
  which would have produced two owner signatures.

### Running it

On GitHub Actions (`.github/workflows/xo-chipnet.yml`):

1. Add two repository secrets with chipnet-only BIP39 mnemonics:
   `XO_OWNER_MNEMONIC` and `XO_RESCUER_MNEMONIC`. To continue from the vault
   created by `d73393f2…`, use the two chipnet mnemonics that run used.
2. Actions → **XO chipnet run** → Run workflow (or push to the `xo-chipnet`
   branch).
3. Results go to the `xo-chipnet-results` artifact and the
   `xo-chipnet-output` branch: `invitations/2-pay-3000.json`,
   `3-pay-4000.json`, `4-pay-5000-overlimit.json`, `5-rescue-1-owner.json`,
   `5-rescue-2-rescuer.json`, `5-rescue.json`, `run.json` (every transaction
   ID and the node's answer to the over-limit payment) and
   `chipnet-output.txt`.

Locally (Linux or macOS; on Windows the engine's SQLite dependency needs C++
build tools):

```bash
cd xo
npm ci
OWNER_MNEMONIC="…" RESCUER_MNEMONIC="…" node scripts/chipnet.mjs run
```

The invitation files are XO's own serialized format (`serializeInvitation`
from `@xo-cash/utils`); `deserializeInvitation` reads them back. They carry
public keys and signatures, never private keys.

Results of the second run are added here once it has run.
