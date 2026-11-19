import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { executeRescue, validateCashAddress, EXPLORER_TX_URL } from '../lib/contract'

export default function Rescue() {
  const { wallet, vault, vaultConfig, refreshVault } = useWallet()
  const [destination, setDestination] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<{
    type: 'success' | 'error'
    message: string
    txHash?: string
  } | null>(null)

  if (!wallet?.connected) return <Navigate to="/" replace />
  if (!vault || !vaultConfig) return <Navigate to="/vault" replace />

  const hasRescuePk = !!vaultConfig.rescuePk

  const handleRescue = async () => {
    if (!confirmed) {
      setResult({ type: 'error', message: 'Confirm that you understand this sweeps the entire vault balance and bypasses the daily limit.' })
      return
    }
    const addrErr = validateCashAddress(destination)
    if (addrErr) {
      setResult({ type: 'error', message: `Invalid destination: ${addrErr}` })
      return
    }

    setSubmitting(true)
    try {
      const txid = await executeRescue(
        vaultConfig, vault.mandate, destination, wallet.provider, wallet.wcIndex ?? 0,
      )
      setResult({
        type: 'success',
        message: 'The wallet/provider returned a transaction ID. Check an explorer for relay, mining, and confirmation.',
        txHash: txid,
      })
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Rescue failed' })
    } finally {
      setSubmitting(false)
    }

    // Refresh after updating the result so a read error cannot replace success.
    try { await refreshVault() } catch { /* best-effort */ }
  }

  return (
    <div className="page-enter space-y-5">
      {/* Back nav */}
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent transition-colors duration-200">
        ← Back to vault
      </Link>

      <h2 className="font-mono text-2xl font-bold">Rescue</h2>

      {/* Warning */}
      <div className="card border-nomos-refuse/15 bg-nomos-refuse/[0.04] p-4 text-xs text-nomos-refuse" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
        <strong>Emergency only.</strong> Sweeps the entire vault balance to a destination address. Requires both owner and rescue co-signer. Daily limit is bypassed.
      </div>

      {/* Multi-party note */}
      {hasRescuePk && (
        <div className="card p-4 text-xs text-nomos-muted">
          <strong className="text-nomos-muted-bright">Two signers?</strong> One wallet connection signs with one key, so this button
          only works if your rescue co-signer key is the same wallet key. For a separate co-signer, use the{' '}
          <a
            href="https://github.com/thereal-awetoby/nomos/blob/main/xo/nomos.template.json"
            target="_blank" rel="noreferrer"
            className="text-nomos-accent hover:underline"
          >
            Nomos XO template
          </a>
          's <em>Emergency rescue</em> action: an XO invitation passes the transaction from the owner to the co-signer.
        </div>
      )}

      {!hasRescuePk && (
        <div className="card p-4 text-xs text-nomos-muted">
          No rescue co-signer configured.{' '}
          <Link to="/mandate" className="text-nomos-accent hover:underline">Set Mandate</Link>{' '}
          to enable rescue.
        </div>
      )}

      {/* Balance */}
      <div className="card px-5 py-4 text-center">
        <p className="label">Vault Balance</p>
        <p className="mt-1 mono-value text-2xl font-bold text-nomos-text">
          {(vault.balanceSats / 1e8).toFixed(8)}
          <span className="ml-1 text-sm text-nomos-muted">BCH</span>
        </p>
      </div>

      {/* Destination */}
      <div>
        <label className="label mb-2 block">Sweep Destination</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setConfirmed(false); setResult(null) }}
          placeholder="bitcoincash:qr…"
          className="input text-xs"
        />
      </div>

      {/* Confirmation gate */}
      <label className="flex cursor-pointer items-start gap-3 text-xs text-nomos-muted-bright">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-nomos-refuse"
        />
        I understand this sweeps the entire vault balance and bypasses the daily limit.
      </label>

      <button
        onClick={handleRescue}
        disabled={!destination || submitting || !hasRescuePk || !confirmed}
        className="btn-danger w-full py-3 font-semibold"
      >
        {submitting ? <><span className="spinner mr-2" /> Signing…</> : 'Rescue — Sweep All Funds'}
      </button>

      {/* Result */}
      {result && (
        <div className={`card p-5 text-center ${
          result.type === 'success'
            ? 'border-nomos-accent/20 bg-nomos-accent/5'
            : 'border-nomos-refuse/20 bg-nomos-refuse/5'
        }`} style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          <p className={`mono-value text-lg font-bold ${
            result.type === 'success' ? 'text-nomos-accent' : 'text-nomos-refuse'
          }`}>
            {result.type === 'success' ? 'Submitted · unconfirmed' : 'Rescue failed'}
          </p>
          <p className="mt-1 text-xs text-nomos-muted-bright">{result.message}</p>
          {result.txHash && (
            <a
              href={`${EXPLORER_TX_URL}${result.txHash}`}
              target="_blank" rel="noreferrer"
              className="mt-3 inline-block text-xs text-nomos-accent hover:underline"
            >
              Check explorer · not confirmed →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
