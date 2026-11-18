import { Outlet } from 'react-router-dom'
import Banner from './Banner'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-nomos-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-nomos-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
        style={{ color: 'rgb(var(--nomos-on-accent))' }}
      >
        Skip to content
      </a>

      {/* Subtle radial glow behind content */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-nomos-accent/[0.03] blur-[120px]" />
      </div>

      <Banner />
      <main
        id="main-content"
        role="main"
        tabIndex={-1}
        className="relative mx-auto w-full max-w-lg flex-1 px-5 py-8"
      >
        <Outlet />
      </main>
      <footer
        role="contentinfo"
        className="relative py-5 text-center text-[10px] text-nomos-muted/40 tracking-wider"
      >
        NOMOS · BCH BLAZE 2026
      </footer>
    </div>
  )
}
