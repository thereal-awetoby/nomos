// ── Wallet connection + signing layer ───────────────────────
// WizardConnect (QR relay via useWizardConnect hook in React)
// + BCH WalletConnect v2 (Cashonize / Paytaca / XO)

import type { WalletConnection, WalletProviderType } from './types'
import { binToHex } from '@wizardconnect/core'
import type { DappConnectionManager } from '@wizardconnect/dapp'
import {
  hash160,
  encodeCashAddress,
  encodeTransaction,
  binToHex as libBinToHex,
  stringify,
} from '@bitauth/libauth'

// ── Active references (set by React layer) ────────────────
let wcManager: DappConnectionManager | null = null

/** Called by WalletContext when the hook's manager becomes available */
export function setWcManager(mgr: DappConnectionManager | null): void {
  wcManager = mgr
}

export function getWcManager(): DappConnectionManager | null {
  return wcManager
}

// ── Derive BCH cashaddr from a compressed public key ──────
export function pubkeyToAddress(
  pubkeyBytes: Uint8Array,
  prefix: 'bitcoincash' | 'bchtest' = 'bitcoincash',
): string {
  const h = hash160(pubkeyBytes)
  const result = encodeCashAddress({ prefix, type: 'p2pkh', payload: h })
  if (typeof result === 'string') return result
  return (result as { address: string }).address
}

/** Get the hex pubkey from WizardConnect manager (child 0, selected receive index) */
export function getWcPubkeyHex(index: number | bigint = 0): string {
  if (!wcManager) return ''
  const raw = wcManager.getPubkey(0, BigInt(index))
  if (!raw) return ''
  return binToHex(raw)
}

/** Get the BCH address from WizardConnect pubkey at a given receive index */
export function getWcAddress(
  network: 'mainnet' | 'chipnet' = 'mainnet',
  index: number | bigint = 0,
): string {
  if (!wcManager) return ''
  const raw = wcManager.getPubkey(0, BigInt(index))
  if (!raw) return ''
  return pubkeyToAddress(raw, network === 'mainnet' ? 'bitcoincash' : 'bchtest')
}

/**
 * Scan WizardConnect receive indices 0..maxIndex and return the first
 * address that holds UTXOs on-chain. Falls back to index 0.
 */
export async function findFundedWcAddress(
  network: 'mainnet' | 'chipnet' = 'mainnet',
  maxIndex = 20,
): Promise<{ address: string; index: number }> {
  // Lazy-import to avoid circular deps
  const { ElectrumNetworkProvider } = await import('cashscript')
  const provider = new ElectrumNetworkProvider(network === 'chipnet' ? 'chipnet' : 'mainnet')

  for (let i = 0; i < maxIndex; i++) {
    const addr = getWcAddress(network, i)
    if (!addr) continue
    try {
      const utxos = await provider.getUtxos(addr)
      const bal = utxos.filter((u: any) => !u.token).reduce((s: bigint, u: any) => s + u.satoshis, 0n)
      if (bal > 0n) return { address: addr, index: i }
    } catch (e) {
      console.warn(`[nomos] scan index ${i} failed:`, e)
    }
  }
  // Fallback to index 0
  return { address: getWcAddress(network, 0), index: 0 }
}

// ── BCH WalletConnect v2 ───────────────────────────────────

let wc2SignClient: any = null
let wc2Session: any = null

export async function connectWc2(): Promise<WalletConnection> {
  const { SignClient } = await import('@walletconnect/sign-client')

  wc2SignClient = await SignClient.init({
    projectId: import.meta.env.VITE_WC_PROJECT_ID || '',
    metadata: {
      name: 'Nomos',
      description: 'On-chain spend mandates for BCH',
      url: window.location.origin,
      icons: [],
    },
  })

  const { uri, approval } = await wc2SignClient.connect({
    requiredNamespaces: {
      bch: {
        methods: ['bch_signTransaction', 'bch_getAddresses'],
        chains: ['bch:bitcoincash'],
        events: ['accountsChanged'],
      },
    },
  })

  // Emit URI so Connect.tsx can render QR code
  if (uri) {
    window.dispatchEvent(new CustomEvent('nomos:wc2:uri', { detail: uri }))
  }

  wc2Session = await approval()

  // Parse address from WC v2 session accounts
  const accounts: string[] = wc2Session.namespaces?.bch?.accounts ?? []
  const rawAccount = accounts[0] ?? ''
  const parts = rawAccount.split(':')
  const address =
    parts.length >= 3 ? `bitcoincash:${parts.slice(2).join(':')}` : rawAccount

  if (!address) throw new Error('WalletConnect: no address received')

  // Fetch pubkey via bch_getAddresses
  let pubkey = ''
  try {
    const addrResult = await wc2SignClient.request({
      topic: wc2Session.topic,
      chainId: 'bch:bitcoincash',
      request: { method: 'bch_getAddresses', params: {} },
    })
    if (Array.isArray(addrResult)) {
      const entry = addrResult.find((a: any) => a.pubkey || a.publicKey)
      pubkey = entry?.pubkey ?? entry?.publicKey ?? ''
    } else if (addrResult?.pubkey) {
      pubkey = addrResult.pubkey
    } else if (addrResult?.publicKey) {
      pubkey = addrResult.publicKey
    }
  } catch {
    console.warn('[nomos] bch_getAddresses not supported by this wallet')
  }

  return { provider: 'wc2', address, pubkey, connected: true }
}

