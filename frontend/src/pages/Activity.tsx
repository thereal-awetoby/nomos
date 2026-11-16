import ReceiptCard from '../components/Receipt'
import type { Receipt } from '../lib/types'

// Placeholder — will be populated from localStorage + on-chain reads
const DEMO_RECEIPTS: Receipt[] = [
  {
    id: '1',
    status: 'refused',
    amount: 50000,
    destination: 'bitcoincash:qrexample...',
    reason: 'Refused: exceeds daily limit (10000 sats remaining)',
    timestamp: Date.now() - 120000,
    mandate: {
      dailyLimitSats: 10000,
      spentTodaySats: 10000,
      dayMarker: Math.floor(Date.now() / 1000 / 86400),
      allowlistEnabled: false,
      allowlist: [],
      agentPk: null,
      rescuePk: null,
    },
  },
  {
    id: '2',
    status: 'paid',
    amount: 5000,
    destination: 'bitcoincash:qrexample2...',
    txHash: 'abc123def456...',
    timestamp: Date.now() - 300000,
    mandate: {
      dailyLimitSats: 10000,
      spentTodaySats: 5000,
      dayMarker: Math.floor(Date.now() / 1000 / 86400),
      allowlistEnabled: false,
      allowlist: [],
      agentPk: null,
      rescuePk: null,
    },
  },
]

export default function Activity() {
  const receipts = DEMO_RECEIPTS

  return (
    <div className="space-y-6">
      <h2 className="font-mono text-xl font-bold">Activity</h2>

      {receipts.length === 0 ? (
        <p className="text-center text-sm text-nomos-muted">
          No transactions yet.
        </p>
      ) : (
        <div className="space-y-3">
          {receipts.map((r) => (
            <ReceiptCard key={r.id} receipt={r} />
          ))}
        </div>
      )}
    </div>
  )
}
