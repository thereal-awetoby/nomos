// ── Contract interaction layer ──────────────────────────────
// CashScript SDK + BCH WalletConnect signing for NomosVault.

import {
  Contract,
  ElectrumNetworkProvider,
} from 'cashscript'
import type { NetworkProvider } from 'cashscript'
import type { Mandate, Receipt, VaultState, VaultConfig, WalletProvider } from './types'
import { signWcTransaction } from './wallet'

// ── Artifact ───────────────────────────────────────────────
let artifactCache: any = null

async function getArtifact(): Promise<any> {
  if (artifactCache) return artifactCache
  try {
    const mod = await import('./NomosVault.json')
    artifactCache = mod.default ?? mod
  } catch {
    throw new Error(
      'NomosVault artifact not found. Run: npm run compile',
    )
  }
  return artifactCache
}

// ── Network ────────────────────────────────────────────────
const NETWORK = (import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet'

function getProvider(): NetworkProvider {
  return new ElectrumNetworkProvider(NETWORK)
}

export const DUST_LIMIT = 546
export const MINER_FEE = 1000

// ── Helpers ────────────────────────────────────────────────

/** Current UTC day number */
export function currentDayMarker(): number {
  return Math.floor(Date.now() / 1000 / 86400)
}

/** Remaining daily budget in sats */
export function remainingToday(mandate: Mandate): number {
  const today = currentDayMarker()
  if (today !== mandate.dayMarker) return mandate.dailyLimitSats
  return Math.max(0, mandate.dailyLimitSats - mandate.spentTodaySats)
}

/** Client-side pre-check: would this spend be refused? */
export function wouldRefuse(
  mandate: Mandate,
  amountSats: number,
  destination: string,
): { refused: boolean; reason?: string } {
  if (amountSats <= 0) {
    return { refused: true, reason: 'Amount must be positive' }
  }
  const remaining = remainingToday(mandate)
  if (amountSats > remaining) {
    return {
      refused: true,
      reason: `Refused: exceeds daily limit (${remaining} sats remaining)`,
    }
  }
  if (mandate.allowlistEnabled && !mandate.allowlist.includes(destination)) {
    return { refused: true, reason: 'Refused: destination not allowlisted' }
  }
  return { refused: false }
}

/** Reverse hex byte-by-byte (LE ↔ BE) */
function reverseHex(hex: string): string {
  return hex.match(/.{2}/g)?.reverse().join('') ?? hex
}

/** Pad bytes20 hash to 20 bytes of zeros if empty */
function padBytes20(hex: string): string {
  if (!hex) return '0000000000000000000000000000000000000000'
  return hex.padEnd(40, '0').slice(0, 40)
}

// ── Instantiate contract with real constructor params ──────

export async function getContract(config: VaultConfig): Promise<Contract> {
  const artifact = await getArtifact()
  const provider = getProvider()

  // Constructor params match NomosVault.cash:
  // ownerPk, agentPk, dailyLimitSats, allowlistEnabled,
  // allowedAddr1..5, rescuePk
  const addrs = config.allowedAddrs.slice(0, 5)
  while (addrs.length < 5) addrs.push('')

  return new Contract(artifact, [
    config.ownerPk,
    config.agentPk || '0'.repeat(66),
    BigInt(config.dailyLimitSats),
    config.allowlistEnabled,
    padBytes20(addrs[0]),
    padBytes20(addrs[1]),
    padBytes20(addrs[2]),
    padBytes20(addrs[3]),
    padBytes20(addrs[4]),
    config.rescuePk || '0'.repeat(66),
  ], { provider, addressType: 'p2sh32' })
}

// ── Read vault state from chain ────────────────────────────

export async function readVaultState(
  config: VaultConfig,
): Promise<VaultState> {
  const contract = await getContract(config)
  const address = contract.address
  const tokenAddress = contract.tokenAddress

  const utxos = await contract.getUtxos()
  let balanceSats = 0
  let spentTodaySats = 0
  let dayMarker = 0

  for (const utxo of utxos) {
    balanceSats += Number(utxo.satoshis)

    // Read mutable state from NFT commitment (16 bytes)
    const commitment = (utxo as any).token?.nft?.commitment as string | undefined
    if (commitment && commitment.length === 32) {
      const spentHex = commitment.slice(0, 16)
      spentTodaySats = Number(BigInt('0x' + reverseHex(spentHex)))
      const dayHex = commitment.slice(16, 32)
      dayMarker = Number(BigInt('0x' + reverseHex(dayHex)))
    }
  }

  return {
    address,
    tokenAddress,
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

// ── Spend ──────────────────────────────────────────────────

export async function executeSpend(
  config: VaultConfig,
  mandate: Mandate,
  amountSats: number,
  destination: string,
  signerAddress: string,
  walletProvider: WalletProvider,
): Promise<Receipt> {
  const contract = await getContract(config)
  const utxos = await contract.getUtxos()
  const nftUtxo = utxos.find((u: any) => u.token?.nft)
  if (!nftUtxo) throw new Error('No NFT UTXO found in vault')

  const locktime = Math.floor(Date.now() / 1000)

  // Build tx with CashScript — the .spend() function call
  // uses placeholderP2PKHUnlocker so the wallet fills the signature.
  const tx = contract.functions
    .spend(
      // sig placeholder — wallet fills this
      new Uint8Array(65),
      // pubkey placeholder — wallet fills this
      new Uint8Array(33),
      BigInt(amountSats),
    )
    .from(nftUtxo)
    .to(destination, BigInt(amountSats))
    .withTime(locktime)

  // Generate the WC transaction object for wallet signing
  let wcTxObj: any
  if (walletProvider === 'wizardconnect') {
    wcTxObj = (tx as any).generateWizardConnectTransactionObject?.({
      broadcast: false,
      userPrompt: `Nomos: pay ${amountSats} sats`,
    })
  }
  if (!wcTxObj) {
    wcTxObj = (tx as any).generateWcTransactionObject?.({
      broadcast: false,
      userPrompt: `Nomos: pay ${amountSats} sats`,
    })
  }
  if (!wcTxObj) {
    // Fallback: build and broadcast directly (for testing with WIF keys)
    const txResult = await tx.send()
    return {
      id: typeof txResult === 'string' ? txResult : (txResult as any)?.txid ?? Date.now().toString(),
      status: 'paid',
      amount: amountSats,
      destination,
      txHash: typeof txResult === 'string' ? txResult : (txResult as any)?.txid,
      mandate,
      timestamp: Date.now(),
    }
  }

  const result = await signWcTransaction(walletProvider, wcTxObj)

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

export async function executeSetMandate(
  config: VaultConfig,
  _newMandate: Partial<Mandate>,
  ownerAddress: string,
  walletProvider: WalletProvider,
): Promise<string> {
  const contract = await getContract(config)
  const utxos = await contract.getUtxos()
  const nftUtxo = utxos.find((u: any) => u.token?.nft)
  if (!nftUtxo) throw new Error('No NFT UTXO found in vault')

  const tx = contract.functions
    .setMandate(new Uint8Array(65))
    .from(nftUtxo)

  let wcTxObj: any
  if (walletProvider === 'wizardconnect') {
    wcTxObj = (tx as any).generateWizardConnectTransactionObject?.({
      broadcast: false,
      userPrompt: 'Nomos: update mandate',
    })
  }
  if (!wcTxObj) {
    wcTxObj = (tx as any).generateWcTransactionObject?.({
      broadcast: false,
      userPrompt: 'Nomos: update mandate',
    })
  }
  if (!wcTxObj) {
    const txResult = await tx.send()
    return typeof txResult === 'string' ? txResult : (txResult as any)?.txid ?? ''
  }

  const result = await signWcTransaction(walletProvider, wcTxObj)
  return result.txid
}

// ── Rescue ─────────────────────────────────────────────────

export async function executeRescue(
  config: VaultConfig,
  mandate: Mandate,
  destination: string,
  walletProvider: WalletProvider,
): Promise<string> {
  const contract = await getContract(config)
  const utxos = await contract.getUtxos()
  const nftUtxo = utxos.find((u: any) => u.token?.nft)
  if (!nftUtxo) throw new Error('No NFT UTXO found in vault')

  const tx = contract.functions
    .rescue(new Uint8Array(65), new Uint8Array(65))
    .from(nftUtxo)
    .to(destination, BigInt(Number(nftUtxo.satoshis) - MINER_FEE))

  let wcTxObj: any
  if (walletProvider === 'wizardconnect') {
    wcTxObj = (tx as any).generateWizardConnectTransactionObject?.({
      broadcast: false,
      userPrompt: 'Nomos: rescue funds',
    })
  }
  if (!wcTxObj) {
    wcTxObj = (tx as any).generateWcTransactionObject?.({
      broadcast: false,
      userPrompt: 'Nomos: rescue funds',
    })
  }
  if (!wcTxObj) {
    const txResult = await tx.send()
    return typeof txResult === 'string' ? txResult : (txResult as any)?.txid ?? ''
  }

  const result = await signWcTransaction(walletProvider, wcTxObj)
  return result.txid
}
