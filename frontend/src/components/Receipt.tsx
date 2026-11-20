import { useEffect, useRef, useState } from 'react'
import type { Receipt as ReceiptType } from '../lib/types'
import { EXPLORER_TX_URL, remainingAt } from '../lib/contract'
import { Chip, fmtBch, fmtSats } from './ui'

/** Add cautious context to common node errors without inferring covenant causation. */
function explainNodeError(refusal: NonNullable<ReceiptType['onChainRefusal']>): string | null {
  const error = refusal.nodeError.toLowerCase()
  if (refusal.scriptFailure) {
    if (error.includes('checksig') || error.includes('signature')) {
      return 'The node reports a signature-related script failure. It does not identify which input or key; inspect the transaction inputs and signing data.'
    }
    return 'The node reported a script-validation failure. It does not identify which input script failed or prove the Nomos covenant caused it.'
  }
  if (refusal.rejectionKind === 'missing-inputs') {
    return 'The node reports one or more inputs are missing, unavailable, or spent from its current view. A parent may be unknown to this node; this alone does not prove the vault UTXO was spent.'
  }
  if (error.includes('dust')) {
    return 'The node flagged an output under its dust relay policy. Thresholds can depend on output type and node policy; this is not by itself proof of a covenant violation.'
  }
  if (error.includes('fee') || error.includes('insufficient priority')) {
    return 'The node reports a fee or priority relay-policy issue. This does not by itself establish a covenant violation or consensus failure.'
  }
  return null
}

