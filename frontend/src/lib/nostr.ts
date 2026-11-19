// ── Nostr pay-by-name ───────────────────────────────────────
// Lets the user type a Nostr identity (npub, nprofile, nostr: link or
// name@domain NIP-05) instead of a BCH address. We find the BCH address the
// person published themselves, using the format Paytaca and OPTN wallets
// already write:
//
//   kind 30078 (NIP-78), d = "paytaca:bch-address"
//   content = {"name":"Paytaca BCH Address","data":{"address":"bitcoincash:…"}}
//
// No server of ours sits in the middle: names resolve over NIP-05 (the
// person's own domain) and relays, and the event's signature is checked here,
// so a relay can't swap in a different address without the person's key.

import { SimplePool } from 'nostr-tools/pool'
import { verifyEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { queryProfile, isNip05 } from 'nostr-tools/nip05'
import type { Event, EventTemplate } from 'nostr-tools/pure'

const BCH_ADDRESS_KIND = 30078
const BCH_ADDRESS_D_TAG = 'paytaca:bch-address'

// Paytaca publishes to its own relay; the others are widely used public ones.
export const DEFAULT_RELAYS = [
  'wss://relay.paytaca.com',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
]

const QUERY_TIMEOUT_MS = 6000

export interface NostrPayee {
  /** what the user typed, trimmed */
  input: string
  pubkeyHex: string
  npub: string
  /** resolved BCH address, exactly as the person published it */
  address: string
  /** when the address event was published (unix seconds) */
  publishedAt: number
  displayName?: string
  picture?: string
  nip05?: string
}

/** True if the text looks like a Nostr identity rather than a BCH address. */
export function isNostrIdentifier(input: string): boolean {
  const s = input.trim().replace(/^nostr:/i, '')
  if (/^(npub1|nprofile1)[02-9ac-hj-np-z]+$/i.test(s)) return true
  // name@domain — but not a cashaddr, which never contains '@'
  return isNip05(s) && s.includes('.')
}

interface PubkeyPointer { pubkeyHex: string; relays: string[]; nip05?: string }

async function resolvePubkey(input: string): Promise<PubkeyPointer> {
  const s = input.trim().replace(/^nostr:/i, '')

  if (/^(npub1|nprofile1)/i.test(s)) {
    let decoded: ReturnType<typeof nip19.decode>
    try {
      decoded = nip19.decode(s)
    } catch {
      throw new Error('That npub/nprofile is not valid')
    }
    if (decoded.type === 'npub') return { pubkeyHex: decoded.data, relays: [] }
    if (decoded.type === 'nprofile') {
      return { pubkeyHex: decoded.data.pubkey, relays: decoded.data.relays ?? [] }
    }
    throw new Error('Expected an npub or nprofile')
  }

  // NIP-05: name@domain → https://domain/.well-known/nostr.json?name=name
  const pointer = await queryProfile(s)
  if (!pointer) throw new Error(`No Nostr key found for ${s}`)
  return { pubkeyHex: pointer.pubkey, relays: pointer.relays ?? [], nip05: s }
}

/**
 * Check the signature on a plain copy of the event. nostr-tools caches a
 * "verified" flag on event objects it has seen, so verifying the object we
 * were handed could trust a cached result; a JSON copy forces a real check
 * of id + signature against this exact content.
 */
function isGenuine(e: Event, pubkeyHex: string): boolean {
  if (e.pubkey !== pubkeyHex) return false
  try {
    return verifyEvent(JSON.parse(JSON.stringify(e)))
  } catch {
    return false
  }
}

function newest(events: Event[]): Event | undefined {
  return events.sort((a, b) => b.created_at - a.created_at)[0]
}

/**
 * Resolve a Nostr identity to the BCH address its owner published.
 * `checkAddress` validates the address for the current network (returns an
 * error string or null), so a chipnet build never pays a mainnet address.
 */
export async function resolveNostrPayee(
  input: string,
  checkAddress: (addr: string) => string | null,
): Promise<NostrPayee> {
  const { pubkeyHex, relays: hintRelays, nip05 } = await resolvePubkey(input)
  const relays = Array.from(new Set([...hintRelays, ...DEFAULT_RELAYS]))

  const pool = new SimplePool()
  try {
    const [addressEvents, profileEvents] = await Promise.all([
      pool.querySync(
        relays,
        { kinds: [BCH_ADDRESS_KIND], authors: [pubkeyHex], '#d': [BCH_ADDRESS_D_TAG] },
        { maxWait: QUERY_TIMEOUT_MS },
      ),
      pool.querySync(relays, { kinds: [0], authors: [pubkeyHex] }, { maxWait: QUERY_TIMEOUT_MS }),
    ])

    // Only trust events this key actually signed
    const signed = addressEvents.filter(
      (e) => isGenuine(e, pubkeyHex) && e.tags.some((t) => t[0] === 'd' && t[1] === BCH_ADDRESS_D_TAG),
    )
    const latest = newest(signed)
    if (!latest) {
      throw new Error('This Nostr identity has not published a BCH address (Paytaca: Settings → Nostr → publish address)')
    }

    let address = ''
    try {
      address = String(JSON.parse(latest.content)?.data?.address ?? '').trim()
    } catch {
      /* fall through */
    }
    // An empty payload is how Paytaca un-publishes; the newest event wins.
    if (!address) throw new Error('This Nostr identity removed its published BCH address')

    const addrErr = checkAddress(address)
    if (addrErr) throw new Error(`Published address is not usable here: ${addrErr}`)

    let displayName: string | undefined
    let picture: string | undefined
    const profile = newest(profileEvents.filter((e) => isGenuine(e, pubkeyHex)))
    if (profile) {
      try {
        const meta = JSON.parse(profile.content)
        displayName = (meta.display_name || meta.name || undefined)?.toString().slice(0, 64)
        picture = typeof meta.picture === 'string' && /^https:\/\//.test(meta.picture) ? meta.picture : undefined
      } catch {
        /* profile is optional */
      }
    }

    return {
      input: input.trim(),
      pubkeyHex,
      npub: nip19.npubEncode(pubkeyHex),
      address,
      publishedAt: latest.created_at,
      displayName,
      picture,
      nip05,
    }
  } finally {
    pool.close(relays)
  }
}

/** Short label for receipts and lists: name, NIP-05 or shortened npub. */
export function payeeLabel(p: NostrPayee): string {
  return p.nip05 || p.displayName || `${p.npub.slice(0, 12)}…${p.npub.slice(-4)}`
}

// ── BCH ↔ Nostr identity link: the Nostr side ──────────────
// The Nostr key claims the BCH address with a NIP-39 external identity:
//
//   kind 10011, tag ["i", "bch:<cashaddr without prefix>", "<anchor txid>"]
//
// The proof is the BCH anchor transaction in which the address named this
// Nostr key (see anchorNostrKey in contract.ts). A link holds only when both
// halves agree. Relays index the "i" tag, so a link can be found from the
// Nostr key or from the BCH address, with no Nomos server involved.

export const IDENTITY_KIND = 10011
const CHALLENGE_KIND = 22242
const CHALLENGE_MAX_AGE_S = 600

interface Nip07 {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate): Promise<Event>
}

