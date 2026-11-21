#!/usr/bin/env node
// A throwaway key for the live runs, and a sweep to send what is left back.
//
//   node keys.mjs new
//   PRIVATE_KEY=<WIF> node keys.mjs sweep <your address> mainnet   (or chipnet)
//   Windows: set PRIVATE_KEY=<WIF>  then  node keys.mjs sweep <address> mainnet
//
// The key is printed once and never saved. Fund it with only what the runs
// need, and keep the WIF out of the repository, chats and screenshots.

import { randomBytes } from 'node:crypto'
import { Signer, TransactionBuilder } from '@solidcash/solidcash'
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum'
import {
  decodePrivateKeyWif, encodePrivateKeyWif, encodeCashAddress, hash160, secp256k1, cashAddressToLockingBytecode,
} from '@bitauth/libauth'

const [command, to, network = 'mainnet'] = process.argv.slice(2)

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

if (command === 'sweep') {
  const wif = process.env.PRIVATE_KEY
  if (!wif || !to) { console.error('Usage: PRIVATE_KEY=<WIF> node keys.mjs sweep <address> mainnet'); process.exit(1) }
  const decoded = decodePrivateKeyWif(wif)
  if (typeof decoded === 'string') { console.error(`Bad WIF: ${decoded}`); process.exit(1) }
  const target = cashAddressToLockingBytecode(to)
  if (typeof target === 'string') { console.error(`Bad address: ${target}`); process.exit(1) }
  const provider = new ElectrumNetworkProvider(network)
  const wallet = new Signer(decoded.privateKey, provider)
  // Plain BCH only. Test tokens from the swap run stay with the key.
  const coins = (await wallet.getUtxos()).filter((u) => !u.token)
  if (coins.length === 0) { console.log('Nothing to sweep.'); process.exit(0) }
  const tb = new TransactionBuilder({ provider })
  tb.addInputs(coins, wallet.unlockP2PKH())
  tb.addBchChangeOutputIfNeeded({ to: target.bytecode, feeRate: 1 })
  const sent = await tb.send()
  const total = coins.reduce((sum, u) => sum + u.satoshis, 0n)
  console.log(`Swept ${total.toLocaleString('en-US')} sats (less the fee) to ${to}: ${sent.txid}`)
  process.exit(0)
}

console.error('Usage: node keys.mjs new  |  PRIVATE_KEY=<WIF> node keys.mjs sweep <address> mainnet')
process.exit(1)
