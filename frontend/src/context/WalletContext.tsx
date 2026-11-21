import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react'
import type { ReactNode } from 'react'
import { useWizardConnect } from '@wizardconnect/react'
import { appIconUrl } from '../lib/env'
import {
  setWcManager,
  getWcPubkeyHex,
  getWcAddress,
  findFundedWcAddress,
} from '../lib/wallet'
import type {
  WalletConnection,
  VaultState,
  VaultConfig,
  Receipt,
  Mandate,
} from '../lib/types'

// ── Context shape ──────────────────────────────────────────
interface WalletCtx {
  wallet: WalletConnection | null
  vault: VaultState | null
  vaultConfig: VaultConfig | null
  receipts: Receipt[]
  connecting: boolean
  error: string | null
  // WizardConnect hook state exposed to pages
  wcState: string
  wcUri: string | null
  wcQrUri: string | null
  wcWalletName: string | null
  /** Start a WizardConnect pairing (returns false if already connecting) */
  startWizardConnect: () => boolean | undefined
  /** Cancel an in-progress WizardConnect pairing (safe to call any time) */
  cancelWizardConnect: () => Promise<void>
  /** Connect via BCH WalletConnect v2 */
  connectWc2: () => Promise<void>
  /** Ask a WalletConnect wallet to sign a message, to learn its public key */
  sharePubkey: () => Promise<void>
  disconnect: () => Promise<void>
  setVaultConfig: (c: VaultConfig) => void
  refreshVault: () => Promise<void>
  addReceipt: (r: Receipt) => void
  /** Patch a stored receipt, for example to attach a node refusal result. */
  updateReceipt: (id: string, patch: Partial<Receipt>) => void
  clearReceipts: () => void
  updateMandate: (m: Mandate) => void
}

const WalletContext = createContext<WalletCtx | null>(null)

export function useWallet(): WalletCtx {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be inside WalletProvider')
  return ctx
}

// ── Storage helpers ────────────────────────────────────────
const RECEIPTS_KEY = 'nomos:receipts'
const WALLET_KEY = 'nomos:wallet'
const CONFIG_KEY = 'nomos:vaultConfig'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, val: unknown) {
  try {
    if (val == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(val))
  } catch { /* noop */ }
}

