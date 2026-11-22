// The swap tracker's bookkeeping: reading a pasted claim, telling a claimed
// Base lock from a refunded one, and keeping finished steps ticked after a
// claim empties the lock they point at.
//
//   npm test        (from frontend/)

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseLockClaimed, swapOutcome, tickEarlierSteps, txidFrom } from '../src/lib/swapProgress'

const TXID = 'a7c4c4c62188b26654b89b56d2263a20644cf54f27b0000000000000000000ab'

test('txidFrom reads a bare ID or an explorer link', () => {
  assert.equal(txidFrom(TXID), TXID)
  assert.equal(txidFrom(`  ${TXID.toUpperCase()}\n`), TXID)
  assert.equal(txidFrom(`https://blockchair.com/bitcoin-cash/transaction/${TXID}`), TXID)
  assert.equal(txidFrom(`https://explorer.example/tx/${TXID}?tab=inputs`), TXID)
  assert.equal(txidFrom(`https://explorer.example/tx/${TXID}/`), TXID)
})

test('txidFrom rejects what is not a Bitcoin Cash transaction ID', () => {
  assert.equal(txidFrom(''), null)
  assert.equal(txidFrom('not a transaction'), null)
  assert.equal(txidFrom(TXID.slice(1)), null, '63 hex characters')
  assert.equal(txidFrom(`${TXID}0`), null, '65 hex characters')
  assert.equal(txidFrom(`0200000001${TXID}${TXID}`), null, 'raw transaction hex')
  assert.equal(txidFrom(`0x${TXID}`), null, 'a Base transaction hash')
  assert.equal(txidFrom(`https://basescan.org/tx/0x${TXID}`), null, 'a Basescan link')
})

test('baseLockClaimed counts a claim, never a refund', () => {
  const refundAfter = 1_800_000_000
  assert.equal(baseLockClaimed(null, refundAfter - 10, false), false)
  assert.equal(baseLockClaimed(undefined, refundAfter - 10, true), false)
  assert.equal(baseLockClaimed({ done: false, refundAfter }, refundAfter - 10, true), false, 'still open')
  // The contract refuses refunds before refundAfter, so a lock done by then was claimed.
  assert.equal(baseLockClaimed({ done: true, refundAfter }, refundAfter - 10, false), true)
  // From refundAfter on it may have been refunded instead; only evidence of a claim counts.
  assert.equal(baseLockClaimed({ done: true, refundAfter }, refundAfter, false), false)
  assert.equal(baseLockClaimed({ done: true, refundAfter }, refundAfter + 3600, true), true)
})

test('tickEarlierSteps keeps a finished swap ticked', () => {
  // A claim emptied the PUSD lock, so the chain no longer shows step 2 as done.
  const finished = tickEarlierSteps([{ done: true }, { done: false }, { done: true }])
  assert.deepEqual(finished.map((s) => s.done), [true, true, true])

  const partway = tickEarlierSteps([{ done: true }, { done: false }, { done: false }])
  assert.deepEqual(partway.map((s) => s.done), [true, false, false])

  const nothingYet = tickEarlierSteps([{ done: false }, { done: false }])
  assert.deepEqual(nothingYet.map((s) => s.done), [false, false])
})

test('tickEarlierSteps leaves a warning in place', () => {
  const steps = tickEarlierSteps([{ done: false }, { done: false, warn: true }, { done: false }, { done: true }])
  assert.deepEqual(steps.map((s) => s.done), [true, false, true, true])
})

test('swapOutcome: each side is complete once it claims what it receives', () => {
  // USDC to PUSD: the offer creator receives PUSD, the counterparty USDC.
  assert.equal(swapOutcome('usdc-to-pusd', 'initiator', { bchClaimTxid: 'a7c4' }), 'complete')
  assert.equal(swapOutcome('usdc-to-pusd', 'initiator', { baseClaimHash: '0x70f5' }), 'open', 'a USDC claim sent from this browser is not this side\'s')
  assert.equal(swapOutcome('usdc-to-pusd', 'responder', { baseClaimHash: '0x70f5' }), 'complete')
  // PUSD to USDC: the offer creator receives USDC, the counterparty PUSD.
  assert.equal(swapOutcome('pusd-to-usdc', 'initiator', { baseClaimHash: '0xd55f' }), 'complete')
  assert.equal(swapOutcome('pusd-to-usdc', 'responder', { bchClaimTxid: '2591' }), 'complete')
  assert.equal(swapOutcome('pusd-to-usdc', 'responder', {}), 'open')
})

test('swapOutcome: a refund ends the swap without a trade', () => {
  assert.equal(swapOutcome('pusd-to-usdc', 'initiator', { bchRefundTxid: 'aa' }), 'refunded')
  assert.equal(swapOutcome('usdc-to-pusd', 'responder', { bchRefundTxid: 'aa' }), 'refunded')
})
