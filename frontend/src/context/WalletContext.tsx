import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react'
import type { ReactNode } from 'react'
import type {
  WalletConnection,
  WalletProviderType,
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
  /** Connect a WC2 wallet (WizardConnect is handled by the hook in Connect.tsx) */
  connectWc2: () => Promise<void>
  /** Set wallet directly (used by WizardConnect hook flow) */
  setWalletDirect: (conn: WalletConnection | null) => void
  disconnect: () => void
  setVaultConfig: (c: VaultConfig) => void
  refreshVault: () => Promise<void>
  addReceipt: (r: Receipt) => void
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
  const [wallet, setWallet] = useState<WalletConnection | null>(
    () => load(WALLET_KEY, null),
  )
  const [vault, setVault] = useState<VaultState | null>(null)
  const [vaultConfig, setVaultConfigState] = useState<VaultConfig | null>(
    () => load(CONFIG_KEY, null),
  )
  const [receipts, setReceipts] = useState<Receipt[]>(
    () => load(RECEIPTS_KEY, []),
  )
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  /** Set wallet directly — used by WizardConnect hook flow in Connect.tsx */
  const setWalletDirect = useCallback((conn: WalletConnection | null) => {
    setWallet(conn)
    save(WALLET_KEY, conn)
    if (!conn) setError(null)
  }, [])

  const disconnect = useCallback(async () => {
    const prev = wallet
    setWallet(null)
    setVault(null)
    save(WALLET_KEY, null)
    // Clean up WC2 session if that was the provider
    if (prev?.provider === 'wc2') {
      const { disconnectWc2 } = await import('../lib/wallet')
      await disconnectWc2()
    }
    // WizardConnect disconnect is handled by the hook's disconnect() in Connect.tsx
  }, [wallet])

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

  const updateMandate = useCallback((m: Mandate) => {
    setVault(prev => (prev ? { ...prev, mandate: m } : prev))
  }, [])

  useEffect(() => {
    if (wallet && vaultConfig) refreshVault()
  }, [wallet, vaultConfig, refreshVault])

  return (
    <WalletContext.Provider
      value={{
        wallet, vault, vaultConfig, receipts, connecting, error,
        connectWc2, setWalletDirect, disconnect, setVaultConfig,
        refreshVault, addReceipt, updateMandate,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
