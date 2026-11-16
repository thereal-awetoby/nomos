// ── Wallet connection layer ─────────────────────────────────
// WizardConnect (QR relay) + BCH WalletConnect v2 (Cashonize / Paytaca / XO)

import type { WalletConnection, WalletProviderType } from './types'

// ── WizardConnect ──────────────────────────────────────────
// Real 0.2.x API: initiateDappRelay() + DappConnectionManager + walletready event.
// There is NO .connect() method on DappConnectionManager.

let wcDappManager: any = null
let wcRelay: any = null

async function connectWizardConnect(): Promise<WalletConnection> {
  const { initiateDappRelay } = await import('@wizardconnect/core')
  const { DappConnectionManager } = await import('@wizardconnect/dapp')

  const mgr = new DappConnectionManager(
    'Nomos',
    window.location.origin + '/favicon.ico',
  )
  wcDappManager = mgr

  // Try to restore an existing session first
  const stored = mgr.loadStoredSession()
  if (stored?.walletPublicKey) {
    try {
      const relay = initiateDappRelay(
        (p: any) => mgr.updateConnection(p.client, p.status),
        {
          existingCredentials: {
            privateKey: stored.privateKey,
            secret: stored.secret,
            walletPublicKey: stored.walletPublicKey,
          },
        },
      )
      wcRelay = relay
      mgr.attachRelay(relay)

      // Wait for walletready or timeout
      const address = await waitForWalletReady(mgr, 10_000)
      const pubkey = mgr.getPubkey(0, 0n)?.toString('hex') ?? ''
      return { provider: 'wizardconnect', address, pubkey, connected: true }
    } catch {
      mgr.clearStoredSession()
      // Fall through to fresh pairing
    }
  }

  // Fresh pairing: start relay, show QR, wait for wallet
  return new Promise<WalletConnection>((resolve, reject) => {
    const relay = initiateDappRelay(
      (p: any) => mgr.updateConnection(p.client, p.status),
    )
    wcRelay = relay
    mgr.attachRelay(relay)

    // Emit the URI so Connect.tsx can show a QR code
    if (relay.uri) {
      window.dispatchEvent(
        new CustomEvent('nomos:wc:uri', { detail: relay.uri }),
      )
    }

    const timeout = setTimeout(() => {
      reject(new Error('WizardConnect pairing timed out (60 s)'))
    }, 60_000)

    mgr.on('walletready', (msg: any) => {
      clearTimeout(timeout)
      const pubkey = mgr.getPubkey(0, 0n)?.toString('hex') ?? ''
      // Derive receive address from the pubkey
      // The wallet name arrives in msg.wallet_name
      const address = deriveAddressFromPubkey(pubkey)
      resolve({ provider: 'wizardconnect', address, pubkey, connected: true })
    })

    mgr.on('disconnect', (_reason: any, message?: string) => {
      clearTimeout(timeout)
      reject(new Error(`WizardConnect disconnected: ${message ?? 'unknown'}`))
    })
  })
}

/** Wait for walletready event with a timeout. */
function waitForWalletReady(mgr: any, ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Reconnect timeout')), ms)
    mgr.on('walletready', (msg: any) => {
      clearTimeout(timer)
      resolve(msg?.address ?? '')
    })
  })
}

/** Derive a cashaddr from a compressed pubkey hex. */
function deriveAddressFromPubkey(pubkeyHex: string): string {
  // Basic derivation — in production use libauth's pubkey-to-address
  // For now return empty; the vault contract uses the pubkey directly
  if (!pubkeyHex) return ''
  try {
    // Attempt libauth derivation if available
    return ''
  } catch {
    return ''
  }
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

// ── Public API ─────────────────────────────────────────────

export async function connectWallet(
  provider: WalletProviderType,
): Promise<WalletConnection> {
  if (provider === 'wizardconnect') return connectWizardConnect()
  if (provider === 'wc2') return connectWc2()
  throw new Error(`Unknown wallet provider: ${provider}`)
}

export async function disconnectWallet(
  provider: WalletProviderType,
): Promise<void> {
  if (provider === 'wizardconnect' && wcDappManager) {
    wcDappManager.clearStoredSession()
    try { await wcDappManager.sendDisconnect('user disconnected') } catch {}
    if (wcRelay) { wcRelay.cleanup(); wcRelay = null }
    wcDappManager = null
  }
  if (provider === 'wc2' && wc2SignClient && wc2Session) {
    try {
      await wc2SignClient.disconnect({
        topic: wc2Session.topic,
        reason: { code: 6000, message: 'User disconnected' },
      })
    } catch {}
    wc2Session = null
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
): Promise<{ txid: string; signedTransaction: string }> {
  if (provider === 'wizardconnect') {
    if (!wcDappManager) throw new Error('No active WizardConnect session')
    // WizardConnect signTransaction takes { transaction, inputPaths }
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
