#!/usr/bin/env node
// A throwaway key for the live runs, its balance, and a sweep to send what is
// left back.
//
//   node keys.mjs new
//   PRIVATE_KEY=<WIF> node keys.mjs balance mainnet                (or chipnet)
//   PRIVATE_KEY=<WIF> node keys.mjs sweep <your address> mainnet   (or chipnet)
//   Windows: set PRIVATE_KEY=<WIF>  then  node keys.mjs sweep <address> mainnet
//
// The key is printed once and never saved. Fund it with only what the runs
// need, and keep the WIF out of the repository, chats and screenshots. Balance
// and sweep also cover the hash-time-lock receiver, a second key derived from
// this one, in case a run stopped before sending its coins back.

import { randomBytes } from 'node:crypto'
import { Signer, TransactionBuilder } from '@solidcash/solidcash'
import {
  decodePrivateKeyWif, encodePrivateKeyWif, encodeCashAddress, hash160, secp256k1, cashAddressToLockingBytecode,
} from '@bitauth/libauth'
import { derivedKey, keepRunningThroughDroppedSockets, liveProvider } from './live.mjs'

const [command, ...args] = process.argv.slice(2)
const n = (v) => BigInt(v).toLocaleString('en-US')

if (command === 'new') {
  let priv
  do { priv = new Uint8Array(randomBytes(32)) } while (!secp256k1.validatePrivateKey(priv))
  const pub = secp256k1.derivePublicKeyCompressed(priv)
  const address = (prefix) => encodeCashAddress({ prefix, type: 'p2pkh', payload: hash160(pub) }).address
  console.log('Mainnet address:', address('bitcoincash'))
  console.log('Chipnet address:', address('bchtest'))
  console.log('Mainnet WIF:    ', encodePrivateKeyWif(priv, 'mainnet'))
  console.log('Chipnet WIF:    ', encodePrivateKeyWif(priv, 'testnet'))
  console.log('\nFund the address, then run with PRIVATE_KEY set to the WIF. This key is not saved anywhere.')
  process.exit(0)
}

/** The wallet and the receiver the hash-time-lock run derives from it. */
async function keys(network) {
  const wif = process.env.PRIVATE_KEY
  if (!wif) { console.error('Set PRIVATE_KEY to the WIF first'); process.exit(1) }
  const decoded = decodePrivateKeyWif(wif)
  if (typeof decoded === 'string') { console.error(`Bad WIF: ${decoded}`); process.exit(1) }
  keepRunningThroughDroppedSockets()
  const provider = await liveProvider(network)
  return {
    provider,
    keys: [
      ['Wallet', new Signer(decoded.privateKey, provider)],
      ['Hash-time-lock receiver', new Signer(derivedKey('nomos-htlc-receiver', decoded.privateKey), provider)],
    ],
  }
}

if (command === 'balance') {
  const [network = 'mainnet'] = args
  const { keys: all } = await keys(network)
  for (const [label, key] of all) {
    const utxos = await key.getUtxos()
    const plain = utxos.filter((u) => !u.token)
    const tokens = utxos.length - plain.length
    const sats = plain.reduce((sum, u) => sum + u.satoshis, 0n)
    console.log(`${label}: ${key.address}`)
    console.log(`  ${n(sats)} sats in ${plain.length} coin(s)${tokens ? `, plus ${tokens} token coin(s)` : ''}`)
  }
  process.exit(0)
}

if (command === 'sweep') {
  const [to, network = 'mainnet'] = args
  if (!to) { console.error('Usage: PRIVATE_KEY=<WIF> node keys.mjs sweep <address> mainnet'); process.exit(1) }
  const target = cashAddressToLockingBytecode(to)
  if (typeof target === 'string') { console.error(`Bad address: ${target}`); process.exit(1) }
  const { provider, keys: all } = await keys(network)
  // Plain BCH only. Test tokens from the swap run stay with the key.
  const tb = new TransactionBuilder({ provider })
  let total = 0n
  for (const [label, key] of all) {
    const coins = (await key.getUtxos()).filter((u) => !u.token)
    if (coins.length === 0) continue
    const sats = coins.reduce((sum, u) => sum + u.satoshis, 0n)
    console.log(`${label}: ${n(sats)} sats in ${coins.length} coin(s)`)
    tb.addInputs(coins, key.unlockP2PKH())
    total += sats
  }
  if (total === 0n) { console.log('Nothing to sweep.'); process.exit(0) }
  tb.addBchChangeOutputIfNeeded({ to: target.bytecode, feeRate: 1 })
  const sent = await tb.send()
  console.log(`Swept ${n(total)} sats (less the fee) to ${to}: ${sent.txid}`)
  process.exit(0)
}

console.error('Usage: node keys.mjs new  |  PRIVATE_KEY=<WIF> node keys.mjs balance mainnet  |  PRIVATE_KEY=<WIF> node keys.mjs sweep <address> mainnet')
process.exit(1)
