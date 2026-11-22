# XO feedback: Nomos (BCH BLAZE 2026)

I'm Toby (thereal-awetoby), building Nomos: a self-custodial vault whose spending rules live in a CashScript covenant on Bitcoin Cash, with a stablecoin bridge to USDC on Base. I'd written the app's CashScript contract before starting on XO, and built its SolidCash edition alongside it. What won me over is that XO lets two people co-sign one flow by passing an invitation between them — and that you can build and check it all offline before a node ever sees it.

## What I built

Nomos is a BCH vault whose spending rules live in a CashScript covenant: a
daily limit, an allowlist, an agent key and a rescue key. For the Build with
XO bounty I described that vault as an XO template, `xo/nomos.template.json`.
`npm run export` generates it from `xo/src/template.mjs`, which reads the
compiled bytecode of `contracts/NomosVault.cash`, so the template can't drift
from the contract the app uses.

|Action|Who signs|What it does|
|---|---|---|
|`pay`|owner or agent|Pays from the vault and updates the day's spending in the vault's NFT. Over the limit, or to an address not on the allowlist, the network refuses it.|
|`topUp`|anyone|Adds BCH to the vault.|
|`withdraw`|owner|Returns the vault's NFT and BCH to the owner.|
|`rescue`|owner and rescuer|Sweeps the vault, ignoring the limit. Needs both keys.|

The template does the state math itself (`newCommitment`, `remainingToday`),
so a participant only supplies the current commitment, an amount and a
locktime.

## What ran on chipnet

On 21 November 2026, XO's engine ran the vault in GitHub Actions runs #25 to
#27:

* three payments the same day, 3,000, 3,000 and 4,000 sats, reaching the
10,000-sat daily limit;
* a 5,000-sat payment, signed and sent twice, which the node refused both
times with `Script failed an OP_VERIFY operation`;
* a rescue signed by the owner and the rescuer in two separate engines, which
returned 6,000 sats and the vault NFT to the owner (`ac6fa394…`).

Every transaction ID is in `xo/REPRODUCE.md`. `npm run replay` rebuilds each
transaction from its saved invitation and checks it in the BCH VM, offline.

## Versions

|Package|Version|
|---|---|
|`@xo-cash/engine`|`0.1.1-next.18230317763` (started on `0.1.0-next.17612568780`)|
|`@xo-cash/utils`|`0.0.12` (started on `0.0.10`)|
|`@xo-cash/types`|`0.0.8`|
|`cashc` and `cashscript`|`0.11.5`|
|`@bitauth/libauth`|`3.1.0-next.8`|
|Runtime|Node 22 on `ubuntu-latest` in GitHub Actions|

## Timeline

* **17 Nov:** the first template and its offline checks.
* **20 Nov:** the first live chipnet attempt, 22 commits over about nine
hours. Genesis landed (`d73393f2…`), but the engine could not see the vault
(problem 1 below).
* **21 Nov, morning:** a newer engine build fixed that, and the second run
started.
* **21 Nov, midday:** a new test that runs the template through the engine
found a bug in my template (problem 2), and the rescue finished.

XO took me about 20 hours in total, across 17–21 November. It started to click
on the morning of 21 November, when a newer engine build fixed the chipnet
checkpoint problem and the second run actually started to move — before that,
it was a long fight with the network.

## What worked well

* **Checking a template offline.** `parseTemplate` and
`compileCashAssemblyString` from `@xo-cash/utils` let me compile every script
and compare it with CashScript byte for byte: 14 checks, no network needed.
* **An engine without a network.** The `Engine` constructor needs no Electrum
connection, so one test runs two engines (owner and rescuer) through the
whole flow and checks every transaction in the BCH VM. That test found a
real bug before chipnet did.
* **Invitations as files.** `serializeInvitation` and `deserializeInvitation`
turn each step into JSON that carries public keys and signatures, never
private keys. I saved every step, passed the rescue between two processes,
and can replay every run offline.
* **Two-key actions.** The rescue needs two signatures. The Nomos web app
can't collect two signatures over one wallet connection; an XO invitation
can.
* **Fixes arrive.** The chipnet header problem was already fixed in a newer
engine build.

The two things that mattered most to me were the offline checks: compiling
every script byte for byte against CashScript with no network, and running the
template through two engines with no Electrum connection. The second of those
found a real bug before chipnet did — that's the check I'd keep.

## Moving an existing contract to XO

* The contract didn't change. The template reads the compiled
`NomosVault.cash`, and the tests check every script against CashScript byte
for byte.
* What moved into XO: the state math, the roles, and signing by several
people through invitations.
* What stayed outside: creating a vault. Its state NFT's category must be the
txid of a coin at output 0, which a template can't choose (problem 4).

Harder than expected. The contract itself didn't change, and the template can't
drift from it, but the genesis constraint and the engine's tracking rules — what
it tracks, which identifiers it accepts, waiting for it to see the coin you
spend — cost more time than I planned.

## Where I got stuck, and what fixed it

### 1. The engine could not follow chipnet past block 332,451

`@electrum-cash/application` rejected a valid chipnet header:
`Header '00000000000ecc7187034ddaa4327af300c23fd57bfd2557af6ca2392a022671' at height 332451 claims target 486604799, expected 437753688.`
Chipnet moved to 60-second blocks at that height. From then on every update
failed with `The requested header is ahead of the current checkpoint`, so the
engine never saw the vault as confirmed. Querying Electrum directly didn't
get past it.

