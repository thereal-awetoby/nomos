// Whole-wallet scan and gathering, against an emulated HD wallet.
//
// Real BIP44 keys sit behind the real WizardConnect dapp manager, which
// derives addresses from the xpubs a wallet shares. A made-up chain holds
// coins on the receive and change paths, with gaps. The emulated wallet signs
// each input with the key at the path and index Nomos names, as Paytaca does,
// and every gathering transaction must pass the BCH virtual machine.
//
//   npm test        (from frontend/)

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createVirtualMachineBch2025,
  deriveHdPath,
  deriveHdPrivateNodeChild,
  deriveHdPrivateNodeFromSeed,
  deriveHdPublicNode,
  encodeCashAddress,
  encodeHdPublicKey,
  encodeTransaction,
  hash160,
  secp256k1,
  sha256,
  utf8ToBin,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBch,
  cashAddressToLockingBytecode,
} from '@bitauth/libauth'
import type { HdPrivateNodeValid, TransactionCommon, Output } from '@bitauth/libauth'
import { MockNetworkProvider } from 'cashscript'
import type { Utxo } from 'cashscript'
import { DappConnectionManager } from '@wizardconnect/dapp'
import { GAP_LIMIT, gatherTransaction, planGather, scanHdWallet } from '../src/lib/hdwallet'
import type { HdPathName, HdSource } from '../src/lib/hdwallet'

// ── The wallet ─────────────────────────────────────────────
const master = deriveHdPrivateNodeFromSeed(sha256.hash(utf8ToBin('nomos test wallet'))) as HdPrivateNodeValid
const account = deriveHdPath(master, "m/44'/145'/0'") as HdPrivateNodeValid
const pathNodes: Record<string, HdPrivateNodeValid> = {
  receive: deriveHdPrivateNodeChild(account, 0) as HdPrivateNodeValid,
  change: deriveHdPrivateNodeChild(account, 1) as HdPrivateNodeValid,
}
const xpub = (node: HdPrivateNodeValid) => (encodeHdPublicKey({ network: 'mainnet', node: deriveHdPublicNode(node) }) as { hdPublicKey: string }).hdPublicKey

const privateKeyAt = (path: string, index: number) => (deriveHdPrivateNodeChild(pathNodes[path], index) as HdPrivateNodeValid).privateKey
const addressOf = (publicKey: Uint8Array) => encodeCashAddress({ prefix: 'bitcoincash', type: 'p2pkh', payload: hash160(publicKey) }).address
const lockOf = (address: string) => (cashAddressToLockingBytecode(address) as { bytecode: Uint8Array }).bytecode

// The dapp side: the real manager, fed the xpubs the wallet shares (no DeFi path).
const manager = new DappConnectionManager('Nomos test', '', { session: false })
manager.restoreSessionPaths([
  { name: 'receive', xpub: xpub(pathNodes.receive) },
  { name: 'change', xpub: xpub(pathNodes.change) },
])
const addressAt = (child: number, index: number) => {
  if (!manager.hasPath(child)) return null
  const publicKey = manager.getPubkey(child, BigInt(index))
  return publicKey ? addressOf(publicKey) : null
}

// ── The chain ──────────────────────────────────────────────
let nextTx = 1
const coin = (satoshis: bigint, token = false): Utxo => ({
  txid: (nextTx++).toString(16).padStart(64, '0'),
  vout: 0,
  satoshis,
  ...(token ? { token: { category: 'ab'.repeat(32), amount: 1n } } : {}),
})
const chain = new Map<string, { used: boolean; coins: Utxo[] }>()
const put = (child: number, index: number, coins: Utxo[]) => chain.set(addressAt(child, index)!, { used: true, coins })

const primary = addressAt(0, 0)!
put(0, 0, [coin(3_000n), coin(1_500n)]) // the address Nomos uses
put(0, 1, []) // used once, spent since
put(0, 7, [coin(50_000n)])
put(0, 27, [coin(20_000n)]) // 19 unused before it: still inside the gap
put(0, 60, [coin(99_999n)]) // past 20 unused in a row: a wallet would not see it either
put(1, 0, [coin(7_000n)])
put(1, 1, [coin(1_000n, true)]) // token coin: left out
put(1, 2, [coin(12_345n)])

const looked = new Set<string>()
const source: HdSource = {
  addressAt: (_path: HdPathName, child, index) => addressAt(child, index),
  used: async (address) => { looked.add(address); return chain.get(address)?.used ?? false },
  coins: async (address) => chain.get(address)?.coins ?? [],
}

// The app's fee estimate for plain P2PKH transactions (contract.ts p2pkhFee).
const feeFor = (inputs: number) => BigInt(Math.ceil((10 + inputs * 150 + 45) * 1 * 1.1))

// ── The wallet signing ─────────────────────────────────────
const compiler = walletTemplateToCompilerBch(walletTemplateP2pkhNonHd)

