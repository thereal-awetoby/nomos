import { useEffect, useRef, useState } from 'react'
import type { Receipt as ReceiptType } from '../lib/types'
import { EXPLORER_TX_URL } from '../lib/contract'

function receiptToText(receipt: ReceiptType, dateStr: string, timeStr: string): string {
  const statusLabel = receipt.status === 'paid'
    ? 'PAID'
    : receipt.status === 'submitted'
      ? 'SUBMITTED — UNCONFIRMED'
      : 'REFUSED'
  return [
    `NOMOS RECEIPT — ${statusLabel}`,
    `Date: ${dateStr} ${timeStr}`,
    `Amount: ${(receipt.amount / 1e8).toFixed(8)} BCH`,
    `To: ${receipt.destinationLabel ? `${receipt.destinationLabel} ` : ''}${receipt.destination}`,
    receipt.reason ? `Reason: ${receipt.reason}` : '',
    receipt.txHash ? `TX: ${EXPLORER_TX_URL}${receipt.txHash}` : '',
    receipt.onChainRefusal ? `Node response: ${receipt.onChainRefusal.rejectionKind} — ${receipt.onChainRefusal.nodeError}` : '',
    receipt.onChainRefusal ? `Node checked: ${receipt.onChainRefusal.network} at ${new Date(receipt.onChainRefusal.checkedAt).toISOString()} (not mined/confirmed)` : '',
    receipt.onChainRefusal ? `Raw signed transaction is rebroadcastable; txid ${receipt.onChainRefusal.txid}` : '',
    '— nomos.asgaya.org',
  ].filter(Boolean).join('\n')
}

