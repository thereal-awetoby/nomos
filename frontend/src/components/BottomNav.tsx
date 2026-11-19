import { NavLink } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'

type Glyph = 'home' | 'pay' | 'mandate' | 'activity'

function NavGlyph({ name }: { name: Glyph }) {
  // 7×7 pixel glyphs, drawn as rects.
  const shapes: Record<Glyph, [number, number, number, number][]> = {
    home: [[0, 0, 7, 1], [0, 6, 7, 1], [0, 0, 1, 7], [6, 0, 1, 7], [2, 2, 3, 3]],
    pay: [[0, 1, 7, 1], [0, 5, 7, 1], [3, 0, 1, 7]],
    mandate: [[0, 0, 7, 1], [0, 3, 5, 1], [0, 6, 7, 1], [6, 2, 1, 3]],
    activity: [[0, 0, 2, 1], [3, 0, 4, 1], [0, 3, 2, 1], [3, 3, 4, 1], [0, 6, 2, 1], [3, 6, 4, 1]],
  }
  return (
    <svg width="14" height="14" viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges">
      {shapes[name].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />)}
    </svg>
  )
}

const ITEMS: { to: string; label: string; glyph: Glyph }[] = [
  { to: '/vault', label: 'Home', glyph: 'home' },
  { to: '/pay', label: 'Pay', glyph: 'pay' },
  { to: '/mandate', label: 'Mandate', glyph: 'mandate' },
  { to: '/activity', label: 'Activity', glyph: 'activity' },
]

/** Fixed bottom navigation on small screens once a wallet is connected. */
export default function BottomNav() {
  const { wallet } = useWallet()
  if (!wallet?.connected) return null

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t hairline-strong bg-nomos-bg/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => (
          <li key={item.to} className="border-r hairline last:border-r-0">
            <NavLink
              to={item.to}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                isActive
                  ? 'text-nomos-text shadow-[inset_0_2px_0_rgb(var(--nomos-accent))]'
                  : 'text-nomos-muted hover:text-nomos-text'
              }`}
            >
              <NavGlyph name={item.glyph} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
