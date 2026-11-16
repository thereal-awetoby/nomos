// ── Contract interaction layer ──────────────────────────────
// CashScript 0.11.x SDK: TransactionBuilder + generateWcTransactionObject.
// NOTE: generateWizardConnectTransactionObject does NOT exist in 0.11.x.
// We use generateWcTransactionObject for both wallets and wrap for WizardConnect.

import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderSignature,
  placeholderPublicKey,
} from 'cashscript'
import type { Network, NetworkProvider, Utxo } from 'cashscript'
import type {
  Mandate,
  Receipt,
  VaultState,
  VaultConfig,
  WalletProviderType,
} from './types'
import { signWcTransaction } from './wallet'
import { decodeCashAddress, binToHex as libBinToHex } from '@bitauth/libauth'

// ── Artifact ───────────────────────────────────────────────
let artifactCache: any = null

async function getArtifact(): Promise<any> {
  if (artifactCache) return artifactCache
  try {
    const mod = await import('./NomosVault.json')
    artifactCache = mod.default ?? mod
  } catch {
    throw new Error('NomosVault artifact not found. Run: npm run compile')
  }
  return artifactCache
}

// ── Network ────────────────────────────────────────────────
const NETWORK = ((import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet') as Network

function getProvider(): NetworkProvider {
  return new ElectrumNetworkProvider(NETWORK)
}

export const DUST_LIMIT = 546n

// The contract's spend() hardcodes `int minerFee = 1000` as the floor.
// For setMandate/rescue (no contract constraint) we still use this as minimum.
const CONTRACT_FEE_FLOOR = 1000n

/** Estimate fee at ~1 sat/byte. Each input ≈ 150 B, each output ≈ 35 B, overhead ≈ 10 B. */
function estimateFee(numInputs: number, numOutputs: number): bigint {
  const bytes = BigInt(10 + numInputs * 150 + numOutputs * 35)
  return bytes > CONTRACT_FEE_FLOOR ? bytes : CONTRACT_FEE_FLOOR
}

// ── Helpers ────────────────────────────────────────────────

export function currentDayMarker(): number {
  return Math.floor(Date.now() / 1000 / 86400)
}

export function remainingToday(mandate: Mandate): number {
  const today = currentDayMarker()
  if (today !== mandate.dayMarker) return mandate.dailyLimitSats
  return Math.max(0, mandate.dailyLimitSats - mandate.spentTodaySats)
}

export function wouldRefuse(
  mandate: Mandate,
  amountSats: number,
  destination: string,
): { refused: boolean; reason?: string } {
  if (amountSats <= 0) return { refused: true, reason: 'Amount must be positive' }
  const remaining = remainingToday(mandate)
  if (amountSats > remaining) {
    return { refused: true, reason: `Exceeds daily limit (${remaining} sats remaining)` }
  }
  if (mandate.allowlistEnabled && !mandate.allowlist.includes(destination)) {
    return { refused: true, reason: 'Destination not allowlisted' }
  }
  return { refused: false }
}

function reverseHex(hex: string): string {
  return hex.match(/.{2}/g)?.reverse().join('') ?? hex
}

/** Convert a cashaddr (bitcoincash:q…) to 20-byte hex hash, or return zero hash */
function addrToHash160(addr: string): string {
  if (!addr) return '0'.repeat(40)
  try {
    const decoded = decodeCashAddress(addr)
    if (typeof decoded === 'string') return '0'.repeat(40)
    return libBinToHex(decoded.payload)
  } catch {
    // If it's already hex (40 chars), pass through
    if (/^[0-9a-fA-F]{40}$/.test(addr)) return addr.toLowerCase()
    return '0'.repeat(40)
  }
}

const EXPECTED_PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest'

/**
 * Validate a BCH cashaddr for use as a payment destination.
 * Any type is accepted (P2PKH, P2SH20, P2SH32, token-aware) but the
 * network prefix must match (bitcoincash: on mainnet, bchtest: otherwise).
 * Returns null if valid, error string if not.
 */
export function validateCashAddress(addr: string): string | null {
  if (!addr) return 'Empty address'
  try {
    const decoded = decodeCashAddress(addr)
    if (typeof decoded === 'string') return decoded
    // Reject wrong-network addresses (e.g. bchtest: on mainnet)
    if (decoded.prefix !== EXPECTED_PREFIX) {
      return `Wrong network: expected ${EXPECTED_PREFIX}, got ${decoded.prefix}`
    }
    return null
  } catch (e: any) {
    return e.message || 'Invalid address'
  }
}

/**
 * Stricter validation for allowlist entries.
 * Must be P2PKH on the correct network — the contract's allowlist check
 * extracts bytes20 from P2PKH locking bytecode at offset 3, so P2SH and
 * token-aware addresses won't match.
 */
export function validateAllowlistAddress(addr: string): string | null {
  if (!addr) return 'Empty address'
  try {
    const decoded = decodeCashAddress(addr)
    if (typeof decoded === 'string') return decoded
    if (decoded.prefix !== EXPECTED_PREFIX) {
      return `Wrong network: expected ${EXPECTED_PREFIX}, got ${decoded.prefix}`
    }
    if (decoded.payload.length !== 20) {
      return 'Only 20-byte P2PKH addresses work with the allowlist'
    }
    if ((decoded as any).type && (decoded as any).type !== 'p2pkh') {
      return `Only P2PKH addresses work with the allowlist (got ${(decoded as any).type})`
    }
    return null
  } catch (e: any) {
    return e.message || 'Invalid address'
  }
}

// ── Instantiate contract ───────────────────────────────────

export async function getContract(config: VaultConfig): Promise<Contract> {
  const artifact = await getArtifact()
  const provider = getProvider()

  const addrs = config.allowedAddrs.slice(0, 5)
  while (addrs.length < 5) addrs.push('')

  return new Contract(artifact, [
    config.ownerPk,
    config.agentPk || '0'.repeat(66),
    BigInt(config.dailyLimitSats),
    config.allowlistEnabled,
    addrToHash160(addrs[0]),
    addrToHash160(addrs[1]),
    addrToHash160(addrs[2]),
    addrToHash160(addrs[3]),
    addrToHash160(addrs[4]),
    config.rescuePk || '0'.repeat(66),
  ], { provider, addressType: 'p2sh32' })
}

// ── Read vault state ───────────────────────────────────────

export async function readVaultState(config: VaultConfig): Promise<VaultState> {
  const contract = await getContract(config)

  const utxos = await contract.getUtxos()
  let balanceSats = 0
  let spentTodaySats = 0
  let dayMarker = 0

  for (const utxo of utxos) {
    balanceSats += Number(utxo.satoshis)

    const commitment = (utxo as any).token?.nft?.commitment as string | undefined
    if (commitment && commitment.length === 32) {
      spentTodaySats = Number(BigInt('0x' + reverseHex(commitment.slice(0, 16))))
      dayMarker = Number(BigInt('0x' + reverseHex(commitment.slice(16, 32))))
    }
  }

  return {
    address: contract.address,
    tokenAddress: contract.tokenAddress,
    balanceSats,
    mandate: {
      dailyLimitSats: config.dailyLimitSats,
      spentTodaySats,
      dayMarker,
      allowlistEnabled: config.allowlistEnabled,
      allowlist: config.allowedAddrs.filter(Boolean),
      agentPk: config.agentPk || null,
      rescuePk: config.rescuePk || null,
    },
  }
}

// ── Helper: find NFT UTXO ──────────────────────────────────

function findNftUtxo(utxos: Utxo[]): Utxo {
  const nft = utxos.find((u: any) => u.token?.nft)
  if (!nft) throw new Error('No NFT UTXO found in vault')
  return nft
}

/** Plain (non-NFT) UTXOs sitting at the contract address — top-ups. */
function findPlainUtxos(utxos: Utxo[]): Utxo[] {
  return utxos.filter((u: any) => !u.token?.nft)
}

// ── Helper: build WC tx object, sign, and broadcast ────────

async function buildSignAndBroadcast(
  txBuilder: TransactionBuilder,
  provider: WalletProviderType,
  prompt: string,
): Promise<{ txid: string; signedTransaction: string }> {
  // CashScript 0.11.x: generateWcTransactionObject (NOT generateWizardConnectTransactionObject)
  const wcTxObj = (txBuilder as any).generateWcTransactionObject({
    broadcast: true,
    userPrompt: prompt,
  })

  const result = await signWcTransaction(provider, wcTxObj)

  // If wallet broadcast (broadcast:true) returned a txid, we're done
  if (result.txid) return result

  // Fallback: wallet didn't broadcast — do it ourselves
  if (result.signedTransaction) {
    const electrum = getProvider() as ElectrumNetworkProvider
    const txid = await electrum.sendRawTransaction(result.signedTransaction)
    return { txid, signedTransaction: result.signedTransaction }
  }

  throw new Error('Wallet returned neither txid nor signed transaction')
}

// ── Spend ──────────────────────────────────────────────────

export async function executeSpend(
  config: VaultConfig,
  mandate: Mandate,
  amountSats: number,
  destination: string,
  _signerAddress: string,
  walletProvider: WalletProviderType,
): Promise<Receipt> {
  const contract = await getContract(config)
  const provider = getProvider()
  const utxos = await contract.getUtxos()
  const nftUtxo = findNftUtxo(utxos)
  const plainUtxos = findPlainUtxos(utxos)

  const locktime = Math.floor(Date.now() / 1000)
  const amount = BigInt(amountSats)

  const txBuilder = new TransactionBuilder({ provider })

  txBuilder.addInput(
    nftUtxo,
    contract.unlock.spend(
      placeholderSignature(),
      placeholderPublicKey(),
      amount,
    ),
  )

  // Consolidate plain UTXOs (top-ups) via the unconstrained setMandate unlock
  let extraSats = 0n
  for (const pu of plainUtxos) {
    txBuilder.addInput(pu, contract.unlock.setMandate(placeholderSignature()))
    extraSats += pu.satoshis
  }

  // Output 0: covenant continuation (NFT sats + top-up sats − spend − fee)
  const numInputs = 1 + plainUtxos.length
  const fee = estimateFee(numInputs, 2) // 2 outputs: covenant + destination
  const inputSats = nftUtxo.satoshis + extraSats
  const changeSats = inputSats - amount - fee
  if (changeSats < DUST_LIMIT) throw new Error('Insufficient vault balance')

  const today = currentDayMarker()
  const prevSpent = today === mandate.dayMarker ? mandate.spentTodaySats : 0
  const newSpent = prevSpent + amountSats
  const spentHex = reverseHex(BigInt(newSpent).toString(16).padStart(16, '0'))
  const dayHex = reverseHex(BigInt(today).toString(16).padStart(16, '0'))
  const newCommitment = spentHex + dayHex

  txBuilder.addOutput({
    to: contract.address,
    amount: changeSats,
    token: {
      amount: 0n,
      category: (nftUtxo as any).token.category,
      nft: {
        capability: (nftUtxo as any).token.nft.capability,
        commitment: newCommitment,
      },
    },
  })

  txBuilder.addOutput({ to: destination, amount })
  txBuilder.setLocktime(locktime)

  const result = await buildSignAndBroadcast(
    txBuilder, walletProvider, `Nomos: pay ${amountSats} sats`,
  )

  return {
    id: result.txid || Date.now().toString(),
    status: 'paid',
    amount: amountSats,
    destination,
    txHash: result.txid,
    mandate,
    timestamp: Date.now(),
  }
}

// ── Set Mandate ────────────────────────────────────────────
// Owner sweeps NFT + funds from old contract to a NEW contract
// built with updated params. The contract's setMandate() only
// checks the owner sig — no covenant on outputs — so the
// destination can be any address (the new contract).

export async function executeSetMandate(
  config: VaultConfig,
  newConfig: VaultConfig,
  _ownerAddress: string,
  walletProvider: WalletProviderType,
): Promise<{ txid: string; newConfig: VaultConfig }> {
  const oldContract = await getContract(config)
  const newContract = await getContract(newConfig)
  const provider = getProvider()
  const utxos = await oldContract.getUtxos()
  const nftUtxo = findNftUtxo(utxos)
  const plainUtxos = findPlainUtxos(utxos)

  const txBuilder = new TransactionBuilder({ provider })

  txBuilder.addInput(
    nftUtxo,
    oldContract.unlock.setMandate(placeholderSignature()),
  )

  // Consolidate plain UTXOs (top-ups) via the same unconstrained setMandate
  let extraSats = 0n
  for (const pu of plainUtxos) {
    txBuilder.addInput(pu, oldContract.unlock.setMandate(placeholderSignature()))
    extraSats += pu.satoshis
  }

  // Send NFT + all funds to the NEW contract (with updated params)
  const numInputs = 1 + plainUtxos.length
  const fee = estimateFee(numInputs, 1) // 1 output: new contract
  const changeSats = nftUtxo.satoshis + extraSats - fee
  txBuilder.addOutput({
    to: newContract.tokenAddress,
    amount: changeSats,
    token: {
      amount: 0n,
      category: (nftUtxo as any).token.category,
      nft: {
        capability: (nftUtxo as any).token.nft.capability,
        // Reset state: spentToday=0, dayMarker=0 (fresh mandate)
        commitment: '00000000000000000000000000000000',
      },
    },
  })

  const result = await buildSignAndBroadcast(
    txBuilder, walletProvider, 'Nomos: update mandate',
  )
  return { txid: result.txid, newConfig }
}

// ── Rescue ─────────────────────────────────────────────────

export async function executeRescue(
  config: VaultConfig,
  _mandate: Mandate,
  destination: string,
  walletProvider: WalletProviderType,
): Promise<string> {
  const contract = await getContract(config)
  const provider = getProvider()
  const utxos = await contract.getUtxos()
  const nftUtxo = findNftUtxo(utxos)
  const plainUtxos = findPlainUtxos(utxos)

  const txBuilder = new TransactionBuilder({ provider })

  txBuilder.addInput(
    nftUtxo,
    contract.unlock.rescue(placeholderSignature(), placeholderSignature()),
  )

  // Consolidate plain UTXOs (top-ups) via the unconstrained setMandate unlock
  let extraSats = 0n
  for (const pu of plainUtxos) {
    txBuilder.addInput(pu, contract.unlock.setMandate(placeholderSignature()))
    extraSats += pu.satoshis
  }

  const numInputs = 1 + plainUtxos.length
  const fee = estimateFee(numInputs, 1) // 1 output: rescue destination
  const sweepAmount = nftUtxo.satoshis + extraSats - fee
  txBuilder.addOutput({ to: destination, amount: sweepAmount })

  const result = await buildSignAndBroadcast(
    txBuilder, walletProvider, 'Nomos: rescue funds',
  )
  return result.txid
}
