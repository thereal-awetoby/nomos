import type { Receipt as ReceiptType } from '../lib/types'
import { EXPLORER_TX_URL } from '../lib/contract'

export default function ReceiptCard({ receipt }: { receipt: ReceiptType }) {
  const isPaid = receipt.status === 'paid'

  return (
    <div
      className={`rounded-lg border p-4 ${
        isPaid
          ? 'border-nomos-accent/30 bg-nomos-accent/5'
          : 'border-nomos-refuse/30 bg-nomos-refuse/5'
      }`}
    >
      {/* Status badge */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
            isPaid
              ? 'bg-nomos-accent/20 text-nomos-accent'
              : 'bg-nomos-refuse/20 text-nomos-refuse'
          }`}
        >
          {isPaid ? 'Paid under mandate' : 'Refused by Nomos'}
        </span>
        <span className="font-mono text-xs text-nomos-muted">
          {new Date(receipt.timestamp).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric',
          })}{' '}
          {new Date(receipt.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-nomos-muted">Amount</span>
          <span>{(receipt.amount / 1e8).toFixed(8)} BCH</span>
        </div>
        <div className="flex justify-between">
          <span className="text-nomos-muted">To</span>
          <span className="max-w-[180px] truncate">{receipt.destination}</span>
        </div>
        {receipt.reason && (
          <div className="mt-2 text-nomos-refuse text-xs">{receipt.reason}</div>
        )}
      </div>

      {/* Explorer link */}
      {receipt.txHash && (
        <a
          href={`${EXPLORER_TX_URL}${receipt.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-nomos-accent hover:underline"
        >
          View on explorer →
        </a>
      )}
    </div>
  )
}
