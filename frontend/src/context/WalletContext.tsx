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
  WalletProvider,
  VaultState,
  VaultConfig,
  Receipt,
  Mandate,
} from '../lib/types'
import { currentDayMarker } from '../lib/contract'

// ── Context shape ──────────────────────────────────────────
interface WalletCtx {
  wallet: WalletConnection | null
  vault: VaultState | null
  vaultConfig: VaultConfig | null
  receipts: Receipt[]
  connecting: boolean
  error: string | null
  connect: (provider: WalletProvider) => Promise<void>
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

// ── Storage ────────────────────────────────────────────────
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

// ── Provider ───────────────────────────────────────────────
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(() => load(WALLET_KEY, null))
  const [vault, setVault] = useState<VaultState | null>(null)
  const [vaultConfig, setVaultConfigState] = useState<VaultConfig | null>(() => load(CONFIG_KEY, null))
  const [receipts, setReceipts] = useState<Receipt[]>(() => load(RECEIPTS_KEY, []))
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (provider: WalletProvider) => {
    setConnecting(true)
    setError(null)
    try {
      const { connectWallet } = await import('../lib/wallet')
      const conn = await connectWallet(provider)
      setWallet(conn)
      save(WALLET_KEY, conn)
    } catch (err: any) {
      setError(err.message || 'Connection failed')
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setWallet(null)
    setVault(null)
    save(WALLET_KEY, null)
  }, [])

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
    setVault(prev => prev ? { ...prev, mandate: m } : prev)
  }, [])

  // Auto-refresh when config is available
  useEffect(() => {
    if (wallet && vaultConfig) refreshVault()
  }, [wallet, vaultConfig, refreshVault])

  return (
    <WalletContext.Provider
      value={{
        wallet, vault, vaultConfig, receipts, connecting, error,
        connect, disconnect, setVaultConfig, refreshVault,
        addReceipt, updateMandate,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
