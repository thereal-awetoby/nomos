import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import type { ReactNode } from 'react'
import { useWizardConnect } from '@wizardconnect/react'
import { appIconUrl } from '../lib/env'
import {
  setWcManager,
  getWcPubkeyHex,
  getWcAddress,
  findFundedWcAddress,
  addressMatchesPubkey,
} from '../lib/wallet'
import type {
  WalletConnection,
  VaultState,
  VaultConfig,
  Receipt,
  Mandate,
} from '../lib/types'
import { BCH_NETWORK, networkKey } from '../lib/network'

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
  /** Forget the vault in this browser, after it has been closed on chain. */
  clearVaultConfig: () => void
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
// Each network keeps its own wallet, vault and history (mainnet keeps the original keys).
const RECEIPTS_KEY = networkKey('nomos:receipts')
const WALLET_KEY = networkKey('nomos:wallet')
// Earlier versions kept one vault for the whole browser under CONFIG_KEY. It is
// read once into the per-wallet list and left in place as a backup.
const CONFIG_KEY = networkKey('nomos:vaultConfig')
const CONFIGS_KEY = networkKey('nomos:vaultConfigs')

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

/** Saved vaults, newest first, one per owner key. */
function loadConfigs(): VaultConfig[] {
  const list = load<VaultConfig[] | null>(CONFIGS_KEY, null)
  if (Array.isArray(list)) return list
  const legacy = load<VaultConfig | null>(CONFIG_KEY, null)
  const migrated = legacy ? [legacy] : []
  save(CONFIGS_KEY, migrated)
  return migrated
}

/** The vault this address owns, else one it is the agent key of. */
function configForAddress(address: string | undefined): VaultConfig | null {
  if (!address) return null
  const list = loadConfigs()
  return list.find((c) => addressMatchesPubkey(address, c.ownerPk))
    ?? list.find((c) => Boolean(c.agentPk) && addressMatchesPubkey(address, c.agentPk))
    ?? null
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
    () => configForAddress(wallet?.address),
  )
  // Each wallet sees its own vault, so a second wallet can create one too.
  const configAddress = useRef(wallet?.address ?? '')
  useEffect(() => {
    const address = wallet?.address ?? ''
    if (address === configAddress.current) return
    configAddress.current = address
    setVaultConfigState(configForAddress(address))
    setVault(null)
  }, [wallet?.address])
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
      const network = BCH_NETWORK
      const saved = loadConfigs()
      // Prefer the address whose key owns (or is the agent of) a vault saved here.
      const vaultIndex = saved.length === 0 ? -1 : Array.from({ length: 20 }, (_, i) => i).find((i) => {
        try {
          const pk = getWcPubkeyHex(i)
          return Boolean(pk) && saved.some((c) => c.ownerPk === pk || c.agentPk === pk)
        } catch {
          return false
        }
      }) ?? -1
      const pick = vaultIndex >= 0
        ? Promise.resolve({ address: getWcAddress(network, vaultIndex), index: vaultIndex })
        : findFundedWcAddress(network)
      pick.then(({ address, index }) => {
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
    save(CONFIGS_KEY, [c, ...loadConfigs().filter((x) => x.ownerPk !== c.ownerPk)])
    setVaultConfigState(c)
  }, [])

  const clearVaultConfig = useCallback(() => {
    if (vaultConfig) save(CONFIGS_KEY, loadConfigs().filter((x) => x.ownerPk !== vaultConfig.ownerPk))
    setVaultConfigState(null)
    setVault(null)
  }, [vaultConfig])

  // A slow read for a vault the wallet has moved away from must not land.
  const currentConfig = useRef(vaultConfig)
  currentConfig.current = vaultConfig
  const refreshVault = useCallback(async () => {
    if (!vaultConfig) return
    try {
      const { readVaultState } = await import('../lib/contract')
      const state = await readVaultState(vaultConfig)
      if (currentConfig.current !== vaultConfig) return
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

  // A transaction shows as unconfirmed until it is mined. Check the ones still
  // waiting against the chain now, then every minute while any remain.
  useEffect(() => {
    const waiting = receipts.filter((r) => r.status === 'submitted' && r.txHash)
    if (waiting.length === 0) return undefined
    let live = true
    const check = async () => {
      try {
        const { txConfirmations } = await import('../lib/contract')
        const confirmations = await txConfirmations(waiting.map((r) => r.txHash!))
        if (!live) return
        for (const r of waiting) {
          if ((confirmations[r.txHash!] ?? 0) >= 1) updateReceipt(r.id, { status: 'paid' })
        }
      } catch (err) {
        console.warn('[nomos] could not check confirmations:', err)
      }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 60_000)
    return () => { live = false; window.clearInterval(timer) }
  }, [receipts, updateReceipt])

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
        setVaultConfig, clearVaultConfig, refreshVault, addReceipt, updateReceipt, clearReceipts, updateMandate,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
