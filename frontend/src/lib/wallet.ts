// ── Wallet connection + signing layer ───────────────────────
// WizardConnect (QR relay via useWizardConnect hook in React)
// + BCH WalletConnect v2 (Cashonize / Paytaca / XO)

import type { WalletConnection, WalletProviderType } from './types'
import { binToHex } from '@wizardconnect/core'
import type { DappConnectionManager } from '@wizardconnect/dapp'
import {
  hash160,
  encodeCashAddress,
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

/** Get the hex pubkey from WizardConnect manager (child 0, index 0) */
export function getWcPubkeyHex(): string {
  if (!wcManager) return ''
  const raw = wcManager.getPubkey(0, 0n)
  if (!raw) return ''
  return binToHex(raw)
}

/** Get the BCH address from WizardConnect pubkey */
export function getWcAddress(
  network: 'mainnet' | 'chipnet' = 'mainnet',
): string {
  if (!wcManager) return ''
  const raw = wcManager.getPubkey(0, 0n)
  if (!raw) return ''
  return pubkeyToAddress(raw, network === 'mainnet' ? 'bitcoincash' : 'bchtest')
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
 * Sign a WC transaction object via the active wallet session.
 * Returns { signedTransaction, signedTransactionHash? }
 */
export async function signWcTransaction(
  provider: WalletProviderType,
  wcTxObj: any,
  inputPaths?: [number, string, number][],
): Promise<{ txid: string; signedTransaction: string }> {
  if (provider === 'wizardconnect') {
    if (!wcManager) throw new Error('No active WizardConnect session')
    const result = await wcManager.signTransaction({
      transaction: wcTxObj,
      inputPaths: inputPaths ?? [[0, 'm/44\'/145\'/0\'', 0]],
    })
    // SignTransactionResponse has signedTransaction (hex) — txid is empty
    // because the wallet doesn't broadcast; we broadcast ourselves as fallback
    return {
      txid: (result as any).signedTransactionHash ?? '',
      signedTransaction: result.signedTransaction ?? '',
    }
  }

  if (provider === 'wc2') {
    if (!wc2SignClient || !wc2Session)
      throw new Error('No active WalletConnect session')
    const result = await wc2SignClient.request({
      topic: wc2Session.topic,
      chainId: 'bch:bitcoincash',
      request: { method: 'bch_signTransaction', params: wcTxObj },
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
