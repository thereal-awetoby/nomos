// BCH-side HTLC tests on the SolidCash mock network. These execute the compiled
// covenant in the BCH VM; they do not deploy or test an EVM-side bridge.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { hash160 } from '@bitauth/libauth'
import { SignatureTemplate } from '@solidcash/solidcash'
import { ContractFactory } from '@solidcash/solidcash/contract-factory'
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock'

const artifact = JSON.parse(readFileSync(new URL('./build/HashedTimeLock.json', import.meta.url)))
const pkh = (signer) => hash160(signer.publicKey)
const sig = (signer) => new SignatureTemplate(signer.privateKey)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest()
const p2pkhLock = (hash) => new Uint8Array([0x76, 0xa9, 0x14, ...hash, 0x88, 0xac])

const INITIAL_BALANCE = 50_000n
const transfer = (contractCall, signer, amount) =>
  contractCall.transfer(p2pkhLock(pkh(signer)), amount)

test('HashedTimeLock enforces claim, refund, preimage, signer and deadline rules', async () => {
  const provider = new MockNetworkProvider()
  const [alice, bob, stranger] = await provider.getSigners(3, { fundingUtxos: 10 })
  const wallNow = Math.floor(Date.now() / 1000)
  provider.increaseTime(wallNow - provider.getBlockTime())

  // Timestamp locktimes must be back-dated below mock-chain median time past.
  const safeLocktime = wallNow - 3 * 3600
  const deploy = (hash, timeout) => new ContractFactory(artifact, alice).deploy(
    pkh(alice), pkh(bob), hash, BigInt(timeout), { initialBalance: INITIAL_BALANCE },
  )
  const lock = (contract, amount, locktime = safeLocktime) => contract.call
    .lock(sig(alice), alice.publicKey)
    .withValue(amount)
    .setLocktime(locktime)
    .send()
  const claim = (contract, receiver, preimage, amount, locktime = safeLocktime) => {
    const call = contract.connect(receiver).call
      .claim(preimage, sig(receiver), receiver.publicKey)
      .setLocktime(locktime)
    return transfer(call, receiver, amount).send()
  }

  // Claim with the matching SHA-256 preimage; no other-chain contract is exercised here.
  const secret = randomBytes(32)
  const htlc = await deploy(sha256(secret), wallNow + 2 * 3600)
  await lock(htlc, 25_000n)
  assert.equal(await htlc.state.lockedSats(), 25_000n)
  const claimReceipt = await claim(htlc, bob, secret, 25_000n)
  assert.ok(claimReceipt.txid)
  assert.equal(await htlc.state.claimed(), true)
  assert.equal(await htlc.state.lockedSats(), 0n)

  await assert.rejects(
    claim(htlc, bob, secret, 25_000n),
    /Already settled/,
  )

  // Wrong secret and wrong claimant both leave the funded contract untouched.
  const expectedSecret = randomBytes(32)
  const wrongSecretHtlc = await deploy(sha256(expectedSecret), wallNow + 2 * 3600)
  await lock(wrongSecretHtlc, 20_000n)
  await assert.rejects(
    claim(wrongSecretHtlc, bob, randomBytes(32), 20_000n),
    /Wrong preimage/,
  )
  await assert.rejects(
    claim(wrongSecretHtlc, stranger, expectedSecret, 20_000n),
    /Not the receiver/,
  )
  const wrongSignatureClaim = wrongSecretHtlc.connect(bob).call
    .claim(expectedSecret, sig(stranger), bob.publicKey)
    .setLocktime(safeLocktime)
  await assert.rejects(
    transfer(wrongSignatureClaim, bob, 20_000n).send(),
    /signature verification|NULLFAIL/i,
  )
  assert.equal(await wrongSecretHtlc.state.claimed(), false)

  // Refund after timeout succeeds; an early refund fails, after which the
  // receiver can still claim before the future deadline.
  const refundSecret = randomBytes(32)
  const expiredTimeout = safeLocktime + 900
  const refundHtlc = await deploy(sha256(refundSecret), expiredTimeout)
  await lock(refundHtlc, 18_000n, safeLocktime - 600)
  const refundLocktime = expiredTimeout + 300
  await assert.rejects(
    transfer(
      refundHtlc.call.refund(sig(stranger), alice.publicKey).setLocktime(refundLocktime),
      alice,
      18_000n,
    ).send(),
    /signature verification|NULLFAIL/i,
  )
  assert.equal(await refundHtlc.state.refunded(), false)

  const refundReceipt = await transfer(
    refundHtlc.call.refund(sig(alice), alice.publicKey).setLocktime(refundLocktime),
    alice,
    18_000n,
  ).send()
  assert.ok(refundReceipt.txid)
  assert.equal(await refundHtlc.state.refunded(), true)

  const futureSecret = randomBytes(32)
  const futureTimeout = wallNow + 24 * 3600
  const futureHtlc = await deploy(sha256(futureSecret), futureTimeout)
  await lock(futureHtlc, 15_000n)
  await assert.rejects(
    transfer(
      futureHtlc.call.refund(sig(alice), alice.publicKey).setLocktime(safeLocktime),
      alice,
      15_000n,
    ).send(),
    /Too early/,
  )
  assert.equal(await futureHtlc.state.refunded(), false)
  const futureClaim = await claim(futureHtlc, bob, futureSecret, 15_000n)
  assert.ok(futureClaim.txid)

  // The receiver cannot claim after the deadline, even if nobody has refunded yet.
  const lateSecret = randomBytes(32)
  const lateTimeout = safeLocktime + 900
  const lateHtlc = await deploy(sha256(lateSecret), lateTimeout)
  await lock(lateHtlc, 12_000n, safeLocktime - 600)
  await assert.rejects(
    claim(lateHtlc, bob, lateSecret, 12_000n, lateTimeout + 300),
    /Claim window expired/,
  )
  assert.equal(await lateHtlc.state.claimed(), false)
})
