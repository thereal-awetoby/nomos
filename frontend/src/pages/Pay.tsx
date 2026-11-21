import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import { shortAddr } from '../components/ui'
import SpentMeter from '../components/SpentMeter'
import RefuseBanner, { refusalRule } from '../components/RefuseBanner'
import { wouldRefuse, remainingToday, executeSpend, validateCashAddress, verifyAnchor, EXPLORER_TX_URL } from '../lib/contract'
import { isNostrIdentifier, resolveNostrPayee, payeeLabel, type NostrPayee } from '../lib/nostr'

const REQUIRE_LINK_KEY = 'nomos:requireLink'

function readRequireLink(): boolean {
  try { return localStorage.getItem(REQUIRE_LINK_KEY) === '1' } catch { return false }
}

function bchToSats(value: string): number {
  if (!/^\d+(?:\.\d{0,8})?$/.test(value.trim())) return 0
  const [whole, fractional = ''] = value.trim().split('.')
  const sats = BigInt(whole) * 100_000_000n + BigInt((fractional + '00000000').slice(0, 8))
  return sats > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(sats)
}

export default function Pay() {
  const { wallet, vault, vaultConfig, addReceipt, refreshVault } = useWallet()
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    type: 'success' | 'refused' | 'error'
    message: string
    txHash?: string
    proofUrl?: string
  } | null>(null)
  // Nostr pay-by-name: resolve npub / nprofile / name@domain to the BCH
  // address the person published (debounced while typing).
  const [payee, setPayee] = useState<NostrPayee | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const isNostr = isNostrIdentifier(destination)
  // Optional policy: pay Nostr names only when both keys signed for the address.
  const [requireLink, setRequireLink] = useState(readRequireLink)
  const toggleRequireLink = (on: boolean) => {
    setRequireLink(on)
    try { localStorage.setItem(REQUIRE_LINK_KEY, on ? '1' : '0') } catch { /* storage is optional */ }
  }
  const unlinkedBlocked = isNostr && Boolean(payee) && !payee?.link && requireLink

  useEffect(() => {
    setPayee(null)
    setResolveError(null)
    if (!isNostr) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setResolving(true)
      try {
        const p = await resolveNostrPayee(destination, validateCashAddress, verifyAnchor)
        if (!cancelled) setPayee(p)
      } catch (err: any) {
        if (!cancelled) setResolveError(err?.message || 'Could not resolve this Nostr identity')
      } finally {
        if (!cancelled) setResolving(false)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [destination, isNostr])

  if (!wallet?.connected) return <Navigate to="/connect" replace />
  if (!vault) return <p className="py-20 text-center text-sm text-nomos-muted">Loading…</p>

  const mandate = vault.mandate
  const remaining = remainingToday(mandate)
  const spentToday = Math.max(0, mandate.dailyLimitSats - remaining)
  const amountSats = bchToSats(amount)
  const payToPreview = payee?.address ?? destination.trim()
  const liveVerdict = vault.deployed && amountSats > 0 && payToPreview && (!isNostr || payee)
    ? wouldRefuse(mandate, amountSats, payToPreview)
    : null
  const quickAmounts = [1_000, 10_000, 50_000]
    .filter((sats) => sats <= remaining)
    .concat(remaining > 0 && ![1_000, 10_000, 50_000].includes(remaining) ? [remaining] : [])
    .filter((sats, index, values) => values.indexOf(sats) === index)

  const handlePay = async () => {
    if (isNostr && !payee) {
      const message = resolveError || 'Still looking up that Nostr identity…'
      setResult({ type: 'error', message })
      toast(message, 'info')
      return
    }
    if (unlinkedBlocked) {
      const message = 'This Nostr identity has not linked its address with both keys, and you chose to pay linked identities only.'
      setResult({ type: 'error', message })
      toast('Not a linked identity', 'info')
      return
    }
    if (!vault.deployed) {
      setResult({ type: 'error', message: 'This vault has no deployed state NFT and cannot make a covenant spend yet.' })
      toast('Vault is not deployed', 'error')
      return
    }
    const payTo = payee?.address ?? destination.trim()
    const label = payee ? payeeLabel(payee) : undefined
    const destinationLink = payee?.link
      ? { npub: payee.npub, anchorTxid: payee.link.anchorTxid, eventId: payee.link.eventId }
      : undefined

    const addrErr = validateCashAddress(payTo)
    if (addrErr) {
      setResult({ type: 'refused', message: `Invalid destination: ${addrErr}` })
      toast('Invalid destination', 'error')
      return
    }

    const check = wouldRefuse(mandate, amountSats, payTo)
    if (check.refused) {
      const receiptId = `local-refusal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const receipt = {
        id: receiptId,
        kind: 'payment' as const,
        status: 'refused' as const,
        amount: amountSats,
        destination: payTo,
        destinationLabel: label,
        destinationLink,
        reason: check.reason,
        mandate,
        timestamp: Date.now(),
      }
      addReceipt(receipt)
      setResult({
        type: 'refused',
        message: check.reason || 'Refused by the current mandate check',
        proofUrl: `/proof?receipt=${encodeURIComponent(receiptId)}&amount=${amountSats}&destination=${encodeURIComponent(payTo)}`,
      })
      toast('Refused: it breaks your rules', 'error')
      return
    }

    if (!vaultConfig) {
      setResult({ type: 'error', message: 'Vault config not set.' })
      toast('Vault config not set', 'error')
      return
    }

    setSubmitting(true)
    try {
      const receipt = await executeSpend(
        vaultConfig, mandate, amountSats, payTo,
        wallet.address, wallet.provider, label, wallet.wcIndex ?? 0,
      )
      addReceipt({ ...receipt, destinationLink })
      setResult({ type: 'success', message: 'Waiting for the network to confirm it.', txHash: receipt.txHash })
      toast('Transaction submitted; confirmation is pending', 'success')
    } catch (err: any) {
      const message = err.message || 'No transaction was accepted by the node.'
      setResult({ type: 'error', message })
      toast('Payment was not confirmed by the node', 'error')
    } finally {
      setSubmitting(false)
    }

    // Refresh vault state separately so a refresh failure doesn't replace the result.
    try { await refreshVault() } catch { /* best-effort */ }
  }

  return (
    <div className="page-enter space-y-4">
      <h1 className="page-title">Pay</h1>

      <div className="card p-4">
        <SpentMeter spentSats={spentToday} limitSats={mandate.dailyLimitSats} pendingSats={amountSats > 0 ? amountSats : 0} />
      </div>

      {/* Amount */}
      <div>
        <label className="label mb-2 block">Amount (BCH)</label>
        <input
          type="number"
          min="0"
          step="0.00000001"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setResult(null) }}
          placeholder="0.0001"
          className="input"
        />
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quick amount buttons">
          {quickAmounts.length > 0 ? quickAmounts.map((sats) => (
            <button
              key={sats}
              type="button"
              onClick={() => { setAmount((sats / 1e8).toFixed(8)); setResult(null) }}
              className="rounded-lg border hairline-strong bg-nomos-surface px-3 py-1.5 text-sm text-nomos-text transition-colors hover:bg-nomos-surface-raised"
            >
              {sats === remaining ? `Max · ${sats.toLocaleString()} sats` : `${sats.toLocaleString()} sats`}
            </button>
          )) : <span className="text-sm text-nomos-muted">Nothing left to spend today.</span>}
        </div>
      </div>

      {/* Destination */}
      <div>
        <label className="label mb-2 block">Destination</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setResult(null) }}
          placeholder="Address, npub or name@domain"
          className="input"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Nostr resolution */}
        {isNostr && (
          <div className="card mt-2 px-3 py-3 text-sm">
            {resolving && <p className="pulse-text text-nomos-muted">Looking up on Nostr…</p>}
            {resolveError && <p className="text-nomos-refuse">{resolveError}</p>}
            {payee && (
              <div className="flex items-center gap-3">
                {payee.picture && (
                  <img src={payee.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-nomos-text">{payee.displayName || payeeLabel(payee)}</p>
                  <p className="truncate font-mono text-xs text-nomos-muted">{shortAddr(payee.address, 10, 6)}</p>
                  {payee.link ? (
                    <p className="text-xs text-nomos-muted-bright">
                      Linked by both keys ·{' '}
                      <a href={`${EXPLORER_TX_URL}${payee.link.anchorTxid}`} target="_blank" rel="noreferrer" className="underline">
                        anchor
                      </a>
                    </p>
                  ) : (
                    <p className="text-xs text-nomos-muted">Published address · not linked</p>
                  )}
                  {payee.publishedAddress && (
                    <p className="text-xs text-nomos-muted">Paying the linked address, not the published one.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {isNostr && (
          <label className="mt-2 flex items-center gap-2 text-sm text-nomos-muted-bright">
            <input type="checkbox" checked={requireLink} onChange={(e) => toggleRequireLink(e.target.checked)} />
            Only pay linked identities
          </label>
        )}
      </div>

      <p className="min-h-[1.25rem] text-sm" aria-live="polite" aria-label="Rule check">
        {!amount || !destination ? (
          <span className="text-nomos-muted">Enter an amount and a destination.</span>
        ) : !vault.deployed ? (
          <span className="text-nomos-refuse">The vault is not created on-chain yet.</span>
        ) : amountSats <= 0 ? (
          <span className="text-nomos-refuse">Enter an amount above zero.</span>
        ) : isNostr && resolving ? (
          <span className="text-nomos-muted">Looking up this name…</span>
        ) : isNostr && !payee ? (
          <span className="text-nomos-refuse">{resolveError || 'This name has no BCH address yet.'}</span>
        ) : unlinkedBlocked ? (
          <span className="text-nomos-muted-bright">Not linked by both keys. Turn off "Only pay linked identities" to pay the published address.</span>
        ) : liveVerdict?.refused ? (
          <span className="text-nomos-refuse">Breaks your rules: {liveVerdict.reason}</span>
        ) : liveVerdict ? (
          <span className="text-nomos-muted-bright">Within your rules.</span>
        ) : (
          <span className="text-nomos-muted">Enter a valid payment.</span>
        )}
      </p>

      <button
        onClick={handlePay}
        disabled={!vault.deployed || amountSats <= 0 || !destination || submitting || (isNostr && !payee) || unlinkedBlocked}
        className={`${liveVerdict?.refused ? 'btn-danger' : 'btn-primary'} w-full`}
      >
        {submitting
          ? <><span className="spinner mr-2" /> Signing…</>
          : liveVerdict?.refused ? 'Submit anyway · see refusal' : 'Pay'}
      </button>

      {/* Result */}
      {result?.type === 'refused' ? (
        <RefuseBanner
          detail={{
            rule: refusalRule(result.message),
            amountSats,
            remainingSats: remaining,
            dailyLimitSats: mandate.dailyLimitSats,
            destination: payToPreview,
            reason: result.message,
          }}
          proofUrl={result.proofUrl}
          onAdjustAmount={refusalRule(result.message) === 'limit' ? () => setAmount((remaining / 1e8).toFixed(8)) : undefined}
          onChangeDestination={refusalRule(result.message) === 'limit' || refusalRule(result.message) === 'amount'
            ? undefined
            : () => { setDestination(''); setPayee(null); setResult(null) }}
        />
      ) : result && (
        <div className="card p-4">
          <p className="text-[15px] font-medium text-nomos-text">
            {result.type === 'success' ? 'Sent' : 'Not sent'}
          </p>
          <p className="mt-1 text-sm text-nomos-muted">{result.message}</p>
          {result.txHash && (
            <a href={`${EXPLORER_TX_URL}${result.txHash}`} target="_blank" rel="noreferrer" className="link-action mt-3 inline-block">
              View on explorer
            </a>
          )}
        </div>
      )}
    </div>
  )
}