**Fix:** `@xo-cash/engine` `0.1.1-next.18230317763`, which brings `@electrum-cash/checkpoint` 0.8.0 with the chipnet block-time switch.

**Ask:** name the engine build that works on chipnet, and make the checkpoint
error say which checkpoint version is running.

### 2. The redeem script was pushed twice

My unlocking scripts ended with `<nomosRedeem>`. With locking type `p2sh` the
engine already appends the redeem script push, so the contract read its
arguments one slot off and every pay, withdraw and rescue failed with
`OP_VERIFY`. My byte-for-byte checks compiled unlocking scripts on their own
and couldn't see it; running the template through two engines did.

**Fix:** the unlocking scripts now end at the function selector.

**Ask:** document this next to `p2sh`, and have `parseTemplate` warn when a
p2sh unlocking script pushes its own redeem script.

### 3. One engine per process

`@electrum-cash/application` sets up its cache for the whole process, so a
second `Engine.create()` fails with `Cannot configure storage for cache after it has been initialized.` An engine also signs only with keys from its own
account. My first attempt tried to sign both sides of the rescue from the
owner's engine.

**Fix:** the rescuer runs in its own process (`chipnet.mjs rescuer-sign`).
The owner creates the invitation and adds its signature
(`appendOwnInputResolutions`), the rescuer's engine accepts it and signs
(`signInvitation`), and the owner merges the result and broadcasts it.

**Ask:** allow several engines in one process, and add a two-signer example
to the docs.

### 4. Genesis can't be a template action

A CashToken category is the txid of the coin its genesis spends, and that
coin must be output 0 of its transaction. My first genesis spent a coin at
output 1 and failed with `bad-txns-token-invalid-category`.

**Fix:** genesis is a plain CashScript transaction, after a self-send that
put the coin at output 0. Every step after genesis is an XO invitation.

**Ask:** a way for a template to mint a category from an input the engine
picks, or a documented genesis pattern.

### 5. Tracking the vault coin

* The engine tracks a contract by its P2SH32 locking bytecode. I first
watched the redeem script's hash, which Electrum never reports.
* The template's `lockingBytecode` is a reference the engine resolves
internally, so I stored the vault's script hash in the engine's state myself.
* A locking script's identifier must be one the template defines, or the
engine stops. The owner's address went in under `ownerReturn`.
* Each step waits until the engine itself tracks the coin it spends.

**Ask:** a helper to watch a contract address, and an error that names an
unknown identifier.

### 6. A refused invitation keeps its coin

After the node refused the over-limit payment, its invitation still reserved
the vault coin, so the rescue couldn't spend it until I archived that
invitation.

**Ask:** release the reservation when a broadcast is rejected, or document
archiving.

### 7. topUp was not exercised

`signInvitation` couldn't unlock a plain P2PKH funding input for a top-up.
That path needs the engine to track an arbitrary P2PKH coin, which this build
doesn't expose cleanly. Pay and rescue were unaffected, because genesis funds
the vault directly.

**Ask:** an example of a composable funding input from an ordinary wallet
coin.

### 8. Types and conversions

Outpoint hashes, token categories and commitments go in as bytes, variables
as a list, and an invitation's ID sits at
`stored.invitation.invitationIdentifier`. The engine and CashScript want
satoshis as `bigint`, while Electrum results come back as numbers.

**Ask:** typed examples of invitation inputs and outputs, and hex strings
accepted where bytes are expected.

### 9. The template's ID is part of every key

Fixing the template changed its identifier, which changed every key and the
vault's address. Before the second run I had to move the first run's vault to
the new owner through its owner-only path.

**Ask:** warn about this in the docs, or let a template be revised without
changing its keys.

### 10. Smaller things

* XO's evaluator mis-sizes a `$()` nested inside another `$()`, so the state
scripts are written as flat opcode sequences.
* Signatures (`…schnorr_signature.all_outputs`) can't be compiled offline, so
the tests swap in the signature CashScript produced.
* The Electrum client's `request()` resolves with an `Error` object instead
of rejecting.
* `@electrum-cash/protocol` is only a transitive dependency, so it couldn't
be imported in CI; I queried Electrum through the client instead.
* In run #26 the rescuer's process crashed while closing its Electrum
connections (`AggregateError: All promises were rejected`), after writing its
signature, so the rescue was only broadcast in run #27.
* On Windows the engine's SQLite dependency needs C++ build tools, so the
chipnet runs went through GitHub Actions on Linux.

## My own mistakes, not XO's

* Script hashes byte-reversed in the wrong place.
* 16-byte allowlist entries where the contract wants 20-byte hashes.
* Mixing `bigint` and `number` for satoshi amounts.
* The double redeem push in problem 2.

## What would help the next builder most

1. A chipnet-ready engine build, named in the docs.
2. A complete two-signer example: create, sign, pass on, merge, broadcast.
3. A documented way to do token genesis alongside a template.
4. A `parseTemplate` warning for the double redeem push.
5. Several engines in one process.

## Would I use XO again?

Yes — for flows that need two people to co-sign one transaction. Nothing else
on Bitcoin Cash makes that as smooth, and the invitations-as-files design means
every run is replayable afterward.

## Reproduce

```bash
cd xo
npm ci
npm test         # 14/14, then 4/4
npm run replay   # rebuilds the chipnet transactions and checks them in the BCH VM
```
