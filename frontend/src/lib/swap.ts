// ── PUSD side of the PUSD ↔ USDC atomic swap, and the swap record ─
// PUSD is locked in contracts/SwapLock.cash on Bitcoin Cash behind a sha256
// secret hash; USDC is locked on Base behind the same hash (see evm.ts).
// Whoever claims first publishes the secret, which unlocks the other side.
// Either lock refunds its sender after its timeout, so no one holds custody.

import { Contract, TransactionBuilder, placeholderP2PKHUnlocker, placeholderSignature } from 'cashscript'
import type { Utxo } from 'cashscript'
import {
  decodeCashAddress,
  encodeCashAddress,
  binToHex,
  hexToBin,
  sha256,
  decodeTransaction,
  decodeAuthenticationInstructions,
} from '@bitauth/libauth'
import artifact from './SwapLock.json'
import { getProvider, buildSignAndBroadcast, p2pkhFee, DUST_LIMIT } from './contract'
import type { WalletProviderType } from './types'

/** ParyonUSD (PUSD) token category, from paryonusd.com. 2 decimals: 1 unit = 0.01 PUSD. */
export const PUSD_CATEGORY = '2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544'
export const PUSD_DECIMALS = 2

/** BCH carried by the lock output; pays the claim or refund fee. */
const LOCK_SATS = 2_000n
const TOKEN_CHANGE_SATS = 1_000n
const CONTRACT_SPEND_FEE = 600n

// ── Secrets ────────────────────────────────────────────────