// ── Signing ───────────────────────────────────────────────

/**
 * WizardConnect relays requests with plain JSON.stringify, and wallets decode
 * `transaction` with hexToBin. So the transaction goes as raw hex, byte arrays
 * as plain hex, and bigints in libauth's `<bigint: Xn>` form.
 */
function toRelayValue(value: unknown): unknown {
  if (typeof value === 'bigint') return `<bigint: ${value.toString()}n>`
  if (value instanceof Uint8Array) return libBinToHex(value)
  if (Array.isArray(value)) return value.map(toRelayValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toRelayValue(v)]))
  }
  return value
}

function toWizardRequest(wcTxObj: any): { transaction: string; sourceOutputs: any[]; broadcast?: boolean; userPrompt?: string } {
  const { transaction, sourceOutputs, ...options } = wcTxObj ?? {}
  const txHex = typeof transaction === 'string' ? transaction : libBinToHex(encodeTransaction(transaction))
  return {
    ...(toRelayValue(options) as object),
    transaction: txHex,
    sourceOutputs: (toRelayValue(sourceOutputs ?? []) as any[]),
  }
}

/**
 * Sign a WC transaction object via the active wallet session.
 * Returns { signedTransaction, signedTransactionHash? }
 */
export async function signWcTransaction(
  provider: WalletProviderType,
  wcTxObj: any,
  inputPaths?: [number, string, number][],
  wcIndex: number = 0,
): Promise<{ txid: string; signedTransaction: string }> {
  if (provider === 'wizardconnect') {
    if (!wcManager) throw new Error('No active WizardConnect session')
    const request = toWizardRequest(wcTxObj)
    // WizardConnect (hdwalletv1) identifies keys by path NAME ('receive',
    // 'change', 'defi') plus address index, not by a derivation string. Nomos
    // uses the receive key at the index where we found funds for every input,
    // so sign them all with it unless told otherwise.
    const inputCount: number = request.sourceOutputs.length || 1
    const paths = inputPaths ?? Array.from({ length: inputCount }, (_, i) => [i, 'receive', wcIndex] as [number, string, number])
    const result: any = await wcManager.signTransaction({
      transaction: request as any,
      inputPaths: paths as any,
    })
    // hdwalletv1 wallets return only the signed hex and never broadcast;
    // the caller broadcasts.
    return {
      txid: '',
      signedTransaction: result?.signedTransaction ?? result?.signedTransactionHex ?? '',
    }
  }

  if (provider === 'wc2') {
    if (!wc2SignClient || !wc2Session)
      throw new Error('No active WalletConnect session')
    const result = await wc2SignClient.request({
      topic: wc2Session.topic,
      chainId: 'bch:bitcoincash',
      // WC2 wallets parse libauth's extended JSON (bigint and Uint8Array
      // markers), as in the CashScript WalletConnect guide.
      request: { method: 'bch_signTransaction', params: JSON.parse(stringify(wcTxObj)) },
    })
    return {
      txid: result?.signedTransactionHash ?? '',
      signedTransaction: result?.signedTransaction ?? '',
    }
  }

  throw new Error(`Cannot sign: unknown provider ${provider}`)
}

// ── Disconnect ────────────────────────────────────────────

/** Disconnect WC2 session (WizardConnect disconnect is handled by the hook) */
export async function disconnectWc2(): Promise<void> {
  if (wc2SignClient && wc2Session) {
    try {
      await wc2SignClient.disconnect({
        topic: wc2Session.topic,
        reason: { code: 6000, message: 'User disconnected' },
      })
    } catch { /* best-effort */ }
  }
  wc2SignClient = null
  wc2Session = null
}
