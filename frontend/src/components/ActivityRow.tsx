import { useState } from 'react'
import type { Receipt } from '../lib/types'
import ReceiptCard from './Receipt'
import { EXPLORER_TX_URL } from '../lib/contract'
import { Chip, fmtBch, shortAddr } from './ui'

function timeLabel(ts: number): string {
  const d = new Date(ts)
  const sameDay = new Date().toDateString() === d.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** One receipt as a dense table row; optionally expands into the full receipt. */
export default function ActivityRow({ receipt, expandable = true }: { receipt: Receipt; expandable?: boolean }) {
  const [open, setOpen] = useState(false)
  const kind = receipt.kind ?? 'payment'
  const amountColor = receipt.status === 'refused' ? 'text-nomos-refuse line-through decoration-1' : 'text-nomos-text'
  const counterparty = kind === 'mandate'
    ? `${receipt.destinationLabel || 'Mandate'} · limit ${fmtBch(receipt.mandate.dailyLimitSats)} BCH`
    : kind === 'rescue'
      ? `Sweep to ${shortAddr(receipt.destination, 6, 5)}`
      : receipt.destinationLabel || shortAddr(receipt.destination, 6, 5)

  return (
    <div className={open ? 'bg-nomos-surface-raised/40' : ''}>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5">
        {kind === 'payment' ? <Chip kind={receipt.status} /> : <Chip kind={kind} />}
        <span className={`truncate font-mono text-xs tabular-nums ${amountColor}`}>
          {fmtBch(receipt.amount)} <span className="text-[10px] text-nomos-muted">BCH</span>
        </span>
        <span className="text-right font-mono text-[10px] tabular-nums text-nomos-muted">{timeLabel(receipt.timestamp)}</span>

        <span className="col-span-2 truncate font-mono text-[10px] text-nomos-muted-bright" title={receipt.destination}>
          {receipt.status === 'refused' && receipt.reason ? <span className="text-nomos-refuse">{receipt.reason} · </span> : null}
          {counterparty}
        </span>
        <span className="flex items-center justify-end gap-3 font-mono text-[10px]">
          {receipt.txHash
            ? <a href={`${EXPLORER_TX_URL}${receipt.txHash}`} target="_blank" rel="noreferrer" className="text-nomos-accent hover:underline" title={receipt.txHash}>tx {receipt.txHash.slice(0, 8)}</a>
            : <span className="text-nomos-muted/70">{receipt.onChainRefusal ? 'node checked' : 'no tx'}</span>}
          {expandable && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="link-action"
            >
              {open ? 'Hide' : 'Open'}
            </button>
          )}
        </span>
      </div>
      {expandable && open && (
        <div className="px-3 pb-3">
          <ReceiptCard receipt={receipt} />
        </div>
      )}
    </div>
  )
}
