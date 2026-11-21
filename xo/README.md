# Nomos XO template

`nomos.template.json` describes a Nomos vault as an [XO](https://xo.cash)
template, for the BCH BLAZE "Build with XO" bounty. It is generated from
`src/template.mjs` by `npm run export`, and it reads the compiled bytecode of
`../contracts/NomosVault.cash`, so it can't drift from the contract the app
and the chipnet tests use.

Built against **`@xo-cash/engine` `0.1.0-next.17612568780`** (the newest
`0.1.0-next.*` on npm), with its matching `@xo-cash/types` `0.0.8` and
`@xo-cash/utils` `0.0.10`. The engine provides the live wallet side: template
import, invitations (create / accept / update), signing, transaction building
and broadcasting against a chipnet Electrum server (`chipnet.imaginary.cash`
by default).

## Actions

| Action | Role(s) | Transaction |
|---|---|---|
| `pay` | spender (owner or agent) | Vault NFT in; vault out with the updated `spentToday`/day commitment, payment out at index 1. Over the daily limit or to a non-allowlisted address, the network refuses it. |
| `topUp` | funder (anyone) | BCH to the vault. Composable: the wallet adds coins and change. |
| `withdraw` | owner | Vault NFT and BCH back to the owner (the contract's `setMandate` path, owner signature only). |
| `rescue` | owner **and** rescuer | Sweep ignoring the daily limit. Needs two different keys: the Nomos web app can't collect two signatures over one wallet connection, an XO invitation can. |

State math lives in the template, so a participant only supplies the current
NFT commitment, the amount and a locktime. The template computes the new
commitment the covenant demands (`newCommitment`) and shows how much is left
today (`remainingToday`).

## How it was checked (offline)

`npm test` (`test/xo.test.mjs`), with XO's own `@xo-cash/utils`:

- `parseTemplate` accepts it, before and after a JSON round trip, and every
  script, input, output, locking script, transaction, role and variable it
  mentions is defined.
- `compileCashAssemblyString` compiles each script with variables converted
  the way `@xo-cash/engine` converts them, and the results match CashScript
  **byte for byte**, inside transactions the covenant accepts (CashScript
  debug, i.e. the BCH VM):
  - the vault redeem script and P2SH32 address, allowlist off and on;
  - the pay unlocking script, new commitment, vault value, payee script and
    locktime, for a first payment, a second payment the same day, and a new
    day that resets the count;
  - the withdraw and rescue unlocking scripts.
- An over-limit payment computed by the template is refused by the covenant
  at `NomosVault.cash:45`; a rescue with the wrong co-signer at line 93.
- Changing one vault parameter changes the address, so the checks have teeth.

Then `test/engine.test.mjs` runs the template through XO's own engine: two
`@xo-cash/engine` instances (owner and rescuer), offline, build and sign a
payment, a second payment the same day, an over-limit payment and a rescue
passed between the two engines, and every transaction they build is checked
in libauth's BCH VM. This test found that the unlocking scripts pushed the
redeem script twice (see [REPRODUCE.md](REPRODUCE.md#the-template-bug-the-engine-test-found)).

```
14/14 passed
4/4 passed
```

## On chipnet

The template ran the vault's lifecycle on chipnet through XO's engine on
21 November 2026: three payments the same day (3,000, 3,000 and 4,000 sats,
reaching the 10,000-sat daily limit), an over-limit payment the node refused with
`Script failed an OP_VERIFY operation`, and a rescue signed by the owner and
the rescuer in two separate engines
(`ac6fa39439fd4486b6dae6984e2e727a47e909f3ec4986819cbb7434adcbbfb1`). The
transaction IDs, the saved invitations and what each run did are in
[REPRODUCE.md](REPRODUCE.md#results) and [`runs/`](runs). Check them offline:

```bash
npm run replay
```

It rebuilds each transaction from its saved invitation, checks the
transaction ID and evaluates it in the BCH VM: the saved payments and the
rescue are valid, and both refused payments fail at `NomosVault.cash:45`.

## Chipnet demo script

See [REPRODUCE.md](REPRODUCE.md) for the offline checks, the blockers the
first attempt hit and how they were fixed.

`scripts/chipnet.mjs` runs the full vault lifecycle on chipnet:

```
node scripts/chipnet.mjs fund   → print the chipnet funding address and stop
node scripts/chipnet.mjs run    → genesis + pays + rescue (needs funded address)
```

It needs `OWNER_MNEMONIC` / `OWNER_KEY` and `RESCUER_MNEMONIC` / `RESCUER_KEY`
(chipnet WIFs, derivation index 0 of each mnemonic). Genesis is a raw CashScript
transaction (`TransactionBuilder` + `SignatureTemplate`, ECDSA) — a template
action can't do genesis because the NFT category must be the txid of the
funding coin. After genesis, every step is an XO invitation: pay 3,000, pay
4,000, an over-limit pay 5,000 (signed and sent to the node, rejection
recorded), and a rescue co-signed by owner + rescuer. Invitations are saved to
`invitations/<n>-<action>.json` (no keys). Run again the same day, it skips the
payments the vault's state says are over today's limit.

**`topUp` is not exercised by the script.** The engine's `signInvitation`
couldn't unlock the funding input for a plain top-up (the composable funding
UTXO path needs the engine to track an arbitrary p2pkh input, which the current
engine build doesn't expose cleanly). The required pay/rescue flow is unaffected
— the genesis funds the vault directly.

## Not checked yet

- **Signatures** (`…schnorr_signature.all_outputs`) can't be compiled offline;
  the tests swap in the exact signature CashScript produced and compare the rest.
- **Creating a vault** stays in the Nomos app: the state NFT's category must be
  the txid of a vout-0 coin, which a template can't choose.
- XO's evaluator mis-sizes a `$()` nested inside another `$()`, so the state
  scripts are written as flat opcode sequences.

## Values for a vault

Integers and satoshi amounts as numbers, bytes as hex, token categories in
display order. `vaultCommitment` is 32 hex characters: spentToday then
dayMarker, each 8 bytes little-endian. `locktime` is a unix time a few hours
in the past (nodes reject a locktime above the chain's median time past).
