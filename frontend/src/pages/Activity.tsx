import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import ActivityRow from '../components/ActivityRow'

import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import { downloadBackup, parseBackup, restoreBackup } from '../lib/backup'
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
  { key: 'admin', label: 'Vault' },
]

function isPayment(receipt: Receipt): boolean {
  return (receipt.kind ?? 'payment') === 'payment'
}

export default function Activity() {
  const { wallet, receipts, clearReceipts } = useWallet()
  const { toast } = useToast()
  const [confirmClear, setConfirmClear] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const restoreInput = useRef<HTMLInputElement>(null)
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

  if (!wallet?.connected) return <Navigate to="/connect" replace />

  const handleExport = () => {
    try {
      downloadActivity(receipts)
      toast('Activity exported as JSON', 'success')
    } catch {
      toast('Could not export activity', 'error')
    }
  }

  const handleBackup = () => {
    try {
      downloadBackup()
      toast('Backup downloaded', 'success')
    } catch {
      toast('Could not make the backup', 'error')
    }
  }

  const handleRestore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const added = restoreBackup(parseBackup(await file.text()))
      if (added.vaults === 0 && added.receipts === 0) {
        toast('Everything in that backup is already here', 'info')
        return
      }
      toast(`Restored ${added.vaults} ${added.vaults === 1 ? 'vault' : 'vaults'} and ${added.receipts} ${added.receipts === 1 ? 'receipt' : 'receipts'}`, 'success')
      window.setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not restore that backup', 'error')
    }
  }

  const countFor = (key: Filter) => key === 'all'
    ? receipts.length
    : key === 'paid' ? stats.paidCount : key === 'refused' ? stats.refusedCount : key === 'admin' ? stats.adminCount : stats.submittedCount

  return (
    <div className="page-enter space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="page-title">Activity</h1>
        {receipts.length > 0 && (
          <div className="flex shrink-0 gap-4">
            <button type="button" onClick={handleExport} className="link-action" title="Saves your receipts as a JSON file, including any signed transactions">Export</button>
            {confirmClear
              ? <button type="button" onClick={() => { clearReceipts(); setConfirmClear(false); toast('Receipts cleared', 'info') }} className="text-sm font-medium text-nomos-refuse hover:underline">Confirm clear</button>
              : <button type="button" onClick={() => setConfirmClear(true)} className="link-action">Clear</button>
            }
          </div>
        )}
      </header>

      {receipts.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-[15px] text-nomos-text">No activity yet</p>
          <p className="mt-1 text-sm text-nomos-muted">Payments and refusals show up here.</p>
          <Link to="/pay" className="btn-primary mt-4">Pay</Link>
        </div>
      ) : (
        <>
          <div className="card divide-hairline-x grid grid-cols-3 text-center" role="group" aria-label="Activity summary">
            {[
              { label: 'Paid', value: String(stats.paidCount) },
              { label: 'Refused', value: String(stats.refusedCount) },
              { label: 'Sats sent', value: stats.totalSats.toLocaleString('en-US') },
            ].map((cell) => (
              <div key={cell.label} className="min-w-0 px-2 py-3">
                <p className="truncate text-lg font-semibold tabular-nums text-nomos-text">{cell.value}</p>
                <p className="text-xs text-nomos-muted">{cell.label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-4 overflow-x-auto border-b hairline [scrollbar-width:none]" role="tablist" aria-label="Filter receipts">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={`-mb-px shrink-0 border-b-2 pb-2 text-sm transition-colors ${
                  filter === item.key ? 'border-nomos-text font-medium text-nomos-text' : 'border-transparent text-nomos-muted hover:text-nomos-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-nomos-muted">Nothing here.</p>
          ) : (
            dateGroups.map((group) => (
              <section key={group.label} aria-label={`${group.label} receipts`}>
                <h2 className="mb-2 text-sm font-medium text-nomos-muted">{group.label}</h2>
                <div className="card divide-hairline overflow-hidden">
                  {group.items.map((receipt) => <ActivityRow key={receipt.id} receipt={receipt} />)}
                </div>
              </section>
            ))
          )}

          {stats.nodeScriptFailures > 0 && (
            <p className="text-sm text-nomos-muted">
              {stats.nodeScriptFailures} receipt{stats.nodeScriptFailures === 1 ? ' has' : 's have'} a node refusal attached. <Link to="/proof" className="underline">Proof checker</Link>
            </p>
          )}
        </>
      )}

      <section id="backup" className="card p-5" aria-labelledby="backup-title">
        <h2 id="backup-title" className="text-[15px] font-semibold text-nomos-text">Back up this browser</h2>
        <p className="mt-1 text-sm leading-relaxed text-nomos-muted">
          Your vaults and their rules are on chain, but the list of your vaults and this activity live only in this browser. Clearing browsing data deletes them. Download a backup, then restore it here or in another browser. It holds public keys and rules, never a private key.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={handleBackup}>Download backup</button>
          <button type="button" className="btn-secondary" onClick={() => restoreInput.current?.click()}>Restore from backup</button>
          <input ref={restoreInput} type="file" accept="application/json,.json" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => { void handleRestore(e) }} />
        </div>
      </section>
    </div>
  )
}
