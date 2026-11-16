import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import ReceiptCard from '../components/Receipt'

export default function Activity() {
  const { wallet, receipts } = useWallet()

  if (!wallet?.connected) return <Navigate to="/" replace />

  return (
    <div className="page-enter space-y-5">
      {/* Back nav */}
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent transition-colors duration-200">
        ← Back to vault
      </Link>

      <h2 className="font-mono text-2xl font-bold">Activity</h2>

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
