import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RefusalProofPanel from '../components/RefusalProofPanel'
import { getLocalProofs, localProofsUpdatedEvent, removeLocalProof, type RefusalProof } from '../lib/proofs'
import { CONTRACT_SOURCE_URL } from '../lib/contract'
import { useToast } from '../components/Toast'

function verdictLabel(proof: RefusalProof): string {
  switch (proof.rejectionKind) {
    case 'script-failure': return 'Script-validation failure'
    case 'missing-inputs': return 'Missing or spent inputs'
    default: return 'Other node rejection'
  }
}

function exportProofs(proofs: RefusalProof[]) {
  const blob = new Blob([JSON.stringify({
    format: 'nomos-local-node-checks',
    exportedAt: new Date().toISOString(),
    note: 'Node replies are point-in-time observations, not mined or confirmed chain state. Raw signed transactions can be rebroadcast.',
    proofs,
  }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `nomos-node-checks-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
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
      exportProofs(proofs)
      toast('Local node checks exported as JSON', 'success')
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
    <div className="page-enter space-y-5">
      <Link to="/" className="text-xs text-nomos-muted transition-colors hover:text-nomos-accent">← Back to connect</Link>
      <header>
        <p className="eyebrow mb-1">PUBLIC VERIFICATION</p>
        <h1 className="font-mono text-2xl font-bold text-nomos-text">Refusal proofs</h1>
        <p className="mt-2 text-xs leading-relaxed text-nomos-muted">Ask a BCH node to evaluate a signed transaction, or inspect locally saved node replies. No wallet is required to check raw transaction hex.</p>
      </header>

      <section className="card p-5 sm:p-6" aria-labelledby="covenant-rules-title">
        <p className="eyebrow mb-1">ON-CHAIN RULES</p>
        <h2 id="covenant-rules-title" className="text-lg font-semibold text-nomos-text">What the vault covenant checks</h2>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-nomos-surface-raised/50 p-3 font-mono text-[10px] leading-relaxed text-nomos-muted-bright"><code>{`currentDay = tx.locktime / 86400
effectiveSpent = currentDay == storedDay ? spentToday : 0
require(effectiveSpent + amount <= dailyLimit)`}</code></pre>
        <p className="mt-3 text-xs leading-relaxed text-nomos-muted">
          The covenant also checks the optional destination allowlist and the continuing vault NFT state. This excerpt is explanatory; read the contract for the full rules.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-nomos-muted">
          A consensus-invalid transaction cannot be included in a valid block, so it cannot pay a mining fee. This checker only records a node's point-in-time response: a script error does not identify which input script failed or prove the Nomos covenant caused it. Missing-input and policy rejections may not establish consensus invalidity; check the chain independently for confirmation.
        </p>
        <a href={CONTRACT_SOURCE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-nomos-accent hover:underline">
          Read the full CashScript source →
        </a>
      </section>

      <RefusalProofPanel
        onProofSaved={refreshProofs}
        receiptId={receiptId}
        initialAmountSats={initialAmountSats}
        initialDestination={initialDestination}
      />

      <section className="card p-5 sm:p-6" aria-labelledby="saved-checks-title">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">THIS BROWSER ONLY</p>
            <h2 id="saved-checks-title" className="text-lg font-semibold text-nomos-text">Saved node checks</h2>
          </div>
          {proofs.length > 0 && (
            <button type="button" onClick={handleExport} className="btn-secondary shrink-0 px-3 py-2 text-[10px]">Export JSON</button>
          )}
        </div>

        {proofs.length === 0 ? (
          <p className="rounded-xl border border-nomos-border/10 p-4 text-xs leading-relaxed text-nomos-muted">No rejected transactions saved on this device. A result is saved here only after a node returns an explicit rejection; network failures and node-accepted transactions are not stored as refusal checks.</p>
        ) : (
          <div className="space-y-3">
            {proofs.map((proof) => (
              <article key={proof.txid} className="rounded-xl border border-nomos-border/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-[11px] font-semibold ${proof.scriptFailure ? 'text-nomos-accent' : 'text-nomos-muted-bright'}`}>{verdictLabel(proof)}</p>
                    <p className="mt-1 break-all font-mono text-[9px] text-nomos-muted">{proof.txid}</p>
                  </div>
                  <button type="button" onClick={() => { removeLocalProof(proof.txid); toast('Local check removed', 'info') }} aria-label={`Remove saved check ${proof.txid}`} className="text-[10px] text-nomos-muted hover:text-nomos-refuse">Remove</button>
                </div>
                <p className="mt-2 break-words text-[10px] leading-relaxed text-nomos-muted">{proof.nodeError}</p>
                <p className="mt-2 text-[9px] text-nomos-muted/70">{proof.network} · {new Date(proof.checkedAt).toLocaleString()}</p>
                <div className="mt-3 flex flex-wrap gap-4 border-t border-nomos-border/10 pt-2">
                  <button type="button" onClick={() => { void copyProof(JSON.stringify(proof, null, 2), 'Node check JSON copied') }} className="text-[10px] text-nomos-accent">Copy JSON</button>
                  <button type="button" onClick={() => { void copyProof(proof.rawTx, 'Signed transaction hex copied; it can be rebroadcast') }} className="text-[10px] text-nomos-accent">Copy raw hex</button>
                </div>
              </article>
            ))}
            <p className="text-[10px] leading-relaxed text-nomos-muted/70">Exported raw signed transactions are rebroadcastable by anyone who receives the JSON. Keep the file private unless you intend to share it.</p>
          </div>
        )}
      </section>
    </div>
  )
}
