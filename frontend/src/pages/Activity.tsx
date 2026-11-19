import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import ActivityRow from '../components/ActivityRow'
import { Panel, fmtBch } from '../components/ui'
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

function downloadActivity(receipts: Receipt[]) {
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

type Filter = 'all' | 'paid' | 'refused' | 'submitted' | 'admin'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'refused', label: 'Refused' },
  { key: 'submitted', label: 'Pending' },
  { key: 'admin', label: 'Vault ops' },
]

function isPayment(receipt: Receipt): boolean {
  return (receipt.kind ?? 'payment') === 'payment'
}

export default function Activity() {
  const { wallet, receipts, clearReceipts } = useWallet()
  const { toast } = useToast()
  const [confirmClear, setConfirmClear] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const stats = receipts.reduce((total, receipt) => {
    if (!isPayment(receipt)) {
      total.adminCount += 1
    } else if (receipt.status === 'paid') {
      total.paidCount += 1
      total.totalSats += receipt.amount
    } else if (receipt.status === 'refused') {
      total.refusedCount += 1
      total.blockedSats += receipt.amount
    } else if (receipt.status === 'submitted') {
      total.submittedCount += 1
      total.totalSats += receipt.amount
    }
    if (receipt.onChainRefusal?.scriptFailure) total.nodeScriptFailures += 1
    return total
  }, { paidCount: 0, refusedCount: 0, submittedCount: 0, totalSats: 0, blockedSats: 0, nodeScriptFailures: 0, adminCount: 0 })
  const filtered = useMemo(
    () => (filter === 'all'
      ? receipts
      : filter === 'admin'
        ? receipts.filter((receipt) => !isPayment(receipt))
        : receipts.filter((receipt) => isPayment(receipt) && receipt.status === filter)),
    [receipts, filter],
  )
  const dateGroups = useMemo(() => groupByDate(filtered), [filtered])

  if (!wallet?.connected) return <Navigate to="/" replace />

  const handleExport = () => {
    try {
      downloadActivity(receipts)
      toast('Activity exported as JSON', 'success')
    } catch {
      toast('Could not export activity', 'error')
    }
  }

  const countFor = (key: Filter) => key === 'all'
    ? receipts.length
    : key === 'paid' ? stats.paidCount : key === 'refused' ? stats.refusedCount : key === 'admin' ? stats.adminCount : stats.submittedCount

  return (
    <div className="page-enter space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-nomos-muted">Receipts saved on this device</p>
        </div>
        {receipts.length > 0 && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleExport} className="btn-ghost px-3 py-2 text-[10px]">Export JSON</button>
            {confirmClear
              ? <button type="button" onClick={() => { clearReceipts(); setConfirmClear(false); toast('Receipts cleared', 'info') }} className="btn-danger px-3 py-2 text-[10px]">Confirm clear</button>
              : <button type="button" onClick={() => setConfirmClear(true)} className="btn-ghost px-3 py-2 text-[10px]">Clear</button>
            }
          </div>
        )}
      </header>

      {/* Stats strip */}
      <div className="card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-5" style={{ background: 'var(--line)' }} role="group" aria-label="Activity summary">
        {[
          { label: 'Paid', value: String(stats.paidCount), cls: 'text-nomos-accent' },
          { label: 'Refused', value: String(stats.refusedCount), cls: 'text-nomos-refuse' },
          { label: 'Unconfirmed', value: String(stats.submittedCount), cls: 'text-nomos-pending' },
          { label: 'Sent · BCH', value: fmtBch(stats.totalSats), cls: 'text-nomos-text' },
          { label: 'Blocked · BCH', value: fmtBch(stats.blockedSats), cls: 'text-nomos-refuse' },
        ].map((cell) => (
          <div key={cell.label} className="bg-nomos-surface px-3 py-2.5">
            <p className="label">{cell.label}</p>
            <p className={`mt-1 font-mono text-base font-bold tabular-nums ${cell.cls}`}>{cell.value}</p>
          </div>
        ))}
      </div>

      {stats.nodeScriptFailures > 0 && (
        <p className="border hairline-strong bg-nomos-surface px-3 py-2 font-mono text-[10px] leading-relaxed text-nomos-muted-bright">
          {stats.nodeScriptFailures} saved receipt{stats.nodeScriptFailures === 1 ? '' : 's'} carry a node script-failure response. A script failure does not by itself identify which input failed or mean anything was mined. <Link to="/proof" className="text-nomos-accent underline">Proof checker</Link>
        </p>
      )}

      {receipts.length === 0 ? (
        <Panel title="Ledger" bodyClassName="p-4">
          <p className="font-mono text-sm text-nomos-text">No movements under this mandate yet.</p>
          <p className="mt-1 text-xs text-nomos-muted">Payments and refusals appear here with a receipt you can save as an image, copy or share.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
            <Link to="/pay" className="btn-primary">Pay</Link>
            <Link to="/proof" className="btn-ghost">Proof checker</Link>
          </div>
        </Panel>
      ) : (
        <Panel
          title={
            <span className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Filter receipts">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.key}
                  onClick={() => setFilter(item.key)}
                  className={`px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                    filter === item.key ? 'bg-nomos-text text-nomos-bg' : 'text-nomos-muted hover:text-nomos-text'
                  }`}
                >
                  {item.label} {countFor(item.key)}
                </button>
              ))}
            </span>
          }
          bodyClassName=""
        >
          {filtered.length === 0 ? (
            <p className="p-3 font-mono text-xs text-nomos-muted">No {filter === 'submitted' ? 'unconfirmed' : filter === 'admin' ? 'rescue or mandate' : filter} records.</p>
          ) : (
            dateGroups.map((group) => (
              <section key={group.label} aria-label={`${group.label} receipts`}>
                <h2 className="border-y hairline bg-nomos-bg-deep/40 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-nomos-muted">{group.label}</h2>
                <div className="divide-hairline">
                  {group.items.map((receipt) => <ActivityRow key={receipt.id} receipt={receipt} />)}
                </div>
              </section>
            ))
          )}
        </Panel>
      )}

      {receipts.length > 0 && (
        <p className="font-mono text-[10px] leading-relaxed text-nomos-muted">JSON export includes any attached signed raw transaction. Anyone with that hex can attempt to rebroadcast it.</p>
      )}
    </div>
  )
}
