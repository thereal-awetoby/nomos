import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from './Toast'
import { shortAddr } from './ui'

// ── The connected wallet, in the header ─────────────────────
// Shows the address; opens a small panel to copy it or disconnect.

const PROVIDER_NAME: Record<string, string> = {
  wizardconnect: 'WizardConnect',
  wc2: 'WalletConnect',
}

export default function WalletChip() {
  const { wallet, disconnect } = useWallet()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [open])

  if (!wallet?.connected) {
    if (pathname === '/connect') return null
    return (
      <Link to="/connect" className="btn-primary min-h-[36px] rounded-full px-4 py-1.5 text-sm">
        Connect wallet
      </Link>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address)
      toast('Address copied', 'success')
    } catch {
      toast('Could not copy the address', 'error')
    }
  }

  const leave = async () => {
    setOpen(false)
    await disconnect()
    toast('Wallet disconnected', 'success')
    navigate('/')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Wallet ${wallet.address}`}
        className="flex h-9 items-center gap-2 rounded-full border hairline-strong bg-nomos-surface pl-2.5 pr-3 text-sm text-nomos-text transition-colors hover:bg-nomos-surface-raised"
      >
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-nomos-ok opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-nomos-ok" />
        </span>
        <span className="font-mono text-xs">{shortAddr(wallet.address.replace(/^bitcoincash:/, ''), 4, 4)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Connected wallet"
          className="absolute right-0 top-11 z-50 w-72 rounded-2xl border hairline-strong bg-nomos-surface p-4 shadow-2xl"
        >
          <p className="text-xs text-nomos-muted">Connected with {PROVIDER_NAME[wallet.provider] ?? 'a wallet'}</p>
          <p className="mt-2 break-all rounded-lg bg-nomos-surface-raised p-2.5 font-mono text-xs leading-relaxed text-nomos-text">{wallet.address}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { void copy() }} className="btn-secondary min-h-[38px] text-sm">Copy</button>
            <button type="button" onClick={() => { void leave() }} className="btn-danger min-h-[38px] text-sm">Disconnect</button>
          </div>
        </div>
      )}
    </div>
  )
}
