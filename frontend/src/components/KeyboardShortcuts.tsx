import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { OPEN_SHORTCUTS_EVENT } from '../lib/theme'
import { useWallet } from '../context/WalletContext'
import { GuideSectionView } from './GuideContent'
import { sectionsFor } from '../lib/guide'

interface Shortcut {
  key: string
  label: string
  route: string
}

const SHORTCUTS: Shortcut[] = [
  { key: 'h', label: 'Home', route: '/' },
  { key: 'g', label: 'Guide: how to use Nomos', route: '/guide' },
  { key: 'v', label: 'Vault', route: '/vault' },
  { key: 'p', label: 'Pay', route: '/pay' },
  { key: 'm', label: 'Rules', route: '/mandate' },
  { key: 'a', label: 'Activity', route: '/activity' },
  { key: 'f', label: 'Proof checker', route: '/proof' },
  { key: 'b', label: 'Swap PUSD and USDC', route: '/bridge' },
  { key: 'i', label: 'Nostr identity', route: '/identity' },
  { key: 's', label: 'Simulator', route: '/simulate' },
  { key: 'd', label: "How it's built", route: '/architecture' },
  { key: 'r', label: 'Rescue', route: '/rescue' },
]

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') !== null
}

/** The help button: this page's steps from the guide, then the keyboard shortcuts. Press ? to open it; Escape closes it. */
export default function KeyboardShortcuts() {
  const { pathname } = useLocation()
  const onLanding = pathname === '/'
  const { wallet } = useWallet()
  const pageHelp = sectionsFor(pathname)
  const [open, setOpen] = useState(false)
  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => {
    try { return localStorage.getItem('nomos-shortcuts') !== 'off' } catch { return true }
  })
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const closePalette = useCallback(() => setOpen(false), [])

  const openPalette = useCallback(() => {
    if (open) return
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body
      ? active
      : null
    setOpen(true)
  }, [open])

  const togglePalette = useCallback(() => {
    if (open) closePalette()
    else openPalette()
  }, [closePalette, open, openPalette])

  const navigateTo = useCallback((route: string) => {
    returnFocusRef.current = null
    setOpen(false)
    navigate(route)
  }, [navigate])

  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        closePalette()
      }
      return
    }

    if (!shortcutsEnabled || event.defaultPrevented || event.repeat || isEditableTarget(event.target)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (event.key === '?') {
      event.preventDefault()
      togglePalette()
      return
    }

    const shortcut = SHORTCUTS.find((item) => item.key === event.key.toLowerCase())
    if (shortcut) {
      event.preventDefault()
      navigateTo(shortcut.route)
    }
  }, [closePalette, navigateTo, open, shortcutsEnabled, togglePalette])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => {
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openPalette)
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, openPalette)
  }, [openPalette])

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
      return
    }
    const previousFocus = returnFocusRef.current
    returnFocusRef.current = null
    if (previousFocus?.isConnected) previousFocus.focus()
  }, [open])

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      {!onLanding && <button
        type="button"
        onClick={openPalette}
        aria-label="Help for this page"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Help for this page"
        className={`fixed right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border hairline-strong bg-nomos-surface text-base font-semibold text-nomos-muted-bright shadow-sm transition-colors hover:text-nomos-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomos-accent ${wallet?.connected ? 'bottom-20 md:bottom-4' : 'bottom-4'}`}
      >
        ?
      </button>}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={closePalette}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-shortcuts-title"
            className="card mx-2 max-h-full w-full max-w-lg overflow-y-auto p-5"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="keyboard-shortcuts-title" className="text-[17px] font-semibold text-nomos-text">
                {pageHelp.length > 0 ? 'Help for this page' : 'Help'}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closePalette}
                aria-label="Close help"
                className="rounded-lg px-2 py-1 text-sm text-nomos-muted transition-colors hover:text-nomos-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomos-accent"
              >
                Close
              </button>
            </div>

            {pageHelp.length > 0 ? (
              <div className="space-y-6">
                {pageHelp.map((section) => (
                  <div key={section.id}>
                    <GuideSectionView section={section} compact onNavigate={closePalette} />
                    <Link to={`/guide#${section.id}`} onClick={() => { returnFocusRef.current = null; setOpen(false) }} className="link-action mt-3 inline-block">
                      More on this in the guide
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-nomos-muted-bright">The guide explains every feature step by step.</p>
            )}

            <Link
              to="/guide"
              onClick={() => { returnFocusRef.current = null; setOpen(false) }}
              className="btn-secondary mt-5 w-full text-sm"
            >
              Open the full guide
            </Link>

            <details className="mt-5 border-t hairline pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-nomos-text">Keyboard shortcuts</summary>

            <div className="mb-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-nomos-surface-raised/60 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-nomos-text">Single-key shortcuts</p>
                <p id="single-key-shortcuts-description" className="text-xs text-nomos-muted">Turn off page keys and the ? key if they interfere with typing. The help button remains available.</p>
              </div>
              <button
                type="button"
                aria-label="Single-key shortcuts"
                aria-describedby="single-key-shortcuts-description"
                aria-pressed={shortcutsEnabled}
                onClick={() => setShortcutsEnabled((enabled) => {
                  const next = !enabled
                  try { localStorage.setItem('nomos-shortcuts', next ? 'on' : 'off') } catch {}
                  return next
                })}
                className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomos-accent ${
 shortcutsEnabled
 ? 'bg-nomos-accent text-nomos-on-accent'
 : 'bg-nomos-surface text-nomos-muted'
 }`}
              >
                {shortcutsEnabled ? 'On' : 'Off'}
              </button>
            </div>

            <ul className="space-y-1.5">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.key}>
                  <button
                    type="button"
                    onClick={() => navigateTo(shortcut.route)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-nomos-surface-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nomos-accent"
                  >
                    <kbd className="flex h-7 w-7 items-center justify-center rounded-lg bg-nomos-surface-raised text-xs font-semibold text-nomos-text">
                      {shortcut.key.toUpperCase()}
                    </kbd>
                    <span className="text-xs text-nomos-muted-bright">{shortcut.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-center text-xs text-nomos-muted">
              Press <kbd className="font-mono">?</kbd> to open or close help, and <kbd className="font-mono">Esc</kbd> to close it.
            </p>
            </details>
          </div>
        </div>
      )}
    </>
  )
}
