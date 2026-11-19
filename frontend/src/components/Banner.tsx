import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { useToast } from './Toast'
import { useWallet } from '../context/WalletContext'
import { Mark, NetworkChip, shortAddr } from './ui'
import { OPEN_SHORTCUTS_EVENT } from '../lib/theme'

// ── Site-wide top banner ────────────────────────────────────

const WIDGET_FACTORY_URL = '#' // TODO: fill after submission
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
  { to: '/proof', label: 'Refusal proof checker', key: 'F' },
  { to: '/simulate', label: 'Mandate simulator', key: 'S' },
  { to: '/identity', label: 'Nostr identity', key: 'I' },
  { to: '/bridge', label: 'Get BCH / Get PUSD', key: 'B' },
  { to: '/architecture', label: 'Architecture', key: 'D' },
]

const EXTERNAL = [
  { href: GITHUB_URL, label: 'GitHub' },
  { href: WIDGET_FACTORY_URL, label: 'Widget Factory' },
  { href: MERCAR_URL, label: 'Mercar P2P' },
  { href: ASGAYA_URL, label: 'Asgaya' },
]

function MenuGlyph({ open }: { open: boolean }) {
  // 4×3 block grid; collapses to an X pattern when open.
  const closed = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  const cross = [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1]
  const cells = open ? cross : closed
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" shapeRendering="crispEdges">
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
    window.addEventListener('keydown', onKey)
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
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
      <nav aria-label="Site navigation" className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4">
        <Link to={homeTo} className="flex items-center gap-2 text-nomos-text" aria-label="Nomos home">
          <Mark size={18} />
          <span className="font-mono text-sm font-black tracking-[0.28em]">NOMOS</span>
        </Link>
        <NetworkChip />

        {wallet?.connected && (
          <div className="ml-4 hidden items-center gap-1 md:flex">
            {PRIMARY.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  isActive ? 'bg-nomos-surface-raised text-nomos-text' : 'text-nomos-muted hover:text-nomos-text'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex h-8 w-9 items-center justify-center border hairline-strong bg-nomos-surface text-nomos-muted-bright transition-colors hover:text-nomos-text"
          >
            <MenuGlyph open={open} />
          </button>
        </div>
      </nav>

      {/* Always-visible strip: links and EMBER address */}
      <div className="border-t hairline">
        <div className="mx-auto flex max-w-5xl items-center gap-3 overflow-x-auto px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-nomos-muted [scrollbar-width:none]">
          <a href={WIDGET_FACTORY_URL} target="_blank" rel="noreferrer" className="shrink-0 hover:text-nomos-accent">Widget Factory</a>
          <span aria-hidden="true" className="opacity-40">|</span>
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

      {open && (
        <div id="site-menu" ref={menuRef} className="absolute inset-x-0 top-full border-b hairline-strong bg-nomos-bg shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {MENU.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`flex items-center justify-between border px-3 py-3 font-mono text-xs uppercase tracking-[0.14em] transition-colors hover:bg-nomos-surface-raised ${
                      pathname === item.to ? 'border-nomos-text/60 bg-nomos-surface text-nomos-text' : 'hairline-strong bg-nomos-surface/70 text-nomos-muted-bright'
                    }`}
                  >
                    <span>{item.label}</span>
                    <kbd className="font-mono text-[10px] text-nomos-muted">{item.key}</kbd>
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT)) }}
                  className="flex w-full items-center justify-between border hairline-strong bg-nomos-surface/70 px-3 py-3 font-mono text-xs uppercase tracking-[0.14em] text-nomos-muted-bright transition-colors hover:bg-nomos-surface-raised"
                >
                  <span>Keyboard shortcuts</span>
                  <kbd className="font-mono text-[10px] text-nomos-muted">?</kbd>
                </button>
              </li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-1.5 border-t hairline pt-3 sm:grid-cols-4">
              {EXTERNAL.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="border hairline-strong bg-nomos-surface/70 px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-nomos-muted-bright transition-colors hover:text-nomos-accent"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
