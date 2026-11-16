// ── Wallet connection layer ─────────────────────────────────
// WizardConnect (QR relay) + BCH WalletConnect v2 (Cashonize / Paytaca / XO)

import type { WalletConnection, WalletProviderType } from './types'

// ── WizardConnect ──────────────────────────────────────────

let wcDappManager: any = null

async function connectWizardConnect(): Promise<WalletConnection> {
  const { DappConnectionManager } = await import('@wizardconnect/dapp')

  // DappConnectionManager(name, iconUrl) per v0.2.x API
  wcDappManager = new DappConnectionManager(
    'Nomos',
    window.location.origin + '/favicon.ico',
  )

  const session = await wcDappManager.connect()

  const address: string =
    session?.address ?? session?.accounts?.[0]?.address ?? ''
  const pubkey: string =
    session?.pubkey ?? session?.accounts?.[0]?.pubkey ?? ''

  if (!address) throw new Error('WizardConnect: no address received')

  return { provider: 'wizardconnect', address, pubkey, connected: true }
}

// ── BCH WalletConnect v2 ───────────────────────────────────

let wc2SignClient: any = null
let wc2Session: any = null

async function connectWc2(): Promise<WalletConnection> {
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

  if (uri) {
    window.dispatchEvent(new CustomEvent('nomos:wc2:uri', { detail: uri }))
  }

  wc2Session = await approval()

  const accounts: string[] = wc2Session.namespaces?.bch?.accounts ?? []
  const rawAccount = accounts[0] ?? ''
  const parts = rawAccount.split(':')
  const address =
    parts.length >= 3 ? `bitcoincash:${parts.slice(2).join(':')}` : rawAccount

  if (!address) throw new Error('WalletConnect: no address received')

  return { provider: 'wc2', address, pubkey: '', connected: true }
}

// ── Public API ─────────────────────────────────────────────

export async function connectWallet(
  provider: WalletProviderType,
): Promise<WalletConnection> {
  if (provider === 'wizardconnect') return connectWizardConnect()
  if (provider === 'wc2') return connectWc2()
  throw new Error(`Unknown wallet provider: ${provider}`)
}

/**
 * Sign a WC transaction object via the active wallet session.
 * Works for both WizardConnect and BCH WalletConnect v2.
 */
export async function signWcTransaction(
  provider: WalletProviderType,
  wcTxObj: any,
  inputPaths?: [number, string, number][],
): Promise<{ txid: string; signedTransaction: string }> {
  if (provider === 'wizardconnect') {
    if (!wcDappManager) throw new Error('No active WizardConnect session')
    const result = await wcDappManager.signTransaction({
      transaction: wcTxObj,
      inputPaths: inputPaths ?? [],
    })
    return {
      txid: result?.signedTransactionHash ?? '',
      signedTransaction: result?.signedTransaction ?? '',
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
