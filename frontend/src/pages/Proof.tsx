import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RefusalProofPanel from '../components/RefusalProofPanel'
import { getLocalProofs, localProofsUpdatedEvent, removeLocalProof } from '../lib/proofs'
import type { RefusalProof } from '../lib/proofs'
import { useToast } from '../components/Toast'
import { Panel } from '../components/ui'
import { CONTRACT_SOURCE_URL } from '../lib/contract'

function verdictLabel(proof: RefusalProof): string {
  if (proof.rejectionKind === 'script-failure') return 'Script-validation failure'
  if (proof.rejectionKind === 'missing-inputs') return 'Missing or spent inputs'
  return 'Other node rejection'
}

function explainError(proof: RefusalProof): string | null {
  const error = proof.nodeError.toLowerCase()
  if (proof.scriptFailure) {
    if (error.includes('checksig') || error.includes('signature')) {
      return 'The node reports a signature-related script failure. It does not identify which input or key; inspect the transaction inputs and signing data.'
    }
    return 'The node reported a script-validation failure. It does not identify which input script failed or prove the Nomos covenant caused it.'
  }
  if (proof.rejectionKind === 'missing-inputs') {
    return 'The node reports one or more inputs are missing, unavailable, or spent from its current view. A parent may be unknown to this node; this alone does not prove the vault UTXO was spent.'
  }
  if (error.includes('dust')) return 'The node flagged an output under its dust relay policy; this is not by itself proof of a covenant violation.'
  if (error.includes('fee') || error.includes('insufficient priority')) return 'The node reports a fee or relay-policy issue; this does not by itself establish a covenant violation.'
  return null
}

function downloadChecks(proofs: RefusalProof[]) {
  const payload = {
    format: 'nomos-node-checks-export',
    exportedAt: new Date().toISOString(),
    note: 'Saved node replies are point-in-time responses. Script failure does not by itself identify the failing input or prove Nomos covenant causation. Attached signed raw transactions may be rebroadcast.',
    checks: proofs,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `nomos-node-checks-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Proof() {
  const [searchParams] = useSearchParams()
  const [proofs, setProofs] = useState<RefusalProof[]>(() => getLocalProofs())
  const { toast } = useToast()
  const receiptId = searchParams.get('receipt') || undefined
  const requestedAmount = searchParams.get('amount') || ''
  const initialAmountSats = /^\d+$/.test(requestedAmount) && Number.isSafeInteger(Number(requestedAmount))
    ? Number(requestedAmount)
    : undefined
  const initialDestination = searchParams.get('destination') || undefined
  const refreshProofs = useCallback(() => setProofs(getLocalProofs()), [])

  useEffect(() => {
    const eventName = localProofsUpdatedEvent()
    window.addEventListener(eventName, refreshProofs)
    window.addEventListener('storage', refreshProofs)
    return () => {
      window.removeEventListener(eventName, refreshProofs)
      window.removeEventListener('storage', refreshProofs)
    }
  }, [refreshProofs])

  const handleExport = () => {
    try {
      downloadChecks(proofs)
      toast('Node checks exported as JSON', 'success')
    } catch {
      toast('Could not export node checks', 'error')
    }
  }

  const copyProof = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast(message, 'success')
    } catch {
      toast('Clipboard access was unavailable', 'error')
    }
  }

  return (
    <div className="page-enter space-y-4">
      <h1 className="page-title">Proof checker</h1>
      <p className="text-sm text-nomos-muted">
        Send a signed spend that breaks your rules to a BCH node and record its answer. A rejected spend can never be mined.
      </p>

      <details className="card px-4 py-3">
        <summary className="cursor-pointer text-[15px] text-nomos-text">What the contract checks</summary>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-nomos-surface-raised p-3 font-mono text-xs leading-relaxed text-nomos-muted-bright"><code>{`currentDay = tx.locktime / 86400
effectiveSpent = currentDay == storedDay ? spentToday : 0
require(effectiveSpent + amount <= dailyLimit)`}</code></pre>
        <p className="mt-2 text-sm text-nomos-muted">It also checks the allowlist and that the vault continues with its state updated.</p>
        <a href={CONTRACT_SOURCE_URL} target="_blank" rel="noreferrer" className="link-action mt-2 inline-block">Contract source</a>
      </details>

      <RefusalProofPanel
        onProofSaved={refreshProofs}
        receiptId={receiptId}
        initialAmountSats={initialAmountSats}
        initialDestination={initialDestination}
      />

      <Panel
        title={<span>Saved checks <span className="ml-1 font-normal text-nomos-muted">{proofs.length}</span></span>}
        right={proofs.length > 0 ? <button type="button" onClick={handleExport} className="link-action font-normal">Export</button> : undefined}
        bodyClassName="p-0"
      >
        {proofs.length === 0 ? (
          <p className="px-4 pb-4 pt-2 text-sm text-nomos-muted">None yet. A check is saved when a node rejects the spend.</p>
        ) : (
          <div className="divide-hairline">
            {proofs.map((proof) => {
              const explanation = explainError(proof)
              return (
                <article key={proof.txid} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-[15px] font-medium ${proof.scriptFailure ? 'text-nomos-refuse' : 'text-nomos-text'}`}>{verdictLabel(proof)}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-nomos-muted" title={proof.txid}>{proof.txid}</p>
                    </div>
                    <button type="button" onClick={() => { removeLocalProof(proof.txid); refreshProofs(); toast('Local check removed', 'info') }} aria-label={`Remove saved check ${proof.txid}`} className="shrink-0 text-sm text-nomos-muted hover:text-nomos-text">Remove</button>
                  </div>
                  <p className="break-words font-mono text-xs leading-relaxed text-nomos-muted-bright">{proof.nodeError}</p>
                  {explanation && <p className="text-sm text-nomos-muted">{explanation}</p>}
                  <p className="text-xs text-nomos-muted">{proof.network} · {new Date(proof.checkedAt).toLocaleString()}</p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button type="button" onClick={() => { void copyProof(JSON.stringify(proof, null, 2), 'Node check JSON copied') }} className="link-action">Copy JSON</button>
                    <button type="button" onClick={() => { void copyProof(proof.rawTx, 'Signed transaction hex copied; it can be rebroadcast') }} className="link-action">Copy signed hex</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
