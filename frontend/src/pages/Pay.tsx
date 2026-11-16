import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { wouldRefuse, remainingToday, executeSpend, validateCashAddress, EXPLORER_TX_URL } from '../lib/contract'

export default function Pay() {
  const { wallet, vault, vaultConfig, addReceipt, refreshVault } = useWallet()
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    type: 'success' | 'refused'
    message: string
    txHash?: string
  } | null>(null)

  if (!wallet?.connected) return <Navigate to="/" replace />
  if (!vault) return <p className="text-center text-nomos-muted">Loading…</p>

  const mandate = vault.mandate
  const remaining = remainingToday(mandate)
  const amountSats = Math.round(parseFloat(amount || '0') * 1e8)

  const handlePay = async () => {
    // Validate destination is a real cashaddr (lenient — any type accepted)
    const addrErr = validateCashAddress(destination)
    if (addrErr) {
      setResult({ type: 'refused', message: `Invalid destination: ${addrErr}` })
      return
    }

    const check = wouldRefuse(mandate, amountSats, destination)
    if (check.refused) {
      const receipt = {
        id: Date.now().toString(),
        status: 'refused' as const,
        amount: amountSats,
        destination,
        reason: check.reason,
        mandate,
        timestamp: Date.now(),
      }
      addReceipt(receipt)
      setResult({ type: 'refused', message: check.reason || 'Refused by Nomos' })
      return
    }

    if (!vaultConfig) {
      setResult({ type: 'refused', message: 'Vault config not set. Go to Set Mandate first.' })
      return
    }

    setSubmitting(true)
    try {
      const receipt = await executeSpend(
        vaultConfig, mandate, amountSats, destination,
        wallet.address, wallet.provider,
      )
      addReceipt(receipt)
      setResult({ type: 'success', message: 'Paid under mandate', txHash: receipt.txHash })
    } catch (err: any) {
      setResult({ type: 'refused', message: err.message || 'Transaction failed' })
    } finally {
      setSubmitting(false)
    }

    // Refresh vault state separately so a refresh failure
    // doesn't overwrite a successful payment result.
    try { await refreshVault() } catch { /* best-effort */ }
  }

  return (
    <div className="space-y-6">
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent">← Vault</Link>
      <h2 className="font-mono text-xl font-bold">Pay</h2>

      <div className="rounded-lg border border-nomos-border bg-nomos-surface p-3 text-center font-mono text-sm">
        <span className="text-nomos-muted">Remaining today: </span>
        <span className="text-nomos-accent">{(remaining / 1e8).toFixed(8)} BCH</span>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">Amount (BCH)</label>
        <input type="number" step="0.00000001" value={amount}
          onChange={(e) => { setAmount(e.target.value); setResult(null) }}
          placeholder="0.0001"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-sm focus:border-nomos-accent focus:outline-none" />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">Destination</label>
        <input type="text" value={destination}
          onChange={(e) => { setDestination(e.target.value); setResult(null) }}
          placeholder="bitcoincash:qr…"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none" />
      </div>

      <button onClick={handlePay} disabled={!amount || !destination || submitting}
        className="w-full rounded-lg bg-nomos-accent py-3 text-center font-semibold text-nomos-bg transition-all hover:brightness-110 disabled:opacity-40">
        {submitting ? 'Signing…' : 'Pay'}
      </button>

      {result && (
        <div className={`rounded-lg border p-4 text-center font-mono ${
          result.type === 'success'
            ? 'border-nomos-accent/40 bg-nomos-accent/10 text-nomos-accent'
            : 'border-nomos-refuse/40 bg-nomos-refuse/10 text-nomos-refuse'
        }`}>
          <p className="text-lg font-bold">
            {result.type === 'success' ? 'Paid under mandate' : 'Refused by Nomos'}
          </p>
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
          {result.txHash && (
            <a href={`${EXPLORER_TX_URL}${result.txHash}`}
              target="_blank" rel="noreferrer"
              className="mt-2 inline-block text-xs underline">
              View on explorer →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
