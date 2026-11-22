// ── Swap offer board ────────────────────────────────────────
// Open PUSD and USDC offers on public Nostr relays, with no Nomos server and
// no middleman. A maker posts what they give and what they want. A taker
// answers with their swap details. The maker's page turns that answer into the
// usual swap offer and posts it back to the taker, and from there both sides
// lock on chain exactly as with a shared link: the second lock is only made
// after the first is checked on chain, so a bad message can waste time but
// cannot move anyone's coins.
//
// Every message is a signed Nostr event (NIP-78 app data, kind 30078). Each
// browser signs with its own board key, kept in local storage: a name on the
// board, not a wallet key. Relays only carry the messages; anyone can run one.

import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure'
import type { Event } from 'nostr-tools/pure'
import { DEFAULT_RELAYS } from './nostr'

export const BOARD_KIND = 30078
export const BOARD_TOPIC = 'nomos-swap-board'
/** How long a posted offer stays up. */
export const POST_TTL_S = 24 * 3600
/** Largest amounts taken from the board, in token units: a million dollars. */
const MAX_PUSD_UNITS = 100_000_000n
const MAX_USDC_UNITS = 1_000_000_000_000n
/** An encoded swap offer is a few hundred characters. */
const MAX_OFFER_CHARS = 4_000
const QUERY_TIMEOUT_MS = 6_000

export type BoardDirection = 'pusd-to-usdc' | 'usdc-to-pusd'
export type BoardNetwork = 'mainnet' | 'chipnet'

/** A side's swap details: the BCH key its PUSD lock uses and its Base address. */
export interface BoardParty {
  bchPk: string
  baseAddress: string
}

/** A posted offer. `direction` is the maker's: 'pusd-to-usdc' means the maker gives PUSD. */
export interface BoardPost {
  type: 'post'
  event: string
  author: string
  id: string
  createdAt: number
  expiresAt: number
  network: BoardNetwork
  direction: BoardDirection
  pusdUnits: string
  usdcUnits: string
  maker: BoardParty
  open: boolean
}

/** A taker's answer to a post: their swap details. */
export interface BoardTake {
  type: 'take'
  event: string
  author: string
  postId: string
  postAuthor: string
  createdAt: number
  taker: BoardParty
}

/** The maker's reply to one take: the swap offer, encoded as in an offer link. */
export interface BoardAccept {
  type: 'accept'
  event: string
  author: string
  postId: string
  postAuthor: string
  takeEvent: string
  takeAuthor: string
  createdAt: number
  offer: string
}

export type BoardMessage = BoardPost | BoardTake | BoardAccept

