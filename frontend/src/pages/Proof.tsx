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
      <header>
        <p className="eyebrow">PUBLIC VERIFICATION</p>
        <h1 className="page-title">Refusal proofs</h1>
        <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-nomos-muted">Ask a BCH node to evaluate a signed transaction, or inspect saved node replies. No wallet is required to check raw transaction hex.</p>
      </header>

      <Panel title="What the covenant checks" bodyClassName="space-y-2 p-3">
        <pre className="overflow-x-auto border hairline bg-nomos-bg-deep/40 p-2 font-mono text-[10px] leading-relaxed text-nomos-muted-bright"><code>{`currentDay = tx.locktime / 86400
effectiveSpent = currentDay == storedDay ? spentToday : 0
require(effectiveSpent + amount <= dailyLimit)`}</code></pre>
        <p className="text-[10px] leading-relaxed text-nomos-muted">The covenant also checks the optional destination allowlist and continuing vault NFT state. Read the contract for full rules.</p>
        <p className="text-[10px] leading-relaxed text-nomos-muted">A consensus-invalid transaction cannot be included in a valid block, so it cannot pay a mining fee. This checker records only a node’s point-in-time response. A script error does not identify which input script failed or prove the Nomos covenant caused it. Missing-input and policy rejections may not establish consensus invalidity; check chain state independently.</p>
        <a href={CONTRACT_SOURCE_URL} target="_blank" rel="noreferrer" className="link-action">Read CashScript source</a>
      </Panel>

      <RefusalProofPanel
        onProofSaved={refreshProofs}
        receiptId={receiptId}
        initialAmountSats={initialAmountSats}
        initialDestination={initialDestination}
      />

      <Panel
        title={<span className="flex items-center justify-between gap-3"><span>Saved node checks <span className="ml-1 text-nomos-muted">{proofs.length}</span></span>{proofs.length > 0 && <button type="button" onClick={handleExport} className="btn-ghost px-2 py-1 text-[9px]">Export</button>}</span>}
        bodyClassName="p-0"
      >
        {proofs.length === 0 ? (
          <p className="p-3 text-[10px] leading-relaxed text-nomos-muted">No rejected transactions saved on this device. A result is saved only after an explicit node rejection; network failures and node-accepted transactions are not stored as refusal checks.</p>
        ) : (
          <div className="divide-y divide-nomos-border">
            {proofs.map((proof) => {
              const explanation = explainError(proof)
              return (
                <article key={proof.txid} className="space-y-1.5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-mono text-[10px] font-bold uppercase ${proof.scriptFailure ? 'text-nomos-refuse' : 'text-nomos-muted-bright'}`}>{verdictLabel(proof)}</p>
                      <p className="mt-0.5 break-all font-mono text-[9px] text-nomos-muted">{proof.txid}</p>
                    </div>
                    <button type="button" onClick={() => { removeLocalProof(proof.txid); refreshProofs(); toast('Local check removed', 'info') }} aria-label={`Remove saved check ${proof.txid}`} className="link-action shrink-0 text-nomos-refuse">Remove</button>
                  </div>
                  <p className="break-words text-[10px] leading-relaxed text-nomos-muted-bright">{proof.nodeError}</p>
                  {explanation && <p className="text-[10px] leading-relaxed text-nomos-muted">{explanation}</p>}
                  <p className="font-mono text-[9px] text-nomos-muted">{proof.network} · {new Date(proof.checkedAt).toLocaleString()} · not mined/confirmed</p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button type="button" onClick={() => { void copyProof(JSON.stringify(proof, null, 2), 'Node check JSON copied') }} className="link-action">Copy JSON</button>
                    <button type="button" onClick={() => { void copyProof(proof.rawTx, 'Signed transaction hex copied; it can be rebroadcast') }} className="link-action">Copy signed hex</button>
                  </div>
                </article>
              )
            })}
            <p className="p-3 text-[9px] leading-relaxed text-nomos-muted">Anyone who receives exported signed raw transaction data can try to rebroadcast it. Keep exports private unless you intend to share them.</p>
          </div>
        )}
      </Panel>
    </div>
  )
}
