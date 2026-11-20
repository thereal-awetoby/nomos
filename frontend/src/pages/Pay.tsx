import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import { Panel } from '../components/ui'
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

  if (!wallet?.connected) return <Navigate to="/" replace />
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
      toast('Blocked by the current mandate check', 'error')
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
      setResult({ type: 'success', message: 'The wallet/provider returned a transaction ID. Check an explorer for network relay, mining, and confirmation.', txHash: receipt.txHash })
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
      <header>
        <p className="eyebrow">PAYMENT · LOCAL PREVIEW</p>
        <h1 className="page-title">Pay</h1>
        <p className="mt-1 text-[10px] text-nomos-muted">Your wallet signs; the covenant enforces the active mandate on-chain.</p>
      </header>

      <Panel
        title="Daily allowance"
        right={<span className="font-mono text-[10px] tabular-nums text-nomos-text">{(remaining / 1e8).toFixed(8)} BCH left</span>}
      >
        <SpentMeter spentSats={spentToday} limitSats={mandate.dailyLimitSats} pendingSats={amountSats > 0 ? amountSats : 0} />
      </Panel>

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
              className="rounded-pill border border-nomos-border/10 px-3 py-1.5 text-[10px] text-nomos-muted-bright transition-colors hover:border-nomos-accent/30 hover:text-nomos-accent"
            >
              {sats === remaining ? `Remaining · ${sats.toLocaleString()} sats` : `${sats.toLocaleString()} sats`}
            </button>
          )) : <span className="text-[10px] text-nomos-muted">No daily allowance remains today.</span>}
        </div>
      </div>

      {/* Destination */}
      <div>
        <label className="label mb-2 block">Destination</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setResult(null) }}
          placeholder="bitcoincash:qr…  or  npub… / name@domain"
          className="input text-xs"
        />

        {/* Nostr resolution */}
        {isNostr && (
          <div className="mt-2 border hairline bg-nomos-surface-raised/40 px-3 py-2.5 text-xs">
            {resolving && <p className="pulse-text text-nomos-muted">Looking up on Nostr…</p>}
            {resolveError && <p className="text-nomos-refuse">{resolveError}</p>}
            {payee && (
              <div className="flex items-center gap-3">
                {payee.picture && (
                  <img src={payee.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-nomos-text">{payee.displayName || payeeLabel(payee)}</p>
                  <p className="truncate font-mono text-[10px] text-nomos-muted">{payee.address}</p>
                  {payee.link ? (
                    <p className="text-[10px] text-nomos-accent">
                      Linked · both keys signed ·{' '}
                      <a href={`${EXPLORER_TX_URL}${payee.link.anchorTxid}`} target="_blank" rel="noreferrer" className="underline">
                        anchor {payee.link.anchorTxid.slice(0, 8)}
                      </a>
                    </p>
                  ) : (
                    <p className="text-[10px] text-nomos-muted">
                      Published address, signed by this Nostr key only · not linked · {new Date(payee.publishedAt * 1000).toLocaleDateString()}
                    </p>
                  )}
                  {payee.publishedAddress && (
                    <p className="text-[10px] text-nomos-muted">Its published address differs; paying the linked one.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {isNostr && (
          <label className="mt-2 flex items-center gap-2 text-[10px] text-nomos-muted-bright">
            <input type="checkbox" checked={requireLink} onChange={(e) => toggleRequireLink(e.target.checked)} />
            Pay Nostr names only when the address is linked by both keys
          </label>
        )}
      </div>

      <section
        className={`rounded-2xl border p-3 text-xs ${
          liveVerdict?.refused
            ? 'border-nomos-refuse/20 bg-nomos-refuse/5'
            : liveVerdict
              ? 'border-nomos-accent/20 bg-nomos-accent/5'
              : 'border-nomos-border/10 bg-nomos-surface/40'
        }`}
        aria-live="polite"
        aria-label="Live mandate verdict preview"
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-nomos-muted">Live mandate preview · local calculation</p>
        {!amount || !destination ? (
          <p className="text-nomos-muted">Enter an amount and destination to preview the current rules.</p>
        ) : !vault.deployed ? (
          <p className="text-nomos-refuse">Vault not deployed: there is no state NFT for the covenant to spend yet.</p>
        ) : amountSats <= 0 ? (
          <p className="text-nomos-refuse">Enter a positive amount in satoshis (up to 8 decimal places in BCH).</p>
        ) : isNostr && resolving ? (
          <p className="text-nomos-muted">Resolving the Nostr destination…</p>
        ) : isNostr && !payee ? (
          <p className="text-nomos-refuse">{resolveError || 'The Nostr identity has not resolved to a verified BCH address yet.'}</p>
        ) : unlinkedBlocked ? (
          <p className="text-nomos-muted-bright">Not linked by both keys. Turn off "linked only" to pay the published address.</p>
        ) : liveVerdict?.refused ? (
          <p className="font-medium text-nomos-refuse">Would be blocked by the current mandate: {liveVerdict.reason}</p>
        ) : liveVerdict ? (
          <p className="font-medium text-nomos-accent">Within the current mandate rules at this snapshot.</p>
        ) : (
          <p className="text-nomos-muted">Enter a valid payment to see the current mandate preview.</p>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-nomos-muted/70">Preview only: this browser check does not prove vault funds or chain state. The network still evaluates the signed transaction.</p>
      </section>

      <button
        onClick={handlePay}
        disabled={!vault.deployed || amountSats <= 0 || !destination || submitting || (isNostr && !payee) || unlinkedBlocked}
        className={`${liveVerdict?.refused ? 'btn-danger' : 'btn-primary'} w-full`}
      >
        {submitting
          ? <><span className="spinner mr-2" /> Signing…</>
          : liveVerdict?.refused ? 'Submit anyway · see refusal' : 'Pay'}
      </button>
      <p className="text-center text-[10px] text-nomos-muted">
        Want an explicit node response for a durable mandate violation? <Link to="/proof" className="text-nomos-accent underline">Open the proof checker</Link>.
      </p>

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
        <div className={`card p-4 ${result.type === 'success' ? 'border-nomos-pending/30 bg-nomos-pending/[0.04]' : 'border-nomos-muted/30 bg-nomos-surface'}`}>
          <p className={`font-mono text-sm font-bold uppercase tracking-[0.08em] ${result.type === 'success' ? 'text-nomos-pending' : 'text-nomos-muted-bright'}`}>
            {result.type === 'success' ? 'Submitted · awaiting confirmation' : 'No confirmed node verdict'}
          </p>
          <p className="mt-1 text-xs text-nomos-muted-bright">{result.message}</p>
          {result.txHash && (
            <a href={`${EXPLORER_TX_URL}${result.txHash}`} target="_blank" rel="noreferrer" className="link-action mt-3 inline-block text-nomos-accent">
              Check explorer · not confirmed
            </a>
          )}
        </div>
      )}
    </div>
  )
}
