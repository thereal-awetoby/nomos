import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { Panel, fmtBch } from '../components/ui'
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

  if (!wallet?.connected) return <Navigate to="/" replace />
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
      <header>
        <p className="eyebrow">OWNER + RESCUE CO-SIGNER</p>
        <h1 className="page-title">Emergency rescue</h1>
      </header>

      <Panel title="Irreversible operation" tone="refused" bodyClassName="p-3">
        <p className="text-xs leading-relaxed text-nomos-refuse"><strong>Emergency only.</strong> Sweeps the vault's available balance to one destination, burns its state NFT, and bypasses the daily limit. Confirm the destination carefully.</p>
      </Panel>

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

      <Panel title="Vault balance">
        <p className="font-mono text-2xl font-bold tabular-nums text-nomos-text">{fmtBch(vault.balanceSats)} <span className="text-xs font-medium text-nomos-muted">BCH before network fee</span></p>
      </Panel>

      <div>
        <label htmlFor="rescue-destination" className="label mb-2 block">Sweep destination</label>
        <input
          id="rescue-destination"
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
        I understand this moves the spendable balance, less the network fee, and bypasses the daily limit.
      </label>

      <button
        onClick={handleRescue}
        disabled={!destination || submitting || !hasRescuePk || !confirmed}
        className="btn-danger w-full py-3 font-semibold"
      >
        {submitting ? <><span className="spinner mr-2" /> Signing…</> : 'Sign rescue sweep'}
      </button>

      {result && (
        <div className={`card p-4 ${result.type === 'success' ? 'border-nomos-pending/30 bg-nomos-pending/[0.04]' : 'border-nomos-refuse/30 bg-nomos-refuse/[0.04]'}`}>
          <p className={`font-mono text-sm font-bold uppercase tracking-[0.08em] ${result.type === 'success' ? 'text-nomos-pending' : 'text-nomos-refuse'}`}>
            {result.type === 'success' ? 'Submitted · awaiting confirmation' : 'Rescue not submitted'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-nomos-muted-bright">{result.message}</p>
          {result.txHash && (
            <div className="mt-3 flex flex-wrap gap-4">
              <a href={`${EXPLORER_TX_URL}${result.txHash}`} target="_blank" rel="noreferrer" className="link-action text-nomos-pending">Check explorer · unconfirmed</a>
              <Link to="/activity" className="link-action">View saved receipt</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