export function newSecret(): string {
  return binToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export function hashSecret(secretHex: string): string {
  return binToHex(sha256.hash(hexToBin(secretHex)))
}

// ── The swap record shared between the two parties ────────

export type SwapDirection = 'pusd-to-usdc' | 'usdc-to-pusd'

/**
 * Everything both parties need, shareable as a link. The secret is never in
 * it; only the initiator's browser holds the secret until a claim reveals it.
 * Both timeouts are fixed when the offer is made: the initiator's lock lasts
 * 24 hours and the responder's 12, so the initiator must claim (and reveal
 * the secret) while the responder still has time to claim the other side.
 */
export interface SwapOffer {
  v: 1
  direction: SwapDirection
  secretHash: string
  pusdUnits: string
  usdcUnits: string
  initiator: { bchPk: string; baseAddress: string }
  responder: { bchPk: string; baseAddress: string }
  initiatorRefundAfter: number
  responderRefundAfter: number
  /** Base block before the first lock, to search claims from. */
  baseFromBlock: number
  createdAt: number
  /**
   * The SwapLock contract on Base this offer uses. Optional for offers made
   * before it was added. The counterparty's page checks its on-chain code
   * against the audited bytecode before reading or approving anything.
   */
  baseContract?: string
}

export function encodeOffer(offer: SwapOffer): string {
  return btoa(JSON.stringify(offer)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeOffer(text: string): SwapOffer {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const offer = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  if (offer?.v !== 1 || !/^[0-9a-f]{64}$/.test(offer.secretHash)) throw new Error('Not a Nomos swap offer')
  if (offer.baseContract !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(offer.baseContract)) throw new Error('Not a Nomos swap offer')
  return offer as SwapOffer
}

/** The BCH lock's parameters follow from the offer: who can claim, who gets a refund, when. */
export function bchLockParams(offer: SwapOffer) {
  return offer.direction === 'pusd-to-usdc'
    ? { recipientPk: offer.responder.bchPk, refundPk: offer.initiator.bchPk, refundAfter: offer.initiatorRefundAfter }
    : { recipientPk: offer.initiator.bchPk, refundPk: offer.responder.bchPk, refundAfter: offer.responderRefundAfter }
}

/** The Base lock's recipient and timeout, also fixed by the offer. */
export function baseLockParams(offer: SwapOffer) {
  return offer.direction === 'pusd-to-usdc'
    ? { recipient: offer.initiator.baseAddress, refundAfter: offer.responderRefundAfter }
    : { recipient: offer.responder.baseAddress, refundAfter: offer.initiatorRefundAfter }
}

function lockContract(offer: SwapOffer): Contract {
  const p = bchLockParams(offer)
  return new Contract(artifact as any, [p.recipientPk, p.refundPk, offer.secretHash, BigInt(p.refundAfter)], {
    provider: getProvider(),
    addressType: 'p2sh32',
  })
}

export function bchLockAddress(offer: SwapOffer): string {
  return lockContract(offer).tokenAddress
}

// ── Wallet helpers ─────────────────────────────────────────

/** Token-aware form of a P2PKH address, for outputs carrying PUSD. */
export function tokenAddressOf(address: string): string {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') throw new Error(decoded)
  const encoded: any = encodeCashAddress({ prefix: decoded.prefix, type: 'p2pkhWithTokens', payload: decoded.payload } as any)
  return typeof encoded === 'string' ? encoded : encoded.address
}

function isPusd(u: Utxo): boolean {
  return (u as any).token?.category === PUSD_CATEGORY && !(u as any).token?.nft
}

export async function pusdBalance(address: string): Promise<bigint> {
  const utxos = await getProvider().getUtxos(address)
  return utxos.filter(isPusd).reduce((sum, u) => sum + BigInt((u as any).token.amount), 0n)
}

/** PUSD and BCH currently held by the lock, if any. */
export async function readBchLock(offer: SwapOffer): Promise<{ pusd: bigint; sats: bigint; utxos: Utxo[] }> {
  const utxos = (await lockContract(offer).getUtxos()).filter(isPusd)
  return {
    pusd: utxos.reduce((sum, u) => sum + BigInt((u as any).token.amount), 0n),
    sats: utxos.reduce((sum, u) => sum + u.satoshis, 0n),
    utxos,
  }
}

// ── Actions ────────────────────────────────────────────────

/** Send `pusdUnits` PUSD (plus fee BCH) from the wallet into the swap lock. */
export async function lockPusd(
  offer: SwapOffer,
  walletAddress: string,
  walletProvider: WalletProviderType,
  wcIndex: number = 0,
): Promise<string> {
  const amount = BigInt(offer.pusdUnits)
  const utxos = await getProvider().getUtxos(walletAddress)
  const pusd = utxos.filter(isPusd).sort((a, b) => (BigInt((b as any).token.amount) > BigInt((a as any).token.amount) ? 1 : -1))
  const plain = utxos.filter((u) => !(u as any).token).sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1))

  const tokenInputs: Utxo[] = []
  let tokenTotal = 0n
  for (const u of pusd) {
    if (tokenTotal >= amount) break
    tokenInputs.push(u)
    tokenTotal += BigInt((u as any).token.amount)
  }
  if (tokenTotal < amount) throw new Error(`The wallet holds ${tokenTotal} PUSD units; the swap needs ${amount}.`)
  const tokenChange = tokenTotal - amount

  const fixedOut = LOCK_SATS + (tokenChange > 0n ? TOKEN_CHANGE_SATS : 0n)
  const bchInputs: Utxo[] = []
  let sats = tokenInputs.reduce((sum, u) => sum + u.satoshis, 0n)
  const feeFor = (n: number) => p2pkhFee(n, tokenChange > 0n ? 2 : 1, 1)
  for (const u of plain) {
    if (sats >= fixedOut + feeFor(tokenInputs.length + bchInputs.length) + DUST_LIMIT) break
    bchInputs.push(u)
    sats += u.satoshis
  }
  const fee = feeFor(tokenInputs.length + bchInputs.length)
  const change = sats - fixedOut - fee
  if (change < DUST_LIMIT) throw new Error('Not enough BCH in the wallet to pay the lock fee.')

  const txBuilder = new TransactionBuilder({ provider: getProvider() })
  for (const u of [...tokenInputs, ...bchInputs]) txBuilder.addInput(u, placeholderP2PKHUnlocker(walletAddress))
  txBuilder.addOutput({
    to: bchLockAddress(offer),
    amount: LOCK_SATS,
    token: { category: PUSD_CATEGORY, amount },
  })
  if (tokenChange > 0n) {
    txBuilder.addOutput({
      to: tokenAddressOf(walletAddress),
      amount: TOKEN_CHANGE_SATS,
      token: { category: PUSD_CATEGORY, amount: tokenChange },
    })
  }
  txBuilder.addOutput({ to: walletAddress, amount: change })
  const result = await buildSignAndBroadcast(txBuilder, walletProvider, `Nomos: lock ${amount} PUSD units for a swap`, wcIndex)
  return result.txid
}

/** Claim the PUSD lock with the secret; PUSD goes to the connected wallet. */
export async function claimPusd(
  offer: SwapOffer,
  secret: string,
  walletAddress: string,
  walletProvider: WalletProviderType,
  wcIndex: number = 0,
): Promise<string> {
  if (hashSecret(secret) !== offer.secretHash) throw new Error('That secret does not match this swap')
  return spendLock(offer, walletAddress, walletProvider, wcIndex, 'claim', secret)
}

/** After the BCH timeout, return the PUSD to the lock's sender. */
export async function refundPusd(
  offer: SwapOffer,
  walletAddress: string,
  walletProvider: WalletProviderType,
  wcIndex: number = 0,
): Promise<string> {
  return spendLock(offer, walletAddress, walletProvider, wcIndex, 'refund')
}

async function spendLock(
  offer: SwapOffer,
  walletAddress: string,
  walletProvider: WalletProviderType,
  wcIndex: number,
  path: 'claim' | 'refund',
  secret?: string,
): Promise<string> {
  const contract = lockContract(offer)
  const { utxos } = await readBchLock(offer)
  if (utxos.length === 0) throw new Error('The PUSD lock is empty: nothing to claim or refund.')

  const txBuilder = new TransactionBuilder({ provider: getProvider() })
  let sats = 0n
  let units = 0n
  for (const u of utxos) {
    txBuilder.addInput(u, path === 'claim'
      ? contract.unlock.claim(placeholderSignature(), secret!)
      : contract.unlock.refund(placeholderSignature()))
    sats += u.satoshis
    units += BigInt((u as any).token.amount)
  }
  const amount = sats - CONTRACT_SPEND_FEE * BigInt(utxos.length)
  if (amount < DUST_LIMIT) throw new Error('The lock does not hold enough BCH to pay the fee.')
  txBuilder.addOutput({
    to: tokenAddressOf(walletAddress),
    amount,
    token: { category: PUSD_CATEGORY, amount: units },
  })
  if (path === 'refund') txBuilder.setLocktime(bchLockParams(offer).refundAfter)
  const label = path === 'claim' ? 'claim PUSD from a swap' : 'refund PUSD from a swap'
  const result = await buildSignAndBroadcast(txBuilder, walletProvider, `Nomos: ${label}`, wcIndex)
  return result.txid
}

/** Read the secret from a BCH transaction that claimed the PUSD lock. */
export async function findBchSecret(offer: SwapOffer, claimTxid: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/i.test(claimTxid.trim())) throw new Error('Paste the claim transaction ID')
  const tx = decodeTransaction(hexToBin(await getProvider().getRawTransaction(claimTxid.trim().toLowerCase())))
  if (typeof tx === 'string') throw new Error('Could not decode that transaction')
  for (const input of tx.inputs) {
    for (const op of decodeAuthenticationInstructions(input.unlockingBytecode) as any[]) {
      if (op.data instanceof Uint8Array && op.data.length === 32) {
        const candidate = binToHex(op.data)
        if (hashSecret(candidate) === offer.secretHash) return candidate
      }
    }
  }
  return null
}
