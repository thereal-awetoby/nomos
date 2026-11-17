# Nomos XO template

`nomos.template.json` describes a Nomos vault as an [XO](https://xo.cash)
template, for the BCH BLAZE "Build with XO" bounty. It is generated from
`src/template.mjs` by `npm run export`, and it reads the compiled bytecode of
`../contracts/NomosVault.cash`, so it can't drift from the contract the app
and the chipnet tests use.

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

```
14/14 passed
```

## Not checked yet

- **Not run in the XO engine or debug tool.** The engine needs a live chipnet
  Electrum connection; the development sandbox has none. Next step: import
  `nomos.template.json` at https://blaze.xo.cash.
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
