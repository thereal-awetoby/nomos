import { NavLink } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'

type Glyph = 'home' | 'pay' | 'mandate' | 'activity'

function NavIcon({ name }: { name: Glyph }) {
  const paths: Record<Glyph, string> = {
    home: 'M4 10.5 12 4l8 6.5V20H4z M10 20v-5h4v5',
    pay: 'M3 7h18v10H3z M3 11h18',
    mandate: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4',
    activity: 'M8 7h12 M8 12h12 M8 17h12 M4 7h.01 M4 12h.01 M4 17h.01',
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

const ITEMS: { to: string; label: string; glyph: Glyph }[] = [
  { to: '/vault', label: 'Home', glyph: 'home' },
  { to: '/pay', label: 'Pay', glyph: 'pay' },
  { to: '/mandate', label: 'Rules', glyph: 'mandate' },
  { to: '/activity', label: 'Activity', glyph: 'activity' },
]

/** Fixed bottom navigation on small screens once a wallet is connected. */
export default function BottomNav() {
  const { wallet } = useWallet()
  if (!wallet?.connected) return null

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t hairline bg-nomos-bg/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                isActive ? 'text-nomos-text' : 'text-nomos-muted hover:text-nomos-text'
              }`}
            >
              <NavIcon name={item.glyph} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
