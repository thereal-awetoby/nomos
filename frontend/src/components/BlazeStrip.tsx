import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './Toast'
import { DECK_URL, DEMO_VIDEO_URL, EMBER_ADDRESS, GITHUB_URL } from '../lib/links'

// ── BCH BLAZE 2026 strip, on every page ─────────────────────
// The hackathon links (demo, deck, source) and the CashTokens address for
// EMBER2026 community-choice votes, with a QR code to scan.

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const PLAY = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l5.5-3.5z'
const DECK = 'M3 4h18M5 4v10h14V4M12 14v3M8.5 21l3.5-4 3.5 4'
const CODE = 'M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5'
const QR = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18v2M17 18h3v2'

// qrcode is CommonJS; depending on the bundler its functions sit on default.
type QRModule = typeof import('qrcode') & { default?: typeof import('qrcode') }

function CashTokensDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [qr, setQr] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    // Loaded only when someone opens the dialog.
    import('qrcode')
      .then((m: QRModule) => (m.default ?? m).toString(EMBER_ADDRESS, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b1d17', light: '#ffffff' },
      }))
      .then((svg) => { if (live) setQr(svg) })
      .catch(() => { if (live) setQr('') })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMBER_ADDRESS)
      toast('EMBER2026 address copied', 'success')
    } catch {
      toast('Could not copy the address', 'error')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blaze-dialog-title"
        className="blaze-dialog w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="blaze-dialog-title" className="text-lg font-bold">Vote for Nomos</h2>
            <p className="mt-1 text-sm text-[#4e635a]">Send EMBER2026 community-choice votes for Nomos to this CashTokens address.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-[#0b1d17]/5">
            <Icon d="M6 6l12 12M18 6 6 18" />
          </button>
        </div>
        <div className="blaze-qr mx-auto mt-4 w-56 rounded-xl border border-[#0b1d17]/10 p-2">
          {qr
            ? <div dangerouslySetInnerHTML={{ __html: qr }} />
            : <div className="aspect-square w-full animate-pulse rounded-lg bg-[#0b1d17]/5" />}
        </div>
        <p className="mt-4 break-all rounded-lg bg-[#eef3ef] p-3 font-mono text-xs leading-relaxed">{EMBER_ADDRESS}</p>
        <button
          type="button"
          data-autofocus
          onClick={() => { void copy() }}
          className="mt-3 w-full rounded-full bg-[#0b1d17] px-4 py-3 text-[15px] font-semibold text-white hover:bg-[#0b1d17]/90"
        >
          Copy address
        </button>
      </div>
    </div>,
    document.body,
  )
}

export default function BlazeStrip() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className="blaze-strip">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-0 px-4 py-1 text-[13px] font-semibold sm:justify-between">
        <span className="font-display font-extrabold tracking-[0.08em]" style={{ fontStretch: '112%' }}>BCH BLAZE 2026</span>
        <span className="flex flex-wrap items-center justify-center gap-x-4">
          {DEMO_VIDEO_URL && <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer"><Icon d={PLAY} />Demo</a>}
          {DECK_URL && <a href={DECK_URL} target="_blank" rel="noreferrer"><Icon d={DECK} />Deck</a>}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Icon d={CODE} />Source</a>
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon d={QR} />CashTokens</button>
        </span>
      </div>
      {open && <CashTokensDialog onClose={close} />}
    </div>
  )
}
