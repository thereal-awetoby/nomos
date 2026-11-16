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
  if (!vault) return <p className="py-20 text-center text-sm text-nomos-muted">Loading…</p>

  const mandate = vault.mandate
  const remaining = remainingToday(mandate)
  const amountSats = Math.round(parseFloat(amount || '0') * 1e8)

  const handlePay = async () => {
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
      setResult({ type: 'refused', message: 'Vault config not set.' })
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

    // Refresh vault state separately so a refresh failure doesn't replace the result.
    try { await refreshVault() } catch { /* best-effort */ }
  }

  return (
    <div className="page-enter space-y-5">
      {/* Back nav */}
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent transition-colors duration-200">
        ← Back to vault
      </Link>

      <h2 className="font-mono text-2xl font-bold">Pay</h2>

      {/* Remaining budget */}
      <div className="card px-5 py-4 text-center">
        <p className="label">Remaining Today</p>
        <p className="mt-1 mono-value text-2xl font-bold text-nomos-accent">
          {(remaining / 1e8).toFixed(8)}
          <span className="ml-1 text-sm text-nomos-muted">BCH</span>
        </p>
      </div>

      {/* Amount */}
      <div>
        <label className="label mb-2 block">Amount (BCH)</label>
        <input
          type="number"
          step="0.00000001"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setResult(null) }}
          placeholder="0.0001"
          className="input"
        />
      </div>

      {/* Destination */}
      <div>
        <label className="label mb-2 block">Destination</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setResult(null) }}
          placeholder="bitcoincash:qr…"
          className="input text-xs"
        />
      </div>

      <button
        onClick={handlePay}
        disabled={!amount || !destination || submitting}
        className="btn-primary w-full"
      >
        {submitting ? <><span className="spinner mr-2" /> Signing…</> : 'Pay'}
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
            {result.type === 'success' ? 'Paid under mandate' : 'Refused by Nomos'}
          </p>
          <p className="mt-1 text-xs text-nomos-muted-bright">{result.message}</p>
          {result.txHash && (
            <a
              href={`${EXPLORER_TX_URL}${result.txHash}`}
              target="_blank" rel="noreferrer"
              className="mt-3 inline-block text-xs text-nomos-accent hover:underline"
            >
              View on explorer →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
