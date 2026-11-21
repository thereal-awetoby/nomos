// Closing a vault (frontend/src/lib/contract.ts, executeCloseVault) in the BCH VM.
// Offline: CashScript's mock network, no chipnet or mainnet connection.
//
// The owner spends every vault coin through setMandate: one plain output back to
// the owner's wallet, and the state NFT to the owner's token address with 1,000
// sats, so the wallet is never asked to sign a token burn.
//
// Run: cd contracts && npm ci && npm run test:close

import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { compileFile } from 'cashc'
import { Contract, MockNetworkProvider, TransactionBuilder, SignatureTemplate, randomUtxo } from 'cashscript'
import { secp256k1, hash160, encodeCashAddress, binToHex } from '@bitauth/libauth'

const here = (path) => new URL(path, import.meta.url)
const shipped = JSON.parse(readFileSync(here('../../frontend/src/lib/NomosVault.json'), 'utf8'))
const NFT_SATS = 1_000n

let pass = 0
let fail = 0
const check = (ok, label, extra = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? '✓' : '✗'} ${label}${extra}`)
}

// ── 1. Artifact matches the source ──
const fresh = compileFile(here('../NomosVault.cash'))
check(fresh.bytecode === shipped.bytecode, 'frontend/src/lib/NomosVault.json is what cashc builds from contracts/NomosVault.cash')

// ── 2. Close ──
const key = () => {
  const priv = new Uint8Array(randomBytes(32))
  const pub = secp256k1.derivePublicKeyCompressed(priv)
  if (typeof pub === 'string') throw new Error(pub)
  const address = (type) => encodeCashAddress({ prefix: 'bitcoincash', type, payload: hash160(pub) }).address
  return { priv, pubHex: binToHex(pub), address: address('p2pkh'), tokenAddress: address('p2pkhWithTokens') }
}
const owner = key()
const rescuer = key()
const stranger = key()

// Same size estimate as contract.ts: 10 + 545 per vault input + 100 per token output + 45 per plain output, plus 10%.
const fee = (inputs) => BigInt(Math.ceil((10 + inputs * 545 + 100 + 45) * 1.1))

function close(signer, topUps) {
  const provider = new MockNetworkProvider()
  const contract = new Contract(shipped, [
    owner.pubHex, '0'.repeat(66), 50_000n, false,
    ...Array(5).fill('0'.repeat(40)),
    rescuer.pubHex,
  ], { provider, addressType: 'p2sh32' })
  const category = randomBytes(32).toString('hex')
  // 3,000 sats spent today; the commitment goes with the NFT unchanged.
  const commitment = 'b80b000000000000' + '4d50000000000000'
  const nft = { ...randomUtxo({ satoshis: 20_000n }), token: { category, amount: 0n, nft: { capability: 'mutable', commitment } } }
  const inputs = [nft, ...Array.from({ length: topUps }, () => randomUtxo({ satoshis: 5_000n }))]
  const tb = new TransactionBuilder({ provider })
  for (const u of inputs) tb.addInput(u, contract.unlock.setMandate(new SignatureTemplate(signer.priv)))
  const total = inputs.reduce((sum, u) => sum + u.satoshis, 0n)
  const f = fee(inputs.length)
  tb.addOutput({ to: owner.address, amount: total - f - NFT_SATS })
  tb.addOutput({ to: owner.tokenAddress, amount: NFT_SATS, token: { amount: 0n, category, nft: { capability: 'mutable', commitment } } })
  return { tb, f }
}

function attempt({ tb, f }) {
  try {
    tb.debug()
    const hex = tb.build()
    return { ok: true, bytes: hex.length / 2, fee: f }
  } catch (e) {
    return { ok: false, err: String(e?.message ?? e).split('\n')[0] }
  }
}

const rate = (r) => (r.ok ? ` (${r.bytes} bytes, ${(Number(r.fee) / r.bytes).toFixed(2)} sat/byte)` : `: ${r.err}`)
const why = (r) => (r.ok ? '' : ` (${r.err.replace(/ at input 0.*$/, '')})`)

let r = attempt(close(owner, 0))
check(r.ok && Number(r.fee) / r.bytes >= 1, 'the owner closes a vault holding only the state NFT, fee above 1 sat/byte', rate(r))
r = attempt(close(owner, 3))
check(r.ok && Number(r.fee) / r.bytes >= 1, 'the owner closes a vault with three top-ups in one transaction', rate(r))
r = attempt(close(stranger, 0))
check(!r.ok, 'someone else cannot close the vault', why(r))
r = attempt(close(rescuer, 0))
check(!r.ok, 'the rescue key alone cannot close the vault', why(r))

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
