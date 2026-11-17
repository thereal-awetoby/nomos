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
  placeholderP2PKHUnlocker,
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
import { decodeCashAddress, binToHex as libBinToHex, hexToBin, hash160, hashTransaction } from '@bitauth/libauth'

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

/** Explorer base URL — switches automatically for chipnet. */
export const EXPLORER_TX_URL = NETWORK === 'mainnet'
  ? 'https://blockchair.com/bitcoin-cash/transaction/'
  : 'https://chipnet.imaginary.cash/tx/'

// ── Fees ───────────────────────────────────────────────────
// Sizes measured from real NomosVault transactions (p2sh32, CashScript 0.11):
// every contract input carries the full redeem script, so it is ~525 bytes,
// not the ~150 of a normal P2PKH input. Rescue carries a second signature.
const TX_OVERHEAD_BYTES = 10
const CONTRACT_INPUT_BYTES = 545
const RESCUE_EXTRA_BYTES = 75
const TOKEN_OUTPUT_BYTES = 100
const PLAIN_OUTPUT_BYTES = 45
const FEE_RATE_SATS_PER_BYTE = 1
const FEE_MARGIN = 1.1 // 10% headroom so we never fall under the 1 sat/byte relay minimum

function estimateFee(opts: {
  contractInputs: number
  tokenOutputs: number
  plainOutputs: number
  rescue?: boolean
}): bigint {
  const bytes =
    TX_OVERHEAD_BYTES +
    opts.contractInputs * CONTRACT_INPUT_BYTES +
    (opts.rescue ? RESCUE_EXTRA_BYTES : 0) +
    opts.tokenOutputs * TOKEN_OUTPUT_BYTES +
    opts.plainOutputs * PLAIN_OUTPUT_BYTES
  return BigInt(Math.ceil(bytes * FEE_RATE_SATS_PER_BYTE * FEE_MARGIN))
}

// spend() lets the NFT input lose at most `amount + 1000` sats; anything above
// that must come from top-up inputs.
const CONTRACT_MAX_FEE_FROM_NFT = 1000n

// ── Locktime / day ─────────────────────────────────────────
// Nodes reject a transaction whose locktime is later than the chain's median
// time past (non-final). MTP trails wall-clock time by roughly an hour, so we
// back-date. The contract derives "today" from tx.locktime, so the UI's notion
// of today must come from the same value or the limit math drifts at midnight.
const LOCKTIME_BACKDATE_SECS = 3 * 3600

function txLocktime(): number {
  return Math.floor(Date.now() / 1000) - LOCKTIME_BACKDATE_SECS
}

// ── Helpers ────────────────────────────────────────────────

export function currentDayMarker(): number {
  return Math.floor(txLocktime() / 86400)
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
  // Compare by key hash so q… and token-aware z… forms of one address match,
  // exactly as the contract does (it reads the 20-byte hash from the output).
  if (mandate.allowlistEnabled && !mandate.allowlist.some((a) => sameHash160(a, destination))) {
    return { refused: true, reason: 'Destination not allowlisted' }
  }
  return { refused: false }
}

function sameHash160(a: string, b: string): boolean {
  const ha = addrToHash160(a)
  return ha !== '0'.repeat(40) && ha === addrToHash160(b)
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
    // Token-aware (z…) P2PKH has the same locking script as q…, so it works too
    const type = (decoded as any).type
    if (type && type !== 'p2pkh' && type !== 'p2pkhWithTokens') {
      return `Only P2PKH addresses work with the allowlist (got ${type})`
    }
    return null
  } catch (e: any) {
    return e.message || 'Invalid address'
  }
}

