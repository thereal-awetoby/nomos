import { useMemo, useRef, useState } from 'react'
import SpendGauge from '../components/SpendGauge'

interface SimulationResult {
  id: number
  amountSats: number
  accepted: boolean
  reason: string
}

function parseSats(value: string): number {
  const sats = Number(value)
  return Number.isSafeInteger(sats) && sats >= 0 ? sats : 0
}

function parseBchToSats(value: string): number {
  if (!value.trim()) return 0
  const amountBch = Number(value)
  if (!Number.isFinite(amountBch) || amountBch <= 0) return Number.NaN
  const amountSats = Math.round(amountBch * 1e8)
  return Number.isSafeInteger(amountSats) ? amountSats : Number.NaN
}

/** Local, illustrative mandate calculator. It does not execute the covenant. */
export default function Simulate() {
  const [dailyLimit, setDailyLimit] = useState(10_000)
  const [spentToday, setSpentToday] = useState(0)
  const [payAmount, setPayAmount] = useState('')
  const [allowlistOn, setAllowlistOn] = useState(false)
  const [allowedDestination, setAllowedDestination] = useState('demo-recipient')
  const [payTo, setPayTo] = useState('')
  const [results, setResults] = useState<SimulationResult[]>([])
  const nextResultId = useRef(0)

  const paySats = parseBchToSats(payAmount)
  const validAmount = Number.isSafeInteger(paySats) && paySats > 0

  const verdict = useMemo(() => {
    if (!Number.isSafeInteger(paySats) || paySats <= 0) {
      return { ok: false, reason: 'Enter a positive amount that fits in satoshis.' }
    }
    if (spentToday + paySats > dailyLimit) {
      return {
        ok: false,
        reason: `Over daily limit: ${spentToday + paySats} > ${dailyLimit} sats.`,
      }
    }
    if (allowlistOn) {
      const destination = payTo.trim()
      const allowed = allowedDestination.trim()
      if (!destination) return { ok: false, reason: 'Enter a destination.' }
      if (!allowed) return { ok: false, reason: 'Set an allowed destination first.' }
      if (destination !== allowed) {
        return { ok: false, reason: 'Destination does not exactly match the allowlisted text.' }
      }
    }
    return { ok: true, reason: 'Would pass the enabled simulated checks.' }
  }, [paySats, spentToday, dailyLimit, allowlistOn, payTo, allowedDestination])

  const simulatePay = () => {
    if (!validAmount) return

    const result: SimulationResult = {
      id: ++nextResultId.current,
      amountSats: paySats,
      accepted: verdict.ok,
      reason: verdict.reason,
    }
    setResults((previous) => [result, ...previous].slice(0, 10))
    if (verdict.ok) setSpentToday((previous) => previous + paySats)
    setPayAmount('')
  }

  return (
    <div className="page-enter space-y-6">
      <header>
        <h1 className="font-mono text-2xl font-bold text-nomos-text">Mandate Simulator</h1>
        <p className="mt-2 text-sm leading-relaxed text-nomos-muted">
          Explore the daily-limit and allowlist rules without connecting a
          wallet. This is a local illustration only: it does not run the
          covenant, validate BCH addresses, create transactions, or spend BCH.
        </p>
      </header>

      <div className="card border-amber-400/20 bg-amber-400/[0.04] p-4" role="note">
        <p className="text-xs leading-relaxed text-nomos-muted-bright">
          The deployed covenant also checks signatures, transaction locktime,
          and NFT continuation. This simulator does not model those checks and
          is not proof of on-chain behavior.
        </p>
      </div>

      <section className="card p-5" aria-labelledby="simulation-budget-title">
        <h2 id="simulation-budget-title" className="label mb-4">Simulated budget</h2>
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <SpendGauge spentSats={spentToday} limitSats={dailyLimit} />
          <div className="w-full flex-1 space-y-3">
            <div>
              <label htmlFor="sim-daily-limit" className="label mb-1 block">Daily limit (sats)</label>
              <input
                id="sim-daily-limit"
                type="number"
                min="0"
                step="1"
                value={dailyLimit}
                onChange={(event) => setDailyLimit(parseSats(event.target.value))}
                className="input text-sm"
              />
            </div>
            <div>
              <label htmlFor="sim-spent-today" className="label mb-1 block">Spent today (sats)</label>
              <input
                id="sim-spent-today"
                type="number"
                min="0"
                step="1"
                value={spentToday}
                onChange={(event) => setSpentToday(parseSats(event.target.value))}
                className="input text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="simulation-allowlist-title">
        <div className="flex items-center justify-between gap-4">
          <h2 id="simulation-allowlist-title" className="label">Optional allowlist</h2>
          <button
            type="button"
            aria-pressed={allowlistOn}
            onClick={() => setAllowlistOn((enabled) => !enabled)}
            className={`rounded-pill px-3 py-1 text-[10px] font-semibold transition-colors ${
              allowlistOn
                ? 'bg-nomos-accent/15 text-nomos-accent'
                : 'bg-nomos-surface-raised text-nomos-muted'
            }`}
          >
            {allowlistOn ? 'On' : 'Off'}
          </button>
        </div>
        {allowlistOn && (
          <div className="mt-3">
            <label htmlFor="sim-allowed-destination" className="label mb-1 block">
              Allowed destination text
            </label>
            <input
              id="sim-allowed-destination"
              type="text"
              value={allowedDestination}
              onChange={(event) => setAllowedDestination(event.target.value)}
              className="input text-xs"
              autoComplete="off"
            />
            <p className="mt-1 text-[10px] text-nomos-muted">
              For this demo, destinations are compared as exact text; they are not checked as BCH addresses.
            </p>
          </div>
        )}
      </section>

      <form
        className="card space-y-3 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          simulatePay()
        }}
      >
        <h2 className="label">Simulate a payment</h2>
        <div>
          <label htmlFor="sim-amount" className="label mb-1 block">Amount (BCH)</label>
          <input
            id="sim-amount"
            type="number"
            min="0"
            step="0.00000001"
            value={payAmount}
            onChange={(event) => setPayAmount(event.target.value)}
            placeholder="0.0001"
            className="input"
          />
        </div>
        {allowlistOn && (
          <div>
            <label htmlFor="sim-pay-to" className="label mb-1 block">Destination text</label>
            <input
              id="sim-pay-to"
              type="text"
              value={payTo}
              onChange={(event) => setPayTo(event.target.value)}
              placeholder="Enter the same text as the allowlisted destination"
              className="input text-xs"
              autoComplete="off"
            />
          </div>
        )}

        {payAmount && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl px-4 py-2.5 text-xs font-medium ${
              verdict.ok
                ? 'bg-nomos-accent/10 text-nomos-accent'
                : 'bg-nomos-refuse/10 text-nomos-refuse'
            }`}
          >
            {verdict.ok ? '✓' : '✗'} {verdict.reason}
          </div>
        )}

        <button
          type="submit"
          disabled={!validAmount}
          className="btn-primary w-full"
        >
          Simulate
        </button>
      </form>

      {results.length > 0 && (
        <section className="card p-5" aria-labelledby="simulation-log-title">
          <h2 id="simulation-log-title" className="label mb-3">Simulation log</h2>
          <ul className="space-y-2">
            {results.map((result) => (
              <li
                key={result.id}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  result.accepted
                    ? 'border-nomos-accent/10 bg-nomos-accent/5'
                    : 'border-nomos-refuse/10 bg-nomos-refuse/5'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono">{(result.amountSats / 1e8).toFixed(8)} BCH</span>
                  <span className={result.accepted ? 'text-nomos-accent' : 'text-nomos-refuse'}>
                    {result.accepted ? 'WOULD PASS' : 'WOULD REFUSE'}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-nomos-muted">{result.reason}</p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setResults([])
              setSpentToday(0)
            }}
            className="btn-ghost mt-3 w-full text-xs"
          >
            Reset simulated day
          </button>
        </section>
      )}

      <section className="card space-y-3 p-5" aria-labelledby="simulation-rules-title">
        <h2 id="simulation-rules-title" className="label">What the covenant checks</h2>
        <div className="space-y-2 text-xs leading-relaxed text-nomos-muted-bright">
          <p>
            <strong className="text-nomos-text">1. Authorization:</strong>{' '}
            the owner or configured agent must sign the payment.
          </p>
          <p>
            <strong className="text-nomos-text">2. Daily limit:</strong>{' '}
            the covenant derives the day bucket from timestamp locktime divided
            by 86,400. This simulator uses a manual spend value and reset button.
          </p>
          <p>
            <strong className="text-nomos-text">3. Optional allowlist:</strong>{' '}
            when enabled, the destination hash must match an allowed address.
          </p>
          <p>
            <strong className="text-nomos-text">4. State continuation:</strong>{' '}
            the vault output must preserve the covenant and update the NFT commitment.
          </p>
        </div>
      </section>
    </div>
  )
}
