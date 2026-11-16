import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { WalletConnection, WalletProvider, VaultState, Receipt, Mandate } from '../lib/types'
import { currentDayMarker } from '../lib/contract'

// ── Context shape ──────────────────────────────────────────
interface WalletCtx {
  wallet: WalletConnection | null
  vault: VaultState | null
  receipts: Receipt[]
  connecting: boolean
  error: string | null
  connect: (provider: WalletProvider) => Promise<void>
  disconnect: () => void
  refreshVault: () => Promise<void>
  addReceipt: (r: Receipt) => void
  updateMandate: (m: Mandate) => void
}

const WalletContext = createContext<WalletCtx | null>(null)

// ── Hook ───────────────────────────────────────────────────
export function useWallet(): WalletCtx {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}

// ── Storage helpers ────────────────────────────────────────
const RECEIPTS_KEY = 'nomos:receipts'
const WALLET_KEY = 'nomos:wallet'

function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(RECEIPTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveReceipts(rs: Receipt[]) {
  try {
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify(rs.slice(0, 100)))
  } catch { /* noop */ }
}

function loadWallet(): WalletConnection | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveWallet(w: WalletConnection | null) {
  try {
    if (w) localStorage.setItem(WALLET_KEY, JSON.stringify(w))
    else localStorage.removeItem(WALLET_KEY)
  } catch { /* noop */ }
}

// ── Default vault state (before on-chain read) ─────────────
function defaultVault(address: string): VaultState {
  return {
    address,
    balanceSats: 0,
    mandate: {
      dailyLimitSats: 0,
      spentTodaySats: 0,
      dayMarker: currentDayMarker(),
      allowlistEnabled: false,
      allowlist: [],
      agentPk: null,
      rescuePk: null,
    },
  }
}

// ── Provider ───────────────────────────────────────────────
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(loadWallet)
  const [vault, setVault] = useState<VaultState | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>(loadReceipts)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Connect ──
  const connect = useCallback(async (provider: WalletProvider) => {
    setConnecting(true)
    setError(null)
    try {
      // Dynamic import to avoid loading both SDKs at startup
      const { connectWallet } = await import('../lib/wallet')
      const conn = await connectWallet(provider)
      setWallet(conn)
      saveWallet(conn)
      setVault(defaultVault(conn.address))
    } catch (err: any) {
      setError(err.message || 'Connection failed')
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  // ── Disconnect ──
  const disconnect = useCallback(() => {
    setWallet(null)
    setVault(null)
    saveWallet(null)
  }, [])

  // ── Refresh vault from chain ──
  const refreshVault = useCallback(async () => {
    if (!wallet) return
    try {
      const { readVaultState } = await import('../lib/contract')
      const state = await readVaultState(wallet.address)
      setVault(state)
    } catch (err: any) {
      console.warn('[nomos] refresh failed:', err.message)
    }
  }, [wallet])

  // ── Add receipt ──
  const addReceipt = useCallback((r: Receipt) => {
    setReceipts(prev => {
      const next = [r, ...prev]
      saveReceipts(next)
      return next
    })
  }, [])

  // ── Update mandate in local state ──
  const updateMandate = useCallback((m: Mandate) => {
    setVault(prev => prev ? { ...prev, mandate: m } : prev)
  }, [])

  // Auto-refresh on mount if wallet is restored from storage
  useEffect(() => {
    if (wallet) refreshVault()
  }, [wallet, refreshVault])

  return (
    <WalletContext.Provider
      value={{
        wallet, vault, receipts, connecting, error,
        connect, disconnect, refreshVault, addReceipt, updateMandate,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
