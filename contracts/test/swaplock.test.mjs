// SwapLock.cash (the PUSD side of the PUSD <-> USDC swap) in the BCH VM.
// Offline: CashScript's mock network, no chipnet or mainnet connection.
//
// 1. The artifact the app ships (frontend/src/lib/SwapLock.json) is what cashc
//    builds from contracts/SwapLock.cash.
// 2. The transaction shapes the app builds (frontend/src/lib/swap.ts): a
//    2,000-sat lock output carrying PUSD, claimed or refunded to a token-aware
//    P2PKH address with a 600-sat fee.
//
// Run: cd contracts && npm ci && npm run test:swap

import { readFileSync } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
import { compileFile } from 'cashc'
import { Contract, MockNetworkProvider, TransactionBuilder, SignatureTemplate, randomUtxo } from 'cashscript'
import { secp256k1, hash160, encodeCashAddress, binToHex } from '@bitauth/libauth'

const here = (path) => new URL(path, import.meta.url)
const shipped = JSON.parse(readFileSync(here('../../frontend/src/lib/SwapLock.json'), 'utf8'))
const PUSD = '2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544'
const LOCK_SATS = 2_000n
const FEE = 600n
const UNITS = 150n

let pass = 0
let fail = 0
const check = (ok, label, extra = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? '✓' : '✗'} ${label}${extra}`)
}

// ── 1. Artifact matches the source ──
const fresh = compileFile(here('../SwapLock.cash'))
check(fresh.bytecode === shipped.bytecode && fresh.debug?.bytecode === shipped.debug?.bytecode,
  'frontend/src/lib/SwapLock.json is what cashc builds from contracts/SwapLock.cash')

// ── 2. Claim and refund ──
const key = () => {
  const priv = new Uint8Array(randomBytes(32))
  const pub = secp256k1.derivePublicKeyCompressed(priv)
  if (typeof pub === 'string') throw new Error(pub)
  const encoded = encodeCashAddress({ prefix: 'bitcoincash', type: 'p2pkhWithTokens', payload: hash160(pub) })
  return { priv, pubHex: binToHex(pub), tokenAddress: typeof encoded === 'string' ? encoded : encoded.address }
}
const recipient = key()
const refunder = key()
const stranger = key()
const secret = randomBytes(32).toString('hex')
const secretHash = createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex')
const refundAfter = 1_800_000_000

function lockedCoin() {
  const provider = new MockNetworkProvider()
  const contract = new Contract(shipped, [recipient.pubHex, refunder.pubHex, secretHash, BigInt(refundAfter)], { provider, addressType: 'p2sh32' })
  const utxo = { ...randomUtxo({ satoshis: LOCK_SATS }), token: { category: PUSD, amount: UNITS } }
  provider.addUtxo(contract.tokenAddress, utxo)
  return { provider, contract, utxo }
}

function spend(path, who, { secretHex = secret, locktime } = {}) {
  const { provider, contract, utxo } = lockedCoin()
  const tb = new TransactionBuilder({ provider })
  const unlocker = path === 'claim'
    ? contract.unlock.claim(new SignatureTemplate(who.priv), secretHex)
    : contract.unlock.refund(new SignatureTemplate(who.priv))
  tb.addInput(utxo, unlocker)
  tb.addOutput({ to: who.tokenAddress, amount: LOCK_SATS - FEE, token: { category: PUSD, amount: UNITS } })
  if (locktime !== undefined) tb.setLocktime(locktime)
  return tb
}

async function attempt(tb) {
  try {
    tb.debug()
    const hex = await tb.build()
    return { ok: true, bytes: hex.length / 2 }
  } catch (e) {
    return { ok: false, err: String(e?.message ?? e).split('\n')[0] }
  }
}

const rate = (r) => (r.ok ? ` (${r.bytes} bytes, ${(Number(FEE) / r.bytes).toFixed(2)} sat/byte)` : `: ${r.err}`)
const why = (r) => (r.ok ? '' : ` (${r.err.replace(/ at input 0.*$/, '')})`)

let r = await attempt(spend('claim', recipient))
check(r.ok && Number(FEE) / r.bytes >= 1, 'the recipient claims with the right secret, fee above 1 sat/byte', rate(r))
r = await attempt(spend('claim', recipient, { secretHex: randomBytes(32).toString('hex') }))
check(!r.ok, 'a wrong secret is refused', why(r))
r = await attempt(spend('claim', stranger))
check(!r.ok, 'someone else holding the secret cannot claim', why(r))
r = await attempt(spend('claim', refunder))
check(!r.ok, 'the refunder cannot claim', why(r))
r = await attempt(spend('refund', refunder, { locktime: refundAfter - 1 }))
check(!r.ok, 'a refund before the timeout is refused', why(r))
r = await attempt(spend('refund', refunder, { locktime: refundAfter }))
check(r.ok && Number(FEE) / r.bytes >= 1, 'the refunder takes the PUSD back from the timeout on', rate(r))
r = await attempt(spend('refund', stranger, { locktime: refundAfter + 10 }))
check(!r.ok, 'nobody else can take the refund', why(r))

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