/** Sign as the wallet does: each input with the key at the path and index named for it. */
function walletSigns(
  wc: { transaction: TransactionCommon; sourceOutputs: (Output & Record<string, unknown>)[] },
  inputPaths: [number, string, number][],
) {
  const sourceOutputs = wc.sourceOutputs.map((o) => ({ lockingBytecode: o.lockingBytecode, valueSatoshis: o.valueSatoshis }))
  const transaction = { ...wc.transaction, inputs: wc.transaction.inputs.map((input) => ({ ...input })) }
  for (const [inputIndex, path, index] of inputPaths) {
    const key = privateKeyAt(path, index)
    const derived = lockOf(addressOf(secp256k1.derivePublicKeyCompressed(key) as Uint8Array))
    assert.deepEqual(derived, sourceOutputs[inputIndex].lockingBytecode, `input ${inputIndex}: ${path}/${index} is not the key for this coin`)
    const unlock = compiler.generateBytecode({
      scriptId: 'unlock',
      data: { keys: { privateKeys: { key } }, compilationContext: { inputIndex, sourceOutputs, transaction } },
    })
    assert.ok(unlock.success, `input ${inputIndex} did not sign: ${JSON.stringify((unlock as any).errors ?? unlock, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 600)}`)
    transaction.inputs[inputIndex].unlockingBytecode = (unlock as { bytecode: Uint8Array }).bytecode
  }
  return { transaction, sourceOutputs }
}

// ── Tests ──────────────────────────────────────────────────
test('scan finds every coin a BIP44 wallet would, and nothing past the gap', async () => {
  const wallet = await scanHdWallet(source)
  const found = wallet.coins.map((c) => `${c.path}/${c.index}:${c.satoshis}`).sort()
  assert.deepEqual(found, [
    'change/0:7000', 'change/2:12345', 'receive/0:1500', 'receive/0:3000', 'receive/27:20000', 'receive/7:50000',
  ].sort())
  assert.equal(wallet.sats, 93_845n)
  assert.equal(wallet.fundedAddresses, 5)
  assert.equal(wallet.usedAddresses, 7)
  assert.ok(!looked.has(addressAt(0, 60)!), 'looked past the gap')
  assert.equal(GAP_LIMIT, 20)
})

test('a target takes the coins already at the address, then the largest others', async () => {
  const wallet = await scanHdWallet(source)
  const plan = planGather(wallet.coins, primary, 40_000n, feeFor)!
  assert.ok(plan)
  assert.deepEqual(plan.inputs.map((c) => `${c.path}/${c.index}:${c.satoshis}`), ['receive/0:3000', 'receive/0:1500', 'receive/7:50000'])
  assert.equal(plan.output, 54_500n - feeFor(3))
  assert.ok(plan.output >= 40_000n)
})

test('without a target every coin is gathered; a target past the wallet is refused', async () => {
  const wallet = await scanHdWallet(source)
  const all = planGather(wallet.coins, primary, null, feeFor)!
  assert.equal(all.inputs.length, 6)
  assert.equal(all.output, 93_845n - feeFor(6))
  assert.equal(planGather(wallet.coins, primary, 93_845n, feeFor), null)
})

test('the wallet signs each input with its own key and the BCH VM accepts the gathering', async () => {
  const wallet = await scanHdWallet(source)
  for (const target of [40_000n, null]) {
    const plan = planGather(wallet.coins, primary, target, feeFor)!
    const { builder, inputPaths } = gatherTransaction(plan, primary, new MockNetworkProvider())
    const wc = (builder as any).generateWcTransactionObject({ broadcast: false, userPrompt: 'test' })

    // One coin at output 0 of the address Nomos uses: a coin that can start a vault.
    assert.equal(wc.transaction.outputs.length, 1)
    assert.deepEqual(wc.transaction.outputs[0].lockingBytecode, lockOf(primary))
    assert.equal(wc.transaction.outputs[0].valueSatoshis, plan.output)
    assert.deepEqual(inputPaths.map(([i]) => i), plan.inputs.map((_, i) => i))

    const signed = walletSigns(wc, inputPaths)
    const verdict = createVirtualMachineBch2025().verify(signed)
    assert.equal(verdict, true, String(verdict))

    // The fee estimate covers the real size at 1 sat/byte.
    const size = encodeTransaction(signed.transaction).length
    assert.ok(plan.fee >= BigInt(size), `fee ${plan.fee} below size ${size}`)
  }
})

test('a wrong path or index is caught before anything is signed', async () => {
  const wallet = await scanHdWallet(source)
  const plan = planGather(wallet.coins, primary, null, feeFor)!
  const { builder, inputPaths } = gatherTransaction(plan, primary, new MockNetworkProvider())
  const wc = (builder as any).generateWcTransactionObject({ broadcast: false, userPrompt: 'test' })
  const swapped = inputPaths.map(([i, path, index]) => [i, path === 'receive' ? 'change' : 'receive', index] as [number, string, number])
  assert.throws(() => walletSigns(wc, swapped), /is not the key for this coin/)
})
