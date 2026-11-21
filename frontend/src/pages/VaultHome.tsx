import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { remainingToday } from '../lib/contract'
import { qrColors, THEME_CHANGE_EVENT } from '../lib/theme'
import MandateCard from '../components/MandateCard'
import SpendSparkline from '../components/SpendSparkline'
import { useToast } from '../components/Toast'
import { Panel, shortAddr } from '../components/ui'

export default function VaultHome() {
  const { wallet, vault, vaultConfig, receipts, refreshVault, disconnect } = useWallet()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [depositCopied, setDepositCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showDepositQr, setShowDepositQr] = useState(false)
  const [qrThemeVersion, setQrThemeVersion] = useState(0)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const depositQrRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const onThemeChange = () => setQrThemeVersion((version) => version + 1)
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
  }, [])

  useEffect(() => {
    const address = vault?.address
    if (!showQr || !address || !qrRef.current) return

    const canvas = qrRef.current
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled) return
      return QRCode.toCanvas(canvas, address, {
        width: 200,
        margin: 2,
        color: qrColors(),
      })
    }).catch(() => {
      // Ignore QR rendering failures; the address remains available to copy.
    })

    return () => { cancelled = true }
  }, [showQr, vault?.address, qrThemeVersion])

  // QR for the token-aware deposit address
  useEffect(() => {
    const tokenAddr = vault?.tokenAddress
    if (!showDepositQr || !tokenAddr || !depositQrRef.current) return

    const canvas = depositQrRef.current
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled) return
      return QRCode.toCanvas(canvas, tokenAddr, {
        width: 200,
        margin: 2,
        color: qrColors(),
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [showDepositQr, vault?.tokenAddress, qrThemeVersion])

  if (!wallet?.connected) return <Navigate to="/connect" replace />

  if (!vaultConfig) {
    return (
      <div className="page-enter flex min-h-[50vh] flex-col items-center justify-center text-center">
        <h1 className="page-title">No vault yet</h1>
        <p className="mt-2 max-w-xs truncate font-mono text-xs text-nomos-muted">{shortAddr(wallet.address || '', 10, 6)}</p>
        <Link to="/mandate" className="btn-primary mt-6">
          Create vault
        </Link>
      </div>
    )
  }

  if (!vault) {
    return (
      <div className="page-enter flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="pulse-text text-sm text-nomos-muted">Loading vault…</p>
        {/* Skeleton cards */}
        <div className="mt-6 w-full max-w-lg space-y-4 px-5">
          <div className="skeleton h-36 w-full" />
          <div className="skeleton h-44 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
        <button onClick={refreshVault} className="btn-ghost mt-4">
          Retry
        </button>
      </div>
    )
  }

  if (!vault.deployed) {
    return (
      <div className="page-enter flex min-h-[50vh] flex-col items-center justify-center text-center">
        <h1 className="page-title">Vault not created yet</h1>
        <p className="mt-2 max-w-xs text-sm text-nomos-muted">Create it on-chain to start paying under your rules.</p>
        <Link to="/mandate" className="btn-primary mt-6">
          Create vault
        </Link>
        <button onClick={refreshVault} className="btn-ghost mt-3">
          Refresh
        </button>
      </div>
    )
  }

  const remaining = remainingToday(vault.mandate)
  const spentToday = Math.max(0, vault.mandate.dailyLimitSats - remaining)
  const isLowBalance = vault.balanceSats < 10_000

  const copy = async (text: string, what: string, done: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text)
      done(true)
      setTimeout(() => done(false), 1500)
      toast(`${what} copied`, 'success')
    } catch {
      toast(`Could not copy the ${what.toLowerCase()}`, 'error')
    }
  }

  const addressRow = (label: string, value: string, copied: boolean, onCopy: () => void, qrOpen: boolean, onQr: () => void) => (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-nomos-muted">{label}</p>
        <p className="truncate font-mono text-[13px] text-nomos-text" title={value}>{shortAddr(value, 8, 6)}</p>
      </div>
      <button type="button" onClick={onCopy} className="link-action shrink-0">{copied ? 'Copied' : 'Copy'}</button>
      <button type="button" onClick={onQr} className="link-action shrink-0">{qrOpen ? 'Hide QR' : 'QR'}</button>
    </div>
  )

  return (
    <div className="page-enter space-y-4">
      <h1 className="page-title">Vault</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4">
          <section className="card p-5">
            <p className="text-sm text-nomos-muted">Balance</p>
            <p className="mt-2 font-display text-[2.6rem] font-extrabold leading-none tabular-nums tracking-tight text-nomos-text" style={{ fontStretch: '112%' }}>
              {(vault.balanceSats / 1e8).toFixed(8)} <span className="text-lg font-medium text-nomos-muted">BCH</span>
            </p>
            {isLowBalance && <p className="mt-1 text-sm text-nomos-muted">Under 10,000 sats. Top up with the deposit address.</p>}

            <div className="mt-4 divide-hairline border-t hairline">
              {addressRow('Vault address', vault.address, copied, () => { void copy(vault.address, 'Vault address', setCopied) }, showQr, () => setShowQr((q) => !q))}
              {showQr && <div className="flex justify-center pb-3"><canvas ref={qrRef} className="rounded-lg" /></div>}
              {addressRow('Deposit address (token-aware)', vault.tokenAddress, depositCopied, () => { void copy(vault.tokenAddress, 'Deposit address', setDepositCopied) }, showDepositQr, () => setShowDepositQr((q) => !q))}
              {showDepositQr && <div className="flex justify-center pb-3"><canvas ref={depositQrRef} className="rounded-lg" /></div>}
            </div>
          </section>

          <Link to="/pay" className="btn-primary w-full">Pay</Link>

          <nav aria-label="More" className="card divide-hairline px-4">
            {[
              { to: '/bridge', label: 'Swap PUSD and USDC' },
              { to: '/identity', label: 'Nostr identity' },
              { to: '/proof', label: 'Proof checker' },
              ...(vaultConfig.rescuePk ? [{ to: '/rescue', label: 'Emergency rescue' }] : []),
            ].map((item) => (
              <Link key={item.to} to={item.to} className="block py-3 text-[15px] text-nomos-text hover:text-nomos-muted-bright">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="min-w-0 space-y-4">
          <MandateCard
            mandate={{
              dailyLimitSats: vault.mandate.dailyLimitSats,
              spentSats: spentToday,
              allowlistEnabled: vault.mandate.allowlistEnabled,
              allowlistCount: vault.mandate.allowlist.length,
              agentSet: Boolean(vault.mandate.agentPk),
              rescueSet: Boolean(vault.mandate.rescuePk),
            }}
            title="Rules"
            right={<Link to="/mandate" className="link-action font-normal">Edit</Link>}
            footer={(
              <>
                <SpendSparkline receipts={receipts} dailyLimitSats={vault.mandate.dailyLimitSats} />
              </>
            )}
          />

          {vault.mandate.allowlistEnabled && vault.mandate.allowlist.length > 0 && (
            <Panel title="Allowed addresses">
              <div className="space-y-1.5">
                {vault.mandate.allowlist.map((addr, i) => (
                  <p key={i} className="truncate font-mono text-[13px] text-nomos-muted-bright" title={addr}>{shortAddr(addr, 10, 8)}</p>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-6 pt-2">
        <button type="button" onClick={refreshVault} className="text-sm text-nomos-muted hover:text-nomos-text">Refresh</button>
        <button type="button" onClick={disconnect} className="text-sm text-nomos-muted hover:text-nomos-text">Disconnect</button>
      </div>
    </div>
  )
}
