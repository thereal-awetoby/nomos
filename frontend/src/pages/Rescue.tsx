import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { fmtBch } from '../components/ui'
import { executeRescue, validateCashAddress, EXPLORER_TX_URL } from '../lib/contract'

export default function Rescue() {
  const { wallet, vault, vaultConfig, refreshVault, addReceipt } = useWallet()
  const [destination, setDestination] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<{
    type: 'success' | 'error'
    message: string
    txHash?: string
  } | null>(null)

  if (!wallet?.connected) return <Navigate to="/connect" replace />
  if (!vault || !vaultConfig) return <Navigate to="/vault" replace />

  const hasRescuePk = !!vaultConfig.rescuePk

  const handleRescue = async () => {
    if (!confirmed) {
      setResult({ type: 'error', message: 'Confirm that you understand the rescue sweeps the spendable balance (minus fees) and bypasses the daily limit.' })
      return
    }
    const addrErr = validateCashAddress(destination)
    if (addrErr) {
      setResult({ type: 'error', message: `Invalid destination: ${addrErr}` })
      return
    }

    setSubmitting(true)
    try {
      const rescue = await executeRescue(
        vaultConfig, vault.mandate, destination, wallet.provider, wallet.wcIndex ?? 0,
      )
      addReceipt({
        id: rescue.txid,
        kind: 'rescue',
        status: 'submitted',
        amount: rescue.amountSats,
        destination,
        destinationLabel: 'Rescue sweep',
        txHash: rescue.txid,
        mandate: vault.mandate,
        timestamp: Date.now(),
      })
      setResult({
        type: 'success',
        message: 'The wallet/provider returned a transaction ID. Check an explorer for relay, mining, and confirmation.',
        txHash: rescue.txid,
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
    <div className="page-enter space-y-4">
      <h1 className="page-title">Emergency rescue</h1>
      <p className="text-sm text-nomos-muted">
        Moves the whole vault to one address and ignores the daily limit. It cannot be undone.
      </p>

      {!hasRescuePk && (
        <p className="text-sm text-nomos-muted-bright">
          No rescue key is set. <Link to="/mandate" className="underline">Add one in Rules</Link> to use this.
        </p>
      )}

      <div className="card p-4">
        <p className="text-sm text-nomos-muted">Vault balance</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-nomos-text">{fmtBch(vault.balanceSats)} <span className="text-sm font-medium text-nomos-muted">BCH</span></p>
      </div>

      <div>
        <label htmlFor="rescue-destination" className="label mb-2 block">Sweep destination</label>
        <input
          id="rescue-destination"
          type="text"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setConfirmed(false); setResult(null) }}
          placeholder="bitcoincash:q…"
          className="input"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Confirmation gate */}
      <label className="flex cursor-pointer items-start gap-3 text-sm text-nomos-muted-bright">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-nomos-accent"
        />
        I understand this moves everything and skips the daily limit.
      </label>

      <button
        onClick={handleRescue}
        disabled={!destination || submitting || !hasRescuePk || !confirmed}
        className="btn-danger w-full"
      >
        {submitting ? <><span className="spinner mr-2" /> Signing…</> : 'Sign rescue sweep'}
      </button>

      {hasRescuePk && (
        <p className="text-sm text-nomos-muted">
          This works when your rescue key is in this wallet. For a separate co-signer, use the{' '}
          <a href="https://github.com/thereal-awetoby/nomos/blob/main/xo/nomos.template.json" target="_blank" rel="noreferrer" className="underline">
            XO template
          </a>.
        </p>
      )}

      {result && (
        <div className="card p-4">
          <p className={`text-[15px] font-medium ${result.type === 'success' ? 'text-nomos-text' : 'text-nomos-refuse'}`}>
            {result.type === 'success' ? 'Sent' : 'Not sent'}
          </p>
          <p className="mt-1 text-sm text-nomos-muted">{result.message}</p>
          {result.txHash && (
            <div className="mt-3 flex flex-wrap gap-4">
              <a href={`${EXPLORER_TX_URL}${result.txHash}`} target="_blank" rel="noreferrer" className="link-action">View on explorer</a>
              <Link to="/activity" className="link-action">Receipt</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
