// The swap offer board's messages: what a maker posts, what a taker sends
// back, what the maker answers, and everything a relay could hand over that
// must be ignored (forged, tampered, malformed or someone else's app data).
//
//   npm test        (from frontend/)

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import {
  BOARD_KIND,
  POST_TTL_S,
  acceptEvent,
  acceptMatches,
  closePostEvent,
  foldBoard,
  isOpen,
  newPostId,
  parseBoardEvent,
  postEvent,
  postKey,
  takeEvent,
} from '../src/lib/board'
import type { BoardAccept, BoardPost, BoardTake } from '../src/lib/board'

const makerKey = generateSecretKey()
const takerKey = generateSecretKey()
const strangerKey = generateSecretKey()
const maker = { bchPk: `02${'a'.repeat(64)}`, baseAddress: `0x${'1'.repeat(40)}` }
const taker = { bchPk: `03${'b'.repeat(64)}`, baseAddress: `0x${'2'.repeat(40)}` }

const terms = { network: 'mainnet' as const, direction: 'pusd-to-usdc' as const, pusdUnits: '130', usdcUnits: '1300000', maker }
const postId = newPostId()
const post = parseBoardEvent(postEvent(makerKey, { id: postId, ...terms })) as BoardPost
const take = parseBoardEvent(takeEvent(takerKey, post, taker)) as BoardTake
const offerCode = 'eyJ2IjoxfQ'
const accept = parseBoardEvent(acceptEvent(makerKey, post, take, offerCode)) as BoardAccept
const offer = { direction: 'pusd-to-usdc', pusdUnits: '130', usdcUnits: '1300000', initiator: maker, responder: taker }

test('a post, a take and an accept come back as they were sent', () => {
  assert.equal(post.type, 'post')
  assert.equal(post.id, postId)
  assert.equal(post.author, getPublicKey(makerKey))
  assert.deepEqual([post.direction, post.pusdUnits, post.usdcUnits, post.network, post.open], ['pusd-to-usdc', '130', '1300000', 'mainnet', true])
  assert.equal(post.expiresAt - post.createdAt, POST_TTL_S)

  assert.equal(take.type, 'take')
  assert.equal(take.postAuthor, post.author)
  assert.equal(take.author, getPublicKey(takerKey))
  assert.deepEqual(take.taker, taker)

  assert.equal(accept.type, 'accept')
  assert.equal(accept.author, post.author)
  assert.equal(accept.takeEvent, take.event)
  assert.equal(accept.takeAuthor, take.author)
  assert.equal(accept.offer, offerCode)
})

test('only the post\'s author can accept, and a tampered event is dropped', () => {
  const forged = acceptEvent(strangerKey, post, take, offerCode)
  assert.equal(parseBoardEvent(forged), null, 'an accept from another key')

  const tampered = { ...postEvent(makerKey, { id: newPostId(), ...terms }) }
  tampered.content = tampered.content.replace('"130"', '"1"')
  assert.equal(parseBoardEvent(tampered), null, 'content changed after signing')
})

test('malformed posts and other apps\' data are ignored', () => {
  const bad = (patch: Record<string, unknown>) => parseBoardEvent(postEvent(makerKey, { id: newPostId(), ...terms, ...patch } as any))
  assert.equal(bad({ pusdUnits: '0' }), null)
  assert.equal(bad({ pusdUnits: '-5' }), null)
  assert.equal(bad({ usdcUnits: '1e6' }), null)
  assert.equal(bad({ pusdUnits: '100000001' }), null, 'over a million dollars')
  assert.equal(bad({ direction: 'sideways' }), null)
  assert.equal(bad({ network: 'testnet' }), null)
  assert.equal(bad({ maker: { bchPk: '02zz', baseAddress: maker.baseAddress } }), null)
  assert.equal(bad({ expiresAt: Math.floor(Date.now() / 1000) - 10 }), null, 'expires before it was made')

  const paytaca = finalizeEvent({
    kind: BOARD_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'paytaca:bch-address']],
    content: '{"name":"Paytaca BCH Address","data":{"address":"bitcoincash:q"}}',
  }, makerKey)
  assert.equal(parseBoardEvent(paytaca), null)
})

test('the board keeps the latest of everything; an accepted or closed post is no longer open', () => {
  const fresh = foldBoard([post])
  assert.equal(fresh.posts.length, 1)
  assert.ok(isOpen(fresh, post))

  const withTake = foldBoard([post, take])
  assert.deepEqual(withTake.takes.get(postKey(post.author, post.id))?.map((t) => t.author), [take.author])
  assert.ok(isOpen(withTake, post), 'a take alone leaves it open')

  const accepted = foldBoard([post, take, accept])
  assert.ok(!isOpen(accepted, post))
  assert.equal(accepted.accepts.get(postKey(post.author, post.id))?.event, accept.event)

  const closed = parseBoardEvent(closePostEvent(makerKey, post)) as BoardPost
  const afterClose = foldBoard([post, closed])
  assert.equal(afterClose.posts.length, 1)
  assert.equal(afterClose.posts[0].open, false)
  assert.ok(!isOpen(afterClose, afterClose.posts[0]))

  assert.ok(!isOpen(fresh, post, post.expiresAt + 1), 'past its end time')
})

test('the taker opens only an offer with the post\'s terms, made for them', () => {
  assert.ok(acceptMatches(post, take, accept, offer))
  assert.ok(!acceptMatches(post, take, accept, { ...offer, usdcUnits: '1' }), 'other amounts')
  assert.ok(!acceptMatches(post, take, accept, { ...offer, direction: 'usdc-to-pusd' }), 'other direction')
  assert.ok(!acceptMatches(post, take, accept, { ...offer, responder: maker }), 'made for someone else')
  assert.ok(!acceptMatches(post, take, accept, { ...offer, initiator: taker }), 'not from the maker')

  const otherTake = parseBoardEvent(takeEvent(strangerKey, post, taker)) as BoardTake
  assert.ok(!acceptMatches(post, otherTake, accept, offer), 'an accept for a different take')
})
