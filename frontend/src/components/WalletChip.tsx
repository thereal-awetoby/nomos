import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from './Toast'
import { fmtBch, shortAddr } from './ui'
import { AddFundsDialog, useWalletBalance } from './AddFunds'

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
  const [adding, setAdding] = useState(false)
  const [gathering, setGathering] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { sats, whole, refresh } = useWalletBalance(wallet?.connected ? wallet.address : undefined)

  useEffect(() => { if (open) void refresh() }, [open, refresh])

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

  // Move the BCH at the wallet's other addresses to this one, so every part of
  // Nomos can use it. The wallet signs each coin with its own key.
  const gather = async () => {
    setGathering(true)
    try {
      const { gatherIntoAddress } = await import('../lib/contract')
      const result = await gatherIntoAddress(wallet.address, null, wallet.provider)
      toast(`Gathered ${fmtBch(Number(result.sats))} BCH from ${result.fromAddresses} addresses`, 'success')
      await refresh(true)
    } catch (err: any) {
      toast(err?.message || 'The BCH was not gathered', 'error')
    } finally {
      setGathering(false)
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
          <p className="mt-2 font-display text-2xl font-extrabold tabular-nums text-nomos-text" style={{ fontStretch: '112%' }}>
            {whole ? fmtBch(whole.sats) : sats === null ? '…' : fmtBch(sats)} <span className="text-sm font-semibold text-nomos-muted">BCH</span>
          </p>
          {whole && whole.elsewhere > 0 && (
            <>
              <p className="mt-1 text-xs leading-relaxed text-nomos-muted">
                Across {whole.addresses} {whole.addresses === 1 ? 'address' : 'addresses'} in your wallet.
                {sats !== null && ` ${fmtBch(sats)} BCH is at ${shortAddr(wallet.address.replace(/^(bitcoincash|bchtest):/, ''), 4, 4)}, the address Nomos uses.`}
              </p>
              <button type="button" onClick={() => { void gather() }} disabled={gathering} className="btn-secondary mt-2 min-h-[38px] w-full text-sm">
                {gathering ? <><span className="spinner mr-2" aria-hidden="true" /> Waiting for your wallet…</> : `Gather it all into ${shortAddr(wallet.address.replace(/^(bitcoincash|bchtest):/, ''), 4, 4)}`}
              </button>
            </>
          )}
          <button type="button" onClick={() => { setOpen(false); setAdding(true) }} className="btn-primary mt-2 min-h-[38px] w-full text-sm">
            Add BCH
          </button>
          <p className="mt-3 break-all rounded-lg bg-nomos-surface-raised p-2.5 font-mono text-xs leading-relaxed text-nomos-text">{wallet.address}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { void copy() }} className="btn-secondary min-h-[38px] text-sm">Copy</button>
            <button type="button" onClick={() => { void leave() }} className="btn-danger min-h-[38px] text-sm">Disconnect</button>
          </div>
        </div>
      )}
      {adding && <AddFundsDialog address={wallet.address} onClose={() => { setAdding(false); void refresh() }} />}
    </div>
  )
}
