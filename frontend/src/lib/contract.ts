// ── Contract interaction layer ──────────────────────────────
// Wraps CashScript SDK calls for NomosVault covenant.
// Uses TransactionBuilder + placeholderP2PKHUnlocker for wallet signing.

import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
} from 'cashscript'
import { placeholderP2PKHUnlocker } from '@cashscript/utils'
import type { Mandate, Receipt, VaultState, WalletProvider } from './types'
import { signWcTransaction } from './wallet'

// ── Artifact: compiled NomosVault.cash output ──────────────
// The build step (cashc) produces this JSON. We import it statically.
// If the compiled artifact isn't available yet, the import will fail
// at build time, which is fine — it means you need to run:
//   npx cashc contracts/NomosVault.cash --output frontend/src/lib/NomosVault.json
//
// For now we'll use a dynamic import with a fallback.
let artifactCache: any = null

async function getArtifact() {
  if (artifactCache) return artifactCache
  try {
    artifactCache = (await import('./NomosVault.json')).default
  } catch {
    throw new Error(
      'NomosVault artifact not found. Run: npx cashc contracts/NomosVault.cash -o frontend/src/lib/NomosVault.json',
    )
  }
  return artifactCache
}

// ── Network provider ───────────────────────────────────────
// Mainnet by default; switch to chipnet for testing.
const NETWORK = (import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet'

function getProvider() {
  return new ElectrumNetworkProvider(NETWORK)
}

const DUST_LIMIT = 546
const MINER_FEE = 1000

/** Get current UTC day number */
export function currentDayMarker(): number {
  return Math.floor(Date.now() / 1000 / 86400)
}

/** Calculate remaining daily budget */
export function remainingToday(mandate: Mandate): number {
  const today = currentDayMarker()
  if (today !== mandate.dayMarker) return mandate.dailyLimitSats
  return Math.max(0, mandate.dailyLimitSats - mandate.spentTodaySats)
}

/** Check if a spend would be refused (client-side pre-check) */
export function wouldRefuse(
  mandate: Mandate,
  amountSats: number,
  destination: string,
): { refused: boolean; reason?: string } {
  const remaining = remainingToday(mandate)

  if (amountSats <= 0) {
    return { refused: true, reason: 'Amount must be positive' }
  }

  if (amountSats > remaining) {
    return {
      refused: true,
      reason: `Refused: exceeds daily limit (${remaining} sats remaining)`,
    }
  }

  if (mandate.allowlistEnabled) {
    if (!mandate.allowlist.includes(destination)) {
      return { refused: true, reason: 'Refused: destination not allowlisted' }
    }
  }

  return { refused: false }
}

// ── Read vault state from chain ────────────────────────────

export async function readVaultState(contractAddress: string): Promise<VaultState> {
  const provider = getProvider()

  // Get UTXOs for the contract address
  const utxos = await provider.getUtxos(contractAddress)
  let balanceSats = 0
  let spentTodaySats = 0
  let dayMarker = 0

  for (const utxo of utxos) {
    balanceSats += Number(utxo.satoshis)

    // Read NFT commitment for mutable state
    if (utxo.token?.nft?.commitment) {
      const commitHex = utxo.token.nft.commitment
      if (commitHex.length === 32) {
        // 16 bytes = 32 hex chars
        // spentTodaySats: first 8 bytes LE
        const spentHex = commitHex.slice(0, 16)
        spentTodaySats = Number(
          BigInt('0x' + reverseHex(spentHex)),
        )
        // dayMarker: last 8 bytes LE
        const dayHex = commitHex.slice(16, 32)
        dayMarker = Number(
          BigInt('0x' + reverseHex(dayHex)),
        )
      }
    }
  }

  return {
    address: contractAddress,
    balanceSats,
    mandate: {
      dailyLimitSats: 0, // read from contract constructor (off-chain config)
      spentTodaySats,
      dayMarker,
      allowlistEnabled: false,
      allowlist: [],
      agentPk: null,
      rescuePk: null,
    },
  }
}

/** Reverse hex string byte-by-byte (for LE encoding) */
function reverseHex(hex: string): string {
  return hex.match(/.{2}/g)?.reverse().join('') ?? hex
}

// ── Build + sign spend tx ──────────────────────────────────

export async function executeSpend(
  contractAddress: string,
  mandate: Mandate,
  amountSats: number,
  destination: string,
  signerAddress: string,
  walletProvider: WalletProvider,
): Promise<Receipt> {
  const artifact = await getArtifact()
  const provider = getProvider()

  // Instantiate contract
  const contract = new Contract(artifact, [], { provider, addressType: 'p2sh32' })

  // Get the contract's UTXOs (need the one with the NFT)
  const utxos = await contract.getUtxos()
  const nftUtxo = utxos.find((u: any) => u.token?.nft)
  if (!nftUtxo) throw new Error('No NFT UTXO found in vault')

  // Build the spend transaction using TransactionBuilder
  const txBuilder = new TransactionBuilder({
    provider,
  })

  // Use placeholderP2PKHUnlocker so the wallet signs via WalletConnect
  const unlocker = placeholderP2PKHUnlocker(signerAddress)

  // Set locktime to current unix timestamp
  const locktime = Math.floor(Date.now() / 1000)

  // Call contract.functions.spend() with the builder pattern
  const txBuilt = contract.functions
    .spend(unlocker, Buffer.alloc(33), amountSats)
    .from(nftUtxo)
    .to(destination, amountSats)
    .withTime(locktime)

  // Generate WalletConnect transaction object (unsigned)
  const wcTxObj = await txBuilt.build()

  // Sign via wallet
  const txid = await signWcTransaction(walletProvider, wcTxObj)

  const receipt: Receipt = {
    id: txid || Date.now().toString(),
    status: 'paid',
    amount: amountSats,
    destination,
    txHash: txid,
    mandate,
    timestamp: Date.now(),
  }

  return receipt
}

/** Build + broadcast a setMandate transaction */
export async function executeSetMandate(
  contractAddress: string,
  currentMandate: Mandate,
  newMandate: Partial<Mandate>,
  ownerAddress: string,
  walletProvider: WalletProvider,
): Promise<string> {
  const artifact = await getArtifact()
  const provider = getProvider()
  const contract = new Contract(artifact, [], { provider, addressType: 'p2sh32' })

  const utxos = await contract.getUtxos()
  const nftUtxo = utxos.find((u: any) => u.token?.nft)
  if (!nftUtxo) throw new Error('No NFT UTXO found in vault')

  const unlocker = placeholderP2PKHUnlocker(ownerAddress)

  // setMandate just requires owner sig — no covenant constraints on output
  const txBuilt = contract.functions
    .setMandate(unlocker)
    .from(nftUtxo)

  const wcTxObj = await txBuilt.build()
  const txid = await signWcTransaction(walletProvider, wcTxObj)

  return txid
}

/** Build + broadcast a rescue transaction */
export async function executeRescue(
  contractAddress: string,
  mandate: Mandate,
  destination: string,
  ownerAddress: string,
  walletProvider: WalletProvider,
): Promise<string> {
  const artifact = await getArtifact()
  const provider = getProvider()
  const contract = new Contract(artifact, [], { provider, addressType: 'p2sh32' })

  const utxos = await contract.getUtxos()
  const nftUtxo = utxos.find((u: any) => u.token?.nft)
  if (!nftUtxo) throw new Error('No NFT UTXO found in vault')

  // Rescue requires both owner + rescue sigs
  const ownerUnlocker = placeholderP2PKHUnlocker(ownerAddress)
  // Note: rescue co-signer must also approve via their wallet
  // For now, both sigs go through the same wallet session
  const rescueUnlocker = placeholderP2PKHUnlocker(ownerAddress)

  const txBuilt = contract.functions
    .rescue(ownerUnlocker, rescueUnlocker)
    .from(nftUtxo)
    .to(destination, Number(nftUtxo.satoshis) - MINER_FEE)

  const wcTxObj = await txBuilt.build()
  const txid = await signWcTransaction(walletProvider, wcTxObj)

  return txid
}

export { DUST_LIMIT, MINER_FEE }
