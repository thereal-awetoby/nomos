# Reproducing the XO chipnet bounty run

This document records how to reproduce the offline checks for the Nomos XO
template, what the first live chipnet (BCH testnet) attempt reached, and the
[results](#results) of the runs that completed the lifecycle.

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

Expected result: `14/14 passed`, then `4/4 passed` from `test/engine.test.mjs`,
which runs the template through XO's own engine
([below](#the-template-bug-the-engine-test-found)).

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

### What the first attempt did not complete

The first attempt did **not** complete the pay and rescue steps; the later
runs did (see [Results](#results)). After the genesis
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

### The template bug the engine test found

`test/engine.test.mjs` runs the template through two real `@xo-cash/engine`
instances offline (the Engine constructor needs no Electrum connection) and
checks every transaction they build in libauth's BCH VM. It found that the
template's vault unlocking scripts ended with `<nomosRedeem>`. The vault's
locking type is `p2sh`, so the engine already appends the redeem script push;
the template pushed it a second time, the contract read its arguments one slot
off, and every pay, withdraw and rescue built by XO failed with
`OP_VERIFY`. The offline byte comparisons in `test/xo.test.mjs` compiled the
unlocking scripts on their own and could not see it.

`unlockPay`, `unlockWithdraw` and `unlockRescue` now end at the function
selector, and `test/xo.test.mjs` appends the redeem push the way the engine
does before comparing bytes with CashScript. With the fix, the engine test
passes: pay 3,000, pay 4,000 the same day, a refused 5,000, and the rescue
signed in two engines are all valid in the VM (`npm test`: 14/14, then 4/4).
Run against the old template, it fails at the first payment.

### What else changed

- **Engine:** `@xo-cash/engine` 0.1.1-next.18230317763 (fixes blocker 3) and
  `@xo-cash/utils` 0.0.12 to match it.
- **A new vault for the fixed template.** The template identifier is part of
  every key path, so the fixed template has new keys and a new vault address.
  The first run's vault (genesis `d73393f2…`, at `bchtest:pdmvyxul…lkezprue`)
  belongs to the same mnemonics under the old identifier. When the new vault
  does not exist yet, `chipnet.mjs` moves the first run's vault to the new
  owner address through its owner-only `setMandate` path and funds the new
  genesis from it, so no faucet is needed. It keeps the first run's NFT at the
  owner's token address.
- **Fixes in `scripts/chipnet.mjs`**, none of which the first run reached:
  - the vault is tracked by its P2SH32 locking bytecode; the script used the
    redeem script, whose script hash Electrum never reports;
  - the owner's address is registered under `ownerReturn`, a locking script the
    template defines (the engine stops on an unknown one);
  - invitation inputs and outputs use the engine's types: outpoint hashes, token
    categories and commitments as bytes, variables as a list, and the
    invitation identifier read from `stored.invitation`;
  - stored key secrets are referenced by the lookup key State returns;
  - the vault state is read as two little-endian 8-byte integers, the way the
    covenant writes it, and a commitment from an earlier day counts as nothing
    spent, as in the covenant;
  - each step waits until the engine itself tracks the vault coin it spends;
  - the refused over-limit invitation is archived, which releases its
    reservation of the vault coin before the rescue.
- **Rescue with two engines.** An XO engine signs only with keys from its own
  account, and the rescue needs the owner's and the rescuer's signatures. The
  owner creates the rescue invitation and adds its signature
  (`appendOwnInputResolutions`); a second engine for the rescuer, in its own
  process and state (`chipnet.mjs rescuer-sign`), accepts the invitation and
  signs the input (`signInvitation`); the owner merges the result and
  broadcasts it.

### Running it

On GitHub Actions (`.github/workflows/xo-chipnet.yml`):

1. Add two repository secrets with chipnet-only BIP39 mnemonics:
   `XO_OWNER_MNEMONIC` and `XO_RESCUER_MNEMONIC`. With the two mnemonics the
   first run used, the new vault is funded from the first run's vault.
2. Actions → **XO chipnet run** → Run workflow (or push to the `xo-chipnet`
   branch).
3. Results go to the `xo-chipnet-results` artifact and the
   `xo-chipnet-output` branch (which keeps only the latest run):
   `invitations/2-pay-3000.json`,
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

## Results

The fixed template ran on chipnet on 21 November 2026 in GitHub Actions runs
#25, #26 and #27 of `.github/workflows/xo-chipnet.yml`, with the same two
mnemonics. Each run continued from the vault the previous one left.

| Run | Step | Chipnet transaction |
|-----|------|---------------------|
| #25 | Moved the first run's vault to the new owner, created the new vault, paid 3,000 sats (3,000 spent today) | pay: [`130d19ad…`](https://chipnet.chaingraph.cash/tx/130d19ad7b009126f56d1f4c969d5960bed47c4184b0aeb00f4fc5a315be5695) |
| #26 | Paid 3,000 sats through an XO invitation (6,000 spent today) | [`4236d8ac…`](https://chipnet.chaingraph.cash/tx/4236d8ac82930401c33e4eb639603580e6c8234e680dd9c0ad24307290a915d3) |
| #26 | Paid 4,000 sats (10,000 spent today, the daily limit) | [`ca1df856…`](https://chipnet.chaingraph.cash/tx/ca1df8563f8ac631072d0d5f7c3944fd8d9aa0f0b74daaa851e046a95cdd0515) |
| #26 | Tried to pay 5,000 more (15,000 > 10,000) | refused by the node; would have been `175db211…` |
| #27 | Tried the same over-limit payment again | refused by the node: `mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation) (code 16)`; would have been `7feeef9b…` |
| #27 | Rescue: the owner and the rescuer signed one invitation in two engines; 6,000 sats and the vault NFT went back to the owner | [`ac6fa394…`](https://chipnet.chaingraph.cash/tx/ac6fa39439fd4486b6dae6984e2e727a47e909f3ec4986819cbb7434adcbbfb1) |

New vault: `bchtest:pwxmnnnj6jcemm59q5wkclr7e4m5zcsh6gl36thqpjp6h9860f6lchj2vfev8`,
token category `cf211e3bbe6e4ca7d10dc2900d3aad95b3114f2bcdfd5c467fefbe7cfe680f5f`;
owner `bchtest:qq5lwjtaafy8qve58mxtkv308tsnvn7tju23rpztw6`, rescuer
`bchtest:qzz8dzfddv3l64pr4952x7v2zm6jedy8gs3dlwraxz`.

Run #25's saved files were replaced on the results branch by the next run, so
its other transaction IDs are not listed here; run #26 started from the vault
coin it left, `130d19ad…:0`, holding 16,000 sats with 3,000 spent that day.

In run #26 the owner and the rescuer both signed the rescue, but the
rescuer's process crashed while closing its Electrum connections, after it
had written its signature (`AggregateError: All promises were rejected`), and
the run did not broadcast the rescue. `scripts/chipnet.mjs` now ends the
rescuer's process as soon as its signature is written, uses a written
signature even if that process fails, keeps the node's whole answer (run #26
kept only its first line), and exits non-zero when a step fails. Run #27 read
from the vault's NFT that the day's 10,000 sats were used, skipped the two
payments, tried the over-limit payment again and finished the rescue.

The saved files are in [`runs/`](runs): each run's `run.json`, log and
invitations.

### Check it yourself, offline

```bash
cd xo
npm ci
npm run replay
```

`scripts/replay.mjs` rebuilds every transaction the engine built from the
saved invitations, checks that it hashes to the transaction ID the run
reported, and evaluates it in libauth's BCH VM with the vault coin it spends.
It also checks that the vault's redeem script is `contracts/NomosVault.cash`
as compiled by cashc 0.11.5, and maps a failure to its `require` line through
the compiler's debug information:

```
runs/run-26
  2-pay-3000.json: pay 4236d8ac… rebuilt with the same ID; VM: valid (3000 spent today + 3000 against a 10000 limit); …
  3-pay-4000.json: pay ca1df856… rebuilt with the same ID; VM: valid (6000 spent today + 4000 against a 10000 limit); …
  4-pay-5000-overlimit.json: pay 175db211… rebuilt with the same ID; VM: fails at NomosVault.cash:45  require(effectiveSpent + amount <= dailyLimitSats); …
runs/run-27
  4-pay-5000-overlimit.json: pay 7feeef9b… rebuilt with the same ID; VM: fails at NomosVault.cash:45  require(effectiveSpent + amount <= dailyLimitSats); …
  5-rescue.json: rescue ac6fa394… rebuilt with the same ID; VM: valid; the run broadcast it with this ID: ok
```

Both refused payments fail at the daily limit, the rule the node's
`Script failed an OP_VERIFY operation` refers to.
