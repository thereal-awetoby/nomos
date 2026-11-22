// ── The whole wallet behind a WizardConnect connection ─────
// WizardConnect hands Nomos one extended public key per path ('receive',
// 'change' and, when the wallet has one, 'defi'), so Nomos can derive the same
// addresses the wallet itself uses. It finds their coins the way HD wallets
// do: walk each path from index 0 and stop after 20 unused addresses in a row.
//
// Gathering merges coins from several of those addresses into one coin at the
// address Nomos works with. The wallet signs each input with the key at the
// path and index Nomos names for it, so nothing leaves the wallet.
//
// Nothing here touches the network or the browser: the caller passes in how to
// derive an address and how to look it up, which keeps this testable in Node.

import { TransactionBuilder, placeholderP2PKHUnlocker } from 'cashscript'
import type { NetworkProvider, Utxo } from 'cashscript'

export const HD_PATHS = [
  { name: 'receive', child: 0 },
  { name: 'change', child: 1 },
  { name: 'defi', child: 7 },
] as const

export type HdPathName = (typeof HD_PATHS)[number]['name']

/** Unused addresses in a row after which a path is taken to end (BIP44). */
export const GAP_LIMIT = 20
/** Addresses looked up at once. */
const BATCH = 10
/** A hard stop far past any real wallet. */
const MAX_INDEX = 2_000
/** Keeps a gathering transaction well inside the 100 kB standard size. */
export const MAX_GATHER_INPUTS = 250

/** A plain BCH coin, with the address, path and index whose key spends it. */
export interface HdCoin extends Utxo {
  address: string
  path: HdPathName
  index: number
}

export interface HdWallet {
  /** Plain BCH coins at every address found. Token coins are left out. */
  coins: HdCoin[]
  /** Addresses that have received anything, holding coins now or not. */
  usedAddresses: number
  /** Addresses holding plain BCH now. */
  fundedAddresses: number
  sats: bigint
}

export interface HdSource {
  /** The address at a path and index; null when the wallet shared no key for that path. */
  addressAt(path: HdPathName, child: number, index: number): string | null
  /** True when the address has ever received anything. */
  used(address: string): Promise<boolean>
  /** The coins at the address now. */
  coins(address: string): Promise<Utxo[]>
}

/** Every plain BCH coin in the wallet, found path by path up to the gap limit. */
export async function scanHdWallet(source: HdSource, gapLimit = GAP_LIMIT): Promise<HdWallet> {
  const coins: HdCoin[] = []
  const funded = new Set<string>()
  let usedAddresses = 0

  for (const { name, child } of HD_PATHS) {
    if (!source.addressAt(name, child, 0)) continue
    let gap = 0
    for (let start = 0; gap < gapLimit && start < MAX_INDEX; start += BATCH) {
      const batch = await Promise.all(Array.from({ length: BATCH }, async (_, k) => {
        const index = start + k
        const address = source.addressAt(name, child, index)
        if (!address || !(await source.used(address))) return null
        return { index, address, coins: await source.coins(address) }
      }))
      // In index order, so an address past the gap is never counted.
      for (const entry of batch) {
        if (gap >= gapLimit) break
        if (!entry) {
          gap += 1
          continue
        }
        gap = 0
        usedAddresses += 1
        for (const coin of entry.coins) {
          if (coin.token) continue
          coins.push({ ...coin, address: entry.address, path: name, index: entry.index })
          funded.add(entry.address)
        }
      }
    }
  }

  return {
    coins,
    usedAddresses,
    fundedAddresses: funded.size,
    sats: coins.reduce((sum, coin) => sum + coin.satoshis, 0n),
  }
}

export interface GatherPlan {
  inputs: HdCoin[]
  fee: bigint
  /** The one coin the gathering creates, at output 0 of the target address. */
  output: bigint
}

const largestFirst = (a: HdCoin, b: HdCoin) => (a.satoshis === b.satoshis ? 0 : a.satoshis > b.satoshis ? -1 : 1)

/**
 * The coins to merge into one coin at `to`. Every coin already at `to` goes
 * in first. With a target, the largest other coins follow until the new coin
 * holds at least the target; without one, all of them do. Null when the
 * wallet cannot reach the target.
 */
export function planGather(
  coins: HdCoin[],
  to: string,
  target: bigint | null,
  feeFor: (inputs: number) => bigint,
  dust = 546n,
): GatherPlan | null {
  const own = coins.filter((coin) => coin.address === to).sort(largestFirst)
  const others = coins.filter((coin) => coin.address !== to).sort(largestFirst)
  const inputs: HdCoin[] = []
  let total = 0n

  for (const coin of own) {
    if (inputs.length >= MAX_GATHER_INPUTS) break
    inputs.push(coin)
    total += coin.satoshis
  }
  for (const coin of others) {
    if (inputs.length >= MAX_GATHER_INPUTS) break
    if (target !== null && total - feeFor(inputs.length) >= target) break
    inputs.push(coin)
    total += coin.satoshis
  }

  const fee = feeFor(inputs.length)
  const output = total - fee
  if (inputs.length === 0 || output < dust || (target !== null && output < target)) return null
  return { inputs, fee, output }
}

/** The gathering transaction, and for each input the wallet path and index that signs it. */
export function gatherTransaction(
  plan: GatherPlan,
  to: string,
  provider: NetworkProvider,
): { builder: TransactionBuilder; inputPaths: [number, HdPathName, number][] } {
  const builder = new TransactionBuilder({ provider })
  for (const coin of plan.inputs) {
    const utxo: Utxo = { txid: coin.txid, vout: coin.vout, satoshis: coin.satoshis }
    builder.addInput(utxo, placeholderP2PKHUnlocker(coin.address))
  }
  builder.addOutput({ to, amount: plan.output })
  return { builder, inputPaths: plan.inputs.map((coin, i) => [i, coin.path, coin.index]) }
}
