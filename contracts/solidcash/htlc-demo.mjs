#!/usr/bin/env node
// The BCH hash-time-lock (HashedTimeLock.scash) on a live network: one lock is
// claimed with its secret, another is refunded after its deadline, and the
// wrong secret and a late claim are refused.
//
//   npm run build
//   PRIVATE_KEY=<funded WIF> node htlc-demo.mjs mainnet      (or chipnet)
//   node htlc-demo.mjs mock                                   (offline, no key)
//   Windows: set PRIVATE_KEY=<WIF>  then  node htlc-demo.mjs mainnet
//
// The wallet is the sender. The receiver is a second key derived from the
// wallet's key, so this script can sign for both sides. A contract call spends
// some of its signer's coins as inputs and needs more for the fee, so the
// receiver gets four small coins first. Whatever it holds goes back to the
// wallet at the end, or later with `node keys.mjs sweep`. Fund about 60,000
// sats. Each deploy leaves state tokens in its contract, which is most of what
// a run costs.

import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { Signer, SignatureTemplate, TransactionBuilder, randomUtxo } from '@solidcash/solidcash'
import { ContractFactory } from '@solidcash/solidcash/contract-factory'
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock'
import { decodePrivateKeyWif, hash160 } from '@bitauth/libauth'
import {
  derivedKey, isConnectionError, isFundingError, keepRunningThroughDroppedSockets, liveProvider,
} from './live.mjs'

const NETWORK = process.argv[2] ?? 'chipnet'
const TX = {
  mainnet: (id) => `https://blockchair.com/bitcoin-cash/transaction/${id}`,
  chipnet: (id) => `https://chipnet.chaingraph.cash/tx/${id}`,
  mock: (id) => `${id} (mock)`,
}[NETWORK]
if (!TX) { console.error('Network must be mainnet, chipnet or mock'); process.exit(1) }

const LOCK_SATS = 2_000n
const FEE_COIN = 3_000n
const RECEIVER_COINS = 4

const artifact = JSON.parse(readFileSync(new URL('./build/HashedTimeLock.json', import.meta.url)))
const sha256 = (bytes) => new Uint8Array(createHash('sha256').update(bytes).digest())
const p2pkh = (pkh) => new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac])
const sig = (signer) => new SignatureTemplate(signer.privateKey)
const pkhOf = (signer) => hash160(signer.publicKey)
const hex = (bytes) => Buffer.from(bytes).toString('hex')
const reason = (e) => {
  const m = String(e?.message ?? e)
  return m.match(/failing require[^\n]*/)?.[0] ?? m.split('\n')[0]
}

keepRunningThroughDroppedSockets()
let provider
let wallet
if (NETWORK === 'mock') {
  // Offline: a throwaway key holding one coin of the suggested funding. The
  // mock could make up fee coins by itself; like a live network, it may not.
  provider = new MockNetworkProvider()
  wallet = new Signer(new Uint8Array(randomBytes(32)), provider)
  await provider.addUtxo(wallet.address, { ...randomUtxo({ satoshis: 60_000n }) })
  provider.addUtxo = undefined
  provider.increaseTime(Math.floor(Date.now() / 1000) - provider.getBlockTime())
} else {
  const wif = process.env.PRIVATE_KEY
  if (!wif) { console.error(`Set PRIVATE_KEY to a funded ${NETWORK} WIF`); process.exit(1) }
  const decoded = decodePrivateKeyWif(wif)
  if (typeof decoded === 'string') { console.error(`Bad WIF: ${decoded}`); process.exit(1) }
  provider = await liveProvider(NETWORK)
  wallet = new Signer(decoded.privateKey, provider)
}
const receiver = new Signer(derivedKey('nomos-htlc-receiver', wallet.privateKey), provider)

/** Plain BCH payment from a key's coins, change back to the same key. */
async function pay(from, outputs) {
  const coins = (await from.getUtxos()).filter((u) => !u.token)
  const tb = new TransactionBuilder({ provider })
  tb.addInputs(coins, from.unlockP2PKH())
  for (const o of outputs) tb.addOutput(o)
  tb.addBchChangeOutputIfNeeded({ to: from.getLockingBytecode(), feeRate: 1 })
  return tb.send()
}

/** Everything a key holds, back to the wallet. */
async function sweep(from) {
  const coins = (await from.getUtxos()).filter((u) => !u.token)
  if (coins.length === 0) return null
  const tb = new TransactionBuilder({ provider })
  tb.addInputs(coins, from.unlockP2PKH())
  tb.addBchChangeOutputIfNeeded({ to: wallet.getLockingBytecode(), feeRate: 1 })
  return tb.send()
}

