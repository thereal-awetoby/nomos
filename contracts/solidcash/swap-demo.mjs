#!/usr/bin/env node
// The StableSwap pool (StableSwap.scash) on a live network, with a test token
// minted for the run: add liquidity, swap BCH for the token and back, see a
// too-greedy quote and a non-admin withdrawal refused, then withdraw it all.
//
//   npm run build
//   PRIVATE_KEY=<funded WIF> node swap-demo.mjs mainnet      (or chipnet)
//   node swap-demo.mjs mock                                   (offline, no key)
//   Windows: set PRIVATE_KEY=<WIF>  then  node swap-demo.mjs mainnet
//
// The token is a new CashToken category made by this run. It is not PUSD and
// has no value. The wallet is the pool's admin and its only trader. Fund about
// 80,000 sats. The pool's BCH comes back at the end except about 1,000 sats the
// SDK keeps in it; the deploy's state tokens are most of what a run costs.

import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
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

const POOL_SATS = 10_000n
const POOL_TOKENS = 1_000_000n
const BCH_IN = 1_000n

const artifact = JSON.parse(readFileSync(new URL('./build/StableSwap.json', import.meta.url)))
const sig = (signer) => new SignatureTemplate(signer.privateKey)
const pkhOf = (signer) => hash160(signer.publicKey)
const n = (v) => BigInt(v).toLocaleString('en-US')
const reason = (e) => {
  const m = String(e?.message ?? e)
  return m.match(/failing require[^\n]*/)?.[0] ?? m.split('\n')[0]
}
const quote = (amountIn, reserveIn, reserveOut) => (amountIn * 997n * reserveOut) / (reserveIn * 1000n + amountIn * 997n)

keepRunningThroughDroppedSockets()
let provider
let wallet
if (NETWORK === 'mock') {
  // Offline: a throwaway key holding one coin of the suggested funding. The
  // mock could make up fee coins by itself; like a live network, it may not.
  provider = new MockNetworkProvider()
  wallet = new Signer(new Uint8Array(randomBytes(32)), provider)
  await provider.addUtxo(wallet.address, { ...randomUtxo({ satoshis: 80_000n }) })
  provider.addUtxo = undefined
} else {
  const wif = process.env.PRIVATE_KEY
  if (!wif) { console.error(`Set PRIVATE_KEY to a funded ${NETWORK} WIF`); process.exit(1) }
  const decoded = decodePrivateKeyWif(wif)
  if (typeof decoded === 'string') { console.error(`Bad WIF: ${decoded}`); process.exit(1) }
  provider = await liveProvider(NETWORK)
  wallet = new Signer(decoded.privateKey, provider)
}
// Signs the refused withdrawal; it never holds coins.
const stranger = new Signer(derivedKey('nomos-swap-stranger', wallet.privateKey), provider)
const me = wallet.getLockingBytecode()

const bchCoins = async () => (await wallet.getUtxos()).filter((u) => !u.token)
const tokenCoins = async (category) => (await wallet.getUtxos()).filter((u) => u.token?.category === category && !u.token.nft)

/** Plain BCH payment, change back to the wallet. */
async function pay(outputs) {
  const tb = new TransactionBuilder({ provider })
  tb.addInputs(await bchCoins(), wallet.unlockP2PKH())
  for (const o of outputs) tb.addOutput(o)
  tb.addBchChangeOutputIfNeeded({ to: me, feeRate: 1 })
  return tb.send()
}

/** A new fungible token: its category is the txid of the output 0 it spends. */
async function mintTestToken(amount) {
  const prep = await pay([
    { to: me, amount: 3_000n },
    { to: me, amount: 3_000n },
    { to: me, amount: 3_000n },
  ])
  const base = (await bchCoins()).find((u) => u.txid === prep.txid && u.vout === 0)
  if (!base) throw new Error('The coin to mint from did not show up')
  const tb = new TransactionBuilder({ provider })
  tb.addInput(base, wallet.unlockP2PKH())
  tb.addOutput({ to: me, amount: 1_000n, token: { category: base.txid, amount } })
  tb.addBchChangeOutputIfNeeded({ to: me, feeRate: 1 })
  const minted = await tb.send()
  return { category: base.txid, txid: minted.txid, prep: prep.txid }
}

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
console.log('Wallet (admin and trader):', wallet.address)

console.log(`\nMint ${n(POOL_TOKENS)} units of a test token (not PUSD, no value)…`)
const { category, txid: mintTx, prep } = await mintTestToken(POOL_TOKENS)
console.log('  coins split:', TX(prep))
console.log('  minted:     ', TX(mintTx))
console.log('  category:   ', category)
const categoryBytes = Uint8Array.from(Buffer.from(category, 'hex'))

