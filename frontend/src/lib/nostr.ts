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
import type { Event } from 'nostr-tools/pure'

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