function receiptToText(receipt: ReceiptType, dateStr: string, timeStr: string): string {
  const statusLabel = receipt.status === 'paid'
    ? 'PAID'
    : receipt.status === 'submitted'
      ? 'SUBMITTED, UNCONFIRMED'
      : 'REFUSED'
  const kind = receipt.kind ?? 'payment'
  const recordLabel = kind === 'payment' ? 'Payment' : kind === 'rescue' ? 'Rescue sweep' : receipt.destinationLabel || 'Mandate update'
  const amountLabel = kind === 'payment' ? 'Amount' : kind === 'rescue' ? 'Swept' : receipt.destinationLabel === 'Vault created' ? 'Initial deposit' : 'Vault value moved'
  return [
    `NOMOS RECEIPT | ${statusLabel}`,
    `Record: ${recordLabel}`,
    `Date: ${dateStr} ${timeStr}`,
    `${amountLabel}: ${(receipt.amount / 1e8).toFixed(8)} BCH`,
    `To: ${receipt.destinationLabel && kind === 'payment' ? `${receipt.destinationLabel} ` : ''}${receipt.destination}`,
    receipt.destinationLink ? `Identity link: ${receipt.destinationLink.npub}, anchor ${receipt.destinationLink.anchorTxid}, claim ${receipt.destinationLink.eventId}` : '',
    receipt.reason ? `Reason: ${receipt.reason}` : '',
    `Mandate: daily limit ${(receipt.mandate.dailyLimitSats / 1e8).toFixed(8)} BCH${kind === 'payment' ? `; remaining before ${(remainingAt(receipt.mandate, receipt.timestamp) / 1e8).toFixed(8)} BCH` : ''}`,
    receipt.txHash ? `TX: ${EXPLORER_TX_URL}${receipt.txHash}` : '',
    receipt.onChainRefusal ? `Node response: ${receipt.onChainRefusal.rejectionKind}: ${receipt.onChainRefusal.nodeError}` : '',
    receipt.onChainRefusal ? `Node checked: ${receipt.onChainRefusal.network} at ${new Date(receipt.onChainRefusal.checkedAt).toISOString()} (not mined/confirmed)` : '',
    receipt.onChainRefusal ? `Raw signed transaction is rebroadcastable; txid ${receipt.onChainRefusal.txid}` : '',
    'nomos.asgaya.org',
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
  const statusLabel = isPaid ? 'Paid' : isRefused ? 'Refused' : 'Submitted, unconfirmed'
  const ts = new Date(receipt.timestamp)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const receiptText = receiptToText(receipt, dateStr, timeStr)
  const nodeErrorExplanation = receipt.onChainRefusal ? explainNodeError(receipt.onChainRefusal) : null

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
        backgroundColor: document.documentElement.dataset.theme === 'light' ? '#f7f6f2' : '#111418',
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
        title: `Nomos receipt: ${statusLabel}`,
        text: receiptText,
      })
    } catch {
      // The user may dismiss the native share sheet; no action is needed then.
    }
  }

  const kind = receipt.kind ?? 'payment'
  const remainingBefore = remainingAt(receipt.mandate, receipt.timestamp)
  const remainingAfter = isRefused ? remainingBefore : Math.max(0, remainingBefore - receipt.amount)
  const isoTime = ts.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const accent = isPaid ? 'var(--nomos-accent)' : isRefused ? 'var(--nomos-refuse)' : 'var(--nomos-pending)'
  const bandText = kind === 'mandate'
    ? 'Mandate record · new rules deployed'
    : kind === 'rescue'
      ? 'Rescue record · vault swept, limit bypassed'
      : isPaid
        ? 'Receipt · spent under mandate'
        : isRefused
          ? 'Refusal record · not spent'
          : 'Receipt · submitted, awaiting confirmation'

  return (
    <div
      ref={cardRef}
      className="receipt-in overflow-hidden rounded-sm bg-nomos-surface"
      style={{ border: `1px solid rgb(${accent} / 0.55)` }}
    >
      <div
        className="flex items-center justify-between gap-3 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
        style={{ background: `rgb(${accent})`, color: 'rgb(var(--nomos-bg))' }}
      >
        <span className="truncate">{bandText}</span>
        <span className="shrink-0">Nomos</span>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">{kind === 'mandate' ? (receipt.destinationLabel === 'Vault created' ? 'Initial deposit' : 'Vault value moved') : kind === 'rescue' ? 'Swept' : 'Amount'}</p>
            <p className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${isRefused ? 'text-nomos-refuse line-through decoration-2' : 'text-nomos-text'}`}>
              {fmtBch(receipt.amount)}
              <span className="ml-1.5 text-xs font-semibold text-nomos-muted no-underline">BCH</span>
            </p>
            <p className="font-mono text-[10px] tabular-nums text-nomos-muted">{fmtSats(receipt.amount)} sats</p>
          </div>
          {kind === 'payment' ? <Chip kind={receipt.status} /> : <Chip kind={kind} />}
        </div>

        <dl className="mt-3 divide-hairline border-y hairline">
          {(receipt.destination || receipt.destinationLabel) && <div className="kv">
            <dt>{kind === 'mandate' ? 'Action' : 'To'}</dt>
            <dd className="text-right" title={receipt.destination}>
              {receipt.destinationLabel && <span className="block truncate text-nomos-accent">{receipt.destinationLabel}</span>}
              {receipt.destination && <span className="block truncate text-[10px] text-nomos-muted-bright">{receipt.destination}</span>}
            </dd>
          </div>}
          {receipt.destinationLink && (
            <div className="kv">
              <dt>Identity link</dt>
              <dd className="text-right">
                <a href={`${EXPLORER_TX_URL}${receipt.destinationLink.anchorTxid}`} target="_blank" rel="noreferrer" className="text-nomos-accent underline">
                  anchor {receipt.destinationLink.anchorTxid.slice(0, 10)}
                </a>
                <span className="block truncate text-[10px] text-nomos-muted-bright" title={receipt.destinationLink.eventId}>
                  claim {receipt.destinationLink.eventId.slice(0, 10)}
                </span>
              </dd>
            </div>
          )}
          <div className="kv"><dt>Time</dt><dd>{isoTime}</dd></div>
          <div className="kv"><dt>Daily limit</dt><dd>{fmtBch(receipt.mandate.dailyLimitSats)} BCH</dd></div>
          {kind === 'payment' && <div className="kv"><dt>Remaining before</dt><dd>{fmtBch(remainingBefore)} BCH</dd></div>}
          {kind === 'payment' && !isRefused && (
            <div className="kv"><dt>Remaining after</dt><dd className="text-nomos-accent">{fmtBch(remainingAfter)} BCH</dd></div>
          )}
          <div className="kv"><dt>Allowlist</dt><dd>{receipt.mandate.allowlistEnabled ? `On · ${receipt.mandate.allowlist.length}/5` : 'Off'}</dd></div>
          {receipt.reason && (
            <div className="kv"><dt>Rule broken</dt><dd className="text-nomos-refuse" title={receipt.reason}>{receipt.reason}</dd></div>
          )}
        </dl>

        {receipt.txHash && (
          <a
            href={`${EXPLORER_TX_URL}${receipt.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block border px-3 py-2.5 font-mono transition-colors hover:bg-nomos-surface-raised"
            style={{ borderColor: `rgb(${accent} / 0.5)` }}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-nomos-muted">
              {receipt.status === 'submitted' ? 'Transaction · check explorer for confirmation' : 'Transaction · view on explorer'}
            </span>
            <span className="mt-0.5 block break-all text-[11px] text-nomos-accent">{receipt.txHash}</span>
          </a>
        )}

        {receipt.onChainRefusal && (
          <section className="mt-3 border hairline-strong bg-nomos-bg-deep/40 p-3" aria-label="Node check details">
            <div className="flex items-center justify-between gap-2">
              <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${receipt.onChainRefusal.scriptFailure ? 'text-nomos-refuse' : 'text-nomos-muted-bright'}`}>
                {receipt.onChainRefusal.rejectionKind === 'script-failure'
                  ? 'Node: script failure'
                  : receipt.onChainRefusal.rejectionKind === 'missing-inputs'
                    ? 'Node: missing or spent inputs'
                    : 'Node: other rejection'}
              </p>
              <button type="button" onClick={() => { void copyNodeCheck() }} className="link-action">
                {proofCopied ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <p className="mt-1 break-all font-mono text-[9px] text-nomos-muted">TXID {receipt.onChainRefusal.txid}</p>
            <p className="mt-1 break-words font-mono text-[10px] leading-relaxed text-nomos-text">{receipt.onChainRefusal.nodeError}</p>
            {nodeErrorExplanation && <p className="mt-1 text-[10px] leading-relaxed text-nomos-muted-bright">{nodeErrorExplanation}</p>}
            <p className="mt-1 font-mono text-[9px] text-nomos-muted">{receipt.onChainRefusal.network} · {new Date(receipt.onChainRefusal.checkedAt).toLocaleString()} · not mined or confirmed</p>
            <details className="mt-2">
              <summary className="link-action cursor-pointer">Signed transaction hex</summary>
              <p className="mt-2 break-all font-mono text-[9px] leading-relaxed text-nomos-muted">{receipt.onChainRefusal.rawTx}</p>
            </details>
            <p className="mt-2 text-[9px] leading-relaxed text-nomos-muted">A node response is not confirmation of chain state. Anyone with the signed hex can try to rebroadcast it. A script failure does not by itself identify which script failed.</p>
          </section>
        )}

        <div className="receipt-actions mt-3 grid grid-cols-3 gap-1.5">
          <button type="button" onClick={downloadImage} disabled={isExporting} className="btn-ghost px-1 py-2 text-[9px]">
            {isExporting ? 'Preparing' : 'Image'}
          </button>
          <button type="button" onClick={copyReceiptText} className="btn-ghost px-1 py-2 text-[9px]">
            {copied ? 'Copied' : 'Copy text'}
          </button>
          {typeof navigator.share === 'function' ? (
            <button type="button" onClick={() => { void shareReceipt() }} className="btn-ghost px-1 py-2 text-[9px]">Share</button>
          ) : (
            <span className="flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.12em] text-nomos-muted">Local record</span>
          )}
        </div>
        {exportError && <p className="mt-2 text-[10px] text-nomos-refuse" role="alert">{exportError}</p>}
        {textActionError && <p className="mt-2 text-[10px] text-nomos-refuse" role="alert">{textActionError}</p>}
        {copied && <p className="sr-only" aria-live="polite">Receipt details copied to clipboard.</p>}
      </div>
    </div>
  )
}
