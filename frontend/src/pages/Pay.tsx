import { useState } from 'react'
import { wouldRefuse, remainingToday } from '../lib/contract'
import type { Mandate } from '../lib/types'

// Placeholder — will come from on-chain read
const DEMO_MANDATE: Mandate = {
  dailyLimitSats: 10000,
  spentTodaySats: 0,
  dayMarker: Math.floor(Date.now() / 1000 / 86400),
  allowlistEnabled: false,
  allowlist: [],
  agentPk: null,
  rescuePk: null,
}

export default function Pay() {
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [result, setResult] = useState<{
    type: 'success' | 'refused'
    message: string
    txHash?: string
  } | null>(null)

  const mandate = DEMO_MANDATE
  const remaining = remainingToday(mandate)
  const amountSats = Math.round(parseFloat(amount || '0') * 1e8)

  const handlePay = async () => {
    // Client-side pre-check
    const check = wouldRefuse(mandate, amountSats, destination)

    if (check.refused) {
      setResult({
        type: 'refused',
        message: check.reason || 'Refused by Nomos',
      })
      return
    }

    // TODO: call executeSpend() — will also catch on-chain refusals
    try {
      // const receipt = await executeSpend(mandate, amountSats, destination, ownerPk)
      setResult({
        type: 'success',
        message: 'Paid under mandate',
        // txHash: receipt.txHash,
      })
    } catch (err: any) {
      setResult({
        type: 'refused',
        message: err.message || 'Transaction failed',
      })
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-mono text-xl font-bold">Pay</h2>

      {/* Remaining today */}
      <div className="rounded-lg border border-nomos-border bg-nomos-surface p-3 text-center font-mono text-sm">
        <span className="text-nomos-muted">Remaining today: </span>
        <span className="text-nomos-accent">
          {(remaining / 1e8).toFixed(8)} BCH
        </span>
      </div>

      {/* Amount */}
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">
          Amount (BCH)
        </label>
        <input
          type="number"
          step="0.00000001"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setResult(null)
          }}
          placeholder="0.0001"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-sm focus:border-nomos-accent focus:outline-none"
        />
      </div>

      {/* Destination */}
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">
          Destination
        </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value)
            setResult(null)
          }}
          placeholder="bitcoincash:qr..."
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none"
        />
      </div>

      {/* Pay button */}
      <button
        onClick={handlePay}
        disabled={!amount || !destination}
        className="w-full rounded-lg bg-nomos-accent py-3 text-center font-semibold text-nomos-bg transition-all hover:brightness-110 disabled:opacity-40"
      >
        Pay
      </button>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border p-4 text-center font-mono ${
            result.type === 'success'
              ? 'border-nomos-accent/40 bg-nomos-accent/10 text-nomos-accent'
              : 'border-nomos-refuse/40 bg-nomos-refuse/10 text-nomos-refuse'
          }`}
        >
          <p className="text-lg font-bold">
            {result.type === 'success'
              ? 'Paid under mandate'
              : 'Refused by Nomos'}
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
