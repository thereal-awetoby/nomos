import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { remainingToday } from '../lib/contract'

export default function VaultHome() {
  const { wallet, vault, vaultConfig, refreshVault, disconnect } = useWallet()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const qrRef = useRef<HTMLCanvasElement>(null)

  // Render QR code when toggled on. Keep this hook above early returns so
  // the number and order of hooks never depends on wallet or vault state.
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
        color: { dark: '#e0e0e0', light: '#00000000' },
      })
    }).catch(() => { /* qrcode failed to load */ })

    return () => { cancelled = true }
  }, [showQr, vault?.address])

  if (!wallet?.connected) return <Navigate to="/" replace />

  // No vault config yet — send to Set Mandate
  if (!vaultConfig) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="mb-4 text-nomos-muted">
          No vault configured yet. Set your mandate to get started.
        </p>
        <Link
          to="/mandate"
          className="rounded-lg bg-nomos-accent px-6 py-3 font-semibold text-nomos-bg transition-all hover:brightness-110"
        >
          Set Mandate
        </Link>
      </div>
    )
  }

  // Config exists but vault state hasn't loaded yet
  if (!vault) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="text-nomos-muted">Loading vault…</p>
        <button
          onClick={refreshVault}
          className="mt-4 rounded-lg border border-nomos-border px-4 py-2 text-xs text-nomos-muted hover:border-nomos-accent hover:text-nomos-accent"
        >
          ↻ Retry
        </button>
      </div>
    )
  }

  const remaining = remainingToday(vault.mandate)

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(vault.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard may be blocked */ }
  }

  return (
    <div className="space-y-6">
      {/* Balance + tappable contract address */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-nomos-muted">
          Vault balance
        </p>
        <p className="mt-1 font-mono text-3xl font-bold">
          {(vault.balanceSats / 1e8).toFixed(8)}{' '}
          <span className="text-lg text-nomos-muted">BCH</span>
        </p>
        <button
          onClick={copyAddress}
          className="mt-1 font-mono text-[10px] text-nomos-muted truncate max-w-full hover:text-nomos-accent transition-colors"
          title="Copy contract address"
        >
          {copied ? '✓ Copied!' : vault.address}
        </button>
        <div className="mt-1 flex items-center justify-center gap-2">
          <p className="text-[9px] text-nomos-muted/50">
            Tap address to copy
          </p>
          <button
            onClick={() => setShowQr(q => !q)}
            className="text-[9px] text-nomos-accent/60 hover:text-nomos-accent transition-colors"
          >
            {showQr ? 'Hide QR' : 'Show QR'}
          </button>
        </div>
        {showQr && (
          <div className="mt-3 flex justify-center">
            <canvas ref={qrRef} className="rounded-lg" />
          </div>
        )}
      </div>

      {/* Mandate summary */}
      <div className="rounded-lg border border-nomos-border bg-nomos-surface p-4 font-mono text-sm">
        <p className="mb-3 text-xs uppercase tracking-widest text-nomos-muted">
          Current mandate
        </p>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-nomos-muted">Daily limit</span>
            <span>{(vault.mandate.dailyLimitSats / 1e8).toFixed(8)} BCH</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Spent today</span>
            <span>
              {(vault.mandate.spentTodaySats / 1e8).toFixed(8)} BCH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Remaining</span>
            <span className="text-nomos-accent">
              {(remaining / 1e8).toFixed(8)} BCH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Allowlist</span>
            <span>
              {vault.mandate.allowlistEnabled ? 'On' : 'Off'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Agent</span>
            <span>
              {vault.mandate.agentPk ? 'Set' : 'Not set'}
            </span>
          </div>
        </div>
      </div>

      {/* Allowlist addresses (when enabled) */}
      {vault.mandate.allowlistEnabled && vault.mandate.allowlist.length > 0 && (
        <div className="rounded-lg border border-nomos-border bg-nomos-surface p-4 font-mono text-sm">
          <p className="mb-2 text-xs uppercase tracking-widest text-nomos-muted">
            Allowed destinations
          </p>
          <div className="space-y-1">
            {vault.mandate.allowlist.map((addr, i) => (
              <p key={i} className="truncate text-[10px] text-nomos-muted">
                {addr}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          to="/mandate"
          className="rounded-lg border border-nomos-border bg-nomos-surface py-3 text-center text-sm font-medium transition-all hover:border-nomos-accent"
        >
          Set Mandate
        </Link>
        <Link
          to="/pay"
          className="rounded-lg bg-nomos-accent py-3 text-center text-sm font-semibold text-nomos-bg transition-all hover:brightness-110"
        >
          Pay
        </Link>
        <Link
          to="/activity"
          className="rounded-lg border border-nomos-border bg-nomos-surface py-3 text-center text-sm font-medium transition-all hover:border-nomos-accent"
        >
          Activity
        </Link>
      </div>

      {/* Rescue (only if rescue co-signer is set) */}
      {vaultConfig.rescuePk && (
        <Link
          to="/rescue"
          className="block w-full rounded-lg border border-nomos-refuse/30 bg-nomos-refuse/5 py-2 text-center text-xs text-nomos-refuse/60 transition-all hover:border-nomos-refuse hover:text-nomos-refuse"
        >
          🚨 Emergency Rescue
        </Link>
      )}

      {/* Refresh + Disconnect */}
      <div className="flex gap-3">
        <button
          onClick={refreshVault}
          className="flex-1 rounded-lg border border-nomos-border py-2 text-xs text-nomos-muted hover:border-nomos-accent hover:text-nomos-accent"
        >
          ↻ Refresh
        </button>
        <button
          onClick={disconnect}
          className="flex-1 rounded-lg border border-nomos-refuse/30 py-2 text-xs text-nomos-refuse/60 hover:border-nomos-refuse hover:text-nomos-refuse"
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}
