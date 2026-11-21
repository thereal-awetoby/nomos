import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './Toast'
import { MERCAR_URL } from '../lib/links'
import { IS_CHIPNET, CHIPNET_FAUCET_URL } from '../lib/network'

// ── Add BCH ─────────────────────────────────────────────────
// Shown boldly when the connected wallet is empty: its address as a QR code
// to send BCH to, and where to buy some.

/** The connected wallet's balance in sats; null while loading or unknown. */
export function useWalletBalance(address: string | undefined) {
  const [sats, setSats] = useState<number | null>(null)
  const refresh = useCallback(async () => {
    if (!address) return
    try {
      const { getWalletBalance } = await import('../lib/contract')
      setSats(await getWalletBalance(address))
    } catch {
      setSats(null)
    }
  }, [address])
  useEffect(() => { void refresh() }, [refresh])
  return { sats, refresh }
}

function AddressQr({ address }: { address: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    import('qrcode')
      .then((m: typeof import('qrcode') & { default?: typeof import('qrcode') }) => (m.default ?? m).toString(address, {
        type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1d17', light: '#ffffff' },
      }))
      .then((s) => { if (live) setSvg(s) })
      .catch(() => {})
    return () => { live = false }
  }, [address])
  return (
    <div className="w-40 shrink-0 rounded-xl bg-white p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square w-full animate-pulse rounded-lg bg-[#0b1d17]/5" />}
    </div>
  )
}

export default function AddFunds({
  address,
  onRefresh,
  title = 'Add BCH to your wallet',
  body,
}: {
  address: string
  onRefresh?: () => void
  title?: string
  body?: string
}) {
  const { toast } = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      toast('Address copied', 'success')
    } catch {
      toast('Could not copy the address', 'error')
    }
  }
  return (
    <section className="rounded-2xl border-2 border-nomos-accent/70 bg-nomos-surface p-5 sm:p-6" aria-label={title}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <AddressQr address={address} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.35rem] font-extrabold leading-tight text-nomos-text" style={{ fontStretch: '112%' }}>{title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
            {body ?? (IS_CHIPNET
              ? 'Your wallet has no test BCH yet. Get free chipnet coins from a faucet, sent to this address.'
              : 'Your wallet has no BCH yet. Send some to this address from another wallet or an exchange, or buy BCH person to person on Mercar.')}
          </p>
          <p className="mt-3 break-all rounded-lg bg-nomos-surface-raised p-2.5 font-mono text-xs leading-relaxed text-nomos-text">{address}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { void copy() }} className="btn-primary min-h-[40px] px-4 text-sm">Copy address</button>
            {IS_CHIPNET
              ? <a href={CHIPNET_FAUCET_URL} target="_blank" rel="noreferrer" className="btn-secondary min-h-[40px] text-sm">Chipnet faucet</a>
              : <a href={MERCAR_URL} target="_blank" rel="noreferrer" className="btn-secondary min-h-[40px] text-sm">Buy on Mercar P2P</a>}
            {onRefresh && <button type="button" onClick={onRefresh} className="btn-ghost min-h-[40px] text-sm">I've sent it, check again</button>}
          </div>
        </div>
      </div>
    </section>
  )
}

/** The same panel in a pop-up, for the wallet button. */
export function AddFundsDialog({ address, onClose }: { address: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add BCH" className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <AddFunds address={address} title="Add BCH" body={IS_CHIPNET ? undefined : 'Send BCH to your wallet address from another wallet or an exchange, or buy BCH person to person on Mercar.'} />
        <button type="button" onClick={onClose} className="mx-auto mt-3 block rounded-full bg-black/40 px-4 py-2 text-sm text-white hover:bg-black/55">Close</button>
      </div>
    </div>,
    document.body,
  )
}
