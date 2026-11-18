import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import ReceiptCard from '../components/Receipt'

export default function Activity() {
  const { wallet, receipts } = useWallet()
  const stats = receipts.reduce((total, receipt) => {
    if (receipt.status === 'paid') {
      total.paidCount += 1
      total.totalSats += receipt.amount
    } else if (receipt.status === 'refused') {
      total.refusedCount += 1
    }
    return total
  }, { paidCount: 0, refusedCount: 0, totalSats: 0 })

  if (!wallet?.connected) return <Navigate to="/" replace />

  return (
    <div className="page-enter space-y-5">
      {/* Back nav */}
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent transition-colors duration-200">
        ← Back to vault
      </Link>

      <h2 className="font-mono text-2xl font-bold">Activity</h2>

      {receipts.length > 0 && (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Activity summary">
          <div className="card px-3 py-3 text-center">
            <p className="text-[10px] text-nomos-muted">Paid</p>
            <p className="mt-1 font-mono text-lg font-bold text-nomos-accent">{stats.paidCount}</p>
          </div>
          <div className="card px-3 py-3 text-center">
            <p className="text-[10px] text-nomos-muted">Refused</p>
            <p className="mt-1 font-mono text-lg font-bold text-nomos-refuse">{stats.refusedCount}</p>
          </div>
          <div className="card px-3 py-3 text-center">
            <p className="text-[10px] text-nomos-muted">Total sent</p>
            <p className="mt-1 font-mono text-sm font-bold text-nomos-text">
              {(stats.totalSats / 1e8).toFixed(8)} BCH
            </p>
          </div>
        </div>
      )}

      {receipts.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <p className="text-sm text-nomos-muted">No transactions yet.</p>
          <p className="mt-2 text-xs text-nomos-muted/60">
            Payments and refusals will appear here with on-chain receipts.
          </p>
          <Link to="/pay" className="btn-primary mt-6 text-sm">
            Make a Payment
          </Link>
        </div>
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
