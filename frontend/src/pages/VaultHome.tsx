import { Link } from 'react-router-dom'
import { remainingToday } from '../lib/contract'
import type { VaultState } from '../lib/types'

// Placeholder state — will come from on-chain read
const DEMO_STATE: VaultState = {
  address: 'bitcoincash:qr...',
  balanceSats: 50000,
  mandate: {
    dailyLimitSats: 10000,
    spentTodaySats: 0,
    dayMarker: Math.floor(Date.now() / 1000 / 86400),
    allowlistEnabled: false,
    allowlist: [],
    agentPk: null,
    rescuePk: null,
  },
}

export default function VaultHome() {
  const vault = DEMO_STATE
  const remaining = remainingToday(vault.mandate)

  return (
    <div className="space-y-6">
      {/* Balance */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-nomos-muted">
          Vault balance
        </p>
        <p className="mt-1 font-mono text-3xl font-bold">
          {(vault.balanceSats / 1e8).toFixed(8)}{' '}
          <span className="text-lg text-nomos-muted">BCH</span>
        </p>
      </div>

      {/* Mandate summary */}
      <div className="rounded-lg border border-nomos-border bg-nomos-surface p-4 font-mono text-sm">
        <p className="mb-3 text-xs uppercase tracking-widest text-nomos-muted">
          Current mandate
        </p>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-nomos-muted">Daily limit</span>
            <span>{(vault.mandate.dailyLimitSats / 1e8).toFixed(8)} BCH</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Spent today</span>
            <span>
              {(vault.mandate.spentTodaySats / 1e8).toFixed(8)} BCH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Remaining</span>
            <span className="text-nomos-accent">
              {(remaining / 1e8).toFixed(8)} BCH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Allowlist</span>
            <span>
              {vault.mandate.allowlistEnabled ? 'On' : 'Off'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-nomos-muted">Agent</span>
            <span>
              {vault.mandate.agentPk ? 'Set' : 'Not set'}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          to="/mandate"
          className="rounded-lg border border-nomos-border bg-nomos-surface py-3 text-center text-sm font-medium transition-all hover:border-nomos-accent"
        >
          Set Mandate
        </Link>
        <Link
          to="/pay"
          className="rounded-lg bg-nomos-accent py-3 text-center text-sm font-semibold text-nomos-bg transition-all hover:brightness-110"
        >
          Pay
        </Link>
        <Link
          to="/activity"
          className="rounded-lg border border-nomos-border bg-nomos-surface py-3 text-center text-sm font-medium transition-all hover:border-nomos-accent"
        >
          Activity
        </Link>
      </div>
    </div>
  )
}