export default function ReceiptCard({ receipt }: { receipt: ReceiptType }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [proofCopied, setProofCopied] = useState(false)
  const [textActionError, setTextActionError] = useState<string | null>(null)
  const copiedTimerRef = useRef<number | null>(null)
  const isPaid = receipt.status === 'paid'
  const isRefused = receipt.status === 'refused'
  const statusLabel = isPaid ? 'Paid' : isRefused ? 'Refused' : 'Submitted · unconfirmed'
  const ts = new Date(receipt.timestamp)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const receiptText = receiptToText(receipt, dateStr, timeStr)

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

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
      try {
        await navigator.clipboard.writeText(receiptText)
        setExportError('Image unavailable; receipt details copied to clipboard.')
      } catch {
        setExportError('Could not create the image or copy receipt details.')
      }
    } finally {
      setIsExporting(false)
    }
  }

  const copyReceiptText = async () => {
    setTextActionError(null)
    setCopied(false)
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
    try {
      await navigator.clipboard.writeText(receiptText)
      setCopied(true)
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copiedTimerRef.current = null
      }, 1500)
    } catch {
      setTextActionError('Could not copy receipt details. Check clipboard permissions.')
    }
  }

  const copyNodeCheck = async () => {
    setTextActionError(null)
    setProofCopied(false)
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt.onChainRefusal, null, 2))
      setProofCopied(true)
      copiedTimerRef.current = window.setTimeout(() => {
        setProofCopied(false)
        copiedTimerRef.current = null
      }, 1500)
    } catch {
      setTextActionError('Could not copy node check JSON. Check clipboard permissions.')
    }
  }

  const shareReceipt = async () => {
    setTextActionError(null)
    try {
      await navigator.share({
        title: `Nomos receipt — ${statusLabel}`,
        text: receiptText,
      })
    } catch {
      // The user may dismiss the native share sheet; no action is needed then.
    }
  }

  return (
    <div ref={cardRef} className={`card p-4 ${
      isPaid
        ? 'border-nomos-accent/10 bg-nomos-accent/[0.03]'
        : isRefused
          ? 'border-nomos-refuse/10 bg-nomos-refuse/[0.03]'
          : 'border-amber-400/10 bg-amber-400/[0.03]'
    }`} style={{ borderWidth: '1px', borderStyle: 'solid' }}>
      <div className="mb-3 flex items-center justify-between">
        <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          isPaid
            ? 'bg-nomos-accent/15 text-nomos-accent'
            : isRefused
              ? 'bg-nomos-refuse/15 text-nomos-refuse'
              : 'bg-amber-400/15 text-amber-400'
        }`}>
          {statusLabel}
        </span>
        <span className="font-mono text-[10px] text-nomos-muted">
          {dateStr} · {timeStr}
        </span>
      </div>

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

      {receipt.onChainRefusal && (
        <section className="mt-3 rounded-xl border border-nomos-border/10 bg-nomos-surface-raised/30 p-3" aria-label="Node check details">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${receipt.onChainRefusal.scriptFailure ? 'text-nomos-accent' : 'text-nomos-muted-bright'}`}>
              {receipt.onChainRefusal.rejectionKind === 'script-failure'
                ? 'Node-reported script failure'
                : receipt.onChainRefusal.rejectionKind === 'missing-inputs'
                  ? 'Node: missing or spent inputs'
                  : 'Other node rejection'}
            </p>
            <button
              type="button"
              onClick={() => { void copyNodeCheck() }}
              className="text-[9px] font-semibold text-nomos-accent"
            >{proofCopied ? 'Copied' : 'Copy node JSON'}</button>
          </div>
          <p className="mt-1 break-all font-mono text-[9px] text-nomos-muted">TXID {receipt.onChainRefusal.txid}</p>
          <p className="mt-1 break-words text-[10px] leading-relaxed text-nomos-muted">{receipt.onChainRefusal.nodeError}</p>
          <p className="mt-1 text-[9px] text-nomos-muted/70">{receipt.onChainRefusal.network} · {new Date(receipt.onChainRefusal.checkedAt).toLocaleString()} · not mined/confirmed</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[9px] font-semibold text-nomos-accent">Show signed transaction hex</summary>
            <p className="mt-2 break-all font-mono text-[9px] leading-relaxed text-nomos-muted">{receipt.onChainRefusal.rawTx}</p>
          </details>
          <p className="mt-2 text-[9px] leading-relaxed text-nomos-muted/70">This response is not confirmation of chain state. Anyone with the signed hex can try to rebroadcast it. A script failure does not by itself identify which script failed.</p>
        </section>
      )}

      {receipt.txHash && (
        <a
          href={`${EXPLORER_TX_URL}${receipt.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[11px] text-nomos-accent/70 transition-colors hover:text-nomos-accent"
        >
          {receipt.status === 'submitted' ? 'Check explorer · not confirmed →' : 'View on explorer →'}
        </a>
      )}

      <div className="receipt-actions mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-nomos-border/10 pt-3">
        <button
          type="button"
          onClick={downloadImage}
          disabled={isExporting}
          className="text-xs text-nomos-muted-bright transition-colors hover:text-nomos-accent disabled:opacity-50"
        >
          {isExporting ? 'Preparing…' : '↓ Image'}
        </button>
        <button
          type="button"
          onClick={copyReceiptText}
          className="text-xs text-nomos-muted-bright transition-colors hover:text-nomos-accent"
        >
          {copied ? '✓ Copied' : '⎘ Copy text'}
        </button>
        {typeof navigator.share === 'function' && (
          <button
            type="button"
            onClick={() => { void shareReceipt() }}
            className="text-xs text-nomos-muted-bright transition-colors hover:text-nomos-accent"
          >
            ↗ Share
          </button>
        )}
      </div>
      {exportError && <p className="mt-2 text-[10px] text-nomos-refuse" role="alert">{exportError}</p>}
      {textActionError && <p className="mt-2 text-[10px] text-nomos-refuse" role="alert">{textActionError}</p>}
      {copied && <p className="sr-only" aria-live="polite">Receipt details copied to clipboard.</p>}
    </div>
  )
}