// ── Provider component ─────────────────────────────────────
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(() => {
    const saved = load<WalletConnection | null>(WALLET_KEY, null)
    // For WizardConnect, don't restore as "connected" until the hook reconnects
    // (the manager isn't ready yet — signing would fail)
    if (saved?.provider === 'wizardconnect') {
      return { ...saved, connected: false }
    }
    // A WalletConnect session is reopened below before it counts as connected.
    if (saved?.provider === 'wc2') {
      return { ...saved, connected: false }
    }
    return saved
  })
  const [vault, setVault] = useState<VaultState | null>(null)
  const [vaultConfig, setVaultConfigState] = useState<VaultConfig | null>(
    () => load(CONFIG_KEY, null),
  )
  const [receipts, setReceipts] = useState<Receipt[]>(
    () => load(RECEIPTS_KEY, []),
  )
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── WizardConnect hook (lives here so it survives page navigation) ──
  const {
    state: wcState,
    manager: wcManager,
    uri: wcUri,
    qrUri: wcQrUri,
    walletName: wcWalletName,
    connect: wcConnect,
    disconnect: wcDisconnect,
    error: wcError,
  } = useWizardConnect({
    dappName: 'Nomos',
    dappIcon: appIconUrl(),
    persistSession: true,
  })

  // Keep wallet.ts module-level manager in sync
  useEffect(() => {
    setWcManager(wcManager ?? null)
  }, [wcManager])

  // When WizardConnect reaches "connected", scan for the funded address
  useEffect(() => {
    if (wcState === 'connected' && wcManager) {
      const network = ((import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet') === 'chipnet' ? 'chipnet' : 'mainnet'
      findFundedWcAddress(network).then(({ address, index }) => {
        const pubkey = getWcPubkeyHex(index)
        if (address) {
          const conn: WalletConnection = {
            provider: 'wizardconnect',
            address,
            pubkey,
            connected: true,
            wcIndex: index,
          }
          setWallet(conn)
          save(WALLET_KEY, conn)
        }
      }).catch((e) => {
        console.error('[nomos] Address scan failed, falling back to index 0:', e)
        const address = getWcAddress(network)
        const pubkey = getWcPubkeyHex(0)
        if (address) {
          const conn: WalletConnection = {
            provider: 'wizardconnect',
            address,
            pubkey,
            connected: true,
            wcIndex: 0,
          }
          setWallet(conn)
          save(WALLET_KEY, conn)
        }
      })
    }
  }, [wcState, wcManager])

  // Reopen a saved WalletConnect session after a reload.
  useEffect(() => {
    const saved = load<WalletConnection | null>(WALLET_KEY, null)
    if (saved?.provider !== 'wc2' || !saved.address) return
    let live = true
    import('../lib/wallet')
      .then(({ restoreWc2Session }) => restoreWc2Session(saved.address))
      .then((ok) => {
        if (!live) return
        if (ok) setWallet({ ...saved, connected: true })
      })
      .catch((e) => console.warn('[nomos] could not reopen the WalletConnect session:', e))
    return () => { live = false }
  }, [])

  // Surface WizardConnect errors
  useEffect(() => {
    if (wcError) setError(wcError)
  }, [wcError])

  /** Start WizardConnect pairing */
  const startWizardConnect = useCallback(() => {
    setError(null)
    return wcConnect()
  }, [wcConnect])

  /** Cancel an in-progress WizardConnect pairing (or tear down relay) */
  const cancelWizardConnect = useCallback(async () => {
    await wcDisconnect()
  }, [wcDisconnect])

  /** Connect via BCH WalletConnect v2 */
  const connectWc2 = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const { connectWc2: doConnect } = await import('../lib/wallet')
      const conn = await doConnect()
      setWallet(conn)
      save(WALLET_KEY, conn)
    } catch (err: any) {
      setError(err.message || 'Connection failed')
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  /** WalletConnect: learn the public key from a signed message. */
  const sharePubkey = useCallback(async () => {
    if (!wallet || wallet.provider !== 'wc2') return
    const { requestWc2Pubkey } = await import('../lib/wallet')
    const pubkey = await requestWc2Pubkey(wallet.address)
    const conn: WalletConnection = { ...wallet, pubkey }
    setWallet(conn)
    save(WALLET_KEY, conn)
  }, [wallet])

  /** Disconnect — handles both providers */
  const disconnect = useCallback(async () => {
    const prev = wallet
    setWallet(null)
    setVault(null)
    save(WALLET_KEY, null)

    if (prev?.provider === 'wc2') {
      const { disconnectWc2 } = await import('../lib/wallet')
      await disconnectWc2()
    } else if (prev?.provider === 'wizardconnect') {
      await wcDisconnect()
      setWcManager(null)
    }
  }, [wallet, wcDisconnect])

  const setVaultConfig = useCallback((c: VaultConfig) => {
    setVaultConfigState(c)
    save(CONFIG_KEY, c)
  }, [])

  const refreshVault = useCallback(async () => {
    if (!vaultConfig) return
    try {
      const { readVaultState } = await import('../lib/contract')
      const state = await readVaultState(vaultConfig)
      setVault(state)
    } catch (err: any) {
      console.warn('[nomos] refresh failed:', err.message)
    }
  }, [vaultConfig])

  const addReceipt = useCallback((r: Receipt) => {
    setReceipts(prev => {
      const next = [r, ...prev].slice(0, 100)
      save(RECEIPTS_KEY, next)
      return next
    })
  }, [])

  const updateReceipt = useCallback((id: string, patch: Partial<Receipt>) => {
    setReceipts(prev => {
      const next = prev.map(receipt => receipt.id === id ? { ...receipt, ...patch } : receipt)
      save(RECEIPTS_KEY, next)
      return next
    })
  }, [])

  const clearReceipts = useCallback(() => {
    setReceipts([])
    save(RECEIPTS_KEY, [])
  }, [])

  const updateMandate = useCallback((m: Mandate) => {
    setVault(prev => (prev ? { ...prev, mandate: m } : prev))
  }, [])

  // Initial load
  useEffect(() => {
    if (wallet && vaultConfig) refreshVault()
  }, [wallet, vaultConfig, refreshVault])

  // Auto-refresh vault balance every 30s when connected and deployed
  useEffect(() => {
    if (!wallet?.connected || !vaultConfig) return
    const id = setInterval(() => {
      refreshVault().catch(() => { /* silent — UI shows last good state */ })
    }, 30_000)
    return () => clearInterval(id)
  }, [wallet?.connected, vaultConfig, refreshVault])

  // Refresh when the tab regains focus so returning users see fresh state.
  useEffect(() => {
    if (!wallet?.connected || !vaultConfig) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshVault().catch(() => { /* silent */ })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [wallet?.connected, vaultConfig, refreshVault])

  return (
    <WalletContext.Provider
      value={{
        wallet, vault, vaultConfig, receipts, connecting, error,
        wcState, wcUri, wcQrUri, wcWalletName,
        startWizardConnect, cancelWizardConnect, connectWc2, sharePubkey, disconnect,
        setVaultConfig, refreshVault, addReceipt, updateReceipt, clearReceipts, updateMandate,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