/** The browser's NIP-07 Nostr signer (an extension such as Alby or nos2x), if any. */
export function nostrSigner(): Nip07 | null {
  const signer = (window as unknown as { nostr?: Nip07 }).nostr
  return signer && typeof signer.signEvent === 'function' ? signer : null
}

/** NIP-39 identity for a cashaddr: platform "bch" (mainnet) or "bchtest", lowercase body. */
export function bchIdentity(address: string): string {
  const [prefix, body] = address.trim().toLowerCase().split(':')
  if (!body) throw new Error('Use a full cashaddr with its prefix')
  return `${prefix === 'bitcoincash' ? 'bch' : prefix}:${body}`
}

function identityToAddress(identity: string): string | null {
  const [platform, body] = identity.split(':')
  if (!body) return null
  if (platform === 'bch') return `bitcoincash:${body}`
  if (platform === 'bchtest') return `bchtest:${body}`
  return null
}

export interface IdentityClaim {
  pubkeyHex: string
  npub: string
  address: string
  anchorTxid: string
  eventId: string
  createdAt: number
}

function claimsFrom(event: Event): IdentityClaim[] {
  return event.tags
    .filter((t) => t[0] === 'i' && typeof t[1] === 'string' && typeof t[2] === 'string')
    .map((t) => ({ address: identityToAddress(t[1]), anchorTxid: t[2] }))
    .filter((c): c is { address: string; anchorTxid: string } => Boolean(c.address))
    .map((c) => ({
      ...c,
      pubkeyHex: event.pubkey,
      npub: nip19.npubEncode(event.pubkey),
      eventId: event.id,
      createdAt: event.created_at,
    }))
}

