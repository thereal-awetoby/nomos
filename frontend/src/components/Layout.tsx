import { Outlet } from 'react-router-dom'
import Banner from './Banner'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Banner />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-nomos-border py-4 text-center text-xs text-nomos-muted">
        Nomos · BCH BLAZE 2026
      </footer>
    </div>
  )
}