let pool
try {
  console.log('\nDeploy the pool…')
  pool = await new ContractFactory(artifact, wallet).deploy(categoryBytes, wallet.publicKey)
  await pool.waitForDeployment()
  console.log('  deploy:', TX(pool.deploymentTransaction().txid))

  console.log(`\nAdd liquidity: ${n(POOL_SATS)} sats and ${n(POOL_TOKENS)} tokens…`)
  const [tokenCoin] = await tokenCoins(category)
  const added = await pool.call
    .addLiquidity(pkhOf(wallet), POOL_TOKENS, sig(wallet))
    .withValue(POOL_SATS)
    .addInput(tokenCoin, wallet.unlockP2PKH())
    .tokenContainerDeposit(category, POOL_TOKENS)
    .send()
  console.log('  added:', TX(added.txid))

  const out = quote(BCH_IN, await pool.state.reserveBch(), await pool.state.reservePusd())
  console.log(`\nSwap ${n(BCH_IN)} sats for tokens (quote ${n(out)}, 0.3% fee kept by the pool)…`)
  await expectRefusal('asking for one token more than the quote', () => pool.call
    .swapBchToPusd(pkhOf(wallet), out + 1n)
    .withValue(BCH_IN)
    .tokenContainerTransfer(category, me, out + 1n)
    .send())
  const bought = await pool.call
    .swapBchToPusd(pkhOf(wallet), out)
    .withValue(BCH_IN)
    .tokenContainerTransfer(category, me, out)
    .send()
  console.log('  SWAPPED:', TX(bought.txid))

  const back = quote(out, await pool.state.reservePusd(), await pool.state.reserveBch())
  console.log(`\nSwap the ${n(out)} tokens back for BCH (quote ${n(back)} sats)…`)
  const [boughtCoin] = await tokenCoins(category)
  const sold = await pool.call
    .swapPusdToBch(pkhOf(wallet), out, back)
    .addInput(boughtCoin, wallet.unlockP2PKH())
    .tokenContainerDeposit(category, out)
    .transfer(me, back)
    .send()
  console.log('  SWAPPED:', TX(sold.txid))

  console.log('\nA withdrawal signed by another key…')
  await expectRefusal('not the admin', () => pool.call
    .removeLiquidity(pkhOf(stranger), 1n, 1n, sig(stranger))
    .transfer(stranger.getLockingBytecode(), 1n)
    .tokenContainerTransfer(category, stranger.getLockingBytecode(), 1n)
    .send())
} catch (e) {
  ok = false
  console.error('\nStopped:', reason(e))
} finally {
  // Whatever happened, take the pool's reserves back to the wallet.
  if (pool) {
    const withdraw = (bch, tokens) => {
      let call = pool.call.removeLiquidity(pkhOf(wallet), bch, tokens, sig(wallet))
      if (bch > 0n) call = call.transfer(me, bch)
      if (tokens > 0n) call = call.tokenContainerTransfer(category, me, tokens)
      return call.send()
    }
    try {
      const reserveBch = await pool.state.reserveBch()
      const tokens = await pool.state.reservePusd()
      if (reserveBch > 0n || tokens > 0n) {
        let bch = reserveBch
        let removed
        try {
          removed = await withdraw(bch, tokens)
        } catch (e) {
          // The SDK will not let this call take the pool's last 1,000 sats or
          // so; take what it allows, which it names in the error.
          const m = String(e?.message ?? e).match(/Total transfer amount \((\d+)\) exceeds satoshi container balance \((\d+)/)
          if (!m) throw e
          bch -= BigInt(m[1]) - BigInt(m[2])
          removed = await withdraw(bch, tokens)
        }
        console.log(`\nWithdraw the pool (${n(bch)} sats, ${n(tokens)} tokens):`, TX(removed.txid))
        if (bch < reserveBch) console.log(`  ${n(reserveBch - bch)} sats could not be withdrawn and stay in the pool`)
      }
    } catch (e) {
      ok = false
      console.error('Withdrawal failed:', reason(e))
    }
  }
}

console.log(ok ? '\nDone: liquidity in, swapped both ways, refusals as expected, pool withdrawn.' : '\nSomething did not go as expected; see above.')
const endSats = await bchOf(wallet)
console.log(`Wallet: ${endSats.toLocaleString('en-US')} of ${startSats.toLocaleString('en-US')} sats back; the run cost ${(startSats - endSats).toLocaleString('en-US')} sats.`)
process.exit(ok ? 0 : 1)