/** True if `address` is the P2PKH address of the vault owner's public key. */
function isOwnerAddress(address: string, ownerPkHex: string): boolean {
  try {
    const decoded = decodeCashAddress(address)
    if (typeof decoded === 'string') return false
    return libBinToHex(decoded.payload) === libBinToHex(hash160(hexToBin(ownerPkHex)) as Uint8Array)
  } catch {
    return false
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
  let deployed = false

  for (const utxo of utxos) {
    balanceSats += Number(utxo.satoshis)

    const commitment = (utxo as any).token?.nft?.commitment as string | undefined
    if (commitment && commitment.length === 32) {
      deployed = true
      spentTodaySats = Number(BigInt('0x' + reverseHex(commitment.slice(0, 16))))
      dayMarker = Number(BigInt('0x' + reverseHex(commitment.slice(16, 32))))
    }
  }

  return {
    address: contract.address,
    tokenAddress: contract.tokenAddress,
    balanceSats,
    deployed,
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

  if (result.signedTransaction) {
    // Always broadcast the signed hex ourselves. If the wallet already did,
    // the node reports it as known and we carry on with the txid we compute.
    const txid = hashTransaction(hexToBin(result.signedTransaction))
    try {
      await getProvider().sendRawTransaction(result.signedTransaction)
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      if (!/already|known|txn-mempool-conflict/i.test(msg)) throw err
    }
    return { txid, signedTransaction: result.signedTransaction }
  }

  // Wallet broadcast and only returned the hash
  if (result.txid) return result

  throw new Error('Wallet returned neither txid nor signed transaction')
}

// ── Spend ──────────────────────────────────────────────────

export async function executeSpend(
  config: VaultConfig,
  mandate: Mandate,
  amountSats: number,
  destination: string,
  signerAddress: string,
  walletProvider: WalletProviderType,
  destinationLabel?: string,
): Promise<Receipt> {
  const contract = await getContract(config)
  const provider = getProvider()
  const utxos = await contract.getUtxos()
  const nftUtxo = findNftUtxo(utxos)
  const plainUtxos = findPlainUtxos(utxos)

  const locktime = txLocktime()
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

  // Top-ups (plain UTXOs at the contract) can only be unlocked through
  // setMandate, which needs the OWNER's signature. Pull them in only when the
  // owner is paying; an agent pays from the NFT UTXO alone.
  const signerIsOwner = isOwnerAddress(signerAddress, config.ownerPk)
  const topUps = signerIsOwner ? plainUtxos : []
  let extraSats = 0n
  for (const pu of topUps) {
    txBuilder.addInput(pu, contract.unlock.setMandate(placeholderSignature()))
    extraSats += pu.satoshis
  }

  // Output 0: covenant continuation (NFT sats + top-up sats − spend − fee)
  const fee = estimateFee({ contractInputs: 1 + topUps.length, tokenOutputs: 1, plainOutputs: 1 })
  if (fee > CONTRACT_MAX_FEE_FROM_NFT + extraSats) {
    throw new Error('Fee too high for this vault layout — update the mandate to merge top-ups first')
  }
  const changeSats = nftUtxo.satoshis + extraSats - amount - fee
  if (changeSats < DUST_LIMIT) {
    const stranded = plainUtxos.length > 0 && !signerIsOwner
    throw new Error(stranded
      ? 'Not enough in the vault for an agent payment. Top-ups need the owner: pay as owner or update the mandate to merge them.'
      : 'Insufficient vault balance')
  }

  const today = currentDayMarker()
  const prevSpent = today === mandate.dayMarker ? mandate.spentTodaySats : 0
  const newSpent = prevSpent + amountSats
  const spentHex = reverseHex(BigInt(newSpent).toString(16).padStart(16, '0'))
  const dayHex = reverseHex(BigInt(today).toString(16).padStart(16, '0'))
  const newCommitment = spentHex + dayHex

  // Must be the token-aware address: CashScript refuses to send an NFT to a
  // plain p2sh address.
  txBuilder.addOutput({
    to: contract.tokenAddress,
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
    destinationLabel,
    txHash: result.txid,
    mandate,
    timestamp: Date.now(),
  }
}

// ── Create vault (genesis) ─────────────────────────────────
// Mints the vault's mutable state NFT (commitment = 16 zero bytes) straight
// into the covenant, funded from the connected wallet. CashTokens genesis must
// spend a coin at output index 0 (the new token category is that coin's
// txid), so if the wallet has none big enough we first merge its coins into
// one — a second signature request.

const P2PKH_INPUT_BYTES = 150
export const MIN_VAULT_DEPOSIT_SATS = 2000

function p2pkhFee(inputs: number, tokenOutputs: number, plainOutputs: number): bigint {
  const bytes =
    TX_OVERHEAD_BYTES +
    inputs * P2PKH_INPUT_BYTES +
    tokenOutputs * TOKEN_OUTPUT_BYTES +
    plainOutputs * PLAIN_OUTPUT_BYTES
  return BigInt(Math.ceil(bytes * FEE_RATE_SATS_PER_BYTE * FEE_MARGIN))
}

export async function executeCreateVault(
  config: VaultConfig,
  depositSats: number,
  walletAddress: string,
  walletProvider: WalletProviderType,
  onStep?: (message: string) => void,
): Promise<{ txid: string }> {
  if (!Number.isFinite(depositSats) || depositSats < MIN_VAULT_DEPOSIT_SATS) {
    throw new Error(`Deposit at least ${MIN_VAULT_DEPOSIT_SATS} sats (${MIN_VAULT_DEPOSIT_SATS / 1e8} BCH)`)
  }

  const contract = await getContract(config)
  const alreadyDeployed = (await contract.getUtxos()).some((u: any) => u.token?.nft)
  if (alreadyDeployed) throw new Error('This vault is already deployed')

  const provider = getProvider()
  const walletUtxos = (await provider.getUtxos(walletAddress)).filter((u: any) => !u.token)
  const deposit = BigInt(depositSats)
  const genesisFee = p2pkhFee(1, 1, 1)
  const needed = deposit + genesisFee + DUST_LIMIT

  let genesisUtxo: Utxo | undefined = walletUtxos
    .filter((u) => u.vout === 0 && u.satoshis >= needed)
    .sort((a, b) => (a.satoshis < b.satoshis ? -1 : 1))[0]

  if (!genesisUtxo) {
    const total = walletUtxos.reduce((sum, u) => sum + u.satoshis, 0n)
    const mergeFee = p2pkhFee(walletUtxos.length, 0, 1)
    const merged = total - mergeFee
    if (walletUtxos.length === 0 || merged < needed) {
      const need = needed + mergeFee
      throw new Error(`Your wallet needs at least ${Number(need) / 1e8} BCH (deposit + fees)`)
    }

    onStep?.('Step 1 of 2: preparing a coin for the vault. Confirm in your wallet.')
    const mergeTx = new TransactionBuilder({ provider })
    for (const u of walletUtxos) mergeTx.addInput(u, placeholderP2PKHUnlocker(walletAddress))
    mergeTx.addOutput({ to: walletAddress, amount: merged })
    const mergeResult = await buildSignAndBroadcast(mergeTx, walletProvider, 'Nomos: prepare vault coin')
    genesisUtxo = { txid: mergeResult.txid, vout: 0, satoshis: merged }

    onStep?.('Step 2 of 2: creating your vault. Confirm in your wallet.')
  } else {
    onStep?.('Creating your vault. Confirm in your wallet.')
  }

  const genesisTx = new TransactionBuilder({ provider })
  genesisTx.addInput(genesisUtxo, placeholderP2PKHUnlocker(walletAddress))
  genesisTx.addOutput({
    to: contract.tokenAddress,
    amount: deposit,
    token: {
      amount: 0n,
      category: genesisUtxo.txid, // genesis: category = txid of the input at vout 0
      nft: { capability: 'mutable', commitment: '0'.repeat(32) },
    },
  })
  const change = genesisUtxo.satoshis - deposit - genesisFee
  if (change >= DUST_LIMIT) genesisTx.addOutput({ to: walletAddress, amount: change })

  const result = await buildSignAndBroadcast(genesisTx, walletProvider, 'Nomos: create vault')
  return { txid: result.txid }
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
  const fee = estimateFee({ contractInputs: 1 + plainUtxos.length, tokenOutputs: 1, plainOutputs: 0 })
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

  // The NFT is burned here (no token output), which is allowed.
  const fee = estimateFee({ contractInputs: 1 + plainUtxos.length, tokenOutputs: 0, plainOutputs: 1, rescue: true })
  const sweepAmount = nftUtxo.satoshis + extraSats - fee
  txBuilder.addOutput({ to: destination, amount: sweepAmount })

  const result = await buildSignAndBroadcast(
    txBuilder, walletProvider, 'Nomos: rescue funds',
  )
  return result.txid
}
