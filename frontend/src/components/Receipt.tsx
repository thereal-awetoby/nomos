import type { Receipt as ReceiptType } from '../lib/types'
import { EXPLORER_TX_URL } from '../lib/contract'

export default function ReceiptCard({ receipt }: { receipt: ReceiptType }) {
  const isPaid = receipt.status === 'paid'
  const ts = new Date(receipt.timestamp)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`card p-4 ${
      isPaid
        ? 'border-nomos-accent/10 bg-nomos-accent/[0.03]'
        : 'border-nomos-refuse/10 bg-nomos-refuse/[0.03]'
    }`} style={{ borderWidth: '1px', borderStyle: 'solid' }}>
      {/* Header: status + timestamp */}
      <div className="mb-3 flex items-center justify-between">
        <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          isPaid
            ? 'bg-nomos-accent/15 text-nomos-accent'
            : 'bg-nomos-refuse/15 text-nomos-refuse'
        }`}>
          {isPaid ? 'Paid' : 'Refused'}
        </span>
        <span className="font-mono text-[10px] text-nomos-muted">
          {dateStr} · {timeStr}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 mono-value text-sm">
        <div className="flex justify-between">
          <span className="text-nomos-muted">Amount</span>
          <span>{(receipt.amount / 1e8).toFixed(8)} BCH</span>
        </div>
        <div className="flex justify-between">
          <span className="text-nomos-muted">To</span>
          <span className="max-w-[180px] truncate text-xs text-nomos-muted-bright">
            {receipt.destination}
          </span>
        </div>
        {receipt.reason && (
          <p className="mt-2 text-xs text-nomos-refuse/80">{receipt.reason}</p>
        )}
      </div>

      {/* Explorer link */}
      {receipt.txHash && (
        <a
          href={`${EXPLORER_TX_URL}${receipt.txHash}`}
          target="_blank" rel="noreferrer"
          className="mt-3 inline-block text-[11px] text-nomos-accent/70 hover:text-nomos-accent transition-colors duration-200"
        >
          View on explorer →
        </a>
      )}
    </div>
  )
}
