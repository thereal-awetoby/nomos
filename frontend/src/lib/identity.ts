// ── BCH ↔ Nostr identity: verification any app can run ────
// Everything here needs only public Nostr relays and a BCH node. Nothing
// is sent to Nomos. The protocol is written down in docs/IDENTITY_PROTOCOL.md.

import * as nip19 from 'nostr-tools/nip19'
import type { Event } from 'nostr-tools/pure'
import { verifyAnchor, verifyBchChallenge } from './contract'
import type { BchChallengeProof } from './contract'
import { findIdentityClaims, verifyNostrChallenge } from './nostr'
import type { IdentityClaim } from './nostr'

export interface CheckedClaim extends IdentityClaim {
  anchorOk: boolean
  anchorReason: string
}

/**
 * Find and check every link for an npub, nprofile, NIP-05 name or BCH
 * address. A claim is a proven link only when `anchorOk` is true.
 */
export async function verifyLinks(input: string): Promise<CheckedClaim[]> {
  const claims = await findIdentityClaims(input)
  return Promise.all(claims.map(async (claim) => {
    const check = await verifyAnchor(claim.anchorTxid, claim.address, claim.pubkeyHex)
    return { ...claim, anchorOk: check.ok, anchorReason: check.reason }
  }))
}

/**
 * A signed answer to a challenge, carrying everything a third party needs
 * to check it: the link it claims and the proof from one of the two keys.
 */
export interface AuthResponse {
  v: 1
  protocol: 'nomos-identity'
  method: 'nostr' | 'bch'
  challenge: string
  address: string
  npub: string
  anchorTxid: string
  proof: Event | BchChallengeProof
}

export interface AuthCheck {
  label: string
  ok: boolean
  detail: string
}

export function makeAuthResponse(
  method: AuthResponse['method'],
  challenge: string,
  link: { address: string; pubkeyHex: string; anchorTxid: string },
  proof: AuthResponse['proof'],
): AuthResponse {
  return {
    v: 1,
    protocol: 'nomos-identity',
    method,
    challenge,
    address: link.address,
    npub: nip19.npubEncode(link.pubkeyHex),
    anchorTxid: link.anchorTxid,
    proof,
  }
}

/**
 * Check an AuthResponse from scratch: the signature over the challenge, then
 * the link itself, fetched again from relays and the BCH chain. Pass the
 * challenge you issued; a response to any other challenge is rejected.
 */
export async function verifyAuthResponse(json: string, expectedChallenge: string): Promise<{ ok: boolean; checks: AuthCheck[] }> {
  const checks: AuthCheck[] = []
  const done = () => ({ ok: checks.length > 0 && checks.every((c) => c.ok), checks })

  let res: AuthResponse
  try {
    res = JSON.parse(json)
  } catch {
    checks.push({ label: 'Format', ok: false, detail: 'Not valid JSON' })
    return done()
  }
  if (res?.v !== 1 || res.protocol !== 'nomos-identity' || !['nostr', 'bch'].includes(res.method)) {
    checks.push({ label: 'Format', ok: false, detail: 'Not a nomos-identity v1 response' })
    return done()
  }

  let pubkeyHex: string
  try {
    const decoded = nip19.decode(res.npub)
    if (decoded.type !== 'npub') throw new Error()
    pubkeyHex = decoded.data
  } catch {
    checks.push({ label: 'Format', ok: false, detail: 'The npub is not valid' })
    return done()
  }
  checks.push({ label: 'Format', ok: true, detail: `${res.method === 'nostr' ? 'Nostr' : 'BCH'} answer, protocol v1` })

  const challengeOk = res.challenge === expectedChallenge.trim().toLowerCase()
  checks.push({
    label: 'Challenge',
    ok: challengeOk,
    detail: challengeOk ? 'Matches the challenge you issued' : 'Answers a different challenge',
  })

  let proofCheck: { ok: boolean; reason: string }
  try {
    proofCheck = res.method === 'nostr'
      ? verifyNostrChallenge(res.proof as Event, pubkeyHex, res.challenge)
      : verifyBchChallenge(res.proof as BchChallengeProof, res.address, res.challenge)
  } catch {
    proofCheck = { ok: false, reason: 'The proof is malformed' }
  }
  checks.push({ label: res.method === 'nostr' ? 'Nostr signature' : 'BCH signature', ok: proofCheck.ok, detail: proofCheck.reason })

  try {
    const claims = await findIdentityClaims(res.npub)
    const claim = claims.find((c) => c.address === res.address.toLowerCase() && c.anchorTxid.toLowerCase() === res.anchorTxid.toLowerCase())
    checks.push({
      label: 'Nostr claim',
      ok: Boolean(claim),
      detail: claim ? 'The key\'s current identity list names this address and anchor' : 'The key\'s current identity list does not carry this link',
    })
  } catch (err) {
    checks.push({ label: 'Nostr claim', ok: false, detail: err instanceof Error ? err.message : 'Relay lookup failed' })
  }

  const anchor = await verifyAnchor(res.anchorTxid, res.address, pubkeyHex)
  checks.push({ label: 'BCH anchor', ok: anchor.ok, detail: anchor.reason })

  return done()
}