const unix = () => Math.floor(Date.now() / 1000)
const dTag = (type: 'post' | 'take' | 'accept', postId: string) => `nomos-swap:${type}:${postId}`
const coordinate = (author: string, postId: string) => `${BOARD_KIND}:${author}:${dTag('post', postId)}`
const tagValue = (event: Event, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const HEX64 = /^[0-9a-f]{64}$/
const POST_ID = /^[0-9a-f]{32}$/

/** Where a post lives: its author and its id. */
export const postKey = (author: string, postId: string) => `${author}:${postId}`

export function isParty(value: unknown): value is BoardParty {
  const p = value as BoardParty
  return typeof p?.bchPk === 'string' && /^0[23][0-9a-f]{64}$/i.test(p.bchPk)
    && typeof p?.baseAddress === 'string' && /^0x[0-9a-fA-F]{40}$/.test(p.baseAddress)
}

const sameParty = (a: BoardParty, b: BoardParty) =>
  a.bchPk.toLowerCase() === b.bchPk.toLowerCase() && a.baseAddress.toLowerCase() === b.baseAddress.toLowerCase()

function units(value: unknown, max: bigint): string | null {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null
  return BigInt(value) <= max ? value : null
}

export function newPostId(): string {
  return Array.from(generateSecretKey().slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Building messages ─────────────────────────────────────

export function postEvent(
  secretKey: Uint8Array,
  post: {
    id: string
    network: BoardNetwork
    direction: BoardDirection
    pusdUnits: string
    usdcUnits: string
    maker: BoardParty
    open?: boolean
    createdAt?: number
    expiresAt?: number
  },
): Event {
  const createdAt = post.createdAt ?? unix()
  const expiresAt = post.expiresAt ?? createdAt + POST_TTL_S
  return finalizeEvent({
    kind: BOARD_KIND,
    created_at: createdAt,
    tags: [['d', dTag('post', post.id)], ['t', BOARD_TOPIC], ['expiration', String(expiresAt)]],
    content: JSON.stringify({
      v: 1,
      type: 'post',
      network: post.network,
      direction: post.direction,
      pusdUnits: post.pusdUnits,
      usdcUnits: post.usdcUnits,
      maker: post.maker,
      open: post.open ?? true,
    }),
  }, secretKey)
}

/** The maker takes a post down, or marks it taken, by posting it again closed. */
export function closePostEvent(secretKey: Uint8Array, post: BoardPost): Event {
  return postEvent(secretKey, {
    ...post,
    open: false,
    createdAt: Math.max(unix(), post.createdAt + 1),
    expiresAt: post.expiresAt,
  })
}

export function takeEvent(secretKey: Uint8Array, post: BoardPost, taker: BoardParty): Event {
  return finalizeEvent({
    kind: BOARD_KIND,
    created_at: unix(),
    tags: [
      ['d', dTag('take', post.id)],
      ['t', BOARD_TOPIC],
      ['a', coordinate(post.author, post.id)],
      ['p', post.author],
      ['expiration', String(post.expiresAt)],
    ],
    content: JSON.stringify({ v: 1, type: 'take', postId: post.id, taker }),
  }, secretKey)
}

export function acceptEvent(secretKey: Uint8Array, post: BoardPost, take: BoardTake, offer: string): Event {
  return finalizeEvent({
    kind: BOARD_KIND,
    created_at: unix(),
    tags: [
      ['d', dTag('accept', post.id)],
      ['t', BOARD_TOPIC],
      ['a', coordinate(post.author, post.id)],
      ['p', take.author],
      ['e', take.event],
      ['expiration', String(post.expiresAt + POST_TTL_S)],
    ],
    content: JSON.stringify({ v: 1, type: 'accept', postId: post.id, takeEvent: take.event, offer }),
  }, secretKey)
}

// ── Reading messages ──────────────────────────────────────

/** A board message from a relay event, or null for anything forged, malformed or off-topic. */
export function parseBoardEvent(event: Event): BoardMessage | null {
  if (event?.kind !== BOARD_KIND || !event.tags.some((t) => t[0] === 't' && t[1] === BOARD_TOPIC)) return null
  // A fresh copy: nostr-tools caches a verdict on the event object, and a
  // cached "valid" must not survive a change to the content.
  const plain = {
    id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind,
    tags: event.tags, content: event.content, sig: event.sig,
  }
  if (!verifyEvent(plain)) return null
  let body: any
  try {
    body = JSON.parse(event.content)
  } catch {
    return null
  }
  if (body?.v !== 1) return null
  const d = tagValue(event, 'd') ?? ''

  if (body.type === 'post') {
    const id = d.startsWith('nomos-swap:post:') ? d.slice('nomos-swap:post:'.length) : ''
    const expiresAt = Number(tagValue(event, 'expiration'))
    const pusdUnits = units(body.pusdUnits, MAX_PUSD_UNITS)
    const usdcUnits = units(body.usdcUnits, MAX_USDC_UNITS)
    if (!POST_ID.test(id) || !pusdUnits || !usdcUnits || !isParty(body.maker)) return null
    if (body.network !== 'mainnet' && body.network !== 'chipnet') return null
    if (body.direction !== 'pusd-to-usdc' && body.direction !== 'usdc-to-pusd') return null
    if (!Number.isInteger(expiresAt) || expiresAt <= event.created_at || expiresAt > event.created_at + 2 * POST_TTL_S) return null
    return {
      type: 'post',
      event: event.id,
      author: event.pubkey,
      id,
      createdAt: event.created_at,
      expiresAt,
      network: body.network,
      direction: body.direction,
      pusdUnits,
      usdcUnits,
      maker: { bchPk: body.maker.bchPk.toLowerCase(), baseAddress: body.maker.baseAddress },
      open: body.open !== false,
    }
  }

  // A take names the post's author in its p tag; an accept names the taker.
  const pTag = tagValue(event, 'p') ?? ''
  const postId = typeof body.postId === 'string' ? body.postId : ''
  if (!POST_ID.test(postId) || !HEX64.test(pTag)) return null

  if (body.type === 'take') {
    if (d !== dTag('take', postId) || tagValue(event, 'a') !== coordinate(pTag, postId)) return null
    if (!isParty(body.taker)) return null
    return {
      type: 'take',
      event: event.id,
      author: event.pubkey,
      postId,
      postAuthor: pTag,
      createdAt: event.created_at,
      taker: { bchPk: body.taker.bchPk.toLowerCase(), baseAddress: body.taker.baseAddress },
    }
  }

  if (body.type === 'accept') {
    // Only the post's own author can accept a take on it.
    const takeEvent = tagValue(event, 'e') ?? ''
    if (d !== dTag('accept', postId) || tagValue(event, 'a') !== coordinate(event.pubkey, postId)) return null
    if (!HEX64.test(takeEvent) || takeEvent !== body.takeEvent) return null
    if (typeof body.offer !== 'string' || body.offer.length === 0 || body.offer.length > MAX_OFFER_CHARS) return null
    return {
      type: 'accept',
      event: event.id,
      author: event.pubkey,
      postId,
      postAuthor: event.pubkey,
      takeEvent,
      takeAuthor: pTag,
      createdAt: event.created_at,
      offer: body.offer,
    }
  }
  return null
}

/** Newest first, ties broken by event id as relays do for replaceable events. */
const newer = (a: { createdAt: number; event: string }, b: { createdAt: number; event: string }) =>
  a.createdAt !== b.createdAt ? a.createdAt > b.createdAt : a.event < b.event

export interface BoardState {
  /** The latest version of every post, open or not, newest first. */
  posts: BoardPost[]
  /** Takes on each post (by postKey), the latest per taker. */
  takes: Map<string, BoardTake[]>
  /** The maker's accept on each post (by postKey), the latest. */
  accepts: Map<string, BoardAccept>
}

/** Fold relay messages into the board: one version per post, take and accept. */
export function foldBoard(messages: BoardMessage[]): BoardState {
  const posts = new Map<string, BoardPost>()
  const takes = new Map<string, Map<string, BoardTake>>()
  const accepts = new Map<string, BoardAccept>()
  for (const m of messages) {
    if (m.type === 'post') {
      const key = postKey(m.author, m.id)
      const seen = posts.get(key)
      if (!seen || newer(m, seen)) posts.set(key, m)
    } else if (m.type === 'take') {
      const key = postKey(m.postAuthor, m.postId)
      const byTaker = takes.get(key) ?? new Map<string, BoardTake>()
      const seen = byTaker.get(m.author)
      if (!seen || newer(m, seen)) byTaker.set(m.author, m)
      takes.set(key, byTaker)
    } else {
      const key = postKey(m.postAuthor, m.postId)
      const seen = accepts.get(key)
      if (!seen || newer(m, seen)) accepts.set(key, m)
    }
  }
  return {
    posts: [...posts.values()].sort((a, b) => b.createdAt - a.createdAt),
    takes: new Map([...takes].map(([key, byTaker]) => [key, [...byTaker.values()].sort((a, b) => a.createdAt - b.createdAt)])),
    accepts,
  }
}

/** A post still up for taking: open, unexpired and not yet accepted. */
export function isOpen(state: BoardState, post: BoardPost, now = unix()): boolean {
  return post.open && post.expiresAt > now && !state.accepts.has(postKey(post.author, post.id))
}

/** The terms of a swap offer, as lib/swap encodes them. */
export interface OfferTerms {
  direction: string
  pusdUnits: string
  usdcUnits: string
  initiator: BoardParty
  responder: BoardParty
}

/**
 * True when the maker's offer is exactly the post's terms, made by the
 * post's maker for this take's taker. The taker's page opens nothing else.
 */
export function acceptMatches(post: BoardPost, take: BoardTake, accept: BoardAccept, offer: OfferTerms): boolean {
  return accept.author === post.author
    && accept.postId === post.id
    && accept.takeEvent === take.event
    && accept.takeAuthor === take.author
    && take.postAuthor === post.author
    && take.postId === post.id
    && offer.direction === post.direction
    && offer.pusdUnits === post.pusdUnits
    && offer.usdcUnits === post.usdcUnits
    && isParty(offer.initiator) && sameParty(offer.initiator, post.maker)
    && isParty(offer.responder) && sameParty(offer.responder, take.taker)
}

// ── Relays and the board key ──────────────────────────────

const KEY_STORAGE = 'nomos:boardKey'

/** This browser's board key: created on first use, kept in local storage. */
export function boardKey(): { secretKey: Uint8Array; publicKey: string } {
  let hex: string | null = null
  try { hex = localStorage.getItem(KEY_STORAGE) } catch { /* storage blocked: a key for this visit */ }
  let secretKey: Uint8Array
  if (hex && HEX64.test(hex)) {
    secretKey = Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)))
  } else {
    secretKey = generateSecretKey()
    try {
      localStorage.setItem(KEY_STORAGE, Array.from(secretKey, (b) => b.toString(16).padStart(2, '0')).join(''))
    } catch { /* see above */ }
  }
  return { secretKey, publicKey: getPublicKey(secretKey) }
}

/** Every board message from the last two days. */
export async function readBoard(relays: string[] = DEFAULT_RELAYS): Promise<BoardMessage[]> {
  const pool = new SimplePool()
  try {
    const events = await pool.querySync(
      relays,
      { kinds: [BOARD_KIND], '#t': [BOARD_TOPIC], since: unix() - 2 * POST_TTL_S },
      { maxWait: QUERY_TIMEOUT_MS },
    )
    return events.map(parseBoardEvent).filter((m): m is BoardMessage => m !== null)
  } finally {
    pool.close(relays)
  }
}

/** Send one message to the relays; at least one has to take it. */
export async function publishToBoard(event: Event, relays: string[] = DEFAULT_RELAYS): Promise<void> {
  const pool = new SimplePool()
  try {
    const results = await Promise.allSettled(pool.publish(relays, event))
    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error('No relay took the message. Check your connection and try again.')
    }
  } finally {
    pool.close(relays)
  }
}