const deploy = async (hashLock, deadline) => {
  const htlc = await new ContractFactory(artifact, wallet).deploy(
    pkhOf(wallet), pkhOf(receiver), hashLock, BigInt(deadline),
  )
  await htlc.waitForDeployment()
  return htlc
}
const lock = (htlc, locktime) => htlc.call
  .lock(sig(wallet), wallet.publicKey)
  .withValue(LOCK_SATS)
  .setLocktime(locktime)
  .send()
const claim = (htlc, preimage, locktime) => htlc.connect(receiver).call
  .claim(preimage, sig(receiver), receiver.publicKey)
  .setLocktime(locktime)
  .transfer(p2pkh(pkhOf(receiver)), LOCK_SATS)
  .send()
const refund = (htlc, locktime) => htlc.call
  .refund(sig(wallet), wallet.publicKey)
  .setLocktime(locktime)
  .transfer(p2pkh(pkhOf(wallet)), LOCK_SATS)
  .send()

const now = Math.floor(Date.now() / 1000)
const locktime = now - 3 * 3600 // nodes need a timestamp locktime below median time past
let ok = true
/** Only the contract or the network turning a call down counts; a run that could not pay for it proves nothing. */
const expectRefusal = async (label, attempt) => {
  try {
    const r = await attempt()
    ok = false
    console.log(`  NOT REFUSED (unexpected): ${TX(r.txid)}`)
  } catch (e) {
    if (isFundingError(e) || isConnectionError(e)) {
      ok = false
      console.log(`  NOT TESTED, ${label}: ${reason(e)}`)
      return
    }
    console.log(`  REFUSED, ${label}: ${reason(e)}`)
  }
}

const bchOf = async (signer) => (await signer.getUtxos()).filter((u) => !u.token).reduce((sum, u) => sum + u.satoshis, 0n)
const startSats = await bchOf(wallet)
console.log(`Network: ${NETWORK}`)
console.log('Sender (wallet):   ', wallet.address)
console.log('Receiver (derived):', receiver.address)

try {
  console.log(`\nGive the receiver ${RECEIVER_COINS} coins for its inputs and fees…`)
  const funding = await pay(wallet, [
    ...Array.from({ length: RECEIVER_COINS }, () => ({ to: receiver.getLockingBytecode(), amount: FEE_COIN })),
    { to: wallet.getLockingBytecode(), amount: FEE_COIN },
    { to: wallet.getLockingBytecode(), amount: FEE_COIN },
  ])
  console.log('  funded:', TX(funding.txid))

  // ── 1. Claimed with the secret ─────────────────────────────
  const secret = randomBytes(32)
  const deadline = now + 2 * 3600
  console.log(`\nHTLC 1: lock ${LOCK_SATS} sats to sha256(secret), claimable for 2 hours`)
  const htlc = await deploy(sha256(secret), deadline)
  console.log('  deploy:', TX(htlc.deploymentTransaction().txid))
  console.log('  lock:  ', TX((await lock(htlc, locktime)).txid))
  await expectRefusal('wrong secret', () => claim(htlc, randomBytes(32), locktime))
  const claimed = await claim(htlc, secret, locktime)
  console.log('  CLAIMED by the receiver:', TX(claimed.txid))
  console.log('  secret, now public on chain:', hex(secret))
  console.log('  claimed on-chain:', await htlc.state.claimed())

  // ── 2. Refunded after the deadline ─────────────────────────
  const secret2 = randomBytes(32)
  const deadline2 = locktime + 900 // already past in chain time
  console.log(`\nHTLC 2: lock ${LOCK_SATS} sats with a deadline that has passed`)
  const htlc2 = await deploy(sha256(secret2), deadline2)
  console.log('  deploy:', TX(htlc2.deploymentTransaction().txid))
  console.log('  lock:  ', TX((await lock(htlc2, locktime - 600)).txid))
  await expectRefusal('claim after the deadline', () => claim(htlc2, secret2, deadline2 + 300))
  const refunded = await refund(htlc2, deadline2 + 300)
  console.log('  REFUNDED to the sender:', TX(refunded.txid))
  console.log('  refunded on-chain:', await htlc2.state.refunded())
} catch (e) {
  ok = false
  console.error('\nStopped:', reason(e))
} finally {
  const swept = await sweep(receiver).catch((e) => {
    console.error('Could not sweep the receiver yet:', reason(e))
    console.error('Its coins stay with the same WIF; `node keys.mjs sweep <address> mainnet` collects them later.')
    return null
  })
  if (swept) console.log('\nReceiver swept back to the wallet:', TX(swept.txid))
}

console.log(ok ? '\nDone: claimed with the secret, refunded after the deadline, refusals as expected.' : '\nSomething did not go as expected; see above.')
const endSats = await bchOf(wallet)
console.log(`Wallet: ${endSats.toLocaleString('en-US')} of ${startSats.toLocaleString('en-US')} sats back; the run cost ${(startSats - endSats).toLocaleString('en-US')} sats.`)
process.exit(ok ? 0 : 1)
