// StableSwap mock-network tests. The mock chain runs the compiled covenant in
// the BCH VM and uses seeded CashToken UTXOs; no real network or funds are used.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hash160 } from '@bitauth/libauth'
import { SignatureTemplate } from '@solidcash/solidcash'
import { ContractFactory } from '@solidcash/solidcash/contract-factory'
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock'

const artifact = JSON.parse(readFileSync(new URL('./build/StableSwap.json', import.meta.url)))
const pkh = (signer) => hash160(signer.publicKey)
const sig = (signer) => new SignatureTemplate(signer.privateKey)

const INITIAL_BCH = 100_000_000n // 1 BCH, in satoshis
const INITIAL_PUSD = 100_000_000n // example 6-decimal token units
const TRADER_PUSD = 1_000_000n
const BCH_IN = 1_000_000n // 0.01 BCH

function quoteBchToPusd(bchIn, reserveBch, reservePusd) {
  const withFee = bchIn * 997n
  return (withFee * reservePusd) / (reserveBch * 1000n + withFee)
}

function quotePusdToBch(pusdIn, reservePusd, reserveBch) {
  const withFee = pusdIn * 997n
  return (withFee * reserveBch) / (reservePusd * 1000n + withFee)
}

test('StableSwap enforces reserves, slippage and the 0.3% swap fee', async () => {
  const provider = new MockNetworkProvider()
  const [admin, trader] = await provider.getSigners(2, { fundingUtxos: 5 })
  const seededTokens = await provider.addTokenUtxosDynamic((categoryId) => [
    {
      address: admin.address,
      satoshis: 10_000n,
      token: { amount: INITIAL_PUSD },
    },
    {
      address: trader.address,
      satoshis: 10_000n,
      token: { amount: TRADER_PUSD },
    },
  ])
  const { categoryId: pusdCategory, utxos: tokenUtxos } = seededTokens
  const pusdCategoryBytes = Uint8Array.from(Buffer.from(pusdCategory, 'hex'))

  const pool = await new ContractFactory(artifact, admin).deploy(
    pusdCategoryBytes,
    admin.publicKey,
    { initialBalance: 50_000n },
  )

  // Seed a 1 BCH / 100 PUSD pool with the administrator's real mock token UTXO.
  const addLiquidity = pool.call
    .addLiquidity(pkh(admin), INITIAL_PUSD, sig(admin))
    .withValue(INITIAL_BCH)
    .addInput(tokenUtxos[0], admin.unlockP2PKH())
    .tokenContainerDeposit(pusdCategory, INITIAL_PUSD)
  const seeded = await addLiquidity.send()
  assert.ok(seeded.txid)
  assert.equal(await pool.state.reserveBch(), INITIAL_BCH)
  assert.equal(await pool.state.reservePusd(), INITIAL_PUSD)

  // BCH → PUSD. Verify the formula and the actual covenant state transition.
  const expectedPusdOut = quoteBchToPusd(BCH_IN, INITIAL_BCH, INITIAL_PUSD)
  assert.equal(expectedPusdOut, 987158n)
  const pusdBefore = await pool.state.reservePusd()
  const bchBefore = await pool.state.reserveBch()
  const swapBch = await pool.connect(trader).call
    .swapBchToPusd(pkh(trader), expectedPusdOut)
    .withValue(BCH_IN)
    .tokenContainerTransfer(pusdCategory, trader.getLockingBytecode(), expectedPusdOut)
    .send()
  assert.ok(swapBch.txid)
  assert.equal(await pool.state.reserveBch(), bchBefore + BCH_IN)
  assert.equal(await pool.state.reservePusd(), pusdBefore - expectedPusdOut)
  const traderPusdAfterBch = (await provider.getUtxos(trader.address))
    .filter((utxo) => utxo.token?.category === pusdCategory)
    .reduce((total, utxo) => total + (utxo.token?.amount ?? 0n), 0n)
  assert.equal(traderPusdAfterBch, TRADER_PUSD + expectedPusdOut)

  // Reject a quote whose minimum is one token unit too high; state must not move.
  const reserveBeforeRefusal = await pool.state.reserveBch()
  await assert.rejects(
    pool.connect(trader).call
      .swapBchToPusd(pkh(trader), expectedPusdOut + 1n)
      .withValue(BCH_IN)
      .send(),
    /Slippage: PUSD output below minimum/,
  )
  assert.equal(await pool.state.reserveBch(), reserveBeforeRefusal)

  // PUSD → BCH. The trader's seeded token UTXO funds the pool-side token deposit.
  const pusdIn = 1_000_000n
  const expectedBchOut = quotePusdToBch(
    pusdIn,
    await pool.state.reservePusd(),
    await pool.state.reserveBch(),
  )
  assert.ok(expectedBchOut > 0n)
  const swapPusd = await pool.connect(trader).call
    .swapPusdToBch(pkh(trader), pusdIn, expectedBchOut)
    .addInput(tokenUtxos[1], trader.unlockP2PKH())
    .tokenContainerDeposit(pusdCategory, pusdIn)
    .transfer(trader.getLockingBytecode(), expectedBchOut)
    .send()
  assert.ok(swapPusd.txid)
  assert.equal(await pool.state.reserveBch(), reserveBeforeRefusal - expectedBchOut)
  assert.equal(await pool.state.reservePusd(), pusdBefore - expectedPusdOut + pusdIn)
  const traderPusdAfterReverseSwap = (await provider.getUtxos(trader.address))
    .filter((utxo) => utxo.token?.category === pusdCategory)
    .reduce((total, utxo) => total + (utxo.token?.amount ?? 0n), 0n)
  assert.equal(traderPusdAfterReverseSwap, expectedPusdOut)

  // Liquidity withdrawal is admin-only, even if a trader supplies valid outputs.
  const finalBchReserve = await pool.state.reserveBch()
  const finalPusdReserve = await pool.state.reservePusd()
  await assert.rejects(
    pool.connect(trader).call
      .removeLiquidity(pkh(trader), 1n, 1n, sig(trader))
      .transfer(trader.getLockingBytecode(), 1n)
      .tokenContainerTransfer(pusdCategory, trader.getLockingBytecode(), 1n)
      .send(),
    /signature verification|Admin signature required/,
  )
  assert.equal(await pool.state.reserveBch(), finalBchReserve)
  assert.equal(await pool.state.reservePusd(), finalPusdReserve)

  const withdrawnBch = 10_000n
  const withdrawnPusd = 1_000_000n
  const withdrawal = await pool.call
    .removeLiquidity(pkh(admin), withdrawnBch, withdrawnPusd, sig(admin))
    .transfer(admin.getLockingBytecode(), withdrawnBch)
    .tokenContainerTransfer(pusdCategory, admin.getLockingBytecode(), withdrawnPusd)
    .send()
  assert.ok(withdrawal.txid)
  assert.equal(await pool.state.reserveBch(), finalBchReserve - withdrawnBch)
  assert.equal(await pool.state.reservePusd(), finalPusdReserve - withdrawnPusd)
  const adminPusdAfterWithdrawal = (await provider.getUtxos(admin.address))
    .filter((utxo) => utxo.token?.category === pusdCategory)
    .reduce((total, utxo) => total + (utxo.token?.amount ?? 0n), 0n)
  assert.equal(adminPusdAfterWithdrawal, withdrawnPusd)

  // Exact quote sanity check for fee retention / invariant behavior.
  const oldK = INITIAL_BCH * INITIAL_PUSD
  const newK = (INITIAL_BCH + BCH_IN) * (INITIAL_PUSD - expectedPusdOut)
  assert.ok(newK >= oldK, 'the 0.3% fee must preserve or increase x*y')
})
