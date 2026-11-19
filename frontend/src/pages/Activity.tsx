import { Link, Navigate } from 'react-router-dom'
import ReceiptCard from '../components/Receipt'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'

function downloadActivity(receipts: ReturnType<typeof useWallet>['receipts']) {
  const payload = {
    format: 'nomos-activity-export',
    exportedAt: new Date().toISOString(),
    note: 'Receipts are locally stored records. Node rejections are point-in-time responses, not mined or confirmed chain state. Included signed raw transactions may be rebroadcast.',
    receipts,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `nomos-activity-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Activity() {
  const { wallet, receipts } = useWallet()
  const { toast } = useToast()
  const stats = receipts.reduce((total, receipt) => {
    if (receipt.status === 'paid') {
      total.paidCount += 1
      total.totalSats += receipt.amount
    } else if (receipt.status === 'refused') {
      total.refusedCount += 1
    } else if (receipt.status === 'submitted') {
      total.submittedCount += 1
      total.totalSats += receipt.amount
    }
    if (receipt.onChainRefusal?.scriptFailure) total.nodeScriptFailures += 1
    return total
  }, { paidCount: 0, refusedCount: 0, submittedCount: 0, totalSats: 0, nodeScriptFailures: 0 })

  if (!wallet?.connected) return <Navigate to="/" replace />

  const handleExport = () => {
    try {
      downloadActivity(receipts)
      toast('Activity exported as JSON', 'success')
    } catch {
      toast('Could not export activity', 'error')
    }
  }

  return (
    <div className="page-enter space-y-5">
      <Link to="/vault" className="text-xs text-nomos-muted transition-colors duration-200 hover:text-nomos-accent">
        ← Back to vault
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-2xl font-bold">Activity</h2>
          <p className="mt-1 text-[10px] text-nomos-muted">Receipts saved on this device</p>
        </div>
        {receipts.length > 0 && <button type="button" onClick={handleExport} className="btn-secondary shrink-0 px-3 py-2 text-[10px]">Export JSON</button>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Activity summary">
        <div className="card px-3 py-3 text-center">
          <p className="text-[10px] text-nomos-muted">Paid</p>
          <p className="mt-1 font-mono text-lg font-bold text-nomos-accent">{stats.paidCount}</p>
        </div>
        <div className="card px-3 py-3 text-center">
          <p className="text-[10px] text-nomos-muted">Refused records</p>
          <p className="mt-1 font-mono text-lg font-bold text-nomos-refuse">{stats.refusedCount}</p>
        </div>
        <div className="card px-3 py-3 text-center">
          <p className="text-[10px] text-nomos-muted">Submitted · unconfirmed</p>
          <p className="mt-1 font-mono text-lg font-bold text-amber-400">{stats.submittedCount}</p>
        </div>
        <div className="card px-3 py-3 text-center">
          <p className="text-[10px] text-nomos-muted">Total sent</p>
          <p className="mt-1 font-mono text-sm font-bold text-nomos-text">{(stats.totalSats / 1e8).toFixed(8)} BCH</p>
        </div>
        <div className="card px-3 py-3 text-center">
          <p className="text-[10px] text-nomos-muted">Node script failures</p>
          <p className="mt-1 font-mono text-lg font-bold text-nomos-accent">{stats.nodeScriptFailures}</p>
        </div>
      </div>

      {stats.nodeScriptFailures > 0 && (
        <p className="rounded-xl border border-nomos-accent/15 bg-nomos-accent/5 p-3 text-[10px] leading-relaxed text-nomos-muted">
          “Node script failures” counts saved receipts whose node response indicated script validation failure. A failure does not by itself identify which input script failed, prove the Nomos covenant caused it, or mean anything was mined or confirmed. <Link to="/proof" className="text-nomos-accent underline">Open proof checker</Link>.
        </p>
      )}

      {receipts.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <p className="text-sm text-nomos-muted">No transactions yet.</p>
          <p className="mt-2 text-xs text-nomos-muted/60">Payments and local refusals appear here. Node check results are not chain confirmations.</p>
          <div className="mt-6 flex gap-3">
            <Link to="/pay" className="btn-primary text-sm">Make a Payment</Link>
            <Link to="/proof" className="btn-secondary text-sm">Check a Proof</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {receipts.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} />)}
          </div>
          <p className="text-center text-[10px] leading-relaxed text-nomos-muted/70">JSON export includes any attached signed raw transaction. Anyone with that hex can attempt to rebroadcast it.</p>
        </>
      )}
    </div>
  )
}
