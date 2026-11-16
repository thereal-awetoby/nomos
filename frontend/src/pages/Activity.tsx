import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import ReceiptCard from '../components/Receipt'

export default function Activity() {
  const { wallet, receipts } = useWallet()

  if (!wallet?.connected) return <Navigate to="/" replace />

  return (
    <div className="space-y-6">
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent">← Vault</Link>
      <h2 className="font-mono text-xl font-bold">Activity</h2>

      {receipts.length === 0 ? (
        <div className="text-center">
          <p className="text-sm text-nomos-muted">No transactions yet.</p>
          <Link to="/pay" className="mt-2 inline-block text-xs text-nomos-accent hover:underline">
            Make your first payment →
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
