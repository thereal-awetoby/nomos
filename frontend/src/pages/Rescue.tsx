import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { executeRescue, validateCashAddress } from '../lib/contract'

export default function Rescue() {
  const { wallet, vault, vaultConfig } = useWallet()
  const [destination, setDestination] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    type: 'success' | 'error'
    message: string
    txHash?: string
  } | null>(null)

  if (!wallet?.connected) return <Navigate to="/" replace />
  if (!vault || !vaultConfig) return <Navigate to="/vault" replace />

  const hasRescuePk = !!vaultConfig.rescuePk

  const handleRescue = async () => {
    const addrErr = validateCashAddress(destination)
    if (addrErr) {
      setResult({ type: 'error', message: `Invalid destination: ${addrErr}` })
      return
    }

    setSubmitting(true)
    try {
      const txid = await executeRescue(
        vaultConfig, vault.mandate, destination, wallet.provider,
      )
      setResult({
        type: 'success',
        message: 'Rescue complete — all funds swept',
        txHash: txid,
      })
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Rescue failed' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-mono text-xl font-bold">Rescue</h2>

      <div className="rounded-lg border border-nomos-refuse/30 bg-nomos-refuse/5 p-3 text-xs text-nomos-refuse">
        <strong>Emergency only.</strong> This sweeps the entire vault balance
        to a destination address. It requires both the owner and rescue
        co-signer to approve. The daily limit is bypassed.
      </div>

      {!hasRescuePk && (
        <div className="rounded-lg border border-nomos-border bg-nomos-surface p-3 text-xs text-nomos-muted">
          No rescue co-signer configured. Set one in{' '}
          <a href="/mandate" className="underline text-nomos-accent">Set Mandate</a>{' '}
          to enable rescue.
        </div>
      )}

      <div className="rounded-lg border border-nomos-border bg-nomos-surface p-4 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-nomos-muted">Vault balance</span>
          <span>{(vault.balanceSats / 1e8).toFixed(8)} BCH</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">
          Sweep destination
        </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setResult(null) }}
          placeholder="bitcoincash:qr…"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none"
        />
      </div>

      <button
        onClick={handleRescue}
        disabled={!destination || submitting || !hasRescuePk}
        className="w-full rounded-lg border border-nomos-refuse bg-nomos-refuse/10 py-3 text-center font-semibold text-nomos-refuse transition-all hover:bg-nomos-refuse/20 disabled:opacity-40"
      >
        {submitting ? 'Signing…' : 'Rescue — Sweep All Funds'}
      </button>

      {result && (
        <div className={`rounded-lg border p-4 text-center font-mono ${
          result.type === 'success'
            ? 'border-nomos-accent/40 bg-nomos-accent/10 text-nomos-accent'
            : 'border-nomos-refuse/40 bg-nomos-refuse/10 text-nomos-refuse'
        }`}>
          <p className="text-lg font-bold">
            {result.type === 'success' ? 'Rescue complete' : 'Rescue failed'}
          </p>
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
          {result.txHash && (
            <a
              href={`https://blockchair.com/bitcoin-cash/transaction/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs underline"
            >
              View on explorer →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
