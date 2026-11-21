import { BCH_NETWORK, IS_CHIPNET, switchNetwork, type BchNetwork } from '../lib/network'

// ── Mainnet / Chipnet ───────────────────────────────────────
// Chipnet is the Bitcoin Cash test network: free coins, same rules. Each
// network keeps its own wallet, vault and history in this browser.

const OPTIONS: { value: BchNetwork; label: string }[] = [
  { value: 'mainnet', label: 'Mainnet' },
  { value: 'chipnet', label: 'Chipnet' },
]

export default function NetworkSwitch({ className = '' }: { className?: string }) {
  return (
    <div role="radiogroup" aria-label="Bitcoin Cash network" className={`inline-flex rounded-full border hairline-strong bg-nomos-surface p-0.5 ${className}`}>
      {OPTIONS.map((o) => {
        const active = o.value === BCH_NETWORK
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => switchNetwork(o.value)}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
              active
                ? o.value === 'chipnet' ? 'bg-nomos-accent text-nomos-on-accent' : 'bg-nomos-ok text-nomos-on-ok'
                : 'text-nomos-muted hover:text-nomos-text'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A line under the header while the app runs on the test network. */
export function ChipnetNotice() {
  if (!IS_CHIPNET) return null
  return (
    <div className="border-b border-nomos-accent/40 bg-nomos-accent/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <span className="text-nomos-text">
          <span className="font-semibold">Chipnet</span>, the test network. Coins here have no value.
        </span>
        <button type="button" onClick={() => switchNetwork('mainnet')} className="font-semibold text-nomos-text underline underline-offset-4">
          Switch to mainnet
        </button>
      </div>
    </div>
  )
}
