import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { remainingToday } from '../lib/contract'

export default function VaultHome() {
  const { wallet, vault, vaultConfig, refreshVault, disconnect } = useWallet()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const qrRef = useRef<HTMLCanvasElement>(null)

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
        color: { dark: '#e8e8f0', light: '#00000000' },
      })
    }).catch(() => {
      // Ignore QR rendering failures; the address remains available to copy.
    })

    return () => { cancelled = true }
  }, [showQr, vault?.address])

  if (!wallet?.connected) return <Navigate to="/" replace />

  if (!vaultConfig) {
    return (
      <div className="page-enter flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="mb-5 text-sm text-nomos-muted">
          No vault yet.
        </p>
        <Link to="/mandate" className="btn-primary">
          Create Vault
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
        <button onClick={refreshVault} className="btn-ghost mt-4 text-xs">
          ↻ Retry
        </button>
      </div>
    )
  }

  if (!vault.deployed) {
    return (
      <div className="page-enter flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="mb-2 text-sm text-nomos-text">Your vault isn't on-chain yet.</p>
        <p className="mb-5 max-w-xs text-xs text-nomos-muted">
          Create it to start paying under your mandate. It takes one or two wallet confirmations.
        </p>
        <Link to="/mandate" className="btn-primary">
          Create Vault
        </Link>
        <button onClick={refreshVault} className="btn-ghost mt-3 text-xs">
          ↻ Refresh
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
    <div className="stagger space-y-5">
      {/* ── Balance hero ── */}
      <div className="card px-5 py-6 text-center">
        <p className="label">Vault Balance</p>
        <p className="mt-2 mono-value text-4xl font-bold text-nomos-text">
          {(vault.balanceSats / 1e8).toFixed(8)}
        </p>
        <p className="mt-1 text-xs text-nomos-muted">BCH</p>

        {/* Address */}
        <button
          onClick={copyAddress}
          className="mx-auto mt-4 block max-w-full truncate font-mono text-[10px] text-nomos-muted hover:text-nomos-accent transition-colors duration-200"
          title="Copy contract address"
        >
          {copied ? '✓ Copied' : vault.address}
        </button>

        {/* QR toggle */}
        <button
          onClick={() => setShowQr(q => !q)}
          className="mt-2 text-[10px] text-nomos-accent/60 hover:text-nomos-accent transition-colors duration-200"
        >
          {showQr ? 'Hide QR' : 'Show QR'}
        </button>
        {showQr && (
          <div className="mt-3 flex justify-center">
            <canvas ref={qrRef} className="rounded-2xl" />
          </div>
        )}
      </div>

      {/* ── Mandate summary ── */}
      <div className="card p-5">
        <p className="label mb-4">Current Mandate</p>
        <div className="space-y-3 mono-value text-sm">
          <div className="flex justify-between">
            <span className="text-nomos-muted">Daily limit</span>
            <span>{(vault.mandate.dailyLimitSats / 1e8).toFixed(8)} BCH</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Spent today</span>
            <span>{(vault.mandate.spentTodaySats / 1e8).toFixed(8)} BCH</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Remaining</span>
            <span className="text-nomos-accent">
              {(remaining / 1e8).toFixed(8)} BCH
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-nomos-muted">Allowlist</span>
            <span className="text-nomos-muted-bright">
              {vault.mandate.allowlistEnabled ? 'On' : 'Off'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-nomos-muted">Agent</span>
            <span className="text-nomos-muted-bright">
              {vault.mandate.agentPk ? 'Set' : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Allowlist ── */}
      {vault.mandate.allowlistEnabled && vault.mandate.allowlist.length > 0 && (
        <div className="card p-5">
          <p className="label mb-3">Allowed Destinations</p>
          <div className="space-y-1.5">
            {vault.mandate.allowlist.map((addr, i) => (
              <p key={i} className="truncate font-mono text-[10px] text-nomos-muted-bright">
                {addr}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Action grid ── */}
      <div className="grid grid-cols-3 gap-3">
        <Link to="/mandate" className="btn-ghost py-3 text-center text-xs">
          Mandate
        </Link>
        <Link to="/pay" className="btn-primary py-3 text-center text-sm">
          Pay
        </Link>
        <Link to="/activity" className="btn-ghost py-3 text-center text-xs">
          Activity
        </Link>
      </div>

      {/* ── Rescue ── */}
      {vaultConfig.rescuePk && (
        <Link to="/rescue" className="btn-danger block w-full py-2.5 text-center text-xs">
          Emergency Rescue
        </Link>
      )}

      {/* ── Bottom controls ── */}
      <div className="flex gap-3">
        <button onClick={refreshVault} className="btn-ghost flex-1 py-2 text-xs">
          ↻ Refresh
        </button>
        <button onClick={disconnect} className="btn-danger flex-1 py-2 text-xs">
          Disconnect
        </button>
      </div>
    </div>
  )
}