/**
 * Find BCH identity claims from a Nostr identity (npub, nprofile, NIP-05) or
 * from a BCH address. Only events whose signatures check out are used, and
 * for each key only its newest identity list counts (kind 10011 is replaceable).
 */
export async function findIdentityClaims(input: string): Promise<IdentityClaim[]> {
  const pool = new SimplePool()
  const trimmed = input.trim()
  let relays = DEFAULT_RELAYS
  try {
    let events: Event[]
    if (isNostrIdentifier(trimmed)) {
      const pointer = await resolvePubkey(trimmed)
      relays = Array.from(new Set([...pointer.relays, ...DEFAULT_RELAYS]))
      events = (await pool.querySync(relays, { kinds: [IDENTITY_KIND], authors: [pointer.pubkeyHex] }, { maxWait: QUERY_TIMEOUT_MS }))
        .filter((e) => isGenuine(e, pointer.pubkeyHex))
    } else {
      const identity = bchIdentity(trimmed)
      events = (await pool.querySync(relays, { kinds: [IDENTITY_KIND], '#i': [identity] }, { maxWait: QUERY_TIMEOUT_MS }))
        .filter((e) => isGenuine(e, e.pubkey))
    }

    const latestByKey = new Map<string, Event>()
    for (const e of events) {
      const current = latestByKey.get(e.pubkey)
      if (!current || e.created_at > current.created_at) latestByKey.set(e.pubkey, e)
    }
    const claims = [...latestByKey.values()].flatMap(claimsFrom)
    if (isNostrIdentifier(trimmed)) return claims
    const wanted = trimmed.toLowerCase()
    return claims.filter((c) => c.address === wanted)
  } finally {
    pool.close(relays)
  }
}

/**
 * Publish the Nostr half of the link with the browser's NIP-07 signer. Other
 * external identities already in the key's list are kept; an older claim for
 * the same address is replaced.
 */
export async function publishIdentityClaim(address: string, anchorTxid: string): Promise<Event> {
  const signer = nostrSigner()
  if (!signer) throw new Error('No Nostr signer found. Install a NIP-07 extension such as Alby or nos2x.')
  const pubkeyHex = await signer.getPublicKey()
  const identity = bchIdentity(address)

  const pool = new SimplePool()
  try {
    const existing = newest((await pool.querySync(DEFAULT_RELAYS, { kinds: [IDENTITY_KIND], authors: [pubkeyHex] }, { maxWait: QUERY_TIMEOUT_MS }))
      .filter((e) => isGenuine(e, pubkeyHex)))
    const kept = (existing?.tags ?? []).filter((t) => !(t[0] === 'i' && t[1] === identity))

    const event = await signer.signEvent({
      kind: IDENTITY_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [...kept, ['i', identity, anchorTxid]],
      content: existing?.content ?? '',
    })
    if (!isGenuine(event, pubkeyHex)) throw new Error('The Nostr signer returned an invalid event')

    const results = await Promise.allSettled(pool.publish(DEFAULT_RELAYS, event))
    if (!results.some((r) => r.status === 'fulfilled')) throw new Error('No relay accepted the identity claim')
    return event
  } finally {
    pool.close(DEFAULT_RELAYS)
  }
}

/** Sign a one-time challenge with the browser's Nostr key (never published). */
export async function signNostrChallenge(nonceHex: string): Promise<Event> {
  const signer = nostrSigner()
  if (!signer) throw new Error('No Nostr signer found. Install a NIP-07 extension such as Alby or nos2x.')
  return signer.signEvent({
    kind: CHALLENGE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['challenge', nonceHex]],
    content: '',
  })
}

/** Verify a signed Nostr challenge: right key, right nonce, recent, valid signature. */
export function verifyNostrChallenge(event: Event, pubkeyHex: string, nonceHex: string): { ok: boolean; reason: string } {
  if (event.kind !== CHALLENGE_KIND) return { ok: false, reason: 'Wrong event kind for a challenge' }
  if (!event.tags.some((t) => t[0] === 'challenge' && t[1] === nonceHex)) return { ok: false, reason: 'The event does not carry this challenge' }
  if (Math.abs(Date.now() / 1000 - event.created_at) > CHALLENGE_MAX_AGE_S) return { ok: false, reason: 'The challenge response is too old' }
  if (!isGenuine(event, pubkeyHex)) return { ok: false, reason: 'Not signed by the linked Nostr key' }
  return { ok: true, reason: 'Signed by the linked Nostr key over this challenge' }
}

/** A fresh 16-byte challenge as hex. */
export function newChallenge(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}
