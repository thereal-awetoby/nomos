import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Banner from './Banner'
import BottomNav from './BottomNav'
import { useWallet } from '../context/WalletContext'

const SOURCE_URL = 'https://github.com/thereal-awetoby/nomos/blob/main/contracts/NomosVault.cash'

// Reading width per route; anything not listed uses the full container.
const PAGE_WIDTH: Record<string, string> = {
  '/pay': 'max-w-2xl',
  '/mandate': 'max-w-2xl',
  '/rescue': 'max-w-2xl',
  '/activity': 'max-w-3xl',
  '/proof': 'max-w-3xl',
  '/identity': 'max-w-3xl',
  '/bridge': 'max-w-3xl',
}

function BackBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { wallet } = useWallet()
  if (pathname === '/') return null

  // React Router keeps the history index in history.state.idx; 0 means this tab opened on this page.
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  const fallback = wallet?.connected ? '/vault' : '/'
  if (idx === 0 && pathname === fallback) return null

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => (idx > 0 ? navigate(-1) : navigate(fallback))}
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-nomos-muted transition-colors hover:text-nomos-text"
      >
        [ Back ]
      </button>
    </div>
  )
}

export default function Layout() {
  const { wallet } = useWallet()
  const hasBottomNav = !!wallet?.connected
  const { pathname } = useLocation()
  const width = PAGE_WIDTH[pathname] ?? ''

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-nomos-accent focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:font-bold focus:uppercase"
        style={{ color: 'rgb(var(--nomos-on-accent))' }}
      >
        Skip to content
      </a>

      <Banner />
      <main
        id="main-content"
        role="main"
        tabIndex={-1}
        className={`relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 focus:outline-none ${hasBottomNav ? 'pb-28 md:pb-10' : 'pb-10'}`}
      >
        <div className={`mx-auto w-full ${width}`}>
          <BackBar />
          <Outlet />
        </div>
      </main>
      <footer
        role="contentinfo"
        className={`border-t hairline ${hasBottomNav ? 'mb-16 md:mb-0' : ''}`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-nomos-muted">
          <span>Nomos · BCH BLAZE 2026</span>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="hover:text-nomos-accent">Covenant source: NomosVault.cash</a>
        </div>
      </footer>
      <BottomNav />
    </div>
  )
}
