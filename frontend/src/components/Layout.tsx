import { Outlet } from 'react-router-dom'
import Banner from './Banner'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-nomos-bg">
      {/* Subtle radial glow behind content */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-nomos-accent/[0.03] blur-[120px]" />
      </div>

      <Banner />
      <main className="relative mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <Outlet />
      </main>
      <footer className="relative py-5 text-center text-[10px] text-nomos-muted/40 tracking-wider">
        NOMOS · BCH BLAZE 2026
      </footer>
    </div>
  )
}
