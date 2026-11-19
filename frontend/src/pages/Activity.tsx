import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import ReceiptCard from '../components/Receipt'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import type { Receipt } from '../lib/types'

/** Group locally saved receipts by the user's local calendar date. */
function groupByDate(receipts: Receipt[]): { label: string; items: Receipt[] }[] {
  if (receipts.length === 0) return []

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  const groups: { today: Receipt[]; yesterday: Receipt[]; earlier: Receipt[] } = {
    today: [],
    yesterday: [],
    earlier: [],
  }

  for (const receipt of receipts) {
    const timestamp = new Date(receipt.timestamp)
    const receiptDay = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()).getTime()
    if (receiptDay === todayStart) groups.today.push(receipt)
    else if (receiptDay === yesterdayStart) groups.yesterday.push(receipt)
    else groups.earlier.push(receipt)
  }

  const result: { label: string; items: Receipt[] }[] = []
  if (groups.today.length > 0) result.push({ label: 'Today', items: groups.today })
  if (groups.yesterday.length > 0) result.push({ label: 'Yesterday', items: groups.yesterday })
  if (groups.earlier.length > 0) result.push({ label: 'Earlier', items: groups.earlier })
  return result
}

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
  const { wallet, receipts, clearReceipts } = useWallet()
  const { toast } = useToast()
  const [confirmClear, setConfirmClear] = useState(false)
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
  const dateGroups = useMemo(() => groupByDate(receipts), [receipts])

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
        {receipts.length > 0 && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleExport} className="btn-secondary px-3 py-2 text-[10px]">Export</button>
            {confirmClear
              ? <button type="button" onClick={() => { clearReceipts(); setConfirmClear(false); toast('Receipts cleared', 'info') }} className="btn-danger px-3 py-2 text-[10px]">Confirm clear</button>
              : <button type="button" onClick={() => setConfirmClear(true)} className="btn-ghost px-3 py-2 text-[10px]">Clear</button>
            }
          </div>
        )}
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
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-nomos-surface-raised/80">
            <span className="text-2xl" aria-hidden="true">📋</span>
          </div>
          <p className="text-sm text-nomos-muted">No transactions yet.</p>
          <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-nomos-muted/60">
            Payments and local mandate refusals appear here with receipts you can download, copy, or share. Node responses are not chain confirmations.
          </p>
          <div className="mt-6 flex gap-3">
            <Link to="/pay" className="btn-primary text-sm">Make a Payment</Link>
            <Link to="/proof" className="btn-secondary text-sm">Check a Proof</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {dateGroups.map((group) => (
              <section key={group.label} aria-label={`${group.label} receipts`}>
                <div className="date-divider mb-3 flex items-center gap-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-nomos-muted">{group.label}</h3>
                  <div className="h-px flex-1 bg-nomos-border/10" aria-hidden="true" />
                </div>
                <div className="space-y-3">
                  {group.items.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} />)}
                </div>
              </section>
            ))}
          </div>
          <p className="text-center text-[10px] leading-relaxed text-nomos-muted/70">JSON export includes any attached signed raw transaction. Anyone with that hex can attempt to rebroadcast it.</p>
        </>
      )}
    </div>
  )
}
