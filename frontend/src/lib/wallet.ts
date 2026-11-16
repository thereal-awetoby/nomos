// ── Wallet connection layer ─────────────────────────────────
// WizardConnect (QR relay) + BCH WalletConnect v2 (for Cashonize, Paytaca, etc.)

import type { WalletConnection, WalletProvider } from './types'

// ── WizardConnect ──────────────────────────────────────────

let wcDappManager: any = null

async function connectWizardConnect(): Promise<WalletConnection> {
  // @wizardconnect/dapp v0.1.x
  const mod = await import('@wizardconnect/dapp')
  const { DappConnectionManager } = mod

  wcDappManager = new DappConnectionManager()

  // The WizardConnectQRDialog in Connect.tsx drives the QR UI.
  // Here we wait for the session to be established.
  const session = await wcDappManager.connect()

  const address: string = session?.address ?? session?.accounts?.[0]?.address ?? ''
  const pubkey: string = session?.pubkey ?? session?.accounts?.[0]?.pubkey ?? ''

  if (!address) throw new Error('WizardConnect: no address received from wallet')

  return {
    provider: 'wizardconnect',
    address,
    pubkey,
    connected: true,
  }
}

// ── BCH WalletConnect v2 ───────────────────────────────────
// Used by Cashonize, Paytaca, and any BCH wallet supporting WC v2.
// This is the path for the "Build with XO" bounty — XO wallet
// connects through the standard WalletConnect v2 protocol.

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

  // Expose the URI so Connect.tsx can render it as a QR code
  if (uri) {
    window.dispatchEvent(new CustomEvent('nomos:wc2:uri', { detail: uri }))
  }

  wc2Session = await approval()

  // Parse address from WC v2 session accounts
  // Format: "bch:bitcoincash:qr..."
  const accounts: string[] = wc2Session.namespaces?.bch?.accounts ?? []
  const rawAccount = accounts[0] ?? ''
  // Strip chain prefix to get the cashaddr
  const parts = rawAccount.split(':')
  const address = parts.length >= 3
    ? `bitcoincash:${parts.slice(2).join(':')}`
    : rawAccount

  if (!address) throw new Error('WalletConnect: no address received')

  return {
    provider: 'wc2',
    address,
    pubkey: '', // WC v2 doesn't expose pubkey directly; will be in signTx response
    connected: true,
  }
}

// ── Public API ─────────────────────────────────────────────

export async function connectWallet(
  provider: WalletProvider,
): Promise<WalletConnection> {
  if (provider === 'wizardconnect') return connectWizardConnect()
  if (provider === 'wc2') return connectWc2()
  throw new Error(`Unknown wallet provider: ${provider}`)
}

/**
 * Sign a BCH WalletConnect transaction object via the active session.
 * Both WizardConnect and WC v2 use the same transaction object shape
 * (from CashScript's generateWcTransactionObject / generateWizardConnectTransactionObject).
 */
export async function signWcTransaction(
  provider: WalletProvider,
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
    if (!wc2SignClient || !wc2Session) throw new Error('No active WalletConnect session')
    const result = await wc2SignClient.request({
      topic: wc2Session.topic,
      chainId: 'bch:bitcoincash',
      request: {
        method: 'bch_signTransaction',
        params: wcTxObj,
      },
    })
    return {
      txid: result?.signedTransactionHash ?? '',
      signedTransaction: result?.signedTransaction ?? '',
    }
  }

  throw new Error(`Cannot sign: unknown provider ${provider}`)
}
