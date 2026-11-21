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
    <section className="card p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-nomos-text">Check a spend with a node</h2>

      {receiptId && <p className="mt-1 text-sm text-nomos-muted">Linked to a refused payment. The node's answer is added to its receipt.</p>}

      <form onSubmit={onSign} className="mt-4 space-y-3">
        <label className="block">
          <span className="label mb-1.5 block">Amount (sats)</span>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} readOnly={Boolean(receiptId)} inputMode="numeric" pattern="[0-9]*" placeholder="50000" className={`input ${receiptId ? 'opacity-70' : ''}`} />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Destination</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} readOnly={Boolean(receiptId)} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="bitcoincash:q…" className={`input ${receiptId ? 'opacity-70' : ''}`} />
        </label>
        {!durable && amount && destination && <p className="text-sm text-nomos-muted">Use an amount above the whole daily limit, or an address outside the allowlist, so the refusal stays valid later.</p>}

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-nomos-muted-bright">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-nomos-accent" />
          <span>I understand the signed transaction goes to a public node, and if the node accepts it, it can spend funds.</span>
        </label>

        <button type="submit" disabled={busy || !canSign || !acknowledged} className="btn-primary w-full">
          {busy && busyMessage.includes('signature') ? 'Waiting for wallet…' : 'Sign and check'}
        </button>
        {!vaultConfig && <p className="text-sm text-nomos-muted">No vault on this device. You can still check signed hex below.</p>}
        {vaultConfig && !vault?.deployed && <p className="text-sm text-nomos-muted">The vault is not loaded. Refresh or reconnect its wallet first.</p>}
      </form>

      <details className="mt-4 border-t hairline pt-3">
        <summary className="cursor-pointer text-sm text-nomos-muted">Check signed hex instead</summary>
        <form onSubmit={onCheckHex} className="mt-3 space-y-3">
          <textarea value={rawTx} onChange={(event) => { setRawTx(event.target.value); setAttempt(null) }} rows={3} maxLength={200000} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="02000000…" aria-label="Signed transaction hex" className="input min-h-20 resize-y font-mono text-sm" />
          <button type="submit" disabled={busy || !rawTx.trim() || !acknowledged} className="btn-ghost w-full">Send to node</button>
        </form>
      </details>

      {busy && <p className="mt-4 text-center text-sm text-nomos-muted" role="status">{busyMessage}</p>}
      {error && <p className="mt-4 text-sm text-nomos-refuse" role="alert">{error}</p>}
      {proof && (
        <div className="mt-4 space-y-1.5 rounded-lg border hairline-strong p-3">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[15px] font-medium ${proof.scriptFailure ? 'text-nomos-refuse' : 'text-nomos-text'}`}>
              {rejectionLabel(proof.rejectionKind)}
            </span>
            <button type="button" onClick={() => { void copyProofJson() }} className="link-action">Copy JSON</button>
          </div>
          <p className="break-words font-mono text-xs text-nomos-muted-bright">{proof.nodeError}</p>
          <p className="truncate font-mono text-xs text-nomos-muted" title={proof.txid}>txid {proof.txid}</p>
          <p className="text-xs text-nomos-muted">{proof.network} · {new Date(proof.checkedAt).toLocaleString()} · saved on this device</p>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-nomos-muted [&::-webkit-details-marker]:hidden"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>Signed transaction</summary>
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-nomos-muted">{proof.rawTx}</p>
          </details>
        </div>
      )}
      {attempt?.outcome === 'accepted' && (
        <p className="mt-4 text-sm text-nomos-refuse">The node accepted it (txid {shorten(attempt.txid)}). It may be mined and spend funds.</p>
      )}
    </section>
  )
}
