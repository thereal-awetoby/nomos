import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { useToast } from './Toast'
import { useWallet } from '../context/WalletContext'
import { shortAddr } from './ui'
import { OPEN_SHORTCUTS_EVENT } from '../lib/theme'
import { ASGAYA_URL, DEMO_VIDEO_URL, EMBER_ADDRESS, GITHUB_URL, MERCAR_URL, WIDGET_FACTORY_URL } from '../lib/links'

// ── Site-wide top banner ────────────────────────────────────


const PRIMARY = [
  { to: '/vault', label: 'Vault', key: 'V' },
  { to: '/pay', label: 'Pay', key: 'P' },
  { to: '/mandate', label: 'Rules', key: 'M' },
  { to: '/activity', label: 'Activity', key: 'A' },
]

const MENU = [
  { to: '/vault', label: 'Vault', key: 'V' },
  { to: '/pay', label: 'Pay', key: 'P' },
  { to: '/mandate', label: 'Rules', key: 'M' },
  { to: '/activity', label: 'Activity', key: 'A' },
  { to: '/rescue', label: 'Rescue', key: 'R' },
  { to: '/proof', label: 'Proof checker', key: 'F' },
  { to: '/simulate', label: 'Simulator', key: 'S' },
  { to: '/identity', label: 'Nostr identity', key: 'I' },
  { to: '/bridge', label: 'Swap PUSD and USDC', key: 'B' },
  { to: '/architecture', label: "How it's built", key: 'D' },
]

const EXTERNAL = [
  { href: GITHUB_URL, label: 'GitHub' },
  ...(WIDGET_FACTORY_URL ? [{ href: WIDGET_FACTORY_URL, label: 'Presentation (Widget Factory)' }] : []),
  ...(DEMO_VIDEO_URL ? [{ href: DEMO_VIDEO_URL, label: 'Demo video' }] : []),
  { href: MERCAR_URL, label: 'Mercar P2P' },
  { href: ASGAYA_URL, label: 'Asgaya' },
]

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d={open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} />
    </svg>
  )
}

export default function Banner() {
  const { toast } = useToast()
  const { wallet } = useWallet()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [open])

  const copyEmberAddress = async () => {
    try {
      await navigator.clipboard.writeText(EMBER_ADDRESS)
      toast('EMBER2026 address copied', 'success')
    } catch {
      toast('Could not copy the EMBER2026 address', 'error')
    }
  }

  const homeTo = wallet?.connected ? '/vault' : '/'

  return (
    <header className="site-banner sticky top-0 z-40 w-full border-b hairline bg-nomos-bg/95 backdrop-blur">
      <nav aria-label="Site navigation" className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link to={homeTo} className="text-lg font-semibold tracking-tight text-nomos-text" aria-label="Nomos home">
          Nomos
        </Link>

        {wallet?.connected && (
          <div className="hidden items-center gap-1 md:flex">
            {PRIMARY.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-nomos-surface-raised font-medium text-nomos-text' : 'text-nomos-muted hover:text-nomos-text'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-nomos-muted-bright transition-colors hover:bg-nomos-surface-raised hover:text-nomos-text"
          >
            <MenuGlyph open={open} />
          </button>
        </div>
      </nav>

      {/* Thin strip: EMBER2026 vote address */}
      <div className="border-t hairline">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-xs text-nomos-muted">
          {WIDGET_FACTORY_URL && (
            <a href={WIDGET_FACTORY_URL} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-nomos-text hover:underline">Deck</a>
          )}
          {DEMO_VIDEO_URL && (
            <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-nomos-text hover:underline">Demo</a>
          )}
          <span className="shrink-0">EMBER2026</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-nomos-muted-bright" title={EMBER_ADDRESS}>{shortAddr(EMBER_ADDRESS, 6, 6)}</span>
          <button
            type="button"
            onClick={() => { void copyEmberAddress() }}
            aria-label="Copy EMBER2026 community address"
            className="ml-auto shrink-0 font-medium text-nomos-text hover:underline"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Right-side slide panel. Rendered into <body>: the header's backdrop-filter
          would otherwise make it the containing block and clip the fixed panel. */}
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id="site-menu"
            ref={menuRef}
            className="fixed right-0 top-0 z-[70] flex h-[100dvh] w-72 max-w-[85vw] flex-col border-l hairline bg-nomos-bg shadow-xl"
          >
            <div className="flex h-14 items-center justify-between px-4">
              <span className="text-base font-semibold text-nomos-text">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-nomos-muted-bright hover:bg-nomos-surface-raised hover:text-nomos-text"
                aria-label="Close menu"
              >
                <MenuGlyph open />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <ul className="space-y-0.5">
                {MENU.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
 pathname === item.to
 ? 'bg-nomos-surface-raised font-medium text-nomos-text'
 : 'text-nomos-muted-bright hover:bg-nomos-surface-raised hover:text-nomos-text'
 }`}
                    >
                      <span>{item.label}</span>
                      <kbd className="hidden font-sans text-xs text-nomos-muted md:inline">{item.key}</kbd>
                    </Link>
                  </li>
                ))}
                <li className="hidden md:block">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT)) }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[15px] text-nomos-muted-bright transition-colors hover:bg-nomos-surface-raised hover:text-nomos-text"
                  >
                    <span>Keyboard shortcuts</span>
                    <kbd className="font-sans text-xs text-nomos-muted">?</kbd>
                  </button>
                </li>
              </ul>
              <div className="mt-3 space-y-0.5 border-t hairline pt-3">
                {EXTERNAL.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg px-3 py-2 text-sm text-nomos-muted transition-colors hover:text-nomos-text"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </header>
  )
}
