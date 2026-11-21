import { useState } from 'react'
import type { Receipt } from '../lib/types'
import ReceiptCard from './Receipt'
import { fmtBch, shortAddr } from './ui'

function timeLabel(ts: number): string {
  const d = new Date(ts)
  const sameDay = new Date().toDateString() === d.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** One receipt as a list row; tapping it opens the full receipt. */
export default function ActivityRow({ receipt, expandable = true }: { receipt: Receipt; expandable?: boolean }) {
  const [open, setOpen] = useState(false)
  const kind = receipt.kind ?? 'payment'
  const title = kind === 'mandate'
    ? (receipt.destinationLabel || 'Rules updated')
    : kind === 'rescue'
      ? 'Rescue'
      : receipt.status === 'paid' ? 'Paid' : receipt.status === 'refused' ? 'Refused' : 'Sent'
  const titleColor = kind === 'payment' && receipt.status === 'paid'
    ? 'text-nomos-ok'
    : kind === 'payment' && receipt.status === 'refused' ? 'text-nomos-refuse' : 'text-nomos-text'
  const detail = kind === 'mandate'
    ? `Limit ${fmtBch(receipt.mandate.dailyLimitSats)} BCH`
    : receipt.status === 'refused' && receipt.reason
      ? receipt.reason
      : receipt.destinationLabel || shortAddr(receipt.destination, 6, 5)

  const row = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-medium ${titleColor}`}>{title}</span>
        <span className="block truncate text-sm text-nomos-muted" title={receipt.destination}>{detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[15px] tabular-nums ${receipt.status === 'refused' ? 'text-nomos-muted line-through' : 'text-nomos-text'}`}>
          {fmtBch(receipt.amount)}
        </span>
        <span className="block text-sm tabular-nums text-nomos-muted">{timeLabel(receipt.timestamp)}</span>
      </span>
    </>
  )

  return (
    <div>
      {expandable ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-nomos-surface-raised/50">
          {row}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{row}</div>
      )}
      {expandable && open && (
        <div className="px-4 pb-4">
          <ReceiptCard receipt={receipt} />
        </div>
      )}
    </div>
  )
}
