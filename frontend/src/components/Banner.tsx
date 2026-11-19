import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { useToast } from './Toast'
import { useWallet } from '../context/WalletContext'
import { shortAddr } from './ui'
import { OPEN_SHORTCUTS_EVENT } from '../lib/theme'

// ── Site-wide top banner ────────────────────────────────────

const WIDGET_FACTORY_URL: string = '' // set to the deck URL; the link is hidden while empty
const GITHUB_URL = 'https://github.com/thereal-awetoby/nomos'
const MERCAR_URL = 'https://mercar.asgaya.org/'
const ASGAYA_URL = 'https://asgaya.org/'
// CashTokens address for EMBER2026 community-choice votes
const EMBER_ADDRESS = 'bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h'

const PRIMARY = [
  { to: '/vault', label: 'Vault', key: 'V' },
  { to: '/pay', label: 'Pay', key: 'P' },
  { to: '/mandate', label: 'Mandate', key: 'M' },
  { to: '/activity', label: 'Activity', key: 'A' },
]

const MENU = [
  { to: '/vault', label: 'Vault', key: 'V' },
  { to: '/pay', label: 'Pay', key: 'P' },
  { to: '/mandate', label: 'Set mandate', key: 'M' },
  { to: '/activity', label: 'Activity', key: 'A' },
  { to: '/rescue', label: 'Rescue', key: 'R' },
  { to: '/proof', label: 'Proof checker', key: 'F' },
  { to: '/simulate', label: 'Simulator', key: 'S' },
  { to: '/identity', label: 'Nostr identity', key: 'I' },
  { to: '/bridge', label: 'Get BCH / Get PUSD', key: 'B' },
  { to: '/architecture', label: 'Architecture', key: 'D' },
]

const EXTERNAL = [
  { href: GITHUB_URL, label: 'GitHub' },
  ...(WIDGET_FACTORY_URL ? [{ href: WIDGET_FACTORY_URL, label: 'Widget Factory' }] : []),
  { href: MERCAR_URL, label: 'Mercar P2P' },
  { href: ASGAYA_URL, label: 'Asgaya' },
]

function MenuGlyph({ open }: { open: boolean }) {
  const closed = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  const cross = [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1]
  const cells = open ? cross : closed
  return (
    <svg width="14" height="10" viewBox="0 0 18 14" aria-hidden="true" shapeRendering="crispEdges">
      {cells.map((on, i) => on
        ? <rect key={i} x={(i % 4) * 5} y={Math.floor(i / 4) * 5} width="3" height="3" fill="currentColor" />
        : null)}
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
    <header className="site-banner sticky top-0 z-40 w-full border-b hairline-strong bg-nomos-bg/95 backdrop-blur-sm">
      <nav aria-label="Site navigation" className="mx-auto flex h-10 max-w-6xl items-center gap-3 px-4">
        <Link to={homeTo} className="font-mono text-sm font-black tracking-[0.28em] text-nomos-text" aria-label="Nomos home">
          NOMOS
        </Link>

        {wallet?.connected && (
          <div className="ml-2 hidden items-center gap-0.5 md:flex">
            {PRIMARY.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  isActive ? 'bg-nomos-surface-raised text-nomos-text' : 'text-nomos-muted hover:text-nomos-text'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex h-7 w-7 items-center justify-center border hairline-strong bg-nomos-surface text-nomos-muted-bright transition-colors hover:text-nomos-text"
          >
            <MenuGlyph open={open} />
          </button>
        </div>
      </nav>

      {/* Compact strip: links and EMBER address */}
      <div className="border-t hairline">
        <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-x-auto px-4 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-nomos-muted [scrollbar-width:none]">
          {WIDGET_FACTORY_URL && (
            <>
              <a href={WIDGET_FACTORY_URL} target="_blank" rel="noreferrer" className="shrink-0 hover:text-nomos-accent">Widget Factory</a>
              <span aria-hidden="true" className="opacity-40">|</span>
            </>
          )}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="shrink-0 hover:text-nomos-accent">GitHub</a>
          <span aria-hidden="true" className="opacity-40">|</span>
          <span className="shrink-0">EMBER2026</span>
          <span className="truncate normal-case tracking-normal text-nomos-muted-bright" title={EMBER_ADDRESS}>{shortAddr(EMBER_ADDRESS, 6, 6)}</span>
          <button
            type="button"
            onClick={() => { void copyEmberAddress() }}
            aria-label="Copy EMBER2026 community address"
            className="ml-auto shrink-0 font-semibold text-nomos-accent hover:underline"
          >
            [ Copy ]
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
            className="fixed right-0 top-0 z-[70] flex h-[100dvh] w-72 max-w-[85vw] flex-col border-l hairline bg-nomos-bg shadow-[-12px_0_40px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center justify-between border-b hairline px-4 py-3">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-nomos-text">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center text-nomos-muted-bright hover:text-nomos-text"
                aria-label="Close menu"
              >
                <MenuGlyph open />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <ul className="space-y-0.5">
                {MENU.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={`flex items-center justify-between border px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                        pathname === item.to
                          ? 'border-nomos-text/40 bg-nomos-surface-raised text-nomos-text'
                          : 'hairline bg-nomos-surface/50 text-nomos-muted-bright hover:bg-nomos-surface-raised hover:text-nomos-text'
                      }`}
                    >
                      <span>{item.label}</span>
                      <kbd className="text-[9px] text-nomos-muted">{item.key}</kbd>
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT)) }}
                    className="flex w-full items-center justify-between border hairline bg-nomos-surface/50 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-nomos-muted-bright transition-colors hover:bg-nomos-surface-raised hover:text-nomos-text"
                  >
                    <span>Keyboard shortcuts</span>
                    <kbd className="text-[9px] text-nomos-muted">?</kbd>
                  </button>
                </li>
              </ul>
              <div className="mt-3 border-t hairline pt-3 space-y-0.5">
                {EXTERNAL.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-nomos-muted-bright transition-colors hover:text-nomos-accent"
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
