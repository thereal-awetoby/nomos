import { useRef, useState } from 'react'
import type { Receipt as ReceiptType } from '../lib/types'
import { EXPLORER_TX_URL } from '../lib/contract'

export default function ReceiptCard({ receipt }: { receipt: ReceiptType }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const isPaid = receipt.status === 'paid'
  const ts = new Date(receipt.timestamp)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const downloadImage = async () => {
    if (!cardRef.current || isExporting) return
    setIsExporting(true)
    setExportError(null)

    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(cardRef.current, {
        scale: Math.min(window.devicePixelRatio || 2, 3),
        backgroundColor: document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#0f0f1a',
        ignoreElements: (element) => element.classList.contains('receipt-actions'),
      })
      const link = document.createElement('a')
      const safeId = receipt.id.replace(/[^a-z0-9_-]/gi, '-')
      link.download = `nomos-receipt-${safeId}.png`
      link.href = canvas.toDataURL('image/png')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      setExportError('Could not create the image. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div ref={cardRef} className={`card p-4 ${
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
          <span className="max-w-[180px] truncate text-right text-xs text-nomos-muted-bright" title={receipt.destination}>
            {receipt.destinationLabel
              ? <><span className="text-nomos-accent">{receipt.destinationLabel}</span><br /><span className="text-[10px] text-nomos-muted">{receipt.destination}</span></>
              : receipt.destination}
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

      <div className="receipt-actions mt-4 border-t border-nomos-border/10 pt-3">
        <button
          type="button"
          onClick={downloadImage}
          disabled={isExporting}
          className="text-xs text-nomos-muted-bright transition-colors hover:text-nomos-accent disabled:opacity-50"
        >
          {isExporting ? 'Preparing image…' : '↓ Download receipt image'}
        </button>
        {exportError && <p className="mt-2 text-[10px] text-nomos-refuse" role="alert">{exportError}</p>}
      </div>
    </div>
  )
}
