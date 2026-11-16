// ── Contract interaction layer ──────────────────────────────
// CashScript 0.11.x SDK: new TransactionBuilder + WC transaction objects.

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
export const MINER_FEE = 1000n

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

function padBytes20(hex: string): string {
  if (!hex) return '0'.repeat(40)
  return hex.padEnd(40, '0').slice(0, 40)
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
    padBytes20(addrs[0]),
    padBytes20(addrs[1]),
    padBytes20(addrs[2]),
    padBytes20(addrs[3]),
    padBytes20(addrs[4]),
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

// ── Helper: build WC tx object and sign ────────────────────

async function buildAndSign(
  txBuilder: TransactionBuilder,
  walletProvider: WalletProviderType,
  prompt: string,
): Promise<{ txid: string; signedTransaction: string }> {
  let wcTxObj: any

  if (walletProvider === 'wizardconnect') {
    wcTxObj = (txBuilder as any).generateWizardConnectTransactionObject?.({
      broadcast: false,
      userPrompt: prompt,
    })
  }

  if (!wcTxObj) {
    wcTxObj = (txBuilder as any).generateWcTransactionObject?.({
      broadcast: false,
      userPrompt: prompt,
    })
  }

  if (!wcTxObj) {
    throw new Error(
      'Could not generate WC transaction object. ' +
      'Connect a wallet that supports WizardConnect or BCH WalletConnect.',
    )
  }

  return signWcTransaction(walletProvider, wcTxObj)
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

  // Output 0: covenant continuation
  const inputSats = nftUtxo.satoshis
  const changeSats = inputSats - amount - MINER_FEE
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

  const result = await buildAndSign(txBuilder, walletProvider, `Nomos: pay ${amountSats} sats`)

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
  _ownerAddress: string,
  walletProvider: WalletProviderType,
): Promise<string> {
  const contract = await getContract(config)
  const provider = getProvider()
  const utxos = await contract.getUtxos()
  const nftUtxo = findNftUtxo(utxos)

  const txBuilder = new TransactionBuilder({ provider })

  txBuilder.addInput(
    nftUtxo,
    contract.unlock.setMandate(placeholderSignature()),
  )

  const changeSats = nftUtxo.satoshis - MINER_FEE
  txBuilder.addOutput({
    to: contract.address,
    amount: changeSats,
    token: {
      amount: 0n,
      category: (nftUtxo as any).token.category,
      nft: {
        capability: (nftUtxo as any).token.nft.capability,
        commitment: (nftUtxo as any).token.nft.commitment,
      },
    },
  })

  const result = await buildAndSign(txBuilder, walletProvider, 'Nomos: update mandate')
  return result.txid
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

  const txBuilder = new TransactionBuilder({ provider })

  txBuilder.addInput(
    nftUtxo,
    contract.unlock.rescue(placeholderSignature(), placeholderSignature()),
  )

  const sweepAmount = nftUtxo.satoshis - MINER_FEE
  txBuilder.addOutput({ to: destination, amount: sweepAmount })

  const result = await buildAndSign(txBuilder, walletProvider, 'Nomos: rescue funds')
  return result.txid
}
