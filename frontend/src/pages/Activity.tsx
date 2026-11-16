import { Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import ReceiptCard from '../components/Receipt'

export default function Activity() {
  const { wallet, receipts } = useWallet()

  if (!wallet?.connected) return <Navigate to="/" replace />

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
