# Nomos identity link: protocol v1

A link says that one Bitcoin Cash address and one Nostr key belong
together. Each key signs its half on its own network, and anyone can check
both halves with public Nostr relays and a BCH node. No Nomos server is
involved in creating, finding or checking a link.

Code: `frontend/src/lib/identity.ts` (verification), `frontend/src/lib/nostr.ts`
(Nostr side), `frontend/src/lib/contract.ts` (BCH side). The UI is at
`/identity` on nomos.asgaya.org.

## Why not just an address in a Nostr profile

A Nostr profile or a Paytaca address event (kind `30078`,
`d = paytaca:bch-address`) is signed by the Nostr key only. It proves the
Nostr key wants payments sent to that address, not that the person controls
the address. A link adds a signature from the BCH key, so both sides have
proven control.

## Keys

- Nostr: a normal secp256k1 Nostr key (BIP-340), signing through NIP-07.
- BCH: the key behind a P2PKH cashaddr, signing through the user's wallet
  (Paytaca over WizardConnect, or WalletConnect).

The two keys are separate. Neither signs anything for the other network.

## The two halves

### 1. BCH anchor

A transaction, broadcast once, with:

- at least one input spent by the address's key (P2PKH unlocking bytecode
  ending in the 33-byte public key that hashes to the address), and
- an output whose locking bytecode is
  `OP_RETURN <"NOMOSID1"> <32-byte Nostr public key>`,
  where `"NOMOSID1"` is the 8 ASCII bytes and the key is the x-only hex
  public key, in its normal byte order.

Nomos builds it as a payment from the address back to itself, so the only
cost is the network fee. The BCH half is a transaction rather than a signed
message because WizardConnect wallets sign transactions, not messages.

### 2. Nostr claim

A NIP-39 external identity in the key's kind `10011` list:

```json
["i", "bch:<cashaddr body, lowercase>", "<anchor txid, hex>"]
```

The platform is `bch` for mainnet addresses and `bchtest` for chipnet and
testnet addresses. Example: `["i", "bch:qpqrel8…", "9f3c…"]`.

Kind `10011` is replaceable: only the newest list from a key counts. Other
entries in the list are left alone when Nomos adds or removes a claim.

## Finding a link

Relays index single-letter tags, so a link can be found from either side:

- From a Nostr identity (npub, nprofile or NIP-05 name): resolve the
  public key (NIP-05 through the person's own domain), then query
  `{"kinds": [10011], "authors": [<pubkey>]}`.
- From a BCH address: query `{"kinds": [10011], "#i": ["bch:<body>"]}`.

Nomos queries `relay.paytaca.com`, `relay.damus.io`, `nos.lol` and
`relay.primal.net`, plus any relay hints from an nprofile or NIP-05 record.

## Verifying a link

For each claim found:

1. Check the event's id and signature, and that its author is the expected
   key. Keep only the newest kind `10011` event per author.
2. Read the `bch:` or `bchtest:` claims from its `i` tags.
3. Fetch the anchor transaction from a BCH node by the txid in the claim.
4. The anchor must contain the `NOMOSID1` output naming this Nostr key, and
   at least one input spent by the claimed address's key. Nodes only relay
   and mine transactions with valid signatures, so a transaction found on the
   network with such an input was signed by the address's owner.
5. The link holds only when steps 1–4 all pass: the Nostr key names the
   address and the transaction, and the address's transaction names the
   Nostr key.

`verifyLinks(input)` in `identity.ts` runs these steps and returns each claim
with `anchorOk` and a reason.

A shareable check: `https://nomos.asgaya.org/identity?verify=<npub, NIP-05
name or address>` opens the page and runs the steps in the visitor's own
browser.

## Authentication (challenge-response)

The verifier issues a random challenge of 16 to 32 bytes (hex). The user
answers with either key:

- **Nostr:** a kind `22242` event, signed and not published, with tag
  `["challenge", <hex>]`. Valid when the signature checks out, the author is
  the linked key, the challenge matches and `created_at` is within 10 minutes.
- **BCH:** a transaction, signed and never broadcast, from the linked address
  to itself with `OP_RETURN <"NOMOSAUTH"> <challenge bytes>`. Valid when the
  challenge matches, every input is spent by the linked address's key, and
  the transaction passes libauth's BCH 2025 virtual machine with the source
  outputs supplied alongside it. No funds move.

### Response format

So a third party can check an answer on its own, Nomos hands out the answer
with the link it claims:

```json
{
  "v": 1,
  "protocol": "nomos-identity",
  "method": "nostr" | "bch",
  "challenge": "<hex>",
  "address": "bitcoincash:q…",
  "npub": "npub1…",
  "anchorTxid": "<hex>",
  "proof": <kind 22242 event> | { "signedHex": "<tx hex>", "sourceOutputs": [{ "lockingBytecode": "<hex>", "valueSatoshis": "<int>" }] }
}
```

`verifyAuthResponse(json, issuedChallenge)` checks, in order: the format,
that the challenge is the one the verifier issued, the signature, that the
key's current kind `10011` list still carries this address and anchor, and
the anchor transaction itself. The "Check someone's signed response" panel on
`/identity` does the same in the browser.

## Removing and rotating

- **Remove:** the Nostr key publishes a new kind `10011` list without the
  claim. Verifiers stop finding the link. ("Remove link" on `/identity`.)
- **New Nostr key:** anchor the new key from the same address, publish the
  claim from the new key, and remove the claim from the old key.
- **New address:** anchor from the new address and add its claim; remove the
  old one if it should no longer count.

## What a link does and does not prove

It proves that whoever controlled the Nostr key and whoever controlled the
BCH address both agreed to the link: the address at the time of the anchor,
the Nostr key as of its newest list.

It does not prove:

- who the person is. There is no real-world identity check.
- that the link is current if relays withhold the newest list. A verifier
  that sees an older list may still see a removed claim. Querying several
  relays reduces this, but does not remove it.
- that the BCH key still agrees. An anchor stays on the chain; only the
  Nostr side can withdraw a link. If a Nostr key is compromised, its holder
  can keep claiming an address that once anchored it. Looking up an address
  on `/identity` lists every key with a proven claim, so more than one key
  is visible rather than hidden.

Only P2PKH addresses can anchor; a covenant or multisig address has no single
key to name.

## How Nomos uses it

When you pay or allowlist by Nostr name, Nomos resolves the key and looks for
both a link and a Paytaca address event:

1. A proven link on the current network wins. Pay shows "Linked · both keys
   signed" with the anchor transaction, and the receipt records the anchor
   txid and claim event id.
2. Without a link, the Paytaca published address is used and Pay says it is
   signed by the Nostr key only.
3. "Pay Nostr names only when the address is linked by both keys" turns step
   2 off.

Either way the payment still goes through the vault covenant, so the daily
limit and allowlist are enforced on-chain.
