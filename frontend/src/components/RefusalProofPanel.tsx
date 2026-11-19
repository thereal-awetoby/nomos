import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  broadcastForVerdict,
  isDurablyViolating,
  signViolatingSpend,
  type RefusalAttempt,
} from '../lib/contract'
import { saveLocalProof } from '../lib/proofs'
import { useWallet } from '../context/WalletContext'
import { useToast } from './Toast'

function shorten(value: string, edge = 8): string {
  return value.length > edge * 2 ? `${value.slice(0, edge)}…${value.slice(-edge)}` : value
}

function rejectionLabel(kind: string): string {
  if (kind === 'script-failure') return 'NODE REPORTED SCRIPT FAILURE'
  if (kind === 'missing-inputs') return 'NODE REJECTED: MISSING OR SPENT INPUTS'
  return 'NODE REJECTED: OTHER REASON'
}

interface RefusalProofPanelProps {
  onProofSaved?: () => void
  receiptId?: string
  initialAmountSats?: number
  initialDestination?: string
}

export default function RefusalProofPanel({
  onProofSaved,
  receiptId,
  initialAmountSats,
  initialDestination,
}: RefusalProofPanelProps) {
  const { vault, vaultConfig, wallet, receipts, addReceipt, updateReceipt } = useWallet()
  const { toast } = useToast()
  const [amount, setAmount] = useState(() => initialAmountSats ? String(initialAmountSats) : '')
  const [destination, setDestination] = useState(() => initialDestination || '')
  const [rawTx, setRawTx] = useState('')
  const [attempt, setAttempt] = useState<RefusalAttempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState('')

  const parsedAmount = Number(amount)
  const amountSats = Number.isSafeInteger(parsedAmount) ? parsedAmount : 0
  const durable = Boolean(vaultConfig && isDurablyViolating(vaultConfig, amountSats, destination.trim()))
  const canSign = Boolean(
    vaultConfig && vault?.deployed && wallet?.connected && durable,
  )

  async function checkWithNode(
    transactionHex: string,
    receiptDetails?: { amountSats: number; destination: string; receiptId?: string },
  ) {
    setBusy(true)
    setError('')
    setAttempt(null)
    setBusyMessage('Sending signed transaction to the configured public node…')
    try {
      const result = await broadcastForVerdict(transactionHex)
      setAttempt(result)
      if (result.outcome === 'accepted') {
        setError('')
        if (receiptDetails) {
          const matchingReceipt = receiptDetails.receiptId
            ? receipts.find((receipt) => receipt.id === receiptDetails.receiptId
              && receipt.status === 'refused'
              && receipt.amount === receiptDetails.amountSats
              && receipt.destination === receiptDetails.destination)
            : undefined
          const reason = 'Node accepted the signed transaction for relay; it is not mined or confirmed and may spend vault funds.'
          if (matchingReceipt) {
            updateReceipt(matchingReceipt.id, { status: 'submitted', txHash: result.txid, reason, onChainRefusal: undefined })
          } else if (vault?.mandate) {
            addReceipt({
              id: `node-accepted-${result.txid}`,
              kind: 'payment',
              status: 'submitted',
              amount: receiptDetails.amountSats,
              destination: receiptDetails.destination,
              txHash: result.txid,
              reason,
              mandate: vault.mandate,
              timestamp: Date.now(),
            })
          }
        }
        toast('Node accepted the transaction — it may be mined', 'error')
        return
      }

      setRawTx(result.proof.rawTx)
      try {
        saveLocalProof(result.proof)
        onProofSaved?.()
      } catch (storageError: any) {
        setError(storageError?.message || 'The node returned a rejection, but the browser could not save it locally. Copy or download the result now.')
      }

      if (receiptDetails) {
        const reason = `Node rejection (${result.proof.rejectionKind}); see attached node response.`
        const matchingReceipt = receiptDetails.receiptId
          ? receipts.find((receipt) => receipt.id === receiptDetails.receiptId
            && receipt.status === 'refused'
            && receipt.amount === receiptDetails.amountSats
            && receipt.destination === receiptDetails.destination)
          : undefined
        if (matchingReceipt) {
          updateReceipt(matchingReceipt.id, { reason, onChainRefusal: result.proof })
        } else if (vault?.mandate) {
          addReceipt({
            id: `refusal-${result.proof.txid}`,
            kind: 'payment',
            status: 'refused',
            amount: receiptDetails.amountSats,
            destination: receiptDetails.destination,
            reason,
            mandate: vault.mandate,
            timestamp: result.proof.checkedAt,
            onChainRefusal: result.proof,
          })
        }
      }

      if (result.proof.rejectionKind === 'script-failure') {
        toast('Node reported a script-validation failure', 'info')
      } else if (result.proof.rejectionKind === 'missing-inputs') {
        toast('Node says one or more inputs are missing or spent', 'info')
      } else {
        toast('Node rejected the transaction for another reason', 'info')
      }
    } catch (checkError: any) {
      setError(checkError?.message || 'No node verdict was received. This is not a refusal proof.')
      toast('No node verdict received', 'error')
    } finally {
      setBusy(false)
      setBusyMessage('')
    }
  }

  async function onSign(event: FormEvent) {
    event.preventDefault()
    setError('')
    setAttempt(null)
    if (!vaultConfig || !vault?.deployed || !wallet?.connected) {
      setError('Connect a wallet and load a deployed vault before signing. The wallet-free checker below remains available.')
      return
    }
    if (!acknowledged) {
      setError('Confirm that you understand the signed transaction can be rebroadcast and may spend vault funds.')
      return
    }
    if (!durable) {
      setError('Only a violation that stays invalid after the day or spend state changes can be signed for this check.')
      return
    }

    setBusy(true)
    setBusyMessage('Rechecking the deployed vault state and requesting a wallet signature…')
    try {
      const signedHex = await signViolatingSpend(
        vaultConfig,
        amountSats,
        destination.trim(),
        wallet.address,
        wallet.provider,
        wallet.wcIndex ?? 0,
      )
      setRawTx(signedHex)
      setBusyMessage('Signed. Sending transaction hex to the node for a verdict…')
      await checkWithNode(signedHex, { amountSats, destination: destination.trim(), receiptId })
    } catch (signError: any) {
      setError(signError?.message || 'Unable to sign a transaction for checking.')
      toast('Signing failed; no refusal was recorded', 'error')
    } finally {
      setBusy(false)
      setBusyMessage('')
    }
  }

  async function onCheckHex(event: FormEvent) {
    event.preventDefault()
    if (!acknowledged) {
      setError('Confirm that you understand this signed hex will be sent to a public node and may be rebroadcast.')
      return
    }
    await checkWithNode(rawTx)
  }

  const proof = attempt?.outcome === 'rejected' ? attempt.proof : null

  const copyProofJson = async () => {
    if (!proof) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(proof, null, 2))
      toast('Node result JSON copied', 'success')
    } catch {
      toast('Could not copy result JSON', 'error')
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">NODE CHECK</p>
          <h2 className="text-lg font-semibold text-nomos-text">Check a signed spend</h2>
        </div>
        <span className="rounded-full border border-nomos-accent/20 bg-nomos-accent/5 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-nomos-accent">WALLET-FREE CHECK</span>
      </div>

      <div className="mb-5 rounded-xl border border-nomos-refuse/20 bg-nomos-refuse/5 p-3 text-[11px] leading-relaxed text-nomos-muted">
        <strong className="text-nomos-refuse">Important:</strong> the checker sends arbitrary signed transaction hex to the configured public Electrum node. A transaction the node accepts may be relayed, mined, and spend funds. Anyone holding the hex can rebroadcast it. A node rejection is only a point-in-time response, not mined or confirmed chain state.
      </div>
      <label className="mb-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-nomos-border/10 p-3 text-[11px] leading-relaxed text-nomos-muted">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 accent-nomos-accent" />
        <span>I understand that sending signed transaction hex to a public node can expose a valid transaction for relay or rebroadcast and may spend funds.</span>
      </label>

      {receiptId && <p className="mb-4 rounded-xl bg-nomos-surface-raised/40 p-3 text-[10px] leading-relaxed text-nomos-muted">This check is linked to a locally refused receipt. If the node rejects the signed transaction, its response will be attached to that receipt; node acceptance is not a refusal proof.</p>}

      <form onSubmit={onSign} className="space-y-3">
        <p className="label">Create a check from this vault</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold text-nomos-muted">Amount in satoshis</span>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} readOnly={Boolean(receiptId)} inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 50000" className={`input ${receiptId ? 'opacity-70' : ''}`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold text-nomos-muted">CashAddress destination</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} readOnly={Boolean(receiptId)} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="bitcoincash:q…" className={`input font-mono text-xs ${receiptId ? 'opacity-70' : ''}`} />
        </label>
        <button type="submit" disabled={busy || !canSign || !acknowledged} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40">
          {busy && busyMessage.includes('signature') ? 'Waiting for wallet…' : 'Sign violating spend & check'}
        </button>
        {!vaultConfig && <p className="text-[11px] leading-relaxed text-nomos-muted">No saved vault configuration on this device. You can still use the wallet-free raw-hex checker below.</p>}
        {vaultConfig && !vault?.deployed && <p className="text-[11px] leading-relaxed text-nomos-muted">The saved vault is not currently loaded as deployed. Refresh or connect its wallet before signing.</p>}
        {!durable && amount && destination && <p className="text-[11px] leading-relaxed text-nomos-muted">To avoid a stale daily-budget refusal becoming valid later, only an amount above the full daily cap or a destination excluded by the immutable allowlist can be used here.</p>}
      </form>

      <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-nomos-muted/60"><span className="h-px flex-1 bg-nomos-border/10" />OR CHECK SIGNED HEX<span className="h-px flex-1 bg-nomos-border/10" /></div>
      <form onSubmit={onCheckHex} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold text-nomos-muted">Signed transaction hex (no wallet needed)</span>
          <textarea value={rawTx} onChange={(event) => { setRawTx(event.target.value); setAttempt(null) }} rows={3} maxLength={200000} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="02000000…" className="input min-h-20 resize-y font-mono text-[10px]" />
        </label>
        <button type="submit" disabled={busy || !rawTx.trim() || !acknowledged} className="btn-secondary w-full disabled:opacity-40">Send hex to node</button>
      </form>

      {busy && <p className="mt-4 text-center text-xs text-nomos-muted" role="status">{busyMessage}</p>}
      {error && <p className="mt-4 rounded-xl border border-nomos-refuse/20 bg-nomos-refuse/5 p-3 text-xs leading-relaxed text-nomos-refuse" role="alert">{error}</p>}
      {proof && (
        <div className="mt-4 space-y-2 rounded-xl border border-nomos-accent/20 bg-nomos-accent/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs font-semibold ${proof.scriptFailure ? 'text-nomos-accent' : 'text-nomos-muted-bright'}`}>
              {rejectionLabel(proof.rejectionKind)}
            </span>
            <button type="button" onClick={() => { void copyProofJson() }} className="text-[10px] font-semibold text-nomos-accent">Copy JSON</button>
          </div>
          <p className="break-all font-mono text-[10px] text-nomos-text">TXID {proof.txid}</p>
          <p className="text-[10px] leading-relaxed text-nomos-muted">{proof.nodeError}</p>
          <p className="text-[10px] text-nomos-muted">{proof.network} · node response at {new Date(proof.checkedAt).toLocaleString()}</p>
          <details className="pt-1">
            <summary className="cursor-pointer text-[10px] font-semibold text-nomos-accent">Show rebroadcastable raw transaction</summary>
            <p className="mt-2 break-all font-mono text-[9px] leading-relaxed text-nomos-muted">{proof.rawTx}</p>
          </details>
          <p className="text-[10px] leading-relaxed text-nomos-muted">A script failure means the node reported a script-validation error; this checker does not identify which input script failed or prove the covenant rule was the cause. Missing inputs and other node rejections are classified separately.</p>
        </div>
      )}
      {attempt?.outcome === 'accepted' && (
        <div className="mt-4 rounded-xl border border-nomos-refuse/30 bg-nomos-refuse/5 p-3 text-xs text-nomos-refuse">Node accepted · txid {shorten(attempt.txid)} · not yet mined or confirmed, and may spend funds.</div>
      )}
      <p className="mt-4 text-[10px] leading-relaxed text-nomos-muted/75">Transport failures, timeouts, or connection errors produce no verdict and are not saved as proofs. Rejected results are saved only in this browser’s local storage; they are not uploaded.</p>
      <p className="mt-3 text-[10px] text-nomos-muted">Current mandate daily cap: {vault?.mandate ? `${(vault.mandate.dailyLimitSats / 1e8).toFixed(8)} BCH` : '—'}</p>
    </section>
  )
}
